import 'dotenv/config'
import { Pool, PoolClient } from 'pg'

// ───────────────────────────────────────────────────────────────────────────────
// Connection
// ───────────────────────────────────────────────────────────────────────────────
const dbHost = process.env.DB_HOST || process.env.TOPPAN_DB_HOST || 'localhost'
const dbPort = parseInt(process.env.DB_PORT || process.env.TOPPAN_DB_PORT || '5432', 10)
const dbName = process.env.DB_NAME || process.env.TOPPAN_DB_NAME || 'person_registry'
const dbUser = process.env.DB_USER || process.env.TOPPAN_DB_USER || 'registry_user'
const dbPassword = process.env.DB_PASSWORD || process.env.TOPPAN_DB_PASSWORD || 'registry_pass'

const pool = new Pool({
  host: dbHost,
  port: dbPort,
  database: dbName,
  user: dbUser,
  password: dbPassword
})

// ───────────────────────────────────────────────────────────────────────────────
// Transaction helper
// ───────────────────────────────────────────────────────────────────────────────
export async function withTransaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const res = await fn(client)
    await client.query('COMMIT')
    return res
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// Serialize per-event updates to avoid double-active fathers
export async function acquireEventAdvisoryLock(eventDbId: string, tx?: PoolClient) {
  // event.id is uuid; hashtext(string) → bigint lock key
  const q = `SELECT pg_advisory_xact_lock(hashtext($1))`
  await (tx ?? pool).query(q, [eventDbId])
}

// ───────────────────────────────────────────────────────────────────────────────
// Core lookups
// ───────────────────────────────────────────────────────────────────────────────
export async function getEventDatabaseId(crvsEventUuid: string, tx?: PoolClient): Promise<string | null> {
  try {
    const { rows } = await (tx ?? pool).query(
      `SELECT id FROM event WHERE crvs_event_uuid = $1`,
      [crvsEventUuid]
    )
    return rows[0]?.id || null
  } catch (error) {
    console.error('Database query error (getEventDatabaseId):', error)
    return null
  }
}

/**
 * Find active father participant for an event.
 * Optionally constrain to a specific person_id.
 */
export async function findExistingFatherParticipant(
  eventDatabaseId: string,
  tx?: PoolClient,
  personId?: string
): Promise<any> {
  try {
    const params: any[] = [eventDatabaseId]
    let q = `
      SELECT id, person_id, event_id, role, relationship_details, created_at, crvs_person_id, status, ended_at, remarks
        FROM event_participant
       WHERE event_id = $1
         AND role = 'father'
         AND status = 'active'
         AND ended_at IS NULL
    `
    if (personId) {
      q += ` AND person_id = $2`
      params.push(personId)
    }
    q += ` ORDER BY created_at DESC LIMIT 1`

    const { rows } = await (tx ?? pool).query(q, params)
    return rows[0] || null
  } catch (error) {
    console.error('Database query error (findExistingFatherParticipant):', error)
    return null
  }
}

export async function findParticipantByCRVSId(
  eventDatabaseId: string,
  crvsPersonId: string,
  tx?: PoolClient
): Promise<any> {
  try {
    const { rows } = await (tx ?? pool).query(
      `
      SELECT id, person_id, event_id, role, relationship_details, created_at, crvs_person_id, status, ended_at, remarks
        FROM event_participant
       WHERE event_id = $1
         AND crvs_person_id = $2
         AND role = 'father'
         AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1
      `,
      [eventDatabaseId, crvsPersonId]
    )
    return rows[0] || null
  } catch (error) {
    console.error('Database query error (findParticipantByCRVSId):', error)
    return null
  }
}

export async function getPersonById(personId: string, tx?: PoolClient): Promise<any> {
  try {
    const { rows } = await (tx ?? pool).query(
      `SELECT id, status, given_name, family_name, gender, dob, identifiers FROM person WHERE id = $1`,
      [personId]
    )
    return rows[0] || null
  } catch (error) {
    console.error('Database query error (getPersonById):', error)
    return null
  }
}

export async function personExists(personId: string, tx?: PoolClient): Promise<boolean> {
  try {
    const { rows } = await (tx ?? pool).query(
      `SELECT 1 FROM person WHERE id = $1`,
      [personId]
    )
    return rows.length > 0
  } catch (error) {
    console.error('Database query error (personExists):', error)
    return false
  }
}

/**
 * Find person by CRVS person ID (from identifiers JSON field)
 * Used to link death registrations to existing birth records
 */
export async function findPersonByCrvsId(crvsPersonId: string, tx?: PoolClient): Promise<any> {
  try {
    const { rows } = await (tx ?? pool).query(
      `SELECT id, given_name, family_name, gender, dob, status, death_date, identifiers, created_at, updated_at
       FROM person
       WHERE identifiers @> $1::jsonb
       LIMIT 1`,
      [JSON.stringify([{ type: 'crvs', value: crvsPersonId }])]
    )
    return rows[0] || null
  } catch (error) {
    console.error('Database query error (findPersonByCrvsId):', error)
    return null
  }
}

/**
 * Update person status to deceased with death date
 * Called when a death registration is created for an existing person
 */
export async function updatePersonToDeceased(data: {
  personId: string
  deathDate: string | null
  updatedAt?: string
}, tx?: PoolClient): Promise<void> {
  const q = `
    UPDATE person
    SET status = 'deceased',
        death_date = $2,
        updated_at = COALESCE($3, CURRENT_TIMESTAMP)
    WHERE id = $1
  `
  await (tx ?? pool).query(q, [data.personId, data.deathDate, data.updatedAt ?? null])
}

// ───────────────────────────────────────────────────────────────────────────────
// Mutations
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Upsert event "touch":
 * - INSERT if missing
 * - UPDATE last_update_at + append remarks if exists
 */
export async function upsertEvent(eventPayload: {
  crvs_event_uuid: string
  last_update_at: string
  remarks?: string | null
}, tx?: PoolClient): Promise<boolean> {
  try {
    const q = `
      INSERT INTO event (crvs_event_uuid, last_update_at, remarks, event_type, status)
      VALUES ($1, $2, $3, 'BIRTH', 'active')
      ON CONFLICT (crvs_event_uuid)
      DO UPDATE
         SET last_update_at = EXCLUDED.last_update_at,
             remarks = COALESCE(event.remarks,'') ||
                       CASE WHEN COALESCE(event.remarks,'') = '' OR EXCLUDED.remarks IS NULL OR EXCLUDED.remarks = '' THEN '' ELSE ' | ' END ||
                       COALESCE(EXCLUDED.remarks,'')
    `
    await (tx ?? pool).query(q, [
      eventPayload.crvs_event_uuid,
      eventPayload.last_update_at,
      eventPayload.remarks ?? null
    ])
    return true
  } catch (error) {
    console.error('Event upsert error:', error)
    return false
  }
}

export async function createDummyPerson(p: {
  id: string
  given_name: string
  family_name: string
  gender: string
  dob: string | null
  place_of_birth: string | null
  status: 'review' | 'active'
  identifiers: Array<{ type: string; value: string }>
}, tx?: PoolClient): Promise<void> {
  const now = new Date().toISOString()
  const q = `
    INSERT INTO person
      (id, given_name, family_name, gender, dob, place_of_birth, status, identifiers, created_at, updated_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
  `
  await (tx ?? pool).query(q, [
    p.id, p.given_name, p.family_name, p.gender, p.dob, p.place_of_birth, p.status,
    JSON.stringify(p.identifiers), now, now
  ])
}

export async function insertEventParticipant(part: {
  id: string
  person_id: string
  event_id: string
  role: 'father' | 'mother' | 'informant' | string
  relationship_details: string | object
  crvs_person_id: string | null
  status: 'active' | 'inactive'
  created_at: string
  ended_at: string | null
  remarks: string
}, tx?: PoolClient): Promise<void> {
  const relationshipJson = typeof part.relationship_details === 'string' ? part.relationship_details : JSON.stringify(part.relationship_details)
  const q = `
    INSERT INTO event_participant
      (id, person_id, event_id, role, relationship_details, created_at, crvs_person_id, status, ended_at, remarks)
    VALUES
      ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
  `
  await (tx ?? pool).query(q, [
    part.id,
    part.person_id,
    part.event_id,
    part.role,
    relationshipJson,
    part.created_at,
    part.crvs_person_id,
    part.status,
    part.ended_at,
    part.remarks
  ])
}

export async function eventParticipantExists(
  eventId: string,
  crvsPersonId: string | null,
  role: string,
  tx?: PoolClient
): Promise<boolean> {
  if (!crvsPersonId) {
    // We only attempt a duplicate check when we can reliably match on CRVS person id.
    return false
  }
  try {
    const { rows } = await (tx ?? pool).query(
      `SELECT 1
         FROM event_participant
        WHERE event_id = $1
          AND crvs_person_id = $2
          AND role = $3
          AND status = 'active'
        LIMIT 1`,
      [eventId, crvsPersonId, role]
    )
    return rows.length > 0
  } catch (error) {
    console.error('Database query error (eventParticipantExists):', error)
    return false
  }
}

export async function deactivateEventParticipant(
  id: string,
  endedAtISO: string,
  extraRemarks: string,
  tx?: PoolClient
): Promise<void> {
  const q = `
    UPDATE event_participant
       SET status   = 'inactive',
           ended_at = $2::timestamp,
           remarks  = COALESCE(remarks,'') ||
                      CASE WHEN COALESCE(remarks,'') = '' THEN '' ELSE ' | ' END ||
                      $3
     WHERE id = $1
  `
  await (tx ?? pool).query(q, [id, endedAtISO, extraRemarks])
}

export async function createEventIfMissing(
  payload: { crvs_event_uuid: string; last_update_at: string; remarks?: string | null },
  tx?: PoolClient
): Promise<void> {
  const q = `
    INSERT INTO event (crvs_event_uuid, last_update_at, remarks, event_type, status)
    VALUES ($1, $2, $3, 'BIRTH', 'active')
    ON CONFLICT (crvs_event_uuid) DO NOTHING
  `
  await (tx ?? pool).query(q, [payload.crvs_event_uuid, payload.last_update_at, payload.remarks ?? null])
}

// Insert a person row (explicit id provided by caller)
export async function insertPerson(p: {
  id: string
  given_name: string
  family_name: string
  gender: string
  dob: string | null
  place_of_birth: string | null
  place_of_birth_uuid?: string | null
  identifiers: string | object // allow pre-JSONed string or object
  status: string
  created_at?: string
  updated_at?: string
}, tx?: PoolClient): Promise<void> {
  const identifiersJson = typeof p.identifiers === 'string' ? p.identifiers : JSON.stringify(p.identifiers)
  const q = `
    INSERT INTO person
      (id, given_name, family_name, gender, dob, place_of_birth, place_of_birth_uuid, identifiers, status, created_at, updated_at)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,COALESCE($10, CURRENT_TIMESTAMP),COALESCE($11, CURRENT_TIMESTAMP))
    ON CONFLICT (id) DO NOTHING
  `
  await (tx ?? pool).query(q, [
    p.id, p.given_name, p.family_name, p.gender, p.dob, p.place_of_birth,
    p.place_of_birth_uuid ?? null, identifiersJson, p.status, p.created_at ?? null, p.updated_at ?? null
  ])
}

// Insert an event row (explicit id allowed)
export async function insertEvent(e: {
  id?: string
  event_type: string
  event_date: string | null
  location: string | null
  source: string | null
  metadata: string | object | null
  crvs_event_uuid: string
  duplicates?: any
  status?: string | null
  last_update_at?: string | null
  remarks?: string | null
  created_at?: string | null
}, tx?: PoolClient): Promise<void> {
  const metaJson = e.metadata ? (typeof e.metadata === 'string' ? e.metadata : JSON.stringify(e.metadata)) : null
  const q = `
    INSERT INTO event
      (id, event_type, event_date, location, source, metadata, crvs_event_uuid, duplicates, status, last_update_at, remarks, created_at)
    VALUES
      (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, COALESCE($12, CURRENT_TIMESTAMP))
    ON CONFLICT (crvs_event_uuid) DO NOTHING
  `
  await (tx ?? pool).query(q, [
    e.id ?? null, e.event_type, e.event_date, e.location, e.source, metaJson,
    e.crvs_event_uuid, e.duplicates ?? null, e.status ?? null, e.last_update_at ?? null, e.remarks ?? null, e.created_at ?? null
  ])
}

// Helper to get event.id by crvs_event_uuid inside a tx
export async function getEventIdByCrvs(crvsEventUuid: string, tx?: PoolClient): Promise<string | null> {
  const { rows } = await (tx ?? pool).query(`SELECT id FROM event WHERE crvs_event_uuid = $1`, [crvsEventUuid])
  return rows[0]?.id ?? null
}

// ───────────────────────────────────────────────────────────────────────────────
// Sync Request Functions
// ───────────────────────────────────────────────────────────────────────────────
export async function insertSyncRequest(data: {
  event_type: string
  action: string
  crvs_event_uuid: string
  payload: any
}): Promise<string> {
  const result = await pool.query(
    `INSERT INTO sync_request (event_type, action, crvs_event_uuid, payload, status, error_message)
     VALUES ($1, $2, $3, $4, 'pending', 'missing_event') RETURNING id`,
    [data.event_type, data.action, data.crvs_event_uuid, JSON.stringify(data.payload)]
  )
  return result.rows[0].id
}

export async function updateSyncRequestStatus(
  id: string, 
  status: 'processing' | 'completed' | 'failed',
  errorMessage?: string
): Promise<void> {
  await pool.query(
    `UPDATE sync_request 
     SET status = $2, error_message = $3, updated_at = CURRENT_TIMESTAMP, processed_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id, status, errorMessage || null]
  )
}

export async function clearSyncRequestPayload(id: string): Promise<void> {
  await pool.query(
    `UPDATE sync_request SET payload = NULL WHERE id = $1`,
    [id]
  )
}

// Update family_link when event_participant is deactivated
export async function updateFamilyLinkOnParticipantChange(
  eventId: string,
  personId: string,
  role: string,
  status: 'active' | 'inactive',
  endedAt: string | null,
  tx?: PoolClient
): Promise<void> {
  if (role !== 'father' && role !== 'mother') return
  
  // Get child from this event
  const { rows: childRows } = await (tx ?? pool).query(
    `SELECT person_id FROM event_participant 
     WHERE event_id = $1 AND role = 'subject' AND status = 'active'`,
    [eventId]
  )
  
  if (!childRows[0]) return
  const childId = childRows[0].person_id
  
  if (status === 'inactive' && endedAt) {
    // End the family relationship - child is person_id, parent is related_person_id
    await (tx ?? pool).query(
      `UPDATE family_link 
       SET end_date = $1::date 
       WHERE person_id = $2 AND related_person_id = $3 AND relationship_type = $4 
         AND source_event_id = $5 AND end_date IS NULL`,
      [endedAt.split('T')[0], childId, personId, role, eventId]
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Export pool (if you need it elsewhere)
// ───────────────────────────────────────────────────────────────────────────────
export { pool }
