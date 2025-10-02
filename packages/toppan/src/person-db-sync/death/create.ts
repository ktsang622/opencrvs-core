// person-db-sync/death/create.ts
import * as Hapi from '@hapi/hapi'
import { randomUUID } from 'crypto'
import {
  withTransaction,
  acquireEventAdvisoryLock,
  insertPerson,
  insertEvent,
  insertEventParticipant,
  eventParticipantExists,
  upsertEvent,
  getEventIdByCrvs,
  insertSyncRequest,
  updateSyncRequestStatus,
  clearSyncRequestPayload,
  findPersonByCrvsId,
  updatePersonToDeceased
} from '../../database'
import { indexPersonDb } from '@opencrvs/toppan-db'

/**
 * Death registration handler
 * Creates death event and updates deceased person status
 */
export async function createDeathHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  const { record } = request.payload as { record: any }
  if (!record) return h.response({ error: 'Missing record' }).code(400)

  // Step 1: Insert sync request first (skip if this is a retry)
  const isRetry = (request as any).isRetry
  const syncRequestId = isRetry ? (request as any).syncRequestId : await insertSyncRequest({
    event_type: 'death',
    action: 'CREATE',
    crvs_event_uuid: record.entry?.find((e: any) => e.resource?.resourceType === 'Composition')?.resource?.id,
    payload: record
  })

  try {
    console.log('\n🔍 === COMPLETE DEATH FHIR BUNDLE DUMP ===')
    console.log(JSON.stringify(record, null, 2))
    console.log('🔍 === END BUNDLE DUMP ===')

    // Extract deceased person CRVS ID to check for existing birth record
    const entries = record?.entry || []
    const composition = entries.find((e: any) => e.resource?.resourceType === 'Composition')?.resource
    const deceased = entries.find((e: any) =>
      e.resource?.resourceType === 'Patient' &&
      e.resource?.deceasedBoolean === true
    )?.resource || entries.find((e: any) =>
      e.resource?.resourceType === 'Patient' &&
      composition?.section?.find((s: any) => s.title === "Deceased details")
        ?.entry?.[0]?.reference?.includes(e.resource?.id)
    )?.resource

    const deceasedCrvsId = deceased?.id

    // Look up existing person by CRVS ID (to link death to birth record)
    let existingPerson = null
    if (deceasedCrvsId) {
      console.log(`\n🔍 Checking for existing person with CRVS ID: ${deceasedCrvsId}`)
      existingPerson = await findPersonByCrvsId(deceasedCrvsId)
      if (existingPerson) {
        console.log(`✅ Found existing person: ${existingPerson.given_name} ${existingPerson.family_name} (ID: ${existingPerson.id})`)
        console.log(`   - Current status: ${existingPerson.status}`)
        console.log(`   - DOB: ${existingPerson.dob}`)
      } else {
        console.log(`ℹ️ No existing person found - will create new deceased person`)
      }
    }

    const mapped = mapDeathBundleToSql(record, existingPerson)
    if (!mapped) return h.response({ error: 'Unable to parse death bundle' }).code(400)

    const now = new Date().toISOString()

    console.log('\n📊 DEATH DATABASE INSERT SUMMARY:')
    console.log('============================')
    console.log(`- Deceased person: ${mapped.shouldUpdateExisting ? '1 UPDATE' : '1 INSERT'}`)
    console.log(`- Death event: 1 INSERT`)
    console.log(`- Participants: ${mapped.participantPayloads.length} INSERTs`)
    console.log(`- New persons: ${mapped.newPersons.length} INSERTs`)
    console.log(`- New events: ${mapped.newEvents.length} INSERTs`)
    console.log(`- New participants: ${mapped.newParticipants.length} INSERTs`)

    console.log('\n📋 RECORD DETAILS:')
    console.log(`- Deceased: ${mapped.deceasedPayload.given_name} ${mapped.deceasedPayload.family_name}`)
    console.log(`- Death Date: ${mapped.eventPayload.event_date}`)
    console.log(`- Registration ID: ${JSON.parse(mapped.eventPayload.metadata).registrationNumber}`)
    console.log(`- Event UUID: ${mapped.eventPayload.crvs_event_uuid}`)

    if (mapped.existingPerson) {
      console.log(`\n✨ Linking to existing person record:`)
      console.log(`  - Person ID: ${mapped.existingPerson.id}`)
      console.log(`  - Previous status: ${mapped.existingPerson.status}`)
      console.log(`  - DOB: ${mapped.existingPerson.dob}`)
    }

    console.log('\n🔄 Starting sequential database insertion...')

    await withTransaction(async (tx) => {
      // Serialize by event to prevent conflicts
      await acquireEventAdvisoryLock(mapped.eventPayload.crvs_event_uuid, tx)

      // 1) Insert any provisional persons/events/participants (informant, spouse, etc.)
      console.log(`📝 Inserting ${mapped.newPersons.length} provisional persons...`)
      for (const p of mapped.newPersons) await insertPerson(p, tx)
      console.log(`📝 Inserting ${mapped.newEvents.length} provisional events...`)
      for (const e of mapped.newEvents) await insertEvent(e, tx)
      console.log(`📝 Inserting ${mapped.newParticipants.length} provisional participants...`)
      for (const ep of mapped.newParticipants) {
        if (await eventParticipantExists(ep.event_id, ep.crvs_person_id, ep.role, tx)) {
          console.log(`   • Skipping existing provisional participant (${ep.role}/${ep.crvs_person_id})`)
          continue
        }
        await insertEventParticipant(ep, tx)
      }

      // 2) Handle deceased person - update existing OR insert new
      if (mapped.shouldUpdateExisting && mapped.existingPerson) {
        console.log('📝 Updating existing person to deceased status...')
        await updatePersonToDeceased({
          personId: mapped.existingPerson.id,
          deathDate: mapped.eventPayload.event_date,
          updatedAt: now
        }, tx)
        console.log(`✅ Person ${mapped.existingPerson.id} updated to deceased`)
      } else {
        console.log('📝 Inserting new deceased person (no prior record)...')
        await insertPerson(mapped.deceasedPayload, tx)
        console.log(`⚠️ Created new deceased person (no birth record found)`)
      }

      // 3) Insert death event
      console.log('📝 Inserting death event...')
      await insertEvent(mapped.eventPayload, tx)

      // Get the actual event database ID for participants
      const actualEventId = await getEventIdByCrvs(mapped.eventPayload.crvs_event_uuid, tx)
      if (!actualEventId) {
        throw new Error('Failed to get event database ID after insertion')
      }

      // Update participant payloads with correct event_id
      const updatedParticipants = mapped.participantPayloads.map(p => ({
        ...p,
        event_id: actualEventId
      }))

      // 4) Insert participants (deceased/subject + informant + maybe mother/father/spouse)
      console.log(`📝 Inserting ${updatedParticipants.length} participants...`)
      for (const ep of updatedParticipants) {
        if (await eventParticipantExists(ep.event_id, ep.crvs_person_id, ep.role, tx)) {
          console.log(`   • Participant already exists (${ep.role}/${ep.crvs_person_id}), skipping`)
          continue
        }
        await insertEventParticipant(ep, tx)
      }

      // Touch remarks/time on the event row
      await upsertEvent({
        crvs_event_uuid: mapped.eventPayload.crvs_event_uuid,
        last_update_at: now,
        remarks: 'CREATION: UI'
      }, tx)
    })

    console.log('\n✅ Database insertion completed successfully')

    // Step 2: Mark sync request as completed and clear sensitive data
    await updateSyncRequestStatus(syncRequestId, 'completed')
    await clearSyncRequestPayload(syncRequestId)

    // Async reindex
    console.log('\n🔍 Updating OpenSearch index...')
    await triggerReindex()
    console.log('✅ OpenSearch index updated successfully')

    return h.response({
      success: true,
      action: 'CREATE_DEATH_EVENT',
      eventId: mapped.eventPayload.crvs_event_uuid,
      deceasedId: mapped.shouldUpdateExisting && mapped.existingPerson
        ? mapped.existingPerson.id
        : mapped.deceasedPayload.id,
      wasLinkedToBirthRecord: mapped.shouldUpdateExisting,
      participants: mapped.participantPayloads.map(p => ({ role: p.role, person_id: p.person_id })),
      newPersons: mapped.newPersons.map(p => p.id),
      newEvents: mapped.newEvents.map(e => e.id)
    }).code(200)

  } catch (error) {
    console.error('❌ Create death error:', error)
    await updateSyncRequestStatus(syncRequestId, 'failed', (error as Error).message)
    return h.response({ error: (error as Error).message }).code(500)
  }
}

/* ---------------- mapping (mirrors webhook) ---------------- */

function mapDeathBundleToSql(record: any, existingPerson: any = null) {
  const entries = record?.entry || []
  const now = new Date().toISOString()

  const task = entries.find((e: any) => e.resource?.resourceType === 'Task')?.resource
  const composition = entries.find((e: any) => e.resource?.resourceType === 'Composition')?.resource
  const compositionId = composition?.id || task?.focus?.reference?.split('/')?.[1]

  // Find deceased patient
  const deceased = entries.find((e: any) =>
    e.resource?.resourceType === 'Patient' &&
    e.resource?.deceasedBoolean === true
  )?.resource || entries.find((e: any) =>
    e.resource?.resourceType === 'Patient' &&
    composition?.section?.find((s: any) => s.title === "Deceased details")
      ?.entry?.[0]?.reference?.includes(e.resource?.id)
  )?.resource

  // Get sections for relationships
  const motherSection = composition?.section?.find((s: any) =>
    s.title === "Mother's details"
  )
  const fatherSection = composition?.section?.find((s: any) =>
    s.title === "Father's details"
  )
  const spouseSection = composition?.section?.find((s: any) =>
    s.title === "Spouse details"
  )

  const mother = motherSection?.entry?.[0]?.reference
    ? entries.find((e: any) => e.fullUrl?.includes(motherSection.entry[0].reference))?.resource
    : null

  const father = fatherSection?.entry?.[0]?.reference
    ? entries.find((e: any) => e.fullUrl?.includes(fatherSection.entry[0].reference))?.resource
    : null

  const spouse = spouseSection?.entry?.[0]?.reference
    ? entries.find((e: any) => e.fullUrl?.includes(spouseSection.entry[0].reference))?.resource
    : null

  // Find informant relation
  const informantRelation = entries.find((e: any) =>
    e.resource?.resourceType === 'RelatedPerson'
  )?.resource

  console.log('🔍 Required data check:')
  console.log('- deceased:', !!deceased, deceased?.id)
  console.log('- task:', !!task, task?.id)
  console.log('- compositionId:', !!compositionId, compositionId)

  if (!deceased || !task || !compositionId) {
    throw new Error(`Missing required data: deceased=${!!deceased}, task=${!!task}, compositionId=${!!compositionId}`)
  }

  const trackingId =
    task.identifier?.find((id: any) =>
      id.system === 'http://opencrvs.org/specs/id/death-tracking-id'
    )?.value

  const registrationNumber =
    task.identifier?.find((id: any) =>
      id.system === 'http://opencrvs.org/specs/id/death-registration-number'
    )?.value || trackingId || 'UNKNOWN'

  console.log('🔍 Found registrationNumber:', registrationNumber)
  console.log('🔍 Found trackingId:', trackingId)
  console.log('🔍 Deceased deathDate:', deceased.deceasedDateTime)

  // Check if deceased person already exists in our DB (has birth record)
  // existingPerson is now passed as parameter from main handler
  const shouldUpdateExisting = !!existingPerson
  const localDeceasedId = existingPerson?.id || randomUUID()

  const deceasedCrvsId = deceased.id
  const localEventId = randomUUID()

  // Generate identifiers for deceased (if creating new)
  const deceasedIdentifiers = [
    { type: 'crvs', value: deceased.id, event: 'death' },
    { type: 'DEATH_REGISTRATION_NUMBER', value: registrationNumber },
    ...(deceased.identifier || [])
      .filter((i: any) => i.value?.trim())
      .map((i: any) => ({
        type: i.type?.coding?.[0]?.code || 'UNKNOWN',
        value: i.value
      }))
  ]

  const deceasedPayload = {
    id: localDeceasedId,
    given_name: (deceased.name?.[0]?.given || []).filter(Boolean).join(' ') || '',
    family_name: deceased.name?.[0]?.family || '',
    gender: deceased.gender || 'unknown',
    dob: deceased.birthDate || null,
    place_of_birth: 'Unknown',
    identifiers: JSON.stringify(deceasedIdentifiers),
    status: 'deceased',
    death_date: deceased.deceasedDateTime?.split('T')[0] || null,
    created_at: now,
    updated_at: now
  }

  const eventPayload = {
    id: localEventId,
    event_type: 'death',
    event_date: deceased.deceasedDateTime?.split('T')[0] || null,
    location: deceased.extension?.find((ext: any) => ext.url === 'http://opencrvs.org/specs/extension/placeOfDeath')
      ?.valueReference?.reference?.split('/')?.[1] || null,
    source: 'OpenCRVS',
    metadata: JSON.stringify({ trackingId, registrationNumber }),
    crvs_event_uuid: compositionId,
    duplicates: null,
    status: task.businessStatus?.coding?.[0]?.code || null,
    last_update_at: task.lastModified || null,
    created_at: now
  }

  const participantPayloads: any[] = [
    {
      id: randomUUID(),
      person_id: localDeceasedId, // Will be updated if existing person found
      event_id: localEventId,
      role: 'subject',
      relationship_details: JSON.stringify({ type: 'deceased' }),
      crvs_person_id: deceased.id,
      status: 'active',
      created_at: now
    }
  ]

  // Handle informant (similar to birth logic)
  const informantPatientId = informantRelation?.patient?.reference?.split('/')?.[1]
  const isMotherInformant = mother && informantPatientId === mother?.id
  const isFatherInformant = father && informantPatientId === father?.id
  const isSpouseInformant = spouse && informantPatientId === spouse?.id
  const isOtherInformant = informantPatientId && !isMotherInformant && !isFatherInformant && !isSpouseInformant

  const informantPatient = isOtherInformant
    ? entries.find((e: any) => e.resource?.resourceType === 'Patient' && e.resource?.id === informantPatientId)?.resource
    : null

  const newPersons: any[] = []
  const newEvents: any[] = []
  const newParticipants: any[] = []

  // Handle other informant (not mother/father/spouse)
  if (isOtherInformant && informantPatient) {
    const informantLocalId = randomUUID()
    newPersons.push({
      id: informantLocalId,
      given_name: (informantPatient.name?.[0]?.given || []).filter(Boolean).join(' ') || '',
      family_name: informantPatient.name?.[0]?.family || '',
      gender: informantPatient.gender || 'unknown',
      dob: informantPatient.birthDate || null,
      place_of_birth: 'Unknown',
      identifiers: JSON.stringify([
        { type: 'crvs', value: informantPatient.id, event: 'death' }
      ]),
      status: 'review',
      created_at: now,
      updated_at: now
    })

    const informantSeedEventId = randomUUID()
    newEvents.push({
      id: informantSeedEventId,
      event_type: 'birth',
      event_date: informantPatient.birthDate || null,
      location: 'Unknown',
      source: 'seed',
      metadata: JSON.stringify({ note: 'generated birth by crvs' }),
      crvs_event_uuid: randomUUID(),
      duplicates: null,
      status: null,
      last_update_at: now,
      remarks: 'Mocked event: Invalid crvs_event_uuid',
      created_at: now
    })

    newParticipants.push({
      id: randomUUID(),
      person_id: informantLocalId,
      event_id: informantSeedEventId,
      role: 'subject',
      relationship_details: JSON.stringify({ import: 'crvs' }),
      crvs_person_id: informantPatient.id,
      status: 'active',
      created_at: now
    })

    const informantRelationshipCode = informantRelation?.relationship?.coding?.[0]?.code || 'OTHER'

    participantPayloads.push({
      id: randomUUID(),
      person_id: informantLocalId,
      event_id: localEventId,
      role: 'informant',
      relationship_details: JSON.stringify({
        type: 'informant',
        relationship: informantRelationshipCode,
        informantType: 'OTHER'
      }),
      crvs_person_id: informantPatient.id,
      status: 'active',
      created_at: now
    })
  }

  // TODO: Handle mother, father, spouse linking if provided

  return {
    deceasedPayload,
    eventPayload,
    participantPayloads,
    newPersons,
    newEvents,
    newParticipants,
    deceasedCrvsId,
    existingPerson,
    shouldUpdateExisting
  }
}

async function triggerReindex() {
  try {
    await indexPersonDb()
    console.log('✅ OpenSearch index updated')
  } catch (error) {
    console.log('⚠️ Reindex failed:', error)
  }
}
