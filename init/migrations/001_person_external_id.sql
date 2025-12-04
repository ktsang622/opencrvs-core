-- Migration: Add person_external_id table for external system integration
-- Version: 001
-- Date: 2024
--
-- This migration adds a normalized table for linking persons to external systems
-- (GoID, NID, Passport, etc.) while maintaining backward compatibility with
-- the existing person.identifiers JSONB column.
--
-- IMPORTANT: Run this migration in a transaction. The migration is idempotent.
--
-- Usage:
--   psql -d registry -f 001_person_external_id.sql
--
-- After migration, run the data migration function:
--   SELECT * FROM migrate_identifiers_to_external_id();

BEGIN;

-- ============================================================================
-- 1. Create person_external_id table
-- ============================================================================

CREATE TABLE IF NOT EXISTS person_external_id (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES person(id) ON DELETE CASCADE,

  -- Origin system identifier (lowercase, e.g., 'goid', 'nid', 'passport')
  origin VARCHAR(50) NOT NULL,

  -- External ID from that system (case-preserved for display)
  external_id VARCHAR(255) NOT NULL,

  -- Normalized external ID for case-insensitive uniqueness
  -- NOTE: We store this separately rather than using citext to avoid
  -- requiring superuser privileges for the citext extension
  external_id_lower VARCHAR(255) NOT NULL,

  -- Legacy type mapping for backward compatibility with identifiers JSON
  -- e.g., 'NATIONAL_ID', 'EXTERNAL_PERSON_ID' - matches existing type values
  legacy_type VARCHAR(100),

  -- Verification audit trail
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by VARCHAR(255),           -- user/system that performed verification
  verification_method VARCHAR(100),   -- 'manual', 'api_lookup', 'biometric', etc.

  -- Optional metadata (JSON, validated at application level for size/PII)
  metadata JSONB,

  -- Soft-delete support for audit trail
  -- When status='removed', the link is inactive but history is preserved
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  removed_at TIMESTAMPTZ,
  removed_by VARCHAR(255),
  removal_reason TEXT,

  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255),

  -- Ensure normalized column matches the original (prevents data inconsistency)
  CONSTRAINT chk_external_id_lower CHECK (external_id_lower = LOWER(external_id)),

  -- Ensure origin is lowercase
  CONSTRAINT chk_origin_lower CHECK (origin = LOWER(origin)),

  -- Valid status values
  CONSTRAINT chk_status CHECK (status IN ('active', 'removed'))
);

-- Case-insensitive uniqueness: one ACTIVE external ID can only belong to one person
-- Removed entries don't block new links (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS uq_origin_external_id_active
  ON person_external_id(origin, external_id_lower)
  WHERE status = 'active';

-- Index for finding all external IDs for a person
CREATE INDEX IF NOT EXISTS idx_person_external_id_person
  ON person_external_id(person_id);

-- Index for lookups by origin + external_id (case-insensitive via normalized column)
-- Only index active entries for faster lookups
CREATE INDEX IF NOT EXISTS idx_person_external_id_lookup
  ON person_external_id(origin, external_id_lower)
  WHERE status = 'active';

COMMENT ON TABLE person_external_id IS
  'Links persons to external system identifiers (GoID, NID, Passport, etc.) with audit trail';
COMMENT ON COLUMN person_external_id.external_id_lower IS
  'Lowercase normalized external_id for case-insensitive uniqueness constraint';
COMMENT ON COLUMN person_external_id.legacy_type IS
  'Maps to existing identifier type codes for backward compatibility with person.identifiers JSON';

-- ============================================================================
-- 2. Create updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_person_external_id_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_person_external_id_timestamp ON person_external_id;
CREATE TRIGGER trigger_update_person_external_id_timestamp
  BEFORE UPDATE ON person_external_id
  FOR EACH ROW
  EXECUTE FUNCTION update_person_external_id_timestamp();

-- ============================================================================
-- 3. Create sync trigger (keeps person.identifiers in sync)
-- ============================================================================

-- This trigger merges external IDs into the existing identifiers JSON
-- while preserving "internal" identifiers (those not managed by this table).
--
-- External entries are marked with "_source": "external" to distinguish them.
-- Downstream consumers (OpenSearch, UI) should either:
--   1. Ignore the _source field when processing identifiers, OR
--   2. Filter it out before display if needed
--
CREATE OR REPLACE FUNCTION sync_external_id_to_identifiers()
RETURNS TRIGGER AS $$
DECLARE
  target_person_id UUID;
  external_ids JSONB;
  internal_ids JSONB;
  merged_ids JSONB;
BEGIN
  -- Determine target person ID based on operation type
  -- IMPORTANT: In DELETE triggers, NEW is not assigned (raises error if accessed)
  IF TG_OP = 'DELETE' THEN
    target_person_id := OLD.person_id;
  ELSE
    -- For INSERT and UPDATE, prefer NEW (UPDATE has both, INSERT only has NEW)
    target_person_id := NEW.person_id;
  END IF;

  -- Aggregate all ACTIVE external IDs for this person from the new table
  -- Each entry gets a "_source": "external" marker for identification
  -- Removed entries are excluded so they don't appear in person.identifiers
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'type', COALESCE(e.legacy_type, UPPER(e.origin)),
        'value', e.external_id,
        '_source', 'external'
      )
    ),
    '[]'::jsonb
  )
  INTO external_ids
  FROM person_external_id e
  WHERE e.person_id = target_person_id
    AND e.status = 'active';

  -- Extract existing "internal" identifiers (those WITHOUT the _source marker)
  -- These are identifiers created by other parts of the system (e.g., NATIONAL_ID from birth form)
  SELECT COALESCE(
    jsonb_agg(elem),
    '[]'::jsonb
  )
  INTO internal_ids
  FROM person p
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.identifiers, '[]'::jsonb)) AS elem
  WHERE p.id = target_person_id
    AND elem->>'_source' IS NULL;

  -- Merge: internal IDs + external IDs
  merged_ids := internal_ids || external_ids;

  -- Update person.identifiers with merged result
  UPDATE person
  SET identifiers = merged_ids,
      updated_at = NOW()
  WHERE id = target_person_id;

  -- Return appropriate record based on operation type
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_external_id_to_identifiers ON person_external_id;
CREATE TRIGGER trigger_sync_external_id_to_identifiers
  AFTER INSERT OR UPDATE OR DELETE ON person_external_id
  FOR EACH ROW
  EXECUTE FUNCTION sync_external_id_to_identifiers();

-- ============================================================================
-- 4. Migration helper function
-- ============================================================================

-- Migrates existing external identifiers from person.identifiers JSON to the
-- new person_external_id table. Only migrates recognized external ID types.
--
-- NOTES:
-- - Uses UUID lexicographic ordering for batching (intentional - Postgres compares
--   UUIDs lexicographically which provides stable ordering for pagination)
-- - Does NOT disable triggers; the sync trigger will fire and update identifiers
--   with the _source marker, which is the desired behavior
-- - Idempotent: ON CONFLICT DO NOTHING for already-migrated entries
--
-- After running, verify with:
--   SELECT COUNT(*) FROM person_external_id;
--   SELECT id, identifiers FROM person WHERE id IN (SELECT DISTINCT person_id FROM person_external_id) LIMIT 5;
--
CREATE OR REPLACE FUNCTION migrate_identifiers_to_external_id(batch_size INT DEFAULT 1000)
RETURNS TABLE(migrated_count BIGINT, skipped_count BIGINT, persons_processed BIGINT) AS $$
DECLARE
  rec RECORD;
  id_rec JSONB;
  migrated BIGINT := 0;
  skipped BIGINT := 0;
  persons BIGINT := 0;
  parsed_origin VARCHAR(50);
  parsed_external_id VARCHAR(255);
  last_id UUID := '00000000-0000-0000-0000-000000000000';
  batch_count INT;
  -- External ID types to migrate (lowercase for comparison)
  external_types TEXT[] := ARRAY['goid', 'external_person_id', 'passport', 'nid', 'national_id'];
BEGIN
  RAISE NOTICE 'Starting migration with batch_size=%', batch_size;

  LOOP
    batch_count := 0;

    -- Process persons in batches using UUID lexicographic ordering
    FOR rec IN
      SELECT id, identifiers
      FROM person
      WHERE id > last_id
        AND identifiers IS NOT NULL
        AND jsonb_array_length(COALESCE(identifiers, '[]'::jsonb)) > 0
      ORDER BY id
      LIMIT batch_size
    LOOP
      batch_count := batch_count + 1;
      last_id := rec.id;
      persons := persons + 1;

      -- Process each identifier in the JSON array
      FOR id_rec IN SELECT * FROM jsonb_array_elements(rec.identifiers)
      LOOP
        parsed_origin := LOWER(COALESCE(id_rec->>'type', ''));
        parsed_external_id := id_rec->>'value';

        -- Skip if already marked as external (already migrated)
        IF id_rec->>'_source' = 'external' THEN
          CONTINUE;
        END IF;

        -- Skip if not an external ID type we want to migrate
        IF NOT (parsed_origin = ANY(external_types)) THEN
          CONTINUE;
        END IF;

        -- Skip invalid entries
        IF parsed_external_id IS NULL OR TRIM(parsed_external_id) = '' THEN
          skipped := skipped + 1;
          CONTINUE;
        END IF;

        BEGIN
          -- Check if this external ID already exists (active)
          -- Can't use ON CONFLICT with partial unique index, so check-then-insert
          PERFORM 1 FROM person_external_id
          WHERE origin = parsed_origin
            AND external_id_lower = LOWER(parsed_external_id)
            AND status = 'active';

          IF NOT FOUND THEN
            INSERT INTO person_external_id (
              person_id, origin, external_id, external_id_lower, legacy_type,
              is_verified, created_by, status
            )
            VALUES (
              rec.id,
              parsed_origin,
              parsed_external_id,
              LOWER(parsed_external_id),
              id_rec->>'type',  -- preserve original case for legacy_type
              false,
              'migration',
              'active'
            );
            migrated := migrated + 1;
          ELSE
            -- Already exists, skip
            skipped := skipped + 1;
          END IF;
        EXCEPTION WHEN unique_violation THEN
          -- Race condition: another process inserted between check and insert
          RAISE WARNING 'Concurrent insert for identifier % on person %', parsed_external_id, rec.id;
          skipped := skipped + 1;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Failed to migrate identifier for person %: %', rec.id, SQLERRM;
          skipped := skipped + 1;
        END;
      END LOOP;
    END LOOP;

    -- Exit when no more rows in this batch
    EXIT WHEN batch_count = 0;

    RAISE NOTICE 'Processed batch, last_id=%, total_persons=%, migrated=%', last_id, persons, migrated;
  END LOOP;

  RAISE NOTICE 'Migration complete. Migrated=%, Skipped=%, Persons=%', migrated, skipped, persons;

  -- Now rebuild identifiers for all affected persons by touching their external_id rows
  -- This fires the sync trigger which will add _source markers to the JSON
  RAISE NOTICE 'Rebuilding identifiers JSON with _source markers...';

  UPDATE person_external_id
  SET updated_at = NOW()
  WHERE created_by = 'migration';

  RAISE NOTICE 'Identifiers rebuild complete';

  RETURN QUERY SELECT migrated, skipped, persons;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Utility functions
-- ============================================================================

-- Find person by external ID (faster than JSON containment query)
-- NOTE: Only returns ACTIVE links; use find_person_by_external_id_any_status for auditing
CREATE OR REPLACE FUNCTION find_person_by_external_id(
  p_origin VARCHAR(50),
  p_external_id VARCHAR(255)
)
RETURNS TABLE(person_id UUID, is_verified BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  SELECT e.person_id, e.is_verified
  FROM person_external_id e
  WHERE e.origin = LOWER(p_origin)
    AND e.external_id_lower = LOWER(p_external_id)
    AND e.status = 'active'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Find person by external ID including removed links (for auditing/analytics)
CREATE OR REPLACE FUNCTION find_person_by_external_id_any_status(
  p_origin VARCHAR(50),
  p_external_id VARCHAR(255)
)
RETURNS TABLE(person_id UUID, is_verified BOOLEAN, status VARCHAR(20), removed_at TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  SELECT e.person_id, e.is_verified, e.status, e.removed_at
  FROM person_external_id e
  WHERE e.origin = LOWER(p_origin)
    AND e.external_id_lower = LOWER(p_external_id)
  ORDER BY e.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get all ACTIVE external IDs for a person
CREATE OR REPLACE FUNCTION get_person_external_ids(p_person_id UUID)
RETURNS TABLE(
  origin VARCHAR(50),
  external_id VARCHAR(255),
  legacy_type VARCHAR(100),
  is_verified BOOLEAN,
  verified_at TIMESTAMPTZ,
  verification_method VARCHAR(100)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.origin,
    e.external_id,
    e.legacy_type,
    e.is_verified,
    e.verified_at,
    e.verification_method
  FROM person_external_id e
  WHERE e.person_id = p_person_id
    AND e.status = 'active'
  ORDER BY e.created_at;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get ALL external IDs for a person including removed (for audit history)
CREATE OR REPLACE FUNCTION get_person_external_ids_with_history(p_person_id UUID)
RETURNS TABLE(
  origin VARCHAR(50),
  external_id VARCHAR(255),
  legacy_type VARCHAR(100),
  is_verified BOOLEAN,
  verified_at TIMESTAMPTZ,
  verification_method VARCHAR(100),
  status VARCHAR(20),
  removed_at TIMESTAMPTZ,
  removed_by VARCHAR(255),
  removal_reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.origin,
    e.external_id,
    e.legacy_type,
    e.is_verified,
    e.verified_at,
    e.verification_method,
    e.status,
    e.removed_at,
    e.removed_by,
    e.removal_reason
  FROM person_external_id e
  WHERE e.person_id = p_person_id
  ORDER BY e.created_at;
END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================
-- Run these queries after migration to verify success:
--
-- 1. Check row counts:
--    SELECT COUNT(*) AS external_id_count FROM person_external_id;
--    SELECT COUNT(*) AS persons_with_external_ids
--    FROM (SELECT DISTINCT person_id FROM person_external_id) x;
--
-- 2. Verify identifiers JSON has _source markers:
--    SELECT id, identifiers
--    FROM person
--    WHERE identifiers @> '[{"_source": "external"}]'
--    LIMIT 5;
--
-- 3. Test round-trip (JSON and table should match):
--    SELECT p.id,
--           (SELECT COUNT(*) FROM jsonb_array_elements(p.identifiers)
--            WHERE value->>'_source' = 'external') AS json_external_count,
--           (SELECT COUNT(*) FROM person_external_id e WHERE e.person_id = p.id) AS table_count
--    FROM person p
--    WHERE EXISTS (SELECT 1 FROM person_external_id e WHERE e.person_id = p.id)
--    LIMIT 10;
--
-- 4. Test lookup performance:
--    EXPLAIN ANALYZE SELECT * FROM find_person_by_external_id('goid', 'test123');
