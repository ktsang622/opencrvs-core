-- Initialize Toppan database schema
-- Based on family-tree database schema

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Create relationship type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='relationship_type_enum') THEN
    CREATE TYPE relationship_type_enum AS ENUM
      ('mother','father','child','spouse','sibling','partner','guardian','grandparent','other');
  END IF;
END$$;

-- Create person table
CREATE TABLE IF NOT EXISTS person (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  given_name TEXT NOT NULL,
  family_name TEXT NOT NULL,
  full_name TEXT GENERATED ALWAYS AS ((given_name || ' ' || family_name)) STORED,
  gender TEXT NOT NULL,
  dob DATE,
  place_of_birth TEXT,
  place_of_birth_uuid UUID,
  identifiers JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  death_date DATE,
  CONSTRAINT person_gender_check CHECK (gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text, 'unknown'::text]))
);

-- Create event table
CREATE TABLE IF NOT EXISTS event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_date DATE,
  location TEXT,
  source TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  crvs_event_uuid UUID UNIQUE NOT NULL,
  duplicates UUID[],
  status TEXT,
  last_update_at TIMESTAMP,
  remarks TEXT
);

-- Create event_participant table
CREATE TABLE IF NOT EXISTS event_participant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID,
  event_id UUID,
  role TEXT NOT NULL,
  relationship_details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  crvs_person_id UUID,
  status TEXT DEFAULT 'active',
  ended_at TIMESTAMP,
  remarks TEXT
);

-- Create family_links_forward table (canonical forward table)
CREATE TABLE IF NOT EXISTS family_links_forward (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL,
  related_person_id UUID NOT NULL,
  relationship_type relationship_type_enum NOT NULL,
  relationship_subtype TEXT,
  source_event_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  source TEXT DEFAULT 'OpenCRVS',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  period daterange GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED,
  CONSTRAINT family_link_check CHECK (person_id <> related_person_id),
  CONSTRAINT chk_start_before_end CHECK (end_date IS NULL OR start_date <= end_date)
);

-- Create family_link table (legacy compatibility)
CREATE TABLE IF NOT EXISTS family_link (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL,
  related_person_id UUID NOT NULL,
  relationship_type relationship_type_enum NOT NULL,
  relationship_subtype TEXT,
  source_event_id UUID,
  start_date DATE,
  end_date DATE,
  source TEXT DEFAULT 'OpenCRVS',
  notes TEXT,
  CONSTRAINT family_link_check CHECK (person_id <> related_person_id)
);

-- Create sync_request table
CREATE TABLE IF NOT EXISTS sync_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  action TEXT NOT NULL,
  crvs_event_uuid UUID NOT NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

-- Create relationship_role_map table
CREATE TABLE IF NOT EXISTS relationship_role_map (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  role_text TEXT NOT NULL,
  forward_relationship relationship_type_enum NOT NULL,
  reverse_relationship relationship_type_enum NOT NULL,
  is_anchor BOOLEAN DEFAULT false NOT NULL,
  creates_link BOOLEAN DEFAULT true NOT NULL,
  closes_links BOOLEAN DEFAULT false NOT NULL,
  counterpart_group TEXT,
  CONSTRAINT chk_event_type_lower CHECK (event_type = lower(event_type))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_full_name ON person USING btree (full_name);
CREATE INDEX IF NOT EXISTS idx_identifiers_gin ON person USING gin (identifiers);
CREATE INDEX IF NOT EXISTS idx_event_type ON event USING btree (event_type);
CREATE UNIQUE INDEX IF NOT EXISTS unique_crvs_event_uuid ON event USING btree (crvs_event_uuid);
CREATE INDEX IF NOT EXISTS idx_person_event ON event_participant USING btree (person_id, event_id);
CREATE INDEX IF NOT EXISTS idx_role ON event_participant USING btree (role);
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_participant ON event_participant USING btree (event_id, crvs_person_id) WHERE (status = 'active'::text);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_father_per_event ON event_participant USING btree (event_id) WHERE ((role = 'father'::text) AND (status = 'active'::text) AND (ended_at IS NULL));
CREATE INDEX IF NOT EXISTS ix_ep_event_person ON event_participant USING btree (event_id, person_id);
CREATE INDEX IF NOT EXISTS idx_family_link_person_id ON family_link USING btree (person_id);
CREATE INDEX IF NOT EXISTS idx_family_link_related_person_id ON family_link USING btree (related_person_id);
CREATE INDEX IF NOT EXISTS idx_family_link_event ON family_link USING btree (source_event_id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_family_link ON family_link USING btree (person_id, related_person_id, relationship_type, source_event_id);
CREATE INDEX IF NOT EXISTS idx_sync_request_status ON sync_request USING btree (status);
CREATE INDEX IF NOT EXISTS idx_sync_request_crvs_uuid ON sync_request USING btree (crvs_event_uuid);
CREATE INDEX IF NOT EXISTS idx_sync_request_created_at ON sync_request USING btree (created_at);
CREATE UNIQUE INDEX IF NOT EXISTS relationship_role_map_event_type_role_text_key ON relationship_role_map USING btree (event_type, role_text);

-- Forward table indexes
CREATE INDEX IF NOT EXISTS idx_fl_fwd_event ON family_links_forward(source_event_id);
CREATE INDEX IF NOT EXISTS idx_fl_fwd_person ON family_links_forward(person_id);
CREATE INDEX IF NOT EXISTS idx_fl_fwd_related ON family_links_forward(related_person_id);
CREATE INDEX IF NOT EXISTS idx_fl_fwd_active ON family_links_forward(person_id, related_person_id) WHERE end_date IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_fl_spouse_unordered ON family_links_forward (
  source_event_id,
  LEAST(person_id, related_person_id),
  GREATEST(person_id, related_person_id)
) WHERE relationship_type IN ('spouse','partner');

-- Add foreign key constraints
ALTER TABLE event_participant DROP CONSTRAINT IF EXISTS event_participant_event_id_fkey;
ALTER TABLE event_participant ADD CONSTRAINT event_participant_event_id_fkey FOREIGN KEY (event_id) REFERENCES event(id) ON DELETE CASCADE;
ALTER TABLE event_participant DROP CONSTRAINT IF EXISTS event_participant_person_id_fkey;
ALTER TABLE event_participant ADD CONSTRAINT event_participant_person_id_fkey FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE CASCADE;
ALTER TABLE family_link DROP CONSTRAINT IF EXISTS family_link_person_id_fkey;
ALTER TABLE family_link ADD CONSTRAINT family_link_person_id_fkey FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE CASCADE;
ALTER TABLE family_link DROP CONSTRAINT IF EXISTS family_link_related_person_id_fkey;
ALTER TABLE family_link ADD CONSTRAINT family_link_related_person_id_fkey FOREIGN KEY (related_person_id) REFERENCES person(id) ON DELETE CASCADE;
ALTER TABLE family_link DROP CONSTRAINT IF EXISTS family_link_source_event_id_fkey;
ALTER TABLE family_link ADD CONSTRAINT family_link_source_event_id_fkey FOREIGN KEY (source_event_id) REFERENCES event(id) ON DELETE SET NULL;

-- Add unique constraint for family_links_forward
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

-- Create migrations tracking table
CREATE TABLE IF NOT EXISTS toppan_migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) UNIQUE NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);