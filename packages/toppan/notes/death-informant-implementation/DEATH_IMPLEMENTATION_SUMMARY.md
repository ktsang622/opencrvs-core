# Death Registration Implementation - Complete Summary

## Architecture Overview

### Core Principles

1. **Informant is Metadata, Not Family Structure**
   - Informant records who reported the death
   - Role: `informant` (NOT `spouse`, `mother`, `father`)
   - Does NOT automatically create family relationships

2. **Family Relationships from Registration Events**
   - **Spouse links**: From marriage registration (`source='marriage_registration'`)
   - **Parent links**: From birth registration
   - **Death form**: Only supplements existing data

3. **Informational Links for Unmarried Partnerships**
   - Created when informant claims spouse but NO marriage exists
   - Source: `death_registration` (vs `marriage_registration`)
   - Immediately closed (`end_date = death_date`)
   - Notes: `[Informational - no marriage record found]`

4. **Validation and Data Quality**
   - Validates informant spouse against marriage record
   - Warns if mismatch detected
   - Flags events for review

---

## Data Model

### Event Participants

| Role | Description | Creates Family Link? | When Used |
|------|-------------|---------------------|-----------|
| `subject` | The deceased person | ❌ No (closes existing spouse links) | Always (required) |
| `informant` | Person who reported death | ⚠️ Conditional (if spouse + no marriage) | Always (required) |

### Informant Relationship Details

```json
{
  "type": "informant",
  "relationship": "SPOUSE" | "CHILD" | "PARENT" | "SIBLING" | "OTHER",
  "informantType": "SPOUSE" | "OTHER"
}
```

### Family Links

| Source | Created By | Type | Active Status | Notes |
|--------|-----------|------|---------------|-------|
| `marriage_registration` | Marriage event | Legal spouse | Closed at death | Source of truth |
| `death_registration` | Death event (trigger) | Informational spouse | Closed immediately | Only if no marriage |

---

## Create Scenarios (6 Cases)

### Case 1: Married + Correct Spouse ✅
- **Marriage**: Exists
- **Informant**: Correct spouse (via PersonPicker)
- **Validation**: Match confirmed
- **Family Link**: Marriage link closed, NO informational link
- **Warning**: None

### Case 2: Married + Wrong Spouse ⚠️
- **Marriage**: Exists
- **Informant**: Wrong person (via PersonPicker)
- **Validation**: Mismatch detected
- **Family Link**: Marriage link closed, NO informational link to wrong person
- **Warning**: Event remarks flagged

### Case 3: Married + Dummy Spouse ⚠️
- **Marriage**: Exists
- **Informant**: New person created (no PersonPicker match)
- **Validation**: Mismatch detected
- **Family Link**: Marriage link closed, NO informational link to dummy
- **Warning**: Event remarks flagged

### Case 4: Not Married + Existing Spouse ✅
- **Marriage**: Does NOT exist
- **Informant**: Existing person (via PersonPicker)
- **Validation**: Skipped (no marriage to check)
- **Family Link**: **Informational link created & closed**
- **Warning**: None

### Case 5: Not Married + Dummy Spouse ✅
- **Marriage**: Does NOT exist
- **Informant**: New person created
- **Validation**: Skipped (no marriage to check)
- **Family Link**: **Informational link created & closed**
- **Warning**: None

### Case 6: Other Informant ✅
- **Informant Type**: CHILD, PARENT, SIBLING, OTHER
- **Validation**: Not applicable
- **Family Link**: None
- **Warning**: None

---

## Correction Scenarios (3 Actions)

### UPDATE_INFORMANT
- **Use Case**: Wrong person selected as informant (any relationship)
- **Action**: Deactivate old informant, create new informant
- **Example**: Selected child but should be sibling

### REMOVE_INFORMANT_SPOUSE
- **Use Case**: Informant wrongly marked as spouse (should be other relationship)
- **Action**: Change relationship_details from SPOUSE to OTHER, close informational link
- **Example**: Marked as spouse but actually is child

### REPLACE_INFORMANT_SPOUSE
- **Use Case**: Wrong spouse selected, need correct spouse
- **Action**: Deactivate old spouse informant, create new spouse informant
- **Example**: Selected person A as spouse, should be person B (actual marriage spouse)

---

## Database Trigger Logic

### Trigger 1: Subject (Deceased) - Close Spouse Links
```sql
IF ep.role = 'subject' AND is_ready THEN
  -- Close ALL spouse links (marriage becomes widowed)
  UPDATE family_links_forward
  SET end_date = death_date,
      notes = notes || ' [Ended by death]'
  WHERE (person_id = deceased_id OR related_person_id = deceased_id)
    AND relationship_type = 'spouse'
    AND end_date IS NULL
END IF
```

### Trigger 2: Informant Spouse - Create Informational Link (If No Marriage)
```sql
IF ep.role = 'informant' AND informantType = 'SPOUSE' THEN
  deceased_id := (SELECT person_id FROM event_participant WHERE role='subject')

  marriage_count := (COUNT spouse links WHERE source='marriage_registration')

  IF marriage_count = 0 THEN
    -- Create informational spouse link
    INSERT INTO family_links_forward (
      source: 'death_registration',
      end_date: death_date,  -- Immediately closed
      notes: '[Informational - no marriage record found]'
    )
  ELSE
    -- Skip (marriage link already closed by subject trigger)
  END IF
END IF
```

---

## Validation Logic

### Informant Spouse Validation

```typescript
async function validateInformantSpouse(deceasedPersonId, informantSpouseId) {
  // Query marriage spouse from family_links_forward
  marriageSpouse := SELECT FROM family_links_forward
                    WHERE person_id = deceasedPersonId
                      AND relationship_type = 'spouse'
                      AND source = 'marriage_registration'

  if (marriageSpouse NOT EXISTS) {
    return null  // No validation needed
  }

  if (marriageSpouse.id != informantSpouseId) {
    return {
      warning: "Informant claims spouse but differs from marriage record",
      marriageSpouseId: marriageSpouse.id
    }
  }

  return null  // Match - all good
}
```

**When Triggered:**
- Case 1: Marriage exists + correct spouse → No warning
- Case 2: Marriage exists + wrong spouse → ⚠️ Warning
- Case 3: Marriage exists + dummy spouse → ⚠️ Warning
- Case 4-6: No marriage or not spouse → No validation

---

## API Endpoints

### POST /v1/person-db-sync/death/create
**Purpose**: Create death registration

**Request Payload**:
```json
{
  "record": {
    "entry": [
      { "resourceType": "Patient", "deceasedBoolean": true },
      { "resourceType": "Patient", "id": "spouse-id" },
      { "resourceType": "RelatedPerson", "relationship": "SPOUSE" }
    ]
  }
}
```

**Response**:
```json
{
  "success": true,
  "eventId": "death-event-uuid",
  "deceasedId": "person-uuid",
  "wasLinkedToBirthRecord": true,
  "participants": [
    { "role": "subject", "person_id": "deceased-uuid" },
    { "role": "informant", "person_id": "spouse-uuid" }
  ],
  "warnings": [...]  // Optional
}
```

### POST /v1/person-db-sync/death/correction
**Purpose**: Correct death registration (informant changes)

**Actions Available**:
- `UPDATE_INFORMANT`
- `REMOVE_INFORMANT_SPOUSE`
- `REPLACE_INFORMANT_SPOUSE`

**Request Payload**:
```json
{
  "action": "REPLACE_INFORMANT_SPOUSE",
  "eventId": "death-event-uuid",
  "informantData": {
    "personId": "correct-spouse-uuid",
    "relationship": "SPOUSE"
  },
  "reason": "Replace with correct spouse from marriage record"
}
```

---

## Data Quality Features

### 1. Warning System
**Triggers**: When informant spouse differs from marriage record

**Event Remarks Example**:
```
CREATION: UI | ⚠️ INFORMANT WARNING: Informant claims spouse but differs from marriage record. Marriage spouse: Jane Smith (ID: abc-123)
```

### 2. Informational Link Tracking
**Purpose**: Record de facto partnerships (unmarried couples)

**Identification**:
- Source: `death_registration` (vs `marriage_registration`)
- Notes: `[Informational - no marriage record found]`
- Status: Always closed (`end_date = death_date`)

### 3. Correction Capabilities
**Purpose**: Fix mistakes in informant selection

**Available Actions**:
- Change informant person
- Change informant relationship type
- Replace spouse with correct person

---

## Database Schema Impact

### Tables Modified

**person**:
- `status`: Updated to `'deceased'`
- `death_date`: Set to event date

**event**:
- `event_type`: `'death'`
- `event_date`: Death date
- `remarks`: Includes warnings if validation fails

**event_participant**:
- `role`: `'subject'` (deceased), `'informant'` (reporter)
- `relationship_details`: JSON with informant type
- `status`: `'active'` or `'inactive'` (for corrections)

**family_links_forward**:
- Existing spouse links: `end_date` updated to death date
- New informational links: Created if no marriage exists

---

## Key Differences from Birth Registration

| Aspect | Birth | Death |
|--------|-------|-------|
| **Family Links Created** | Mother, Father (always) | Spouse (only if no marriage) |
| **Link Type** | Authoritative (birth creates family) | Informational (supplements marriage) |
| **Validation** | None (birth is source of truth) | Validates against marriage record |
| **Corrections** | ADD/REMOVE/REPLACE parents | UPDATE/REMOVE/REPLACE informant |
| **Trigger Behavior** | Creates parent links | Closes spouse links + conditionally creates informational |

---

## Implementation Files

| File | Purpose | Lines |
|------|---------|-------|
| `init/database.sql` (403-479) | Database triggers for death events | 77 |
| `death/create.ts` | Death registration creation handler | 593 |
| `death/correction.ts` | Death correction handler (informant changes) | 400+ |
| `death/delete.ts` | Death deletion placeholder | 30 |

---

## Summary Statistics

**Total Scenarios Handled**: 6 create + 3 correction = 9 scenarios

**Database Triggers**: 2
1. Close spouse links (subject role)
2. Create informational link (informant spouse + no marriage)

**Validation Checks**: 1
- Informant spouse vs marriage record mismatch

**Family Link Sources**: 2
- `marriage_registration` (legal, authoritative)
- `death_registration` (informational, supplementary)

**API Endpoints**: 2
- `/death/create`
- `/death/correction`

**Correction Actions**: 3
- UPDATE_INFORMANT
- REMOVE_INFORMANT_SPOUSE
- REPLACE_INFORMANT_SPOUSE

---

## Design Decisions Made

### ✅ Adopted
1. **Informant as metadata** (not family structure)
2. **Marriage as source of truth** for spouse relationships
3. **Informational links for unmarried partnerships**
4. **Validation warnings** for data quality
5. **Correction capabilities** for mistakes

### ❌ Rejected
1. ~~Death form creates authoritative spouse links~~
2. ~~Mother/father participants in death registration~~
3. ~~Spouse as family participant role~~
4. ~~Informational links when marriage exists~~

---

## Next Steps for Review
1. Compare against UN Principles and Recommendations for CRVS
2. Compare against WHO International Form of Medical Certificate of Cause of Death
3. Compare against international best practices (UK, Australia, Singapore)
4. Identify gaps and improvements
