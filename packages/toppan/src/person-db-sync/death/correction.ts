/**
 * DEATH CORRECTION HANDLER
 *
 * Handles corrections for death registration including:
 * - UPDATE_INFORMANT: Change who the informant is (mistake correction)
 * - REMOVE_INFORMANT_SPOUSE: Remove informant spouse link (mistaken relationship)
 * - REPLACE_INFORMANT_SPOUSE: Replace informant spouse with correct person
 */

import * as Hapi from '@hapi/hapi'
import Joi from 'joi'
import { randomUUID } from 'crypto'
import { indexPersonDb } from '@opencrvs/toppan-db'
import {
  getEventDatabaseId,
  upsertEvent,
  withTransaction,
  insertEventParticipant,
  deactivateEventParticipant,
  createDummyPerson,
  personExists,
  acquireEventAdvisoryLock,
  insertSyncRequest,
  updateSyncRequestStatus,
  clearSyncRequestPayload
} from '../../database'

type Action = 'UPDATE_INFORMANT' | 'REMOVE_INFORMANT_SPOUSE' | 'REPLACE_INFORMANT_SPOUSE'

interface InformantData {
  personId?: string              // Local DB person.id
  crvsUuid?: string              // CRVS (FHIR) UUID
  manual?: {                     // Manual/dummy person creation
    given_name?: string
    family_name?: string
    gender?: 'male' | 'female' | 'unknown'
    dob?: string
    place_of_birth?: string
    national_id?: string
  }
  relationship: string           // Will be normalized to uppercase: MOTHER | FATHER | SPOUSE | CHILD | SIBLING | LEGAL_GUARDIAN | OTHER
}

const correctionPayloadSchema = Joi.object({
  action: Joi.string().valid('UPDATE_INFORMANT', 'REMOVE_INFORMANT_SPOUSE', 'REPLACE_INFORMANT_SPOUSE').required(),
  eventId: Joi.string().required(),
  informantData: Joi.object({
    personId: Joi.string().uuid().optional(),
    crvsUuid: Joi.string().uuid().optional(),
    manual: Joi.object({
      given_name: Joi.string().optional(),
      family_name: Joi.string().optional(),
      gender: Joi.string().valid('male', 'female', 'unknown').optional(),
      dob: Joi.string().isoDate().optional(),
      place_of_birth: Joi.string().optional(),
      national_id: Joi.string().optional()
    }).optional(),
    relationship: Joi.string().uppercase().valid('MOTHER', 'FATHER', 'SPOUSE', 'CHILD', 'SIBLING', 'LEGAL_GUARDIAN', 'OTHER').required()
  }).when('action', {
    is: Joi.valid('UPDATE_INFORMANT', 'REPLACE_INFORMANT_SPOUSE'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  reason: Joi.string().allow('', null).optional(),
  correctionType: Joi.string().allow('', null).optional(),
  bundle: Joi.any().optional()
}).unknown(true)

export const deathCorrectionValidation = { payload: correctionPayloadSchema }

export async function deathCorrectionHandler(request: Hapi.Request, h: Hapi.ResponseToolkit) {
  if (!request.payload) {
    return h.response({ error: 'Missing required payload' }).code(400)
  }

  const now = new Date().toISOString()
  const { action, eventId, informantData, reason, correctionType, bundle } = request.payload as {
    action: Action
    eventId: string
    informantData?: InformantData
    reason?: string
    correctionType?: string
    bundle?: any
  }

  // Insert sync request
  const isRetry = (request as any).isRetry
  const syncRequestId = isRetry ? (request as any).syncRequestId : await insertSyncRequest({
    event_type: 'death',
    action: `CORRECTION_${action}`,
    crvs_event_uuid: eventId,
    payload: request.payload
  })

  try {
    console.log(`\n🔧 Death Correction: ${action}`)
    console.log(`Event ID: ${eventId}`)
    console.log(`Reason: ${reason || 'Not provided'}`)

    const eventDbId = await getEventDatabaseId(eventId)
    if (!eventDbId) {
      return h.response({ error: 'Event not found' }).code(404)
    }

    let result: any

    await withTransaction(async (tx) => {
      await acquireEventAdvisoryLock(eventId, tx)

      switch (action) {
        case 'UPDATE_INFORMANT':
          result = await handleUpdateInformant({ eventId, eventDbId, informantData, reason, correctionType, now, h, tx, bundle, syncRequestId })
          break
        case 'REMOVE_INFORMANT_SPOUSE':
          result = await handleRemoveInformantSpouse({ eventId, eventDbId, reason, correctionType, now, h, tx, syncRequestId })
          break
        case 'REPLACE_INFORMANT_SPOUSE':
          result = await handleReplaceInformantSpouse({ eventId, eventDbId, informantData, reason, correctionType, now, h, tx, bundle, syncRequestId })
          break
        default:
          throw new Error(`Unknown action: ${action}`)
      }

      // Update event remarks
      await upsertEvent({
        crvs_event_uuid: eventId,
        last_update_at: now,
        remarks: `CORRECTION: ${action} - ${reason || 'No reason provided'}`
      }, tx)
    })

    await updateSyncRequestStatus(syncRequestId, 'completed')
    await clearSyncRequestPayload(syncRequestId)

    console.log('✅ Death correction completed')
    await indexPersonDb()

    return result || h.response({ success: true, action }).code(200)

  } catch (error) {
    console.error('❌ Death correction error:', error)
    await updateSyncRequestStatus(syncRequestId, 'failed', (error as Error).message)
    return h.response({ error: (error as Error).message }).code(500)
  }
}

/**
 * UPDATE_INFORMANT: Change who the informant is
 * Use case: Wrong person selected as informant, need to correct
 */
async function handleUpdateInformant({ eventId, eventDbId, informantData, reason, correctionType, now, h, tx, bundle, syncRequestId }: any) {
  if (!informantData) {
    return h.response({ error: 'informantData required for UPDATE_INFORMANT' }).code(400)
  }

  console.log('🔄 Updating informant...')

  // Get current informant
  const { rows: currentRows } = await tx.query(`
    SELECT id, person_id, role, relationship_details, crvs_person_id
    FROM event_participant
    WHERE event_id = $1 AND role = 'informant' AND status = 'active' AND ended_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `, [eventDbId])

  const currentInformant = currentRows[0]
  if (!currentInformant) {
    return h.response({ error: 'No active informant found' }).code(404)
  }

  const currentRelationship = currentInformant.relationship_details
  const currentInformantType = currentRelationship?.informantType || 'OTHER'
  const newInformantType = informantData.relationship?.toUpperCase() === 'SPOUSE' ? 'SPOUSE' : 'OTHER'

  // Resolve new informant person ID
  const { personId: newPersonId, isDummy } = await resolveInformantPerson(informantData, tx)

  // Deactivate old informant
  await deactivateEventParticipant(currentInformant.id, now, 'Corrected - wrong informant', tx)
  console.log(`✅ Deactivated old informant: ${currentInformant.person_id}`)

  // Create new informant participant
  const newInformantId = randomUUID()
  await insertEventParticipant({
    id: newInformantId,
    event_id: eventDbId,
    person_id: newPersonId,
    role: 'informant',
    relationship_details: JSON.stringify({
      type: 'informant',
      relationship: informantData.relationship?.toUpperCase() || 'OTHER',
      informantType: newInformantType
    }),
    crvs_person_id: informantData.crvsUuid || randomUUID(),
    status: 'active',
    remarks: `Corrected from ${currentInformant.person_id}`,
    created_at: now,
    ended_at: null
  }, tx)

  console.log(`✅ Created new informant: ${newPersonId}`)

  // Handle spouse link closure/creation based on relationship change
  let linkAction = null
  let warnings: string[] = []

  if (currentInformantType === 'SPOUSE' && newInformantType !== 'SPOUSE') {
    // Changing from spouse to non-spouse: DELETE informational link (clerical error)
    // Rationale: This was entered in error, should not appear in family tree at all
    const { rowCount } = await tx.query(`
      DELETE FROM family_links_forward
      WHERE source_event_id = (SELECT id FROM event WHERE crvs_event_uuid = $1)
        AND relationship_type = 'spouse'
        AND source = 'death_registration'
        AND (person_id = $2 OR related_person_id = $2)
    `, [eventId, currentInformant.person_id])

    if (rowCount && rowCount > 0) {
      linkAction = 'deleted_erroneous_spouse_link'
      console.log(`✅ Deleted informational spouse link (clerical error corrected)`)
    } else {
      console.log(`ℹ️ No informational spouse link found to delete`)
    }
  } else if (currentInformantType !== 'SPOUSE' && newInformantType === 'SPOUSE') {
    // Changing from non-spouse to spouse: Trigger will create informational link (if no marriage)
    linkAction = 'trigger_will_create_spouse_link'
    console.log(`ℹ️ Trigger will create informational spouse link if no marriage exists`)
  }

  // If new informant is spouse, trigger will handle informational link creation (if no marriage)
  // Note: Trigger fires on INSERT of event_participant with informantType='SPOUSE'

  return h.response({
    success: true,
    action: 'UPDATE_INFORMANT',
    oldInformant: { id: currentInformant.id, person_id: currentInformant.person_id, informantType: currentInformantType },
    newInformant: { id: newInformantId, person_id: newPersonId, informantType: newInformantType, isDummy },
    linkAction,
    warnings: warnings.length > 0 ? warnings : undefined
  }).code(200)
}

/**
 * REMOVE_INFORMANT_SPOUSE: Remove informant spouse link
 * Use case: Informant was mistakenly marked as spouse, should be OTHER relationship
 */
async function handleRemoveInformantSpouse({ eventId, eventDbId, reason, correctionType, now, h, tx, syncRequestId }: any) {
  console.log('🗑️ Removing informant spouse link...')

  // Get current informant spouse
  const { rows: currentRows } = await tx.query(`
    SELECT id, person_id, relationship_details
    FROM event_participant
    WHERE event_id = $1
      AND role = 'informant'
      AND status = 'active'
      AND ended_at IS NULL
      AND relationship_details->>'informantType' = 'SPOUSE'
    ORDER BY created_at DESC
    LIMIT 1
  `, [eventDbId])

  if (currentRows.length === 0) {
    return h.response({ error: 'No spouse informant found to remove' }).code(404)
  }

  const currentInformant = currentRows[0]

  // Update relationship_details to change from SPOUSE to OTHER
  await tx.query(`
    UPDATE event_participant
    SET relationship_details = jsonb_set(
          jsonb_set(relationship_details, '{informantType}', '"OTHER"'),
          '{relationship}', '"OTHER"'
        ),
        remarks = COALESCE(remarks, '') || ' [Changed from SPOUSE to OTHER]'
    WHERE id = $1
  `, [currentInformant.id])

  // Delete informational spouse link (clerical error - never should have been created)
  const { rowCount } = await tx.query(`
    DELETE FROM family_links_forward
    WHERE source_event_id = (SELECT id FROM event WHERE crvs_event_uuid = $1)
      AND relationship_type = 'spouse'
      AND source = 'death_registration'
      AND (person_id = $2 OR related_person_id = $2)
  `, [eventId, currentInformant.person_id])

  if (rowCount && rowCount > 0) {
    console.log(`✅ Deleted erroneous spouse link for informant: ${currentInformant.person_id}`)
  } else {
    console.log(`ℹ️ No informational spouse link found (may not have been created)`)
  }

  return h.response({
    success: true,
    action: 'REMOVE_INFORMANT_SPOUSE',
    informant: { id: currentInformant.id, person_id: currentInformant.person_id },
    linkAction: rowCount && rowCount > 0 ? 'deleted_erroneous_spouse_link' : 'no_link_found'
  }).code(200)
}

/**
 * REPLACE_INFORMANT_SPOUSE: Replace informant spouse with correct person
 * Use case: Wrong spouse selected, need to replace with correct spouse
 */
async function handleReplaceInformantSpouse({ eventId, eventDbId, informantData, reason, correctionType, now, h, tx, bundle, syncRequestId }: any) {
  if (!informantData) {
    return h.response({ error: 'informantData required for REPLACE_INFORMANT_SPOUSE' }).code(400)
  }

  if (informantData.relationship?.toUpperCase() !== 'SPOUSE') {
    return h.response({ error: 'informantData.relationship must be SPOUSE for REPLACE_INFORMANT_SPOUSE' }).code(400)
  }

  console.log('🔄 Replacing informant spouse...')

  // Get current informant spouse
  const { rows: currentRows } = await tx.query(`
    SELECT id, person_id, relationship_details
    FROM event_participant
    WHERE event_id = $1
      AND role = 'informant'
      AND status = 'active'
      AND ended_at IS NULL
      AND relationship_details->>'informantType' = 'SPOUSE'
    ORDER BY created_at DESC
    LIMIT 1
  `, [eventDbId])

  if (currentRows.length === 0) {
    return h.response({ error: 'No spouse informant found to replace' }).code(404)
  }

  const currentInformant = currentRows[0]

  // Resolve new spouse person ID
  const { personId: newSpouseId, isDummy } = await resolveInformantPerson(informantData, tx)

  // Deactivate old informant
  await deactivateEventParticipant(currentInformant.id, now, 'Replaced - wrong spouse', tx)

  // Delete old informational link (wrong person selected - clerical error)
  await tx.query(`
    DELETE FROM family_links_forward
    WHERE source_event_id = (SELECT id FROM event WHERE crvs_event_uuid = $1)
      AND relationship_type = 'spouse'
      AND source = 'death_registration'
      AND (person_id = $2 OR related_person_id = $2)
  `, [eventId, currentInformant.person_id])

  console.log(`✅ Deactivated old spouse informant: ${currentInformant.person_id}`)

  // Create new informant participant
  const newInformantId = randomUUID()
  await insertEventParticipant({
    id: newInformantId,
    event_id: eventDbId,
    person_id: newSpouseId,
    role: 'informant',
    relationship_details: JSON.stringify({
      type: 'informant',
      relationship: 'SPOUSE',
      informantType: 'SPOUSE'
    }),
    crvs_person_id: informantData.crvsUuid || randomUUID(),
    status: 'active',
    remarks: `Replaced from ${currentInformant.person_id}`,
    created_at: now,
    ended_at: null
  }, tx)

  console.log(`✅ Created new spouse informant: ${newSpouseId}`)

  // Trigger will create new informational link (if no marriage)

  return h.response({
    success: true,
    action: 'REPLACE_INFORMANT_SPOUSE',
    oldInformant: { id: currentInformant.id, person_id: currentInformant.person_id },
    newInformant: { id: newInformantId, person_id: newSpouseId, isDummy }
  }).code(200)
}

/**
 * Resolve informant person ID from various sources
 */
async function resolveInformantPerson(informantData: InformantData, tx: any): Promise<{ personId: string; isDummy: boolean }> {
  // Priority 1: Existing person ID provided
  if (informantData.personId) {
    const exists = await personExists(informantData.personId, tx)
    if (exists) {
      return { personId: informantData.personId, isDummy: false }
    }
  }

  // Priority 2: Look up by CRVS UUID
  if (informantData.crvsUuid) {
    const { rows } = await tx.query(`
      SELECT id FROM person
      WHERE identifiers::jsonb @> $1::jsonb
      LIMIT 1
    `, [JSON.stringify([{ type: 'crvs', value: informantData.crvsUuid }])])

    if (rows.length > 0) {
      return { personId: rows[0].id, isDummy: false }
    }
  }

  // Priority 3: Create dummy person from manual data
  if (informantData.manual) {
    const newId = randomUUID()
    const identifiers: Array<{type: string, value: string}> = []
    if (informantData.manual.national_id) {
      identifiers.push({ type: 'NATIONAL_ID', value: informantData.manual.national_id })
    }
    if (informantData.crvsUuid) {
      identifiers.push({ type: 'crvs', value: informantData.crvsUuid })
    }

    await createDummyPerson({
      id: newId,
      given_name: informantData.manual.given_name || 'Unknown',
      family_name: informantData.manual.family_name || 'Informant',
      gender: informantData.manual.gender || 'unknown',
      dob: informantData.manual.dob || null,
      place_of_birth: informantData.manual.place_of_birth || 'Unknown',
      status: 'review',
      identifiers
    }, tx)

    return { personId: newId, isDummy: true }
  }

  throw new Error('Could not resolve informant person ID - no valid data provided')
}
