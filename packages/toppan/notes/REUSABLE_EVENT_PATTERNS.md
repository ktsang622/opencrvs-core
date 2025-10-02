# Reusable Event Handler Patterns

**Purpose:** Extract common patterns from birth/death handlers to create a framework for future vital events (marriage, divorce, adoption, etc.)

**Status:** Architecture Proposal
**Priority:** High - Reduces implementation time for new events by ~60%

---

## Overview

Birth and death handlers share ~60% identical code. This document extracts those patterns into reusable abstractions.

**Benefits:**
- 🚀 **Faster development:** New events in 2-3 days instead of 1-2 weeks
- 🐛 **Fewer bugs:** Shared code = tested once, used everywhere
- 📚 **Easier maintenance:** Fix once, all events benefit
- ✅ **Consistency:** Same error handling, validation, transaction patterns

---

## Pattern 1: Base Event Handler

### Common Flow (All Events)

```
1. Validate input (Joi schema)
2. Create sync request (retry capability)
3. Parse FHIR bundle → SQL
4. Validate business rules
5. Execute in transaction:
   a. Acquire advisory lock
   b. Insert persons (provisional if needed)
   c. Insert events
   d. Insert participants
   e. Update event metadata
6. Mark sync request complete
7. Trigger reindex
8. Return response
```

### Proposed Base Class

```typescript
/**
 * Base handler for all vital event registrations
 * Handles common patterns: sync requests, transactions, reindexing
 */
export abstract class VitalEventHandler<TBundle, TMapped> {
  constructor(
    protected eventType: 'birth' | 'death' | 'marriage' | 'divorce' | 'adoption',
    protected pool: Pool
  ) {}

  /**
   * Main entry point for event creation
   */
  async create(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const { record } = request.payload as { record: TBundle }
    if (!record) return h.response({ error: 'Missing record' }).code(400)

    // Step 1: Create sync request (retry capability)
    const isRetry = (request as any).isRetry
    const syncRequestId = isRetry
      ? (request as any).syncRequestId
      : await this.createSyncRequest(record)

    try {
      // Step 2: Parse and validate
      const mapped = await this.parseBundle(record)
      this.validateBusinessRules(mapped)

      // Step 3: Execute in transaction
      await withTransaction(async (tx) => {
        await acquireEventAdvisoryLock(mapped.eventId, tx)
        await this.insertData(mapped, tx)
      })

      // Step 4: Complete sync request
      await this.completeSyncRequest(syncRequestId)

      // Step 5: Reindex (async)
      this.triggerReindex().catch(err =>
        console.warn('Reindex failed:', err)
      )

      return this.buildSuccessResponse(mapped, h)

    } catch (error) {
      await this.failSyncRequest(syncRequestId, error)
      return h.response({ error: (error as Error).message }).code(500)
    }
  }

  // Abstract methods - each event implements these
  protected abstract parseBundle(bundle: TBundle): Promise<TMapped>
  protected abstract validateBusinessRules(mapped: TMapped): void
  protected abstract insertData(mapped: TMapped, tx: PoolClient): Promise<void>
  protected abstract buildSuccessResponse(mapped: TMapped, h: Hapi.ResponseToolkit): Hapi.ResponseObject

  // Common implementations (reusable across events)
  protected async createSyncRequest(record: any): Promise<string> {
    return insertSyncRequest({
      event_type: this.eventType,
      action: 'CREATE',
      crvs_event_uuid: this.extractCompositionId(record),
      payload: record
    })
  }

  protected async completeSyncRequest(syncRequestId: string): Promise<void> {
    await updateSyncRequestStatus(syncRequestId, 'completed')
    await clearSyncRequestPayload(syncRequestId)
  }

  protected async failSyncRequest(syncRequestId: string, error: any): Promise<void> {
    await updateSyncRequestStatus(syncRequestId, 'failed', error.message)
  }

  protected async triggerReindex(): Promise<void> {
    await indexPersonDb()
  }

  protected extractCompositionId(record: any): string {
    return record.entry?.find((e: any) =>
      e.resource?.resourceType === 'Composition'
    )?.resource?.id
  }
}
```

### Usage Example: Death Handler

```typescript
interface DeathBundle {
  entry: any[]
}

interface DeathMapped {
  eventId: string
  deceasedPayload: PersonPayload
  eventPayload: EventPayload
  participantPayloads: ParticipantPayload[]
  newPersons: PersonPayload[]
}

class DeathEventHandler extends VitalEventHandler<DeathBundle, DeathMapped> {
  constructor(pool: Pool) {
    super('death', pool)
  }

  protected async parseBundle(bundle: DeathBundle): Promise<DeathMapped> {
    return mapDeathBundleToSql(bundle)
  }

  protected validateBusinessRules(mapped: DeathMapped): void {
    // Death-specific validations
    if (mapped.deceasedId === mapped.spouseId) {
      throw new Error('Deceased and spouse cannot be the same person')
    }
  }

  protected async insertData(mapped: DeathMapped, tx: PoolClient): Promise<void> {
    // Insert persons
    for (const p of mapped.newPersons) await insertPerson(p, tx)

    // Insert deceased (update existing or create new)
    if (mapped.existingPerson) {
      await updatePersonToDeceased(mapped.existingPerson.id, mapped.eventPayload.event_date, tx)
    } else {
      await insertPerson(mapped.deceasedPayload, tx)
    }

    // Insert event
    await insertEvent(mapped.eventPayload, tx)

    // Insert participants
    const eventDbId = await getEventIdByCrvs(mapped.eventId, tx)
    for (const ep of mapped.participantPayloads) {
      await insertEventParticipant({ ...ep, event_id: eventDbId }, tx)
    }
  }

  protected buildSuccessResponse(mapped: DeathMapped, h: Hapi.ResponseToolkit) {
    return h.response({
      success: true,
      action: 'CREATE_DEATH_EVENT',
      eventId: mapped.eventId,
      deceasedId: mapped.deceasedPayload.id
    }).code(200)
  }
}

// Register route
server.route({
  method: 'POST',
  path: '/events/death/create',
  handler: (req, h) => new DeathEventHandler(pool).create(req, h)
})
```

**Time savings:** 80% of boilerplate eliminated ✅

---

## Pattern 2: Person Resolver Service

### Problem: Duplicated 4 Times

**Current state:**
- Birth create: Mother/father resolution (lines 279-294)
- Death create: Spouse resolution (lines 439-510)
- Birth correction: Father resolution (lines 300-438)
- Death correction: Informant resolution (lines 389-437)

**Common pattern:**
1. Priority 1: Use existing person ID (from PersonPicker)
2. Priority 2: Look up by CRVS UUID
3. Priority 3: Create dummy person from manual data

### Proposed Service

```typescript
interface PersonResolutionInput {
  // Priority 1: Existing person (from PersonPicker)
  personId?: string

  // Priority 2: CRVS UUID (from FHIR)
  crvsUuid?: string

  // Priority 3: Manual data (create dummy)
  manual?: {
    given_name?: string
    family_name?: string
    gender?: 'male' | 'female' | 'unknown'
    dob?: string
    place_of_birth?: string
    national_id?: string
  }

  // Metadata for dummy creation
  role: 'mother' | 'father' | 'spouse' | 'informant' | 'child' | 'witness'
  context: 'birth' | 'death' | 'marriage' | 'divorce' | 'correction'
}

interface PersonResolutionResult {
  personId: string
  isDummy: boolean
  isExisting: boolean
  provisionalEventId?: string  // If dummy person created with fake birth event
}

/**
 * Resolves person identity from various sources
 * Used by all event handlers to find or create persons
 */
export class PersonResolver {
  constructor(private pool: Pool) {}

  async resolve(input: PersonResolutionInput, tx?: PoolClient): Promise<PersonResolutionResult> {
    const client = tx ?? this.pool

    // Priority 1: Existing person ID provided (PersonPicker selection)
    if (input.personId) {
      const exists = await this.personExists(input.personId, client)
      if (exists) {
        return { personId: input.personId, isDummy: false, isExisting: true }
      }
      throw new Error(`Person ID ${input.personId} not found`)
    }

    // Priority 2: CRVS UUID lookup (person may already exist from another event)
    if (input.crvsUuid) {
      const existing = await this.findByCrvsUuid(input.crvsUuid, client)
      if (existing) {
        return { personId: existing.id, isDummy: false, isExisting: true }
      }

      // CRVS UUID provided but person doesn't exist yet → Create dummy
      return await this.createDummy(input, client)
    }

    // Priority 3: Manual data (create provisional person)
    if (input.manual) {
      return await this.createDummy(input, client)
    }

    throw new Error('No valid person identification provided')
  }

  private async personExists(personId: string, client: Pool | PoolClient): Promise<boolean> {
    const { rows } = await client.query(
      `SELECT 1 FROM person WHERE id = $1 LIMIT 1`,
      [personId]
    )
    return rows.length > 0
  }

  private async findByCrvsUuid(crvsUuid: string, client: Pool | PoolClient): Promise<{ id: string } | null> {
    const { rows } = await client.query(
      `SELECT id FROM person WHERE identifiers @> $1::jsonb LIMIT 1`,
      [JSON.stringify([{ type: 'crvs', value: crvsUuid }])]
    )
    return rows[0] || null
  }

  private async createDummy(input: PersonResolutionInput, client: Pool | PoolClient): Promise<PersonResolutionResult> {
    const personId = randomUUID()
    const provisionalEventId = randomUUID()
    const now = new Date().toISOString()

    const identifiers = this.buildIdentifiers(input)
    const defaults = this.getDefaults(input.role)

    // Create dummy person
    await createDummyPerson({
      id: personId,
      given_name: input.manual?.given_name || defaults.givenName,
      family_name: input.manual?.family_name || defaults.familyName,
      gender: input.manual?.gender || defaults.gender,
      dob: input.manual?.dob || null,
      place_of_birth: input.manual?.place_of_birth || 'Unknown',
      status: 'review',
      identifiers
    }, client)

    // Create provisional birth event (required for family_link triggers)
    await insertEvent({
      id: provisionalEventId,
      event_type: 'birth',
      event_date: input.manual?.dob || null,
      location: 'Unknown',
      source: 'provisional',  // Mark as provisional
      metadata: JSON.stringify({
        provisionalFrom: input.context,
        role: input.role,
        note: 'Auto-generated provisional person'
      }),
      crvs_event_uuid: randomUUID(),
      status: null,
      remarks: 'Provisional person - requires merging',
      created_at: now
    }, client)

    // Link person to their provisional birth event
    await insertEventParticipant({
      id: randomUUID(),
      person_id: personId,
      event_id: provisionalEventId,
      role: 'subject',
      relationship_details: JSON.stringify({ provisional: true }),
      crvs_person_id: input.crvsUuid || `manual-${input.role}`,
      status: 'active',
      created_at: now
    }, client)

    return {
      personId,
      isDummy: true,
      isExisting: false,
      provisionalEventId
    }
  }

  private buildIdentifiers(input: PersonResolutionInput): Array<{type: string, value: string}> {
    const ids: Array<{type: string, value: string}> = []
    if (input.crvsUuid) ids.push({ type: 'crvs', value: input.crvsUuid })
    if (input.manual?.national_id) ids.push({ type: 'NATIONAL_ID', value: input.manual.national_id })
    if (ids.length === 0) ids.push({ type: 'provisional', value: randomUUID() })
    return ids
  }

  private getDefaults(role: string): { givenName: string; familyName: string; gender: string } {
    const defaults = {
      mother: { givenName: 'Unknown', familyName: 'Mother', gender: 'female' },
      father: { givenName: 'Unknown', familyName: 'Father', gender: 'male' },
      spouse: { givenName: 'Unknown', familyName: 'Spouse', gender: 'unknown' },
      informant: { givenName: 'Unknown', familyName: 'Informant', gender: 'unknown' },
      child: { givenName: 'Unknown', familyName: 'Child', gender: 'unknown' },
      witness: { givenName: 'Unknown', familyName: 'Witness', gender: 'unknown' }
    }
    return defaults[role] || { givenName: 'Unknown', familyName: 'Person', gender: 'unknown' }
  }
}
```

### Usage Example

```typescript
// Before (death correction): 50 lines of duplicate code
async function resolveInformantPerson(informantData, tx) {
  if (informantData.personId) {
    // ... 10 lines
  }
  if (informantData.crvsUuid) {
    // ... 20 lines
  }
  if (informantData.manual) {
    // ... 20 lines
  }
}

// After: 1 line
const personResolver = new PersonResolver(pool)
const { personId, isDummy } = await personResolver.resolve({
  personId: informantData.personId,
  crvsUuid: informantData.crvsUuid,
  manual: informantData.manual,
  role: 'informant',
  context: 'death'
}, tx)
```

**Time savings:** 80% reduction in person resolution code ✅

---

## Pattern 3: FHIR Bundle Parser

### Problem: Complex Parsing Logic (400+ lines)

**Current state:**
- Birth: `mapBundleToSql()` - 398 lines
- Death: `mapDeathBundleToSql()` - 285 lines

**Issues:**
- Mixing parsing, validation, and transformation
- Hard to test individual parts
- Deeply nested conditionals

### Proposed Pipeline

```typescript
/**
 * FHIR Bundle Parser - Extracts resources from FHIR bundles
 */
export class FHIRBundleParser {
  constructor(private bundle: any) {}

  // Extract composition (required for all events)
  getComposition(): any {
    const comp = this.bundle.entry?.find((e: any) =>
      e.resource?.resourceType === 'Composition'
    )?.resource
    if (!comp) throw new Error('Missing Composition')
    return comp
  }

  // Extract task (required for all events)
  getTask(): any {
    const task = this.bundle.entry?.find((e: any) =>
      e.resource?.resourceType === 'Task'
    )?.resource
    if (!task) throw new Error('Missing Task')
    return task
  }

  // Extract section by title (flexible for any section)
  getSection(title: string): any {
    const composition = this.getComposition()
    return composition.section?.find((s: any) => s.title === title)
  }

  // Extract patient from section reference
  getPatientFromSection(sectionTitle: string): any | null {
    const section = this.getSection(sectionTitle)
    if (!section?.entry?.[0]?.reference) return null

    return this.bundle.entry?.find((e: any) =>
      e.fullUrl?.includes(section.entry[0].reference)
    )?.resource
  }

  // Extract related person (informant, witness, etc.)
  getRelatedPerson(): any | null {
    return this.bundle.entry?.find((e: any) =>
      e.resource?.resourceType === 'RelatedPerson'
    )?.resource
  }

  // Extract registration identifiers
  getRegistrationNumber(eventType: 'birth' | 'death' | 'marriage'): string {
    const task = this.getTask()
    const systemMap = {
      birth: 'http://opencrvs.org/specs/id/birth-registration-number',
      death: 'http://opencrvs.org/specs/id/death-registration-number',
      marriage: 'http://opencrvs.org/specs/id/marriage-registration-number'
    }

    return task.identifier?.find((id: any) =>
      id.system === systemMap[eventType]
    )?.value || 'UNKNOWN'
  }

  // Check if person has EXTERNAL_PERSON_ID (from PersonPicker)
  hasExternalPersonId(patient: any): string | null {
    return patient?.identifier?.find((id: any) =>
      id.type?.coding?.some((c: any) => c.code === 'EXTERNAL_PERSON_ID')
    )?.value || null
  }

  // Check if patient is active (not a placeholder)
  isActivePatient(patient: any): boolean {
    if (patient?.active === false) return false
    if (!patient?.name?.length) return false
    return true
  }
}

/**
 * Event Validator - Business rule validation
 */
export class EventValidator {
  validate(data: any): void {
    // Override in subclasses for event-specific rules
  }

  protected validateNotSamePerson(person1Id: string, person2Id: string, message: string): void {
    if (person1Id && person2Id && person1Id === person2Id) {
      throw new ValidationError(message)
    }
  }
}

/**
 * SQL Transformer - Converts parsed FHIR to SQL payloads
 */
export class SQLTransformer {
  protected buildIdentifiers(fhirPatient: any, additionalIds: Array<{type: string, value: string}> = []): string {
    const ids = [
      ...additionalIds,
      ...(fhirPatient.identifier || [])
        .filter((i: any) => i.value?.trim())
        .map((i: any) => ({
          type: i.type?.coding?.[0]?.code || 'UNKNOWN',
          value: i.value
        }))
    ]
    return JSON.stringify(ids)
  }

  protected extractPersonName(fhirPatient: any): { given_name: string; family_name: string } {
    return {
      given_name: (fhirPatient.name?.[0]?.given || []).filter(Boolean).join(' ') || '',
      family_name: fhirPatient.name?.[0]?.family || ''
    }
  }
}
```

### Usage Example: Death Handler

```typescript
class DeathBundleTransformer extends SQLTransformer {
  private parser: FHIRBundleParser
  private validator: EventValidator
  private personResolver: PersonResolver

  constructor(bundle: any, pool: Pool) {
    super()
    this.parser = new FHIRBundleParser(bundle)
    this.validator = new EventValidator()
    this.personResolver = new PersonResolver(pool)
  }

  async transform(): Promise<DeathMapped> {
    // Step 1: Parse FHIR resources
    const deceased = this.parser.getPatientFromSection('Deceased details')
    const spouse = this.parser.getPatientFromSection('Spouse details')
    const informant = this.parser.getRelatedPerson()
    const task = this.parser.getTask()
    const composition = this.parser.getComposition()

    // Step 2: Validate business rules
    this.validator.validateNotSamePerson(
      deceased?.id,
      spouse?.id,
      'Deceased and spouse cannot be the same person'
    )

    // Step 3: Transform to SQL payloads
    const deceasedPayload = this.buildPersonPayload(deceased, 'deceased')
    const eventPayload = this.buildEventPayload(deceased, task, composition.id)

    // Step 4: Resolve participants
    const participants = await this.buildParticipants(deceased, spouse, informant)

    return {
      eventId: composition.id,
      deceasedPayload,
      eventPayload,
      participantPayloads: participants.main,
      newPersons: participants.provisional
    }
  }

  private buildPersonPayload(patient: any, status: 'active' | 'deceased'): PersonPayload {
    const name = this.extractPersonName(patient)
    return {
      id: randomUUID(),
      ...name,
      gender: patient.gender || 'unknown',
      dob: patient.birthDate || null,
      place_of_birth: 'Unknown',
      identifiers: this.buildIdentifiers(patient, [
        { type: 'crvs', value: patient.id, event: 'death' }
      ]),
      status,
      death_date: status === 'deceased' ? patient.deceasedDateTime?.split('T')[0] : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  }

  private buildEventPayload(patient: any, task: any, compositionId: string): EventPayload {
    return {
      id: randomUUID(),
      event_type: 'death',
      event_date: patient.deceasedDateTime?.split('T')[0] || null,
      location: this.extractDeathLocation(patient),
      source: 'OpenCRVS',
      metadata: JSON.stringify({
        registrationNumber: this.parser.getRegistrationNumber('death')
      }),
      crvs_event_uuid: compositionId,
      status: task.businessStatus?.coding?.[0]?.code || null,
      created_at: new Date().toISOString()
    }
  }

  // ... more methods
}
```

**Benefits:**
- ✅ Testable: Each parser/validator/transformer can be unit tested
- ✅ Reusable: `FHIRBundleParser` works for all events
- ✅ Clear: Separation of concerns (parse → validate → transform)
- ✅ Maintainable: Easy to add new sections/validations

---

## Pattern 4: Correction Handler Base

### Common Correction Flow

```
1. Validate payload (Joi)
2. Create sync request
3. Get event database ID
4. Acquire advisory lock
5. Execute correction action
6. Update event metadata
7. Complete sync request
8. Reindex
```

### Proposed Base Class

```typescript
export abstract class CorrectionHandler<TAction extends string, TData> {
  constructor(
    protected eventType: 'birth' | 'death' | 'marriage',
    protected pool: Pool
  ) {}

  async handle(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const { action, eventId, reason, correctionType } = request.payload as {
      action: TAction
      eventId: string
      reason?: string
      correctionType?: string
    }

    const syncRequestId = await this.createSyncRequest(eventId, action, request.payload)

    try {
      const eventDbId = await getEventDatabaseId(eventId)
      if (!eventDbId) {
        return h.response({ error: 'Event not found' }).code(404)
      }

      let result: any

      await withTransaction(async (tx) => {
        await acquireEventAdvisoryLock(eventId, tx)
        result = await this.executeAction(action, eventId, eventDbId, request.payload, tx)
        await this.updateEventMetadata(eventId, action, reason, tx)
      })

      await this.completeSyncRequest(syncRequestId)
      await this.triggerReindex()

      return result || h.response({ success: true, action }).code(200)

    } catch (error) {
      await this.failSyncRequest(syncRequestId, error)
      return h.response({ error: (error as Error).message }).code(500)
    }
  }

  protected abstract executeAction(
    action: TAction,
    eventId: string,
    eventDbId: string,
    payload: any,
    tx: PoolClient
  ): Promise<any>

  protected abstract getValidationSchema(): Joi.ObjectSchema

  // Common implementations
  protected async createSyncRequest(eventId: string, action: string, payload: any): Promise<string> {
    return insertSyncRequest({
      event_type: this.eventType,
      action: `CORRECTION_${action}`,
      crvs_event_uuid: eventId,
      payload
    })
  }

  protected async updateEventMetadata(
    eventId: string,
    action: string,
    reason: string | undefined,
    tx: PoolClient
  ): Promise<void> {
    await upsertEvent({
      crvs_event_uuid: eventId,
      last_update_at: new Date().toISOString(),
      remarks: `CORRECTION: ${action}${reason ? ` - ${reason}` : ''}`
    }, tx)
  }

  protected async completeSyncRequest(syncRequestId: string): Promise<void> {
    await updateSyncRequestStatus(syncRequestId, 'completed')
    await clearSyncRequestPayload(syncRequestId)
  }

  protected async failSyncRequest(syncRequestId: string, error: any): Promise<void> {
    await updateSyncRequestStatus(syncRequestId, 'failed', error.message)
  }

  protected async triggerReindex(): Promise<void> {
    await indexPersonDb()
  }
}
```

### Usage Example: Death Correction

```typescript
type DeathCorrectionAction = 'UPDATE_INFORMANT' | 'REMOVE_INFORMANT_SPOUSE' | 'REPLACE_INFORMANT_SPOUSE'

class DeathCorrectionHandler extends CorrectionHandler<DeathCorrectionAction, InformantData> {
  constructor(pool: Pool) {
    super('death', pool)
  }

  protected async executeAction(
    action: DeathCorrectionAction,
    eventId: string,
    eventDbId: string,
    payload: any,
    tx: PoolClient
  ): Promise<any> {
    switch (action) {
      case 'UPDATE_INFORMANT':
        return this.handleUpdateInformant(eventId, eventDbId, payload, tx)
      case 'REMOVE_INFORMANT_SPOUSE':
        return this.handleRemoveInformantSpouse(eventId, eventDbId, tx)
      case 'REPLACE_INFORMANT_SPOUSE':
        return this.handleReplaceInformantSpouse(eventId, eventDbId, payload, tx)
      default:
        throw new Error(`Unknown action: ${action}`)
    }
  }

  protected getValidationSchema(): Joi.ObjectSchema {
    return Joi.object({
      action: Joi.string().valid('UPDATE_INFORMANT', 'REMOVE_INFORMANT_SPOUSE', 'REPLACE_INFORMANT_SPOUSE').required(),
      eventId: Joi.string().required(),
      informantData: Joi.object({...}).when('action', {...})
    })
  }

  // Specific correction actions (60 lines instead of 150)
  private async handleUpdateInformant(eventId, eventDbId, payload, tx) {
    // ... implementation
  }
}
```

**Time savings:** 70% reduction in correction boilerplate ✅

---

## Pattern 5: Idempotency Helper

### Common Pattern: Skip Duplicates

```typescript
/**
 * Idempotency helper for event participant insertion
 * Ensures replays don't create duplicates
 */
export class IdempotentInserter {
  constructor(private tx: PoolClient) {}

  async insertEventParticipants(participants: EventParticipantPayload[]): Promise<void> {
    for (const ep of participants) {
      const exists = await this.eventParticipantExists(
        ep.event_id,
        ep.crvs_person_id,
        ep.role
      )

      if (exists) {
        console.log(`⏭️ Skipping existing participant: ${ep.role}/${ep.crvs_person_id}`)
        continue
      }

      await insertEventParticipant(ep, this.tx)
      console.log(`✅ Inserted participant: ${ep.role}/${ep.crvs_person_id}`)
    }
  }

  private async eventParticipantExists(
    eventId: string,
    crvsPersonId: string,
    role: string
  ): Promise<boolean> {
    const { rows } = await this.tx.query(
      `SELECT 1 FROM event_participant
       WHERE event_id = $1 AND crvs_person_id = $2 AND role = $3
       LIMIT 1`,
      [eventId, crvsPersonId, role]
    )
    return rows.length > 0
  }
}

// Usage
const inserter = new IdempotentInserter(tx)
await inserter.insertEventParticipants(mapped.participantPayloads)
```

---

## Implementation Roadmap

### Phase 1: Extract Core Services (1 week)

**Week 1:**
```
Day 1-2: PersonResolver service
  ├── Extract common resolution logic
  ├── Unit tests (90%+ coverage)
  └── Replace in birth/death handlers

Day 3-4: FHIRBundleParser
  ├── Extract parsing methods
  ├── Unit tests
  └── Refactor birth/death mappers

Day 5: VitalEventHandler base class
  ├── Extract transaction flow
  ├── Integration tests
  └── Document patterns
```

### Phase 2: Refactor Existing Handlers (1 week)

**Week 2:**
```
Day 1-2: Birth handler refactor
  ├── Extend VitalEventHandler
  ├── Use PersonResolver
  └── Test parity with old handler

Day 3-4: Death handler refactor
  ├── Extend VitalEventHandler
  ├── Use PersonResolver
  └── Test parity with old handler

Day 5: Correction base class
  └── Extract common correction flow
```

### Phase 3: Apply to New Events (2-3 days each)

**Future:**
```
Marriage: 2-3 days
  ├── MarriageEventHandler extends VitalEventHandler
  ├── MarriageBundleTransformer extends SQLTransformer
  ├── MarriageCorrectionHandler extends CorrectionHandler
  └── Tests

Divorce: 2-3 days (similar pattern)
Adoption: 2-3 days (similar pattern)
```

---

## Testing Strategy

### Unit Tests (Individual Components)

```typescript
describe('PersonResolver', () => {
  it('should prioritize personId over crvsUuid', async () => {})
  it('should create dummy if crvsUuid not found', async () => {})
  it('should throw if no identification provided', async () => {})
})

describe('FHIRBundleParser', () => {
  it('should extract composition', async () => {})
  it('should extract patient from section', async () => {})
  it('should check external person ID', async () => {})
})

describe('VitalEventHandler', () => {
  it('should handle sync request lifecycle', async () => {})
  it('should rollback on error', async () => {})
  it('should be idempotent (replay safe)', async () => {})
})
```

### Integration Tests (Full Flow)

```typescript
describe('Death Event Handler (using base classes)', () => {
  it('should create death with existing person', async () => {})
  it('should create death with new person', async () => {})
  it('should validate business rules', async () => {})
})

describe('Birth Event Handler (using base classes)', () => {
  it('should create birth with mother/father', async () => {})
  it('should handle optional father', async () => {})
})
```

---

## Metrics & Success Criteria

### Before Refactoring
- Birth create: 590 lines
- Death create: 580 lines
- Birth correction: 510 lines
- Death correction: 438 lines
- **Total:** 2,118 lines
- **Duplication:** ~60%

### After Refactoring (Projected)
- Base classes: 500 lines (VitalEventHandler, PersonResolver, FHIRBundleParser, CorrectionHandler)
- Birth create: 200 lines (−66%)
- Death create: 180 lines (−69%)
- Birth correction: 180 lines (−65%)
- Death correction: 150 lines (−66%)
- **Total:** 1,210 lines (−43% overall)
- **Duplication:** ~5%

### New Event Time
- **Before:** 7-10 days (write everything from scratch)
- **After:** 2-3 days (extend base classes, focus on business logic)
- **Savings:** 70% faster

---

## Summary

**Key Reusable Patterns:**

1. ✅ **VitalEventHandler** - Transaction flow, sync requests, reindexing
2. ✅ **PersonResolver** - Find/create persons (80% code reuse)
3. ✅ **FHIRBundleParser** - Extract FHIR resources (90% code reuse)
4. ✅ **CorrectionHandler** - Correction flow (70% code reuse)
5. ✅ **IdempotentInserter** - Replay-safe insertions

**Benefits:**

| Aspect | Before | After | Improvement |
|--------|--------|-------|-------------|
| New event time | 7-10 days | 2-3 days | **70% faster** |
| Code duplication | 60% | 5% | **-55pp** |
| Lines of code | 2,118 | 1,210 | **-43%** |
| Test coverage | Unknown | 90%+ | Testable components |
| Consistency | Manual | Enforced | Same patterns everywhere |

**ROI:**
- Initial investment: 2 weeks refactoring
- Payback: After 2nd new event (~1 month)
- Long-term: Every new event saves 5-7 days

**Recommended:** Start with PersonResolver (highest reuse, lowest risk)
