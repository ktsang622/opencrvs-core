import * as Hapi from '@hapi/hapi'
import Joi from 'joi'
import axios from 'axios'
import { randomUUID } from 'crypto'
import {
  getEventDatabaseId,
  findExistingFatherParticipant,
  findParticipantByCRVSId,
  upsertEvent,
  withTransaction,
  insertEventParticipant,
  deactivateEventParticipant,
  createDummyPerson,
  personExists,
  acquireEventAdvisoryLock,
} from '../../database'

type Action = 'ADD_FATHER' | 'REMOVE_FATHER' | 'UPDATE_FATHER_SAME' | 'REPLACE_FATHER'

interface ManualFather {
  given_name?: string
  family_name?: string
  gender?: 'male' | 'female' | 'unknown'
  dob?: string
  place_of_birth?: string
  national_id?: string
}

interface FatherData {
  fatherId?: string            // local DB person.id
  fatherCRVSUuid?: string      // CRVS (FHIR) UUID for father
  manual?: ManualFather        // manual/dummy person creation
  expectedPersonId?: string    // optimistic concurrency - local person id expected
  expectedCRVSUuid?: string    // optimistic concurrency - CRVS UUID expected
}

// Joi validation schemas
const manualFatherSchema = Joi.object({
  given_name: Joi.string().optional(),
  family_name: Joi.string().optional(),
  gender: Joi.string().valid('male', 'female', 'unknown').optional(),
  dob: Joi.string().isoDate().optional(),
  place_of_birth: Joi.string().optional(),
  national_id: Joi.string().optional()
})

const fatherDataSchema = Joi.object({
  fatherId: Joi.string().uuid().optional(),
  fatherCRVSUuid: Joi.string().uuid().optional(),
  manual: manualFatherSchema.optional(),
  expectedPersonId: Joi.string().uuid().optional(),
  expectedCRVSUuid: Joi.string().uuid().optional()
})

const correctionPayloadSchema = Joi.object({
  action: Joi.string().valid('ADD_FATHER','REMOVE_FATHER','UPDATE_FATHER_SAME','REPLACE_FATHER').required(),
  eventId: Joi.string().uuid().required(),
  fatherData: fatherDataSchema.when('action', {
    is: Joi.valid('ADD_FATHER','UPDATE_FATHER_SAME','REPLACE_FATHER'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  reason: Joi.string().allow('', null).optional(),
  correctionType: Joi.string().allow('', null).optional()
})

export const correctionValidation = { payload: correctionPayloadSchema }

export async function correctionHandler(request: Hapi.Request, h: Hapi.ResponseToolkit) {
  if (!request.payload) {
    return h.response({ error: 'Missing required payload' }).code(400)
  }

  const now = new Date().toISOString()
  const { action, eventId, fatherData, reason, correctionType } = request.payload as {
    action: Action
    eventId: string
    fatherData?: FatherData
    reason?: string | null
    correctionType?: string | null
  }

  console.log('\n📊 DATABASE CORRECTION SUMMARY:')
  console.log('================================')
  console.log(`- eventId: ${eventId}`)
  console.log(`- action: ${action}`)
  if (fatherData) console.log(`- fatherData: ${JSON.stringify(fatherData)}`)

  try {
    return await withTransaction(async (tx) => {
      // Serialize per-event corrections via advisory lock
      await acquireEventAdvisoryLock(eventId, tx)

      // Resolve local event database id
      const eventDbId = await getEventDatabaseId(eventId, tx)
      if (!eventDbId) {
        return h.response({ error: 'Event not found in local DB' }).code(404)
      }

      switch (action) {
        case 'ADD_FATHER':
          return await handleAddFather({ eventId, eventDbId, fatherData: fatherData!, reason, correctionType, now, h, tx })
        case 'REMOVE_FATHER':
          return await handleRemoveFather({ eventId, eventDbId, reason, correctionType, now, h, tx })
        case 'UPDATE_FATHER_SAME':
          return await handleUpdateFatherSame({ eventId, eventDbId, fatherData: fatherData!, reason, correctionType, now, h, tx })
        case 'REPLACE_FATHER':
          return await handleReplaceFather({ eventId, eventDbId, fatherData: fatherData!, reason, correctionType, now, h, tx })
        default:
          return h.response({ error: 'Unsupported action' }).code(400)
      }
    })
  } catch (e) {
    console.error('\n❌ Birth correction error:', e)
    return h.response({ error: (e as Error).message }).code(500)
  }
}

async function handleAddFather({ eventId, eventDbId, fatherData, reason, correctionType, now, h, tx }: any) {
  console.log('\n👨 Adding father to existing record...')

  // deactivate current active father (if any)
  const current = await findExistingFatherParticipant(eventDbId, tx)
  if (current) {
    await deactivateEventParticipant(current.id, now, remarks('Deactivate existing father before ADD_FATHER', correctionType, reason, false), tx)
  }

  const { personId, isDummy } = await resolvePersonIdForFather(fatherData, tx)

  await insertEventParticipant({
    id: randomUUID(),
    person_id: personId,
    event_id: eventDbId,
    role: 'father',
    relationship_details: { type: 'father', relationship: 'FATHER' },
    crvs_person_id: fatherData.fatherCRVSUuid || null,
    status: 'active',
    created_at: now,
    ended_at: null,
    remarks: remarks('Father added', correctionType, reason, isDummy)
  }, tx)

  await upsertEvent({ crvs_event_uuid: eventId, last_update_at: now, remarks: 'ADD_FATHER' }, tx)

  safeTriggerReindex()
  return h.response({ success: true, action: 'ADD_FATHER', personId }).code(200)
}

async function handleRemoveFather({ eventId, eventDbId, reason, correctionType, now, h, tx }: any) {
  console.log('\n❌ Removing father from record...')
  const current = await findExistingFatherParticipant(eventDbId, tx)
  if (!current) {
    return h.response({ success: true, message: 'No active father to remove' }).code(200)
  }

  await deactivateEventParticipant(current.id, now, remarks('Father removed', correctionType, reason, false), tx)
  await upsertEvent({ crvs_event_uuid: eventId, last_update_at: now, remarks: 'REMOVE_FATHER' }, tx)

  safeTriggerReindex()
  return h.response({ success: true, action: 'REMOVE_FATHER' }).code(200)
}

async function handleUpdateFatherSame({ eventId, eventDbId, fatherData, reason, correctionType, now, h, tx }: any) {
  console.log('\n✏️ Updating father (same person)...')

  // Must be same person; guard using expectedPersonId when provided
  if (fatherData.expectedPersonId) {
    const current = await findExistingFatherParticipant(eventDbId, tx)
    if (!current || current.person_id !== fatherData.expectedPersonId) {
      return h.response({ error: 'Concurrency check failed: current father does not match expected' }).code(409)
    }
  }

  // Deactivate previous
  const current = await findExistingFatherParticipant(eventDbId, tx)
  if (current) {
    await deactivateEventParticipant(current.id, now, remarks('Deactivate old before UPDATE_FATHER_SAME', correctionType, reason, false), tx)
  }

  // Re-insert for update (immutable history pattern)
  const nextPersonId = fatherData.fatherId ?? current?.person_id
  if (!nextPersonId) {
    return h.response({ error: 'Missing fatherId for UPDATE_FATHER_SAME' }).code(400)
  }

  await insertEventParticipant({
    id: randomUUID(),
    person_id: nextPersonId,
    event_id: eventDbId,
    role: 'father',
    relationship_details: { type: 'father', relationship: 'FATHER' },
    crvs_person_id: fatherData.fatherCRVSUuid || current?.crvs_person_id || null,
    status: 'active',
    created_at: now,
    ended_at: null,
    remarks: remarks('Father updated (same person)', correctionType, reason, false)
  }, tx)

  await upsertEvent({ crvs_event_uuid: eventId, last_update_at: now, remarks: 'UPDATE_FATHER_SAME' }, tx)

  safeTriggerReindex()
  return h.response({ success: true, action: 'UPDATE_FATHER_SAME', personId: nextPersonId }).code(200)
}

async function handleReplaceFather({ eventId, eventDbId, fatherData, reason, correctionType, now, h, tx }: any) {
  console.log('\n🔄 Replacing father with different person...')

  const current = await findExistingFatherParticipant(eventDbId, tx)
  if (current) {
    await deactivateEventParticipant(current.id, now, remarks('Father replaced - deactivate old', correctionType, reason, false), tx)
  }

  const { personId, isDummy } = await resolvePersonIdForFather(fatherData, tx)

  await insertEventParticipant({
    id: randomUUID(),
    person_id: personId,
    event_id: eventDbId,
    role: 'father',
    relationship_details: { type: 'father', relationship: 'FATHER' },
    crvs_person_id: fatherData.fatherCRVSUuid || null,
    status: 'active',
    created_at: now,
    ended_at: null,
    remarks: remarks('Father replaced (different person)', correctionType, reason, isDummy)
  }, tx)

  await upsertEvent({ crvs_event_uuid: eventId, last_update_at: now, remarks: 'REPLACE_FATHER' }, tx)

  safeTriggerReindex()
  return h.response({ success: true, action: 'REPLACE_FATHER', personId }).code(200)
}

// Resolve person id for father from provided data, creating a dummy if instructed
async function resolvePersonIdForFather(fatherData: FatherData, tx: any): Promise<{ personId: string, isDummy: boolean }> {
  if (fatherData.fatherId) {
    const exists = await personExists(fatherData.fatherId, tx)
    if (!exists) throw new Error('fatherId does not exist in local DB')
    return { personId: fatherData.fatherId, isDummy: false }
  }

  if (fatherData.fatherCRVSUuid) {
    const found = await findParticipantByCRVSId('*', fatherData.fatherCRVSUuid, tx) // implement lookup in your DB layer
    if (found?.person_id) return { personId: found.person_id, isDummy: false }
  }

  // manual/dummy
  const manual = fatherData.manual || {}
  const dummyId = randomUUID()
  await createDummyPerson({
    id: dummyId,
    given_name: manual.given_name ?? 'Dummy',
    family_name: manual.family_name ?? 'Father',
    gender: manual.gender ?? 'unknown',
    dob: manual.dob ?? null,
    place_of_birth: manual.place_of_birth ?? null,
    status: 'review',
    identifiers: buildDummyIdentifiers(manual.national_id ?? null)
  }, tx)

  return { personId: dummyId, isDummy: true }
}

function buildDummyIdentifiers(nationalId: string | null) {
  const ids: Array<{type: string, value: string}> = [{ type: 'origin', value: 'dummy_from_correction' }]
  if (nationalId) ids.push({ type: 'NATIONAL_ID', value: String(nationalId) })
  return ids
}

function remarks(base: string, correctionType?: string | null, reason?: string | null, isDummy?: boolean) {
  const payload: any = { base, isDummy: !!isDummy }
  if (correctionType) payload.correctionType = correctionType
  if (reason) payload.reason = reason
  return JSON.stringify(payload)
}

/*
 * when upgrade to node 20 
function safeTriggerReindex() {
  try {
    // Node 20+ has global fetch; ignore if unavailable
    // @ts-ignore
    if (typeof fetch !== 'function') return
    // Best-effort fire-and-forget
    // @ts-ignore
    fetch('http://localhost:3888/api/opensearch/index-person-db', { method: 'POST' })
      .then(() => console.log('✅ OpenSearch index update triggered'))
      .catch((e: any) => console.log('⚠️ Reindex trigger failed:', e?.message || e))
  } catch (_) {
    // ignore
  }
}
*/

function safeTriggerReindex() {
  axios.post('http://localhost:3888/api/opensearch/index-person-db')
    .then(() => console.log('✅ OpenSearch index update triggered'))
    .catch((e) => console.log('⚠️ Reindex trigger failed:', e?.message || e))
}
