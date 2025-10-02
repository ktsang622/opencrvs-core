# Birth Correction Flow - Father Participant

This document describes the fixed birth correction flow for father participants, implementing proper data integrity and business logic.

## Key Features

### 1. Precondition Guards
- **Event Existence Check**: Corrections require the local `event` row to exist
- **Queue on Missing**: If event missing → insert into `sync_request` table and return HTTP 412
- **No Bootstrap**: Corrections never create missing events

### 2. FHIR Father Detection
- **Active Check**: Parse FHIR bundle to detect `father.active` status
- **Skip Inactive**: If `father.active=false` and no explicit `fatherData` → return 204 (no-op)
- **Bundle Support**: Full bundle passed for proper father detection

### 3. Father Identity Resolution (Precedence Order)
1. **`fatherData.fatherId`** - Local person UUID (must exist)
2. **`fatherData.fatherCRVSUuid`** - FHIR UUID (find existing or create dummy)
3. **`fatherData.manual`** - Manual entry fields (create dummy person)

### 4. Action Semantics

#### ADD_FATHER
- **Conflict Check**: Returns 409 if active father already exists
- **Creates**: New active father participant
- **Returns**: 201 on success

#### REMOVE_FATHER
- **Idempotent**: Returns 204 if no active father exists
- **Deactivates**: Current active father participant
- **Returns**: 200 on successful removal

#### UPDATE_FATHER_SAME
- **Requires**: Active father participant must exist
- **Process**: Deactivate current → create new with same `person_id`
- **Concurrency**: Supports `expectedPersonId` and `expectedCRVSUuid` checks
- **Returns**: 200 on success, 409 on conflicts

#### REPLACE_FATHER
- **Smart Logic**: Falls back to UPDATE_SAME if same person detected
- **Process**: Deactivate old → create new with different `person_id`
- **Returns**: 201 on successful replacement

### 5. Data Integrity
- **Unique Index**: `uniq_active_father_per_event` prevents multiple active fathers
- **JSONB Safety**: Proper JSON stringification for `relationship_details`
- **Advisory Locks**: Event-scoped locking prevents race conditions

### 6. Event Metadata
- **Timestamp Updates**: `event.last_update_at` updated on all corrections
- **Remarks Tracking**: Appends correction notes to `event.remarks`
- **Audit Trail**: Complete history of all corrections

## API Usage

### Endpoint
```
POST /v1/person-db-sync/birth/correction
```

### Request Schema
```json
{
  "action": "ADD_FATHER|REMOVE_FATHER|UPDATE_FATHER_SAME|REPLACE_FATHER",
  "eventId": "uuid",
  "fatherData": {
    "fatherId": "uuid",           // Option 1: Local person ID
    "fatherCRVSUuid": "uuid",     // Option 2: FHIR UUID
    "manual": {                   // Option 3: Manual entry
      "given_name": "string",
      "family_name": "string",
      "gender": "male|female|unknown",
      "dob": "YYYY-MM-DD",
      "national_id": "string"
    },
    "expectedPersonId": "uuid",   // Concurrency control
    "expectedCRVSUuid": "uuid"    // Concurrency control
  },
  "reason": "string",
  "correctionType": "string",
  "bundle": {}                    // FHIR bundle for father detection
}
```

### Response Codes
- **200**: Successful update/removal
- **201**: Successful creation/replacement
- **204**: No-op (idempotent operations)
- **409**: Conflict (active father exists, concurrency mismatch)
- **412**: Precondition failed (event missing, queued for retry)

## Database Schema

### Tables Used
- **`event`**: Event metadata and timestamps
- **`event_participant`**: Father participant records
- **`person`**: Person identity records
- **`sync_request`**: Queued corrections for missing events

### Key Constraints
```sql
-- Ensures only one active father per event
CREATE UNIQUE INDEX uniq_active_father_per_event
ON event_participant(event_id)
WHERE role='father' AND status='active' AND ended_at IS NULL;
```

## Testing

Run the test suite:
```bash
node test-correction-flow.js
```

### Test Scenarios
1. **Missing Event**: Returns 412 and queues correction
2. **Inactive Father Bundle**: Returns 204 (no-op)
3. **Manual Father Addition**: Returns 201
4. **Duplicate Addition**: Returns 409 (conflict)
5. **Father Removal**: Returns 200
6. **Idempotent Removal**: Returns 204

## Migration

The service automatically runs migrations on startup:
- Creates unique index for data integrity
- Tracks executed migrations in `toppan_migrations` table

## Error Handling

### Common Errors
- **412 Precondition Failed**: Event not in local DB → correction queued
- **409 Conflict**: Active father exists or concurrency mismatch
- **400 Bad Request**: Invalid payload or missing required fields

### Recovery
- Failed corrections are queued in `sync_request` table
- Retry mechanism processes queued corrections when events become available
- Advisory locks prevent race conditions during concurrent corrections

## Integration

### Workflow Service
The workflow service calls the correction endpoint via:
```typescript
await syncBirthRecordCorrection(recordInput, eventType, token)
```

### Payload Mapping
The `mapRecordToCorrectionPayload` function:
- Analyzes correction values to determine action
- Resolves father data from various sources
- Passes full bundle for FHIR detection
- Handles person picker vs manual entry scenarios