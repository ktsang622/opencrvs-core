import { Request, ResponseToolkit } from '@hapi/hapi';
import { Pool } from 'pg';
import { TOPPAN_DB_HOST, TOPPAN_DB_PORT, TOPPAN_DB_NAME, TOPPAN_DB_USER, TOPPAN_DB_PASSWORD } from '../../environment';

const pool = new Pool({
  user: TOPPAN_DB_USER,
  host: TOPPAN_DB_HOST,
  database: TOPPAN_DB_NAME,
  password: TOPPAN_DB_PASSWORD,
  port: TOPPAN_DB_PORT,
});

export const personEventsHandler = async (request: Request, h: ResponseToolkit) => {
  const { personId } = request.params;

  if (!personId) {
    return h.response({ message: 'Person ID is required' }).code(400);
  }

  try {
    // Get person details with relationship end date
    const personQuery = `
      SELECT 
        p.id,
        p.given_name,
        p.family_name,
        p.full_name,
        p.gender,
        p.dob,
        p.death_date,
        p.place_of_birth,
        p.place_of_birth_uuid,
        p.identifiers,
        p.status,
        fl.end_date as relationship_end_date
      FROM person p
      LEFT JOIN family_links_bidirectional fl ON p.id = fl.person_id OR p.id = fl.related_person_id
      WHERE p.id = $1
      ORDER BY fl.end_date DESC NULLS LAST
      LIMIT 1
    `;
    
    const personResult = await pool.query(personQuery, [personId]);
    
    if (personResult.rows.length === 0) {
      return h.response({ message: 'Person not found' }).code(404);
    }

    const person = personResult.rows[0];

    // Get events for this person
    const eventsQuery = `
      SELECT 
        e.id as event_id,
        e.event_type,
        e.event_date,
        e.location,
        e.source,
        e.metadata,
        e.status as event_status,
        e.crvs_event_uuid,
        ep.role,
        ep.relationship_details,
        ep.status as participant_status,
        ep.remarks
      FROM event e
      JOIN event_participant ep ON e.id = ep.event_id
      WHERE ep.person_id = $1 
        AND ep.status IN ('active', 'inactive', 'review')
      ORDER BY e.event_date DESC, e.created_at DESC
    `;

    const eventsResult = await pool.query(eventsQuery, [personId]);

    // Format events for the frontend
    const events = eventsResult.rows.map(row => {
      const metadata = row.metadata || {};
      const trackingId = metadata.trackingId || 'N/A';
      
      return {
        type: formatEventType(row.event_type),
        date: row.event_date || 'Unknown',
        status: formatStatus(row.event_status),
        role: formatRole(row.role),
        registrationId: trackingId,
        declarationId: row.crvs_event_uuid,
        crvsEventUuid: row.crvs_event_uuid,
        eventType: row.event_type,
        location: row.location || 'Unknown',
        source: row.source || 'Unknown',
        eventId: row.event_id,
        remarks: row.remarks
      };
    });

    // Format person data
    const identifiers = person.identifiers || [];
    let nationalId = identifiers.find((id: any) => id.type === 'NATIONAL_ID')?.value || '';
    
    // Generate National ID for children if missing
    if (!nationalId) {
      const isChild = eventsResult.rows.some(row => row.role === 'subject' && row.event_type === 'birth');
      if (isChild) {
        nationalId = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
      }
    }
    
    const displayId = nationalId || identifiers.find((id: any) => id.value?.trim())?.value || '';
    const displayIdType = nationalId ? 'National ID' : (identifiers.find((id: any) => id.value?.trim())?.type || 'ID');
    const birthRegNumber = identifiers.find((id: any) => id.type === 'BIRTH_REGISTRATION_NUMBER')?.value;
    
    const responseData = {
      person: {
        id: person.id,
        givenName: person.given_name,
        familyName: person.family_name,
        fullName: person.full_name,
        nationalId: displayId,
        nationalIdType: displayIdType,
        birthRegistrationNumber: birthRegNumber,
        phone: 'N/A',
        dateOfBirth: person.dob,
        dateOfDeath: person.death_date,
        gender: person.gender,
        placeOfBirth: person.place_of_birth,
        place_of_birth_uuid: person.place_of_birth_uuid,
        status: person.status,
        identifiers: identifiers,
        end_date: person.relationship_end_date
      },
      events: events
    };

    return h.response(responseData).code(200);

  } catch (error) {
    console.error('Database error:', error);
    return h.response({ message: 'Internal server error' }).code(500);
  }
};

export const eventParticipantsHandler = async (request: Request, h: ResponseToolkit) => {
  const { eventId } = request.params;

  if (!eventId) {
    return h.response({ message: 'Event ID is required' }).code(400);
  }

  try {
    // Get event participants with person details
    const query = `
WITH ep AS (
  SELECT 
    ep.id               AS participant_id,
    ep.role,
    ep.relationship_details,
    ep.crvs_person_id,
    ep.ended_at,
    ep.person_id,
    p.given_name,
    p.family_name,
    p.full_name,
    p.gender,
    p.dob,
    p.identifiers,
    p.status,
    e.id                AS event_id,
    e.event_type,
    e.event_date,
    e.crvs_event_uuid
  FROM event_participant ep
  JOIN person p ON ep.person_id = p.id
  JOIN event e  ON ep.event_id = e.id
  WHERE e.crvs_event_uuid = $1
    AND ep.status IN ('active', 'inactive', 'review')
),
subject AS (
  SELECT person_id AS subject_id, event_id
  FROM ep
  WHERE role = 'subject'
  LIMIT 1
)
SELECT
  ep.participant_id,
  ep.role,
  ep.relationship_details,
  ep.crvs_person_id,
  ep.ended_at,
  ep.person_id,
  ep.given_name,
  ep.family_name,
  ep.full_name,
  ep.gender,
  ep.dob,
  ep.identifiers,
  ep.status,
  ep.event_type,
  ep.event_date,
  ep.crvs_event_uuid,
  fl.end_date AS relationship_end_date
FROM ep
CROSS JOIN subject s
LEFT JOIN LATERAL (
  SELECT end_date
  FROM family_links_bidirectional fl
  WHERE fl.source_event_id = ep.event_id
    AND ep.role <> 'subject'
    AND (
      (fl.person_id = s.subject_id AND fl.related_person_id = ep.person_id) OR
      (fl.person_id = ep.person_id AND fl.related_person_id = s.subject_id)
    )
  LIMIT 1
) fl ON true
ORDER BY CASE ep.role 
  WHEN 'subject'   THEN 1
  WHEN 'mother'    THEN 2
  WHEN 'father'    THEN 3
  WHEN 'informant' THEN 4
  ELSE 5
END;
    `;

    const result = await pool.query(query, [eventId]);

    if (result.rows.length === 0) {
      return h.response({ message: 'Event not found or no participants' }).code(404);
    }

    const eventInfo = {
      eventType: result.rows[0].event_type,
      eventDate: result.rows[0].event_date,
      crvsEventUuid: result.rows[0].crvs_event_uuid
    };

    const participants = result.rows.map(row => {
      const identifiers = row.identifiers || [];
      let nationalId = identifiers.find((id: any) => id.type === 'NATIONAL_ID')?.value || '';
      
      // Generate National ID for children if missing
      if (!nationalId && row.role === 'subject' && row.event_type === 'birth') {
        nationalId = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
      }
      
      const displayId = nationalId || identifiers.find((id: any) => id.value?.trim() && id.type !== 'crvs')?.value || '';
      const relationshipDetails = row.relationship_details || {};

      return {
        participantId: row.participant_id,
        role: row.role,
        relationshipDetails: relationshipDetails,
        relationshipEndDate: row.relationship_end_date,
        person: {
          id: row.person_id,
          givenName: row.given_name,
          familyName: row.family_name,
          fullName: row.full_name,
          nationalId: displayId,
          gender: row.gender,
          dateOfBirth: row.dob,
          status: row.status,
          crvsPersonId: row.crvs_person_id,
          identifiers: identifiers
        }
      };
    });

    return h.response({
      event: eventInfo,
      participants: participants
    }).code(200);

  } catch (error) {
    console.error('Database error:', error);
    return h.response({ message: 'Internal server error' }).code(500);
  }
};

function formatEventType(eventType: string): string {
  switch (eventType?.toLowerCase()) {
    case 'birth':
      return 'Birth Registration';
    case 'death':
      return 'Death Registration';
    case 'marriage':
      return 'Marriage Registration';
    default:
      return eventType || 'Unknown Event';
  }
}

function formatStatus(status: string): string {
  switch (status?.toLowerCase()) {
    case 'registered':
      return 'Registered';
    case 'declared':
      return 'Declared';
    case 'issued':
      return 'Issued';
    default:
      return status || 'Unknown';
  }
}

export const personRelationshipsHandler = async (request: Request, h: ResponseToolkit) => {
  const { personId } = request.params;

  if (!personId) {
    return h.response({ message: 'Person ID is required' }).code(400);
  }

  try {
    const relationshipsQuery = `
      SELECT 
        e.crvs_event_uuid,
        ep.ended_at::date AS end_date,
        ep.remarks AS participant_remarks
      FROM event_participant ep
      JOIN event e ON e.id = ep.event_id
      WHERE ep.person_id = $1 
        AND ep.ended_at IS NOT NULL
        AND ep.status = 'inactive'
      ORDER BY ep.ended_at DESC
    `;

    const result = await pool.query(relationshipsQuery, [personId]);
    
    const relationships = result.rows.reduce((acc: any, row: any) => {
      let parsedRemarks = row.participant_remarks;
      
      if (row.participant_remarks) {
        try {
          // Parse the last JSON remark from concatenated string
          const parts = row.participant_remarks.split(' | ');
          const lastPart = parts[parts.length - 1];
          const parsed = JSON.parse(lastPart);
          parsedRemarks = `${parsed.base} (${parsed.correctionType || parsed.reason || 'Unknown'})`;
        } catch {
          // Keep original if parsing fails
          parsedRemarks = row.participant_remarks;
        }
      }
      
      acc[row.crvs_event_uuid] = {
        end_date: row.end_date,
        participant_remarks: parsedRemarks
      };
      return acc;
    }, {});

    return h.response({ relationships }).code(200);

  } catch (error) {
    console.error('Database error:', error);
    return h.response({ message: 'Internal server error' }).code(500);
  }
};

function formatRole(role: string): string {
  switch (role?.toLowerCase()) {
    case 'subject':
      return 'Subject';
    case 'mother':
      return 'Mother';
    case 'father':
      return 'Father';
    case 'groom':
      return 'Groom';
    case 'bride':
      return 'Bride';
    case 'informant':
      return 'Informant';
    default:
      return role || 'Unknown';
  }
}