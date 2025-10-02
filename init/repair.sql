-- =========================================================
-- FAMILY-LINK INFRA REPAIR + REBUILD (FINAL, FIXED)
-- =========================================================

-- 0) Safe-drop legacy objects & old indexes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='family_link') THEN
    EXECUTE 'DROP TABLE family_link CASCADE';
  ELSIF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name='family_link') THEN
    EXECUTE 'DROP VIEW family_link CASCADE';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='family_link_new') THEN
    EXECUTE 'DROP TABLE family_link_new CASCADE';
  ELSIF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name='family_link_new') THEN
    EXECUTE 'DROP VIEW family_link_new CASCADE';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name='family_links_bidirectional') THEN
    EXECUTE 'DROP VIEW family_links_bidirectional CASCADE';
  END IF;

  -- old unordered spouse index (legacy name)
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='ux_flnew_spouse_unordered') THEN
    EXECUTE 'DROP INDEX ux_flnew_spouse_unordered';
  END IF;

  -- if a previous unique INDEX (not constraint) existed on forward keys, drop to avoid ambiguity
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='ux_fl_forward_unique') THEN
    EXECUTE 'DROP INDEX ux_fl_forward_unique';
  END IF;
END$$;

-- 1) Enum type (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='relationship_type_enum') THEN
    CREATE TYPE relationship_type_enum AS ENUM
      ('mother','father','child','spouse','sibling','partner','guardian','grandparent','other');
  END IF;
END$$;

-- 2) Canonical forward table
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS family_links_forward (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id             uuid NOT NULL,
  related_person_id     uuid NOT NULL,
  relationship_type     relationship_type_enum NOT NULL,
  relationship_subtype  text NULL,
  source_event_id       uuid NOT NULL,
  start_date            date NOT NULL,   -- from event.event_date or event.created_at
  end_date              date NULL,       -- always clamped to >= start_date
  source                text NULL,
  notes                 text NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Safety: end >= start
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='family_links_forward' AND constraint_name='chk_start_before_end'
  ) THEN
    ALTER TABLE family_links_forward
      ADD CONSTRAINT chk_start_before_end
      CHECK (end_date IS NULL OR start_date <= end_date);
  END IF;
END$$;

-- *** KEY FIX: ensure a UNIQUE CONSTRAINT that matches ON CONFLICT keys ***
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_fl_forward'
      AND conrelid = 'family_links_forward'::regclass
  ) THEN
    ALTER TABLE family_links_forward
      ADD CONSTRAINT uq_fl_forward
      UNIQUE (person_id, related_person_id, relationship_type, source_event_id, start_date);
  END IF;
END$$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_fl_fwd_event    ON family_links_forward(source_event_id);
CREATE INDEX IF NOT EXISTS idx_fl_fwd_person   ON family_links_forward(person_id);
CREATE INDEX IF NOT EXISTS idx_fl_fwd_related  ON family_links_forward(related_person_id);
CREATE INDEX IF NOT EXISTS idx_fl_fwd_active   ON family_links_forward(person_id, related_person_id) WHERE end_date IS NULL;

-- Unordered uniqueness for spouse/partner (one row per pair per event)
CREATE UNIQUE INDEX IF NOT EXISTS ux_fl_spouse_unordered
ON family_links_forward (
  source_event_id,
  LEAST(person_id, related_person_id),
  GREATEST(person_id, related_person_id)
)
WHERE relationship_type IN ('spouse','partner');

-- 3) Bidirectional view (reverse edges are virtual)
CREATE OR REPLACE VIEW family_links_bidirectional AS
WITH ep_roles AS (
  SELECT
    e.id                AS event_id,
    ep.person_id        AS pid,
    lower(e.event_type) AS etype,
    ep.role             AS role_text
  FROM event_participant ep
  JOIN event e ON e.id = ep.event_id
  WHERE ep.status = 'active' AND ep.ended_at IS NULL
)
-- forward rows
SELECT
  fl.person_id,
  fl.related_person_id,
  fl.relationship_type,
  CASE
    WHEN fl.relationship_type = 'spouse' THEN
      CASE lower(rf.role_text)
        WHEN 'groom' THEN 'husband'
        WHEN 'bride' THEN 'wife'
        ELSE NULL
      END
    ELSE fl.relationship_subtype
  END AS relationship_subtype,
  fl.source_event_id,
  fl.start_date,
  fl.end_date,
  fl.source,
  fl.notes
FROM family_links_forward fl
LEFT JOIN ep_roles rf
  ON rf.event_id = fl.source_event_id
 AND rf.pid      = fl.person_id
 AND rf.etype    = 'marriage'

UNION ALL
-- reverse (virtual) rows
SELECT
  fl.related_person_id AS person_id,
  fl.person_id         AS related_person_id,
  CASE fl.relationship_type
    WHEN 'mother'      THEN 'child'::relationship_type_enum
    WHEN 'father'      THEN 'child'::relationship_type_enum
    WHEN 'guardian'    THEN 'child'::relationship_type_enum
    WHEN 'grandparent' THEN 'child'::relationship_type_enum
    WHEN 'spouse'      THEN 'spouse'::relationship_type_enum
    WHEN 'sibling'     THEN 'sibling'::relationship_type_enum
    WHEN 'partner'     THEN 'partner'::relationship_type_enum
    WHEN 'child'       THEN 'other'::relationship_type_enum
    ELSE                    'other'::relationship_type_enum
  END AS relationship_type,
  CASE
    WHEN fl.relationship_type = 'spouse' THEN
      CASE lower(rr.role_text)
        WHEN 'groom' THEN 'husband'
        WHEN 'bride' THEN 'wife'
        ELSE NULL
      END
    ELSE NULL
  END AS relationship_subtype,
  fl.source_event_id,
  fl.start_date,
  fl.end_date,
  fl.source,
  'Reverse (virtual)' AS notes
FROM family_links_forward fl
LEFT JOIN ep_roles rr
  ON rr.event_id = fl.source_event_id
 AND rr.pid      = fl.related_person_id
 AND rr.etype    = 'marriage';

-- 4) Upsert helper (modern version with support for end_date and death spouse logic)
CREATE OR REPLACE FUNCTION upsert_family_link_forward_shadow(
    p_person_id uuid,
    p_related_person_id uuid,
    p_relationship relationship_type_enum,
    p_event_id uuid,
    p_start_date date,
    p_end_date date,
    p_source text
) RETURNS void AS $$
BEGIN
  -- Close any active conflicting link (same anchor/role/event pointing elsewhere)
  UPDATE family_links_forward fl
     SET end_date = COALESCE(p_start_date, CURRENT_DATE),
         notes = COALESCE(fl.notes,'') || ' [Auto-ended due to revision]'
   WHERE fl.person_id = p_person_id
     AND fl.relationship_type = p_relationship
     AND fl.source_event_id = p_event_id
     AND fl.end_date IS NULL
     AND fl.related_person_id <> p_related_person_id;

  -- Upsert the current link
  INSERT INTO family_links_forward(
    person_id, related_person_id, relationship_type,
    source_event_id, start_date, end_date, source, notes
  )
  VALUES (
    p_person_id, p_related_person_id, p_relationship,
    p_event_id, p_start_date, p_end_date, p_source, 'From EP (shadow)'
  )
  ON CONFLICT (person_id, related_person_id, relationship_type, source_event_id)
  DO UPDATE SET
    start_date = COALESCE(family_links_forward.start_date, EXCLUDED.start_date),
    end_date   = COALESCE(EXCLUDED.end_date, family_links_forward.end_date),
    source     = COALESCE(EXCLUDED.source, family_links_forward.source);
END;
$$ LANGUAGE plpgsql;

-- 5) Worker (modern version with death spouse informational link support)
CREATE OR REPLACE FUNCTION apply_event_participant_change_shadow(p_event_participant_id uuid)
RETURNS void AS $$
DECLARE
  ep    event_participant%ROWTYPE;
  ev    event%ROWTYPE;
  m_row relationship_role_map%ROWTYPE;

  start_d   date;
  end_d     date;
  is_active boolean;
  is_ready  boolean;

  anchor_id uuid;
  other_id  uuid;
BEGIN
  SELECT * INTO ep FROM event_participant WHERE id = p_event_participant_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO ev FROM event WHERE id = ep.event_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO m_row
  FROM relationship_role_map
  WHERE event_type = lower(ev.event_type)
    AND role_text  = ep.role;
  IF NOT FOUND THEN RETURN; END IF;

  is_active := (ep.status = 'active' AND ep.ended_at IS NULL);
  is_ready  := (ep.status IN ('active','review') AND ep.ended_at IS NULL);

  start_d := COALESCE(ev.event_date, ep.created_at::date, CURRENT_DATE);
  end_d   := NULL;

  -- ========= BIRTH =========
  IF lower(ev.event_type) = 'birth' THEN
    SELECT ep2.person_id
      INTO anchor_id
    FROM event_participant ep2
    WHERE ep2.event_id = ep.event_id
      AND ep2.role = 'subject'
      AND ep2.status = 'active'
      AND ep2.ended_at IS NULL
    ORDER BY ep2.created_at
    LIMIT 1;

    IF anchor_id IS NULL THEN RETURN; END IF;

    IF is_ready AND m_row.creates_link AND ep.person_id IS NOT NULL THEN
      PERFORM upsert_family_link_forward_shadow(
        anchor_id,
        ep.person_id,
        m_row.forward_relationship,
        ep.event_id,
        start_d,
        NULL,
        COALESCE(ev.source,'OpenCRVS')
      );
    END IF;

    IF ep.ended_at IS NOT NULL AND m_row.creates_link AND ep.person_id IS NOT NULL THEN
      UPDATE family_links_forward fl
         SET end_date = ep.ended_at::date,
             notes = COALESCE(fl.notes,'') || ' [Closed by EP ended_at]'
       WHERE fl.person_id = anchor_id
         AND fl.related_person_id = ep.person_id
         AND fl.relationship_type = m_row.forward_relationship
         AND fl.source_event_id = ep.event_id
         AND fl.end_date IS NULL;
    END IF;

    RETURN;
  END IF;

  -- ========= MARRIAGE =========
  IF lower(ev.event_type) = 'marriage' THEN
    IF NOT is_active OR NOT m_row.creates_link OR ep.person_id IS NULL THEN
      RETURN;
    END IF;

    SELECT ep2.person_id
      INTO other_id
    FROM event_participant ep2
    WHERE ep2.event_id = ep.event_id
      AND ep2.role IN (
        SELECT role_text FROM relationship_role_map
        WHERE event_type = 'marriage'
          AND counterpart_group = m_row.counterpart_group
      )
      AND ep2.id <> ep.id
      AND ep2.status = 'active'
      AND ep2.ended_at IS NULL
    LIMIT 1;

    IF other_id IS NULL THEN RETURN; END IF;

    INSERT INTO family_links_forward(
      person_id, related_person_id, relationship_type,
      source_event_id, start_date, end_date, source, notes
    )
    SELECT
      LEAST(ep.person_id, other_id),
      GREATEST(ep.person_id, other_id),
      'spouse'::relationship_type_enum,
      ep.event_id,
      start_d,
      NULL,
      COALESCE(ev.source,'OpenCRVS'),
      'From marriage event (shadow)'
    ON CONFLICT (person_id, related_person_id, relationship_type, source_event_id)
    DO NOTHING;

    RETURN;
  END IF;

  -- ========= DEATH =========
  IF lower(ev.event_type) = 'death' THEN
    -- Death: Handle subject (deceased) - close spouse links
    IF ep.role = 'subject' AND is_ready AND ep.person_id IS NOT NULL THEN
      UPDATE family_links_forward
      SET end_date = COALESCE(ev.event_date, CURRENT_DATE),
          notes = COALESCE(notes, '') || ' [Ended by death]'
      WHERE (person_id = ep.person_id OR related_person_id = ep.person_id)
        AND relationship_type = 'spouse'
        AND end_date IS NULL;

      RAISE NOTICE 'Death: Closed spouse links for deceased person %', ep.person_id;
    END IF;

    -- Death: Handle informant claiming spouse - create informational link if no marriage
    IF ep.role = 'informant' AND is_ready AND ep.person_id IS NOT NULL THEN
      DECLARE
        v_relationship_details jsonb;
        v_informant_type text;
        v_deceased_id uuid;
        v_marriage_count integer;
      BEGIN
        v_relationship_details := ep.relationship_details::jsonb;
        v_informant_type := v_relationship_details->>'informantType';

        IF v_informant_type = 'SPOUSE' THEN
          SELECT ep2.person_id INTO v_deceased_id
          FROM event_participant ep2
          WHERE ep2.event_id = ep.event_id
            AND ep2.role = 'subject'
            AND ep2.status = 'active'
            AND ep2.ended_at IS NULL
          ORDER BY ep2.created_at
          LIMIT 1;

          IF v_deceased_id IS NOT NULL THEN
            SELECT COUNT(*) INTO v_marriage_count
            FROM family_links_forward
            WHERE (person_id = v_deceased_id OR related_person_id = v_deceased_id)
              AND relationship_type = 'spouse'
              AND source = 'marriage_registration'
              AND (end_date IS NULL OR end_date >= COALESCE(start_d, CURRENT_DATE));

            IF v_marriage_count = 0 THEN
              PERFORM upsert_family_link_forward_shadow(
                ep.person_id,
                v_deceased_id,
                'spouse'::relationship_type_enum,
                ep.event_id,
                start_d,
                NULL,
                'death_registration'
              );

              UPDATE family_links_forward
              SET end_date = COALESCE(ev.event_date, CURRENT_DATE),
                  notes = COALESCE(notes, '') || ' [Informational - no marriage record found. Reported by informant on death form]'
              WHERE source_event_id = ep.event_id
                AND relationship_type = 'spouse'
                AND (person_id = ep.person_id OR related_person_id = ep.person_id)
                AND end_date IS NULL;

              RAISE NOTICE 'Death: Created informational spouse link (no marriage) for deceased % and informant spouse %', v_deceased_id, ep.person_id;
            ELSE
              RAISE NOTICE 'Death: Skipped informational spouse link - marriage exists for deceased %', v_deceased_id;
            END IF;
          END IF;
        END IF;
      END;
    END IF;

    RETURN;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 6) Trigger wrapper (correct trigger syntax)
DROP FUNCTION IF EXISTS event_participant_shadow_sync() CASCADE;
CREATE OR REPLACE FUNCTION event_participant_shadow_sync()
RETURNS trigger AS $$
BEGIN
  PERFORM apply_event_participant_change_shadow(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_participant_shadow_sync ON event_participant;
CREATE TRIGGER trg_event_participant_shadow_sync
AFTER INSERT OR UPDATE OF role, person_id, event_id, status, ended_at, created_at, relationship_details
ON event_participant
FOR EACH ROW
EXECUTE FUNCTION event_participant_shadow_sync();

-- 7) Rebuild from existing EP rows (stable, timestamp-driven order)
TRUNCATE TABLE family_links_forward;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT epx.id
    FROM event_participant epx
    JOIN event ex ON ex.id = epx.event_id
    ORDER BY ex.event_date NULLS LAST,
             ex.created_at NULLS LAST,
             epx.created_at NULLS LAST,
             epx.id
  LOOP
    PERFORM apply_event_participant_change_shadow(r.id);
  END LOOP;
END $$;

-- 8) Sanity counts
SELECT
  (SELECT count(*) FROM family_links_forward)       AS forward_cnt,
  (SELECT count(*) FROM family_links_bidirectional) AS bidi_cnt;