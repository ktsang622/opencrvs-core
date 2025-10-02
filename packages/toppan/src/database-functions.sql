-- Database functions and views for Toppan service
-- Based on family-tree repair.sql

-- Upsert helper function
CREATE OR REPLACE FUNCTION upsert_family_link_forward_shadow(
  p_person_id           uuid,
  p_related_person_id   uuid,
  p_relationship        relationship_type_enum,
  p_event_id            uuid,
  p_source              text
) RETURNS void AS $$
DECLARE
  e_rec     RECORD;
  v_person  uuid;
  v_related uuid;
  v_start   date;
BEGIN
  SELECT e.event_date::date AS ev_date, e.created_at::date AS ev_created
  INTO e_rec
  FROM event e
  WHERE e.id = p_event_id;

  v_start := COALESCE(e_rec.ev_date, e_rec.ev_created);

  IF p_relationship IN ('spouse','partner') THEN
    v_person  := LEAST(p_person_id, p_related_person_id);
    v_related := GREATEST(p_person_id, p_related_person_id);
  ELSE
    v_person  := p_person_id;
    v_related := p_related_person_id;
  END IF;

  -- Auto-close only for parental links revised within the same event
  IF p_relationship IN ('mother','father') THEN
    UPDATE family_links_forward fl
    SET end_date = GREATEST(v_start, COALESCE(fl.start_date, v_start)),
        notes    = COALESCE(fl.notes,'') || ' [Auto-ended: revision]'
    WHERE fl.person_id = v_person
      AND fl.relationship_type = p_relationship
      AND fl.source_event_id = p_event_id
      AND fl.end_date IS NULL
      AND fl.related_person_id <> v_related;
  END IF;

  INSERT INTO family_links_forward(
    person_id, related_person_id, relationship_type, relationship_subtype,
    source_event_id, start_date, end_date, source, notes
  )
  VALUES (
    v_person, v_related, p_relationship, NULL,
    p_event_id, v_start, NULL, p_source, 'Auto-linked from event'
  )
  ON CONFLICT (person_id, related_person_id, relationship_type, source_event_id, start_date)
  DO UPDATE SET
    start_date = LEAST(family_links_forward.start_date, EXCLUDED.start_date),
    source     = COALESCE(EXCLUDED.source, family_links_forward.source);
END;
$$ LANGUAGE plpgsql;

-- Worker function
CREATE OR REPLACE FUNCTION apply_event_participant_change_shadow(p_event_participant_id uuid)
RETURNS void AS $$
DECLARE
  ep_rec      RECORD;
  subject_id  uuid;
  v_start     date;
  v_close     date;
  counterpart uuid;
BEGIN
  SELECT epx.*, ex.event_type,
         ex.event_date::date      AS ev_date,
         ex.created_at::date      AS ev_created,
         ex.last_update_at::date  AS ev_updated,
         COALESCE(ex.source,'OpenCRVS') AS ev_source
  INTO ep_rec
  FROM event_participant epx
  JOIN event ex ON ex.id = epx.event_id
  WHERE epx.id = p_event_participant_id;

  IF ep_rec.id IS NULL THEN RETURN; END IF;

  v_start := COALESCE(ep_rec.ev_date, ep_rec.ev_created);

  -- Birth: child <- mother/father (subject is the child)
  IF lower(ep_rec.event_type) = 'birth' THEN
    SELECT person_id INTO subject_id
    FROM event_participant
    WHERE event_id = ep_rec.event_id AND role = 'subject'
    ORDER BY created_at NULLS FIRST, id
    LIMIT 1;

    IF subject_id IS NOT NULL AND ep_rec.role IN ('mother','father') THEN
      PERFORM upsert_family_link_forward_shadow(
        subject_id, ep_rec.person_id, ep_rec.role::relationship_type_enum,
        ep_rec.event_id, ep_rec.ev_source
      );
    END IF;

    IF subject_id IS NOT NULL AND ep_rec.role IN ('mother','father') AND ep_rec.ended_at IS NOT NULL THEN
      v_close := COALESCE(ep_rec.ended_at::date, ep_rec.ev_updated, v_start);
      UPDATE family_links_forward fl
      SET end_date = GREATEST(v_close, COALESCE(fl.start_date, v_close)),
          notes    = COALESCE(fl.notes,'') || ' [Closed by EP ended_at]'
      WHERE fl.person_id = subject_id
        AND fl.related_person_id = ep_rec.person_id
        AND fl.relationship_type = ep_rec.role::relationship_type_enum
        AND fl.source_event_id = ep_rec.event_id
        AND fl.end_date IS NULL;
    END IF;
  END IF;

  -- Marriage: spouse (normalize pair; either EP can arrive first)
  IF lower(ep_rec.event_type) = 'marriage' AND ep_rec.role IN ('bride','groom') THEN
    SELECT person_id INTO counterpart
    FROM event_participant
    WHERE event_id = ep_rec.event_id
      AND role IN ('bride','groom')
      AND person_id <> ep_rec.person_id
    ORDER BY created_at NULLS FIRST, id
    LIMIT 1;

    IF counterpart IS NOT NULL THEN
      PERFORM upsert_family_link_forward_shadow(
        ep_rec.person_id, counterpart, 'spouse',
        ep_rec.event_id, ep_rec.ev_source
      );
    END IF;

    IF ep_rec.ended_at IS NOT NULL THEN
      v_close := COALESCE(ep_rec.ended_at::date, ep_rec.ev_updated, v_start);
      UPDATE family_links_forward fl
      SET end_date = GREATEST(v_close, COALESCE(fl.start_date, v_close)),
          notes    = COALESCE(fl.notes,'') || ' [Closed by EP ended_at]'
      WHERE fl.source_event_id = ep_rec.event_id
        AND fl.relationship_type = 'spouse'
        AND (fl.person_id, fl.related_person_id) = (
             LEAST(ep_rec.person_id, COALESCE(counterpart, ep_rec.person_id)),
             GREATEST(ep_rec.person_id, COALESCE(counterpart, ep_rec.person_id))
           )
        AND fl.end_date IS NULL;
    END IF;
  END IF;

  -- Death: close spouse/partner links for subject on death date
  IF lower(ep_rec.event_type) = 'death' AND ep_rec.role = 'subject' THEN
    v_close := COALESCE(v_start, ep_rec.ev_updated);
    UPDATE family_links_forward fl
    SET end_date = GREATEST(v_close, COALESCE(fl.start_date, v_close)),
        notes    = COALESCE(fl.notes,'') || ' [Closed by death]'
    WHERE (fl.person_id = ep_rec.person_id OR fl.related_person_id = ep_rec.person_id)
      AND fl.relationship_type IN ('spouse','partner')
      AND fl.end_date IS NULL;
  END IF;

  -- Death: create informational spouse link when spouse is listed
  -- This creates a dotted-line relationship for family tree display
  IF lower(ep_rec.event_type) = 'death' AND ep_rec.role = 'spouse' THEN
    SELECT person_id INTO subject_id
    FROM event_participant
    WHERE event_id = ep_rec.event_id AND role = 'subject'
    ORDER BY created_at NULLS FIRST, id
    LIMIT 1;

    IF subject_id IS NOT NULL THEN
      -- Create the informational spouse link
      PERFORM upsert_family_link_forward_shadow(
        ep_rec.person_id,
        subject_id,
        'spouse',
        ep_rec.event_id,
        'death_registration'
      );

      -- Immediately close it (relationship ends at death)
      v_close := COALESCE(v_start, ep_rec.ev_updated);
      UPDATE family_links_forward
      SET end_date = GREATEST(v_close, COALESCE(start_date, v_close)),
          notes = COALESCE(notes,'') || ' [Informational from death registration - not legal marriage]'
      WHERE source_event_id = ep_rec.event_id
        AND relationship_type = 'spouse'
        AND (person_id = ep_rec.person_id OR related_person_id = ep_rec.person_id)
        AND end_date IS NULL;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger function
CREATE OR REPLACE FUNCTION event_participant_shadow_sync()
RETURNS trigger AS $$
BEGIN
  PERFORM apply_event_participant_change_shadow(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_event_participant_shadow_sync ON event_participant;
CREATE TRIGGER trg_event_participant_shadow_sync
AFTER INSERT OR UPDATE OF role, person_id, event_id, status, ended_at, created_at, relationship_details
ON event_participant
FOR EACH ROW
EXECUTE FUNCTION event_participant_shadow_sync();

-- Create bidirectional view
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

-- Create get_family view (updated to use family_links_bidirectional)
CREATE OR REPLACE VIEW get_family AS
SELECT f.person_id,
    f.relationship_type,
    json_agg(json_build_object(
        'related_person_id', f.related_person_id,
        'relationship_subtype', f.relationship_subtype,
        'start_date', f.start_date,
        'end_date', f.end_date,
        'source_event_id', f.source_event_id,
        'source', f.source,
        'notes', f.notes
    )) AS relatives
FROM family_links_bidirectional f
GROUP BY f.person_id, f.relationship_type;