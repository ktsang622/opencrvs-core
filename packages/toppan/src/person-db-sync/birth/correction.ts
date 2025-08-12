import * as Hapi from '@hapi/hapi'
import Joi from 'joi'
import axios from 'axios'
import { randomUUID } from 'crypto'
import {
  getEventDatabaseId,
  findExistingFatherParticipant,
  upsertEvent,
  withTransaction,
  insertEventParticipant,
  deactivateEventParticipant,
  createDummyPerson,
  personExists,
  acquireEventAdvisoryLock,
  insertSyncRequest,
  insertEvent,
  updateFamilyLinkOnParticipantChange,
  pool
} from '../../database'

type Action = 'ADD_FATHER' | 'REMOVE_FATHER' | 'UPDATE_FATHER_SAME' | 'REPLACE_FATHER'

interface ProvisionPerson {
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
  manual?: ProvisionPerson     // manual/dummy person creation
  expectedPersonId?: string    // optimistic concurrency - local person id expected
  expectedCRVSUuid?: string    // optimistic concurrency - CRVS UUID expected
}

// Joi validation schemas
const provisionPersonSchema = Joi.object({
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
  manual: provisionPersonSchema.optional(),
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
  correctionType: Joi.string().allow('', null).optional(),
  bundle: Joi.object().optional()
})

export const correctionValidation = { payload: correctionPayloadSchema }

export async function correctionHandler(request: Hapi.Request, h: Hapi.ResponseToolkit) {
  if (!request.payload) {
    return h.response({ error: 'Missing required payload' }).code(400)
  }

  const now = new Date().toISOString()
  const { action, eventId, fatherData, reason, correctionType, bundle } = request.payload as {
    action: Action
    eventId: string
    fatherData?: FatherData
    reason?: string | null
    correctionType?: string | null
    bundle?: any
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

      // Fix 1: Precondition guard - check if event exists locally
      const eventDbId = await getEventDatabaseId(eventId, tx)
      if (!eventDbId) {
        // Queue the correction and return 412
        await insertSyncRequest({
          event_type: 'birth',
          action,
          crvs_event_uuid: eventId,
          payload: request.payload
        })
        return h.response({
          error: 'precondition_failed',
          message: 'Event not present locally; correction queued'
        }).code(412)
      }

      // Fix 2: FHIR father detection
      const fatherInfo = detectFatherFromBundle(bundle)
      if (!fatherInfo.provided && (action === 'ADD_FATHER' && !fatherData)) {
        return h.response({ success: true, status: 'noop', message: 'No father provided in bundle' }).code(204)
      }
      
      // Check for contradictory bundle in UPDATE/REPLACE actions
      if (!fatherInfo.provided && !fatherData && (action === 'UPDATE_FATHER_SAME' || action === 'REPLACE_FATHER')) {
        return h.response({ error: 'contradictory_payload', message: 'Bundle indicates inactive father but no fatherData provided' }).code(409)
      }

      switch (action) {
        case 'ADD_FATHER':
          return await handleAddFather({ eventId, eventDbId, fatherData: fatherData!, reason, correctionType, now, h, tx, bundle })
        case 'REMOVE_FATHER':
          return await handleRemoveFather({ eventId, eventDbId, reason, correctionType, now, h, tx })
        case 'UPDATE_FATHER_SAME':
          return await handleUpdateFatherSame({ eventId, eventDbId, fatherData: fatherData!, reason, correctionType, now, h, tx, bundle })
        case 'REPLACE_FATHER':
          return await handleReplaceFather({ eventId, eventDbId, fatherData: fatherData!, reason, correctionType, now, h, tx, bundle })
        default:
          return h.response({ error: 'Unsupported action' }).code(400)
      }
    })
  } catch (e) {
    console.error('\n❌ Birth correction error:', e)
    return h.response({ error: (e as Error).message }).code(500)
  }
}

async function handleAddFather({ eventId, eventDbId, fatherData, reason, correctionType, now, h, tx, bundle }: any) {
  console.log('\n👨 Adding father to existing record...')

  // Check if active father already exists
  const current = await findExistingFatherParticipant(eventDbId, tx)
  if (current) {
    return h.response({ error: 'Active father participant already exists' }).code(409)
  }

  const { personId, isDummy } = await resolvePersonIdForFather(fatherData, tx, bundle)

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

  await upsertEvent({ crvs_event_uuid: eventId, last_update_at: now, remarks: `Correction: ADD_FATHER | ${reason ?? ''}`.trim() }, tx)

  safeTriggerReindex()
  return h.response({ success: true, action: 'ADD_FATHER', personId }).code(201)
}

// Fix 6: Make REMOVE_FATHER idempotent
async function handleRemoveFather({ eventId, eventDbId, reason, correctionType, now, h, tx }: any) {
  console.log('\n❌ Removing father from record...')
  const current = await findExistingFatherParticipant(eventDbId, tx)
  if (!current) {
    return h.response({ success: true, status: 'noop', message: 'No active father' }).code(204)
  }

  await deactivateEventParticipant(current.id, now, remarks('REMOVE_FATHER', correctionType, reason, false), tx)
  await updateFamilyLinkOnParticipantChange(eventDbId, current.person_id, 'father', 'inactive', now, tx)
  await upsertEvent({ crvs_event_uuid: eventId, last_update_at: now, remarks: `Correction: REMOVE_FATHER | ${reason ?? ''}`.trim() }, tx)

  safeTriggerReindex()
  return h.response({ success: true, status: 'removed', action: 'REMOVE_FATHER' }).code(200)
}

// Fix 5: Enforce UPDATE vs REPLACE semantics with optimistic concurrency
async function handleUpdateFatherSame({ eventId, eventDbId, fatherData, reason, correctionType, now, h, tx, bundle }: any) {
  console.log('\n✏️ Updating father (same person)...')
  
  const current = await findExistingFatherParticipant(eventDbId, tx)
  if (!current) {
    return h.response({ error: 'No active father participant to update' }).code(409)
  }
  
  // Check for contradictory bundle
  const fatherInfo = detectFatherFromBundle(bundle)
  if (!fatherInfo.provided && !fatherData) {
    return h.response({ error: 'contradictory_payload', message: 'Bundle indicates inactive father for UPDATE_SAME' }).code(409)
  }

  // Optimistic concurrency checks
  if (fatherData.expectedPersonId && current.person_id !== fatherData.expectedPersonId) {
    return h.response({ error: 'expectedPersonId mismatch' }).code(409)
  }
  if (fatherData.expectedCRVSUuid && current.crvs_person_id !== fatherData.expectedCRVSUuid) {
    return h.response({ error: 'expectedCRVSUuid mismatch' }).code(409)
  }

  await deactivateEventParticipant(current.id, now, remarks('UPDATE_FATHER_SAME (deactivate)', correctionType, reason, false), tx)
  await updateFamilyLinkOnParticipantChange(eventDbId, current.person_id, 'father', 'inactive', now, tx)

  await insertEventParticipant({
    id: randomUUID(),
    person_id: current.person_id, // same person
    event_id: eventDbId,
    role: 'father',
    relationship_details: fatherData?.manual?.national_id
      ? { type: 'father', source: 'UPDATE', national_id: fatherData.manual.national_id }
      : { type: 'father', source: 'UPDATE' },
    crvs_person_id: current.crvs_person_id,
    status: 'active',
    created_at: now,
    ended_at: null,
    remarks: remarks('UPDATE_FATHER_SAME (activate)', correctionType, reason, false)
  }, tx)

  await upsertEvent({ crvs_event_uuid: eventId, last_update_at: now, remarks: `Correction: UPDATE_FATHER_SAME | ${reason ?? ''}`.trim() }, tx)

  safeTriggerReindex()
  return h.response({ success: true, action: 'UPDATE_FATHER_SAME', personId: current.person_id }).code(200)
}

async function handleReplaceFather({ eventId, eventDbId, fatherData, reason, correctionType, now, h, tx, bundle }: any) {
  console.log('\n🔄 Replacing father with different person...')

  // Check for contradictory bundle
  const fatherInfo = detectFatherFromBundle(bundle)
  if (!fatherInfo.provided && !fatherData) {
    return h.response({ error: 'contradictory_payload', message: 'Bundle indicates inactive father for REPLACE' }).code(409)
  }

  const current = await findExistingFatherParticipant(eventDbId, tx)
  const { personId: newPersonId, isDummy } = await resolvePersonIdForFather(fatherData, tx, bundle)

  // If same person, treat as UPDATE_SAME
  if (current && current.person_id === newPersonId) {
    return await handleUpdateFatherSame({ eventId, eventDbId, fatherData, reason, correctionType, now, h, tx })
  }

  if (current) {
    await deactivateEventParticipant(current.id, now, remarks('REPLACE_FATHER (deactivate old)', correctionType, reason, false), tx)
    await updateFamilyLinkOnParticipantChange(eventDbId, current.person_id, 'father', 'inactive', now, tx)
  }

  await insertEventParticipant({
    id: randomUUID(),
    person_id: newPersonId,
    event_id: eventDbId,
    role: 'father',
    relationship_details: { type: 'father', source: 'REPLACE' },
    crvs_person_id: fatherData?.fatherCRVSUuid || null,
    status: 'active',
    created_at: now,
    ended_at: null,
    remarks: remarks('REPLACE_FATHER (activate new)', correctionType, reason, isDummy)
  }, tx)

  await upsertEvent({ crvs_event_uuid: eventId, last_update_at: now, remarks: `Correction: REPLACE_FATHER | ${reason ?? ''}`.trim() }, tx)

  safeTriggerReindex()
  return h.response({ success: true, action: 'REPLACE_FATHER', personId: newPersonId }).code(201)
}

// Fix 3: Deterministic father identity resolution with proper precedence
async function resolvePersonIdForFather(fatherData: FatherData, tx: any, bundle?: any): Promise<{ personId: string, isDummy: boolean }> {
  // Precedence 1: fatherId (local person.uuid)
  if (fatherData.fatherId) {
    const exists = await personExists(fatherData.fatherId, tx)
    if (!exists) throw new Error('fatherId does not exist in local DB')
    return { personId: fatherData.fatherId, isDummy: false }
  }

  // Precedence 2: fatherCRVSUuid (FHIR UUID) - find existing person with this CRVS identifier
  if (fatherData.fatherCRVSUuid) {
    const { rows } = await (tx ?? pool).query(
      `SELECT id FROM person WHERE identifiers @> $1::jsonb`,
      [JSON.stringify([{ type: 'crvs', value: fatherData.fatherCRVSUuid }])]
    )
    if (rows[0]?.id) {
      return { personId: rows[0].id, isDummy: false }
    }
    // Create dummy with CRVS UUID, extract from FHIR bundle if available
    const dummyId = randomUUID()
    const manual = fatherData.manual
    const fatherFromBundle = findFatherInBundle(bundle)
    
    await createDummyPerson({
      id: dummyId,
      given_name: manual?.given_name || extractGivenName(fatherFromBundle) || 'Unknown',
      family_name: manual?.family_name || extractFamilyName(fatherFromBundle) || 'Father',
      gender: manual?.gender || fatherFromBundle?.gender || 'male',
      dob: manual?.dob || fatherFromBundle?.birthDate || null,
      place_of_birth: manual?.place_of_birth || 'Unknown',
      status: 'review',
      identifiers: buildDummyIdentifiers(manual?.national_id ?? null, fatherData.fatherCRVSUuid, fatherFromBundle)
    }, tx)
    return { personId: dummyId, isDummy: true }
  }

  // Precedence 3: manual (dummy person fields) - create provisional person like create.ts
  if (fatherData.manual) {
    return await createProvisionalPerson(fatherData.manual, fatherData.fatherCRVSUuid, 'father', tx)
  }

  throw new Error('No valid father identification provided')
}

function buildDummyIdentifiers(nationalId: string | null, crvsUuid?: string, fhirFather?: any) {
  const ids: Array<{type: string, value: string}> = []
  if (crvsUuid) ids.push({ type: 'crvs', value: crvsUuid })
  if (nationalId) ids.push({ type: 'NATIONAL_ID', value: String(nationalId) })
  
  // Extract identifiers from FHIR father
  if (fhirFather?.identifier) {
    fhirFather.identifier
      .filter((i: any) => i.value?.trim())
      .forEach((i: any) => {
        const type = i.type?.coding?.[0]?.code || 'UNKNOWN'
        if (!ids.some(existing => existing.type === type)) {
          ids.push({ type, value: i.value })
        }
      })
  }
  
  if (ids.length === 0) ids.push({ type: 'manual', value: randomUUID() })
  return ids
}

// Helper to find father in bundle
function findFatherInBundle(bundle: any): any {
  if (!bundle) return null
  if (bundle.father) return bundle.father
  return findFatherPatientInBundle(bundle)
}

// Extract given name from FHIR father
function extractGivenName(father: any): string | null {
  if (!father?.name?.[0]?.given) return null
  return father.name[0].given.filter(Boolean).join(' ') || null
}

// Extract family name from FHIR father
function extractFamilyName(father: any): string | null {
  return father?.name?.[0]?.family || null
}

// Create provisional person (father/mother) with event and participant like create.ts
async function createProvisionalPerson(
  manual: ProvisionPerson, 
  crvsUuid: string | undefined, 
  role: 'father' | 'mother', 
  tx: any
): Promise<{ personId: string, isDummy: boolean }> {
  const dummyId = randomUUID()
  const birthEventId = randomUUID()
  const now = new Date().toISOString()
  const defaultGender = role === 'father' ? 'male' : 'female'
  const defaultName = role === 'father' ? 'Father' : 'Mother'
  
  // Create provisional person
  await createDummyPerson({
    id: dummyId,
    given_name: manual.given_name ?? 'Manual',
    family_name: manual.family_name ?? defaultName,
    gender: manual.gender ?? defaultGender,
    dob: manual.dob ?? null,
    place_of_birth: manual.place_of_birth ?? 'Unknown',
    status: 'review',
    identifiers: buildDummyIdentifiers(manual.national_id ?? null, crvsUuid)
  }, tx)
  
  // Create provisional birth event
  await insertEvent({
    id: birthEventId,
    event_type: 'birth',
    event_date: manual.dob ?? null,
    location: 'Unknown',
    source: 'seed',
    metadata: JSON.stringify({ note: 'generated birth by correction' }),
    crvs_event_uuid: randomUUID(),
    duplicates: null,
    status: null,
    last_update_at: null,
    remarks: 'Mocked event: Invalid crvs_event_uuid',
    created_at: now
  }, tx)
  
  // Create provisional person as subject of their own birth
  await insertEventParticipant({
    id: randomUUID(),
    person_id: dummyId,
    event_id: birthEventId,
    role: 'subject',
    relationship_details: JSON.stringify({ import: 'correction' }),
    crvs_person_id: crvsUuid || `manual-${role}-correction`,
    status: 'active',
    created_at: now,
    ended_at: null,
    remarks: `Provisional ${role} created from correction`
  }, tx)
  
  return { personId: dummyId, isDummy: true }
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

// Fix 2: FHIR father detection helper - more robust parsing
function detectFatherFromBundle(bundle: any): { provided: boolean, fhirId?: string } {
  if (!bundle) {
    return { provided: false }
  }
  
  // Parse father from FHIR entries or custom bundle.father
  const father = bundle.father || findFatherPatientInBundle(bundle)
  if (!father) {
    return { provided: false }
  }
  
  // Check if father Patient.active is explicitly false
  if (father.active === false) {
    // Optionally check extension reason-not-applying
    const reasonExtension = father.extension?.find((ext: any) => 
      ext.url?.includes('reason-not-applying')
    )
    if (reasonExtension?.valueString === 'nil') {
      return { provided: false }
    }
    return { provided: false }
  }
  
  return { provided: true, fhirId: father._fhirID || father.id }
}

// Helper to find father Patient in FHIR bundle entries
function findFatherPatientInBundle(bundle: any): any {
  if (!bundle.entry) return null
  return bundle.entry.find((entry: any) => 
    entry.resource?.resourceType === 'Patient' && 
    entry.resource?.extension?.some((ext: any) => ext.url?.includes('father'))
  )?.resource
}
