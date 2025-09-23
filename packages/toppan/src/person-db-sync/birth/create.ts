// person-db-sync/birth/create.ts
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
} from '../../database'
import { indexPersonDb } from '@opencrvs/toppan-db'

/**
 * This handler mirrors the mapping used in your webhook.
 * Input: { record: <OpenCRVS FULL BUNDLE> }
 */
export async function createPersonHandler(request: Hapi.Request, h: Hapi.ResponseToolkit) {
  const { record } = request.payload as { record: any }
  if (!record) return h.response({ error: 'Missing record' }).code(400)

  // Step 1: Insert sync request first (skip if this is a retry)
  const isRetry = (request as any).isRetry
  const syncRequestId = isRetry ? (request as any).syncRequestId : await insertSyncRequest({
    event_type: 'birth',
    action: 'CREATE', 
    crvs_event_uuid: record.entry?.find((e: any) => e.resource?.resourceType === 'Composition')?.resource?.id,
    payload: record
  })

  try {
    // Debug: Dump the complete FHIR bundle
    console.log('\n🔍 === COMPLETE FHIR BUNDLE DUMP ===')
    console.log(JSON.stringify(record, null, 2))
    console.log('🔍 === END BUNDLE DUMP ===')

    const mapped = mapBundleToSql(record)
    if (!mapped) return h.response({ error: 'Unable to parse birth bundle' }).code(400)

    const now = new Date().toISOString()

    // Debug summary
    console.log('\n📊 DATABASE INSERT SUMMARY:')
    console.log('============================')
    console.log(`- Child person: 1 INSERT`)
    console.log(`- Birth event: 1 INSERT`)
    console.log(`- Participants: ${mapped.participantPayloads.length} INSERTs`)
    console.log(`- New persons: ${mapped.newPersons.length} INSERTs`)
    console.log(`- New events: ${mapped.newEvents.length} INSERTs`)
    console.log(`- New participants: ${mapped.newParticipants.length} INSERTs`)
    console.log(`- Total INSERTs: ${1 + 1 + mapped.participantPayloads.length + mapped.newPersons.length + mapped.newEvents.length + mapped.newParticipants.length}`)

    console.log('\n📋 RECORD DETAILS:')
    console.log(`- Child: ${mapped.personPayload.given_name} ${mapped.personPayload.family_name}`)
    console.log(`- Registration ID: ${JSON.parse(mapped.eventPayload.metadata).registrationNumber}`)
    console.log(`- Event UUID: ${mapped.eventPayload.crvs_event_uuid}`)

    console.log('\n🔄 Starting sequential database insertion...')

    await withTransaction(async (tx) => {
      // Serialize by event to prevent conflicts
      await acquireEventAdvisoryLock(mapped.eventPayload.crvs_event_uuid, tx)

      // 1) Insert any provisional persons/events/participants (e.g., informant when not mother/father)
      console.log(`📝 Inserting ${mapped.newPersons.length} provisional persons...`)
      for (const p of mapped.newPersons) await insertPerson(p, tx)
      console.log(`📝 Inserting ${mapped.newEvents.length} provisional events...`)
      for (const e of mapped.newEvents) await insertEvent(e, tx)
      console.log(`📝 Inserting ${mapped.newParticipants.length} provisional participants...`)
      for (const ep of mapped.newParticipants) {
        // Idempotency: skip if this participant was already created in a previous run for the same event/person.
        if (await eventParticipantExists(ep.event_id, ep.crvs_person_id, ep.role, tx)) {
          console.log(`   • Skipping existing provisional participant (${ep.role}/${ep.crvs_person_id})`)
          continue
        }
        await insertEventParticipant(ep, tx)
      }

      // 2) Insert the child person and the main event (idempotent-ish: your schema uses server-side defaults)
      console.log('📝 Inserting main child person...')
      await insertPerson(mapped.personPayload, tx)
      console.log('📝 Inserting birth event...')
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

      // 3) Insert main participants (child/subject + mother + maybe father + maybe informant)
      console.log(`📝 Inserting ${updatedParticipants.length} participants...`)
      for (const ep of updatedParticipants) {
        // Idempotency: participants may already exist if the same record is replayed. Skip duplicates gracefully.
        if (await eventParticipantExists(ep.event_id, ep.crvs_person_id, ep.role, tx)) {
          console.log(`   • Participant already exists (${ep.role}/${ep.crvs_person_id}), skipping`)
          continue
        }
        await insertEventParticipant(ep, tx)
      }

      // Touch remarks/time on the real event row (no-op if just inserted)
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

    // Async reindex (ok for baseline; outbox later)
    console.log('\n🔍 Updating OpenSearch index...')
    await triggerReindex()
    console.log('✅ OpenSearch index updated successfully')

    return h.response({
      success: true,
      action: 'CREATE_BIRTH_EVENT',
      eventId: mapped.eventPayload.crvs_event_uuid,
      childId: mapped.personPayload.id,
      participants: mapped.participantPayloads.map(p => ({ role: p.role, person_id: p.person_id })),
      newPersons: mapped.newPersons.map(p => p.id),
      newEvents: mapped.newEvents.map(e => e.id)
    }).code(200)

  } catch (error) {
    console.error('❌ Create birth error:', error)
    // Step 3: Mark sync request as failed
    await updateSyncRequestStatus(syncRequestId, 'failed', (error as Error).message)
    return h.response({ error: (error as Error).message }).code(500)
  }
}

/* ---------------- mapping (mirrors webhook) ---------------- */

function mapBundleToSql(record: any) {
  const entries = record?.entry || []
  const now = new Date().toISOString()

  const task = entries.find((e: any) => e.resource?.resourceType === 'Task')?.resource
  const composition = entries.find((e: any) => e.resource?.resourceType === 'Composition')?.resource
  const compositionId = composition?.id || task?.focus?.reference?.split('/')?.[1]

  const child = entries.find((e: any) =>
    e.resource?.resourceType === 'Patient' && e.resource?.gender
  )?.resource

  const parentPatients = entries
    .filter((e: any) => e.resource?.resourceType === 'Patient' && !e.resource?.gender && e.resource?.active === true)
    .map((e: any) => e.resource)

  // Get mother and father from composition sections
  const motherSection = composition?.section?.find((s: any) => 
    s.title === "Mother's details"
  )
  const fatherSection = composition?.section?.find((s: any) => 
    s.title === "Father's details"
  )

  const mother = motherSection?.entry?.[0]?.reference
    ? entries.find((e: any) => e.fullUrl?.includes(motherSection.entry[0].reference))?.resource
    : null

  const fatherPatient = fatherSection?.entry?.[0]?.reference
    ? entries.find((e: any) => e.fullUrl?.includes(fatherSection.entry[0].reference))?.resource
    : null
  
  // Check if father details are actually provided (not just a placeholder)
  const father = fatherPatient?.active === false || !fatherPatient?.name?.length
    ? null
    : fatherPatient

  // Find informant relation (separate from parent identification)
  const informantRelation = entries.find((e: any) =>
    e.resource?.resourceType === 'RelatedPerson'
  )?.resource

  const hasFather = Boolean(father)

  // Debug missing data
  console.log('🔍 Required data check:')
  console.log('- child:', !!child, child?.id)
  console.log('- task:', !!task, task?.id)
  console.log('- mother:', !!mother, mother?.id)
  console.log('- father:', !!father, father?.id)
  console.log('- compositionId:', !!compositionId, compositionId)
  console.log('- motherSection:', !!motherSection, motherSection?.entry?.[0]?.reference)
  console.log('- fatherSection:', !!fatherSection, fatherSection?.entry?.[0]?.reference)
  console.log('- parentPatients count:', parentPatients.length)

  if (!child || !task || !mother || !compositionId) {
    throw new Error(`Missing required data: child=${!!child}, task=${!!task}, mother=${!!mother}, compositionId=${!!compositionId}`)
  }

  // Debug: Log all task identifiers
  console.log('🔍 Task identifiers:', JSON.stringify(task.identifier, null, 2))

  const trackingId =
    task.identifier?.find((id: any) =>
      id.system === 'http://opencrvs.org/specs/id/birth-tracking-id'
    )?.value

  const registrationNumber =
    task.identifier?.find((id: any) =>
      id.system === 'http://opencrvs.org/specs/id/birth-registration-number'
    )?.value || trackingId || 'UNKNOWN'

  console.log('🔍 Found registrationNumber:', registrationNumber)
  console.log('🔍 Found trackingId:', trackingId)
  console.log('🔍 Child birthDate:', child.birthDate)
  console.log('🔍 Child data:', JSON.stringify(child, null, 2))
  
  // Debug: Log all RelatedPerson resources
  const allRelatedPersons = entries.filter((e: any) => e.resource?.resourceType === 'RelatedPerson')
  console.log('🔍 All RelatedPerson resources:', JSON.stringify(allRelatedPersons, null, 2))
  
  // Debug: Log all Patient resources
  const allPatients = entries.filter((e: any) => e.resource?.resourceType === 'Patient')
  console.log('🔍 All Patient resources count:', allPatients.length)
  console.log('🔍 Parent patients:', JSON.stringify(parentPatients, null, 2))
  
  console.log('🔍 Mother section found:', !!motherSection)
  console.log('🔍 Father section found:', !!fatherSection)
  console.log('🔍 Mother found:', !!mother)
  console.log('🔍 Father found:', !!father)
  console.log('🔍 Has father:', hasFather)

  // Local IDs
  const localChildId = randomUUID()
  const localEventId = randomUUID()

  const motherExternalUuid = mother?.identifier?.find((id: any) =>
    id.type?.coding?.some((c: any) => c.code === 'EXTERNAL_PERSON_ID')
  )?.value

  const localMotherId = motherExternalUuid || randomUUID()
  const shouldInsertMother = !motherExternalUuid

  let localFatherId: string | null = null
  let shouldInsertFather = false
  if (hasFather) {
    const fatherExternalUuid = father?.identifier?.find((id: any) =>
      id.type?.coding?.some((c: any) => c.code === 'EXTERNAL_PERSON_ID')
    )?.value
    localFatherId = fatherExternalUuid || randomUUID()
    shouldInsertFather = !fatherExternalUuid
  }

  // Generate National ID for child (10 digits)
  const childNationalId = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0')
  
  const childIdentifiers = [
    { type: 'NATIONAL_ID', value: childNationalId },
    { type: 'BIRTH_REGISTRATION_NUMBER', value: registrationNumber },
    ...(child.identifier || [])
      .filter((i: any) => i.value?.trim())
      .filter((i: any) => {
        const type = i.type?.coding?.[0]?.code
        // Skip if it's already covered above
        return type !== 'NATIONAL_ID' && type !== 'BIRTH_REGISTRATION_NUMBER'
      })
      .map((i: any) => ({
        type: i.type?.coding?.[0]?.code || 'UNKNOWN',
        value: i.value
      }))
  ]

  const personPayload = {
    id: localChildId,
    given_name: (child.name?.[0]?.given || []).filter(Boolean).join(' ') || '',
    family_name: child.name?.[0]?.family || '',
    gender: child.gender || '',
    dob: child.birthDate || null,
    place_of_birth: 'Unknown',
    place_of_birth_uuid:
      child.extension?.find((ext: any) => ext.url === 'http://opencrvs.org/specs/extension/placeOfBirth')
        ?.valueReference?.reference?.split('/')?.[1] || null,
    identifiers: JSON.stringify(childIdentifiers),
    status: 'active',
    created_at: now,
    updated_at: now
  }

  const eventPayload = {
    id: localEventId,
    event_type: 'birth',
    event_date: child.birthDate || null,
    location: child.extension?.find((ext: any) => ext.url === 'http://opencrvs.org/specs/extension/placeOfBirth')
      ?.valueReference?.reference?.split('/')?.[1] || null,
    source: 'OpenCRVS',
    metadata: JSON.stringify({ trackingId, registrationNumber }),
    crvs_event_uuid: compositionId,
    duplicates: null,
    status: task.businessStatus?.coding?.[0]?.code || null,
    last_update_at: task.lastModified || null,
    created_at: now
  }

  // INFORMANT mapping
  const informantPatientId = informantRelation?.patient?.reference?.split('/')?.[1]
  const isMotherInformant = informantPatientId === mother?.id
  const isFatherInformant = father && informantPatientId === father?.id
  const isOtherInformant = informantPatientId && !isMotherInformant && !isFatherInformant

  const informantPatient = isOtherInformant
    ? entries.find((e: any) => e.resource?.resourceType === 'Patient' && e.resource?.id === informantPatientId)?.resource
    : null

  const participantPayloads: any[] = [
    {
      id: randomUUID(),
      person_id: localChildId,
      event_id: localEventId,
      role: 'subject',
      relationship_details: JSON.stringify({ type: 'child' }),
      crvs_person_id: child.id,
      status: 'active',
      created_at: now
    },
    {
      id: randomUUID(),
      person_id: localMotherId,
      event_id: localEventId,
      role: 'mother',
      relationship_details: JSON.stringify({
        type: 'mother',
        relationship: 'MOTHER',
        ...(isMotherInformant && { informantType: 'MOTHER' })
      }),
      crvs_person_id: mother.id,
      status: 'active',
      remarks: shouldInsertMother ? 'Creation: UI' : null,
      created_at: now
    }
  ]

  if (hasFather && localFatherId) {
    participantPayloads.push({
      id: randomUUID(),
      person_id: localFatherId,
      event_id: localEventId,
      role: 'father',
      relationship_details: JSON.stringify({
        type: 'father',
        relationship: 'FATHER',
        ...(isFatherInformant && { informantType: 'FATHER' })
      }),
      crvs_person_id: father?.id || 'unknown-father-crvs-id',
      status: shouldInsertFather ? 'review' : 'active',
      remarks: shouldInsertFather ? 'Creation: UI' : null,
      created_at: now
    })
  }

  const newPersons: any[] = []
  const newEvents: any[] = []
  const newParticipants: any[] = []

  // Other informant → provisional person if needed
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
        { type: 'crvs', value: informantPatient.id, event: 'birth' },
        ...(informantPatient.identifier || [])
          .filter((i: any) => i.value?.trim())
          .map((i: any) => ({
            type: i.type?.coding?.[0]?.code || 'UNKNOWN',
            value: i.value
          }))
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

  // Provisional mother
  if (shouldInsertMother) {
    const motherBirthEventId = randomUUID()
    newPersons.push({
      id: localMotherId,
      given_name: (mother.name?.[0]?.given || []).filter(Boolean).join(' ') || '',
      family_name: mother.name?.[0]?.family || '',
      gender: 'female',
      dob: mother.birthDate || null,
      place_of_birth: 'Unknown',
      identifiers: JSON.stringify([
        { type: 'crvs', value: mother.id, event: 'birth' },
        ...(mother.identifier || [])
          .filter((i: any) => i.value?.trim())
          .map((i: any) => ({ type: i.type?.coding?.[0]?.code || 'UNKNOWN', value: i.value }))
      ]),
      status: 'review',
      created_at: now,
      updated_at: now
    })

    newEvents.push({
      id: motherBirthEventId,
      event_type: 'birth',
      event_date: mother.birthDate || null,
      location: 'Unknown',
      source: 'seed',
      metadata: JSON.stringify({ note: 'generated birth by crvs' }),
      crvs_event_uuid: randomUUID(),
      duplicates: null,
      status: null,
      last_update_at: null,
      remarks: 'Mocked event: Invalid crvs_event_uuid',
      created_at: now
    })

    newParticipants.push({
      id: randomUUID(),
      person_id: localMotherId,
      event_id: motherBirthEventId,
      role: 'subject',
      relationship_details: JSON.stringify({ import: 'crvs' }),
      crvs_person_id: mother.id,
      status: 'active',
      created_at: now
    })
  }

  // Provisional father
  if (shouldInsertFather && localFatherId) {
    const fatherBirthEventId = randomUUID()

    newPersons.push({
      id: localFatherId,
      given_name: (father?.name?.[0]?.given || []).filter(Boolean).join(' ') || 'Unknown',
      family_name: father?.name?.[0]?.family || 'Father',
      gender: 'male',
      dob: father?.birthDate || null,
      place_of_birth: 'Unknown',
      identifiers: JSON.stringify([
        { type: 'crvs', value: father?.id || 'unknown-father-crvs-id', event: 'birth' },
        ...(father?.identifier || [])
          .filter((i: any) => i.value?.trim())
          .map((i: any) => ({ type: i.type?.coding?.[0]?.code || 'UNKNOWN', value: i.value }))
      ]),
      status: 'review',
      created_at: now,
      updated_at: now
    })

    newEvents.push({
      id: fatherBirthEventId,
      event_type: 'birth',
      event_date: father?.birthDate || null,
      location: 'Unknown',
      source: 'seed',
      metadata: JSON.stringify({ note: 'generated birth by crvs' }),
      crvs_event_uuid: randomUUID(),
      duplicates: null,
      status: null,
      last_update_at: null,
      remarks: 'Mocked event: Invalid crvs_event_uuid',
      created_at: now
    })

    newParticipants.push({
      id: randomUUID(),
      person_id: localFatherId,
      event_id: fatherBirthEventId,
      role: 'subject',
      relationship_details: JSON.stringify({ import: 'crvs' }),
      crvs_person_id: father?.id || 'unknown-father-crvs-id',
      status: 'active',
      created_at: now
    })
  }

  return {
    personPayload,
    eventPayload,
    participantPayloads,
    newPersons,
    newEvents,
    newParticipants
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
