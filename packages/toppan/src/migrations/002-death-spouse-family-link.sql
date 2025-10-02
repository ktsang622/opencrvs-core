-- Migration: Add death spouse family link trigger
-- Date: 2025-10-02
-- Purpose: Create family_links_forward when spouse is recorded in death event

-- Update the apply_event_participant_change_shadow function to handle death spouse
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
