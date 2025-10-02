# Death Registration - Complete Scenarios Guide

## Table of Contents
1. [Create Scenarios](#create-scenarios)
2. [Correction Scenarios](#correction-scenarios)
3. [Database Trigger Behavior](#database-trigger-behavior)
4. [API Examples](#api-examples)

---

## Create Scenarios

### Summary Table

| Case | Marriage Exists? | Informant Type | PersonPicker? | Action | Informational Link? | Warning? |
|------|-----------------|----------------|---------------|--------|---------------------|----------|
| 1 | ✅ Yes | Spouse | ✅ Yes (correct) | Match validated | ❌ No | ❌ No |
| 2 | ✅ Yes | Spouse | ✅ Yes (wrong) | Mismatch detected | ❌ No | ⚠️ Yes |
| 3 | ✅ Yes | Spouse | ❌ No (dummy) | Mismatch detected | ❌ No | ⚠️ Yes |
| 4 | ❌ No | Spouse | ✅ Yes | No validation | ✅ Yes (created by trigger) | ❌ No |
| 5 | ❌ No | Spouse | ❌ No (dummy) | No validation | ✅ Yes (created by trigger) | ❌ No |
| 6 | N/A | Other | ❌ No | No validation | ❌ No | ❌ No |

---

### Case 1: Married, Correct Spouse Selected ✅

**Scenario:**
- Deceased has active marriage in database
- User selects correct spouse via PersonPicker
- Informant is the actual spouse from marriage record

**Flow:**
1. User searches via PersonPicker → Finds spouse person
2. User selects correct spouse → Links to existing person_id
3. Death create handler validates:
   - Marriage exists? ✅ Yes
   - Selected ID = Marriage spouse ID? ✅ Match
4. Create informant participant (role='informant', informantType='SPOUSE')
5. Trigger: Close marriage link (end_date = death_date)
6. Trigger: Skip informational link (marriage exists)

**Result:**
- ✅ Informant participant created
- ✅ Marriage link closed (widowed spouse)
- ❌ No informational link (not needed)
- ❌ No warning

**Event Remarks:** `CREATION: UI`

**Family Links:**
```sql
-- Marriage link (updated)
source='marriage_registration', end_date='2024-01-15', notes='[Ended by death]'
```

---

### Case 2: Married, Wrong Person Selected ⚠️

**Scenario:**
- Deceased has active marriage in database
- User selects WRONG person via PersonPicker (mistake)
- Selected person ≠ marriage spouse

**Flow:**
1. User searches via PersonPicker → Finds person A
2. User selects person A → Links to person A
3. Death create handler validates:
   - Marriage exists? ✅ Yes (to person B)
   - Selected ID (A) = Marriage spouse ID (B)? ❌ Mismatch
   - **WARNING TRIGGERED**
4. Create informant participant (person A as informant)
5. Add warning to event remarks
6. Trigger: Close marriage link (to person B, not person A)
7. Trigger: Skip informational link (marriage exists)

**Result:**
- ✅ Informant participant created (wrong person)
- ✅ Marriage link closed (actual spouse B widowed)
- ❌ No link to wrong informant (person A)
- ⚠️ **WARNING in event remarks**

**Event Remarks:**
```
CREATION: UI | ⚠️ INFORMANT WARNING: Informant claims spouse but differs from marriage record. Marriage spouse: Jane Smith (ID: abc-123)
```

**Family Links:**
```sql
-- Marriage link to actual spouse (updated)
source='marriage_registration', end_date='2024-01-15', notes='[Ended by death]'
-- No link to wrong informant
```

**Fix Required:**
- Use `REPLACE_INFORMANT_SPOUSE` correction to change informant from person A to person B

---

### Case 3: Married, Dummy Person Created ⚠️

**Scenario:**
- Deceased has active marriage in database
- User enters manual details (no PersonPicker match)
- Dummy person created but doesn't match marriage spouse

**Flow:**
1. User enters manual spouse details → No PersonPicker match
2. Create dummy person (new UUID)
3. Death create handler validates:
   - Marriage exists? ✅ Yes (to person B)
   - Dummy ID = Marriage spouse ID (B)? ❌ Mismatch
   - **WARNING TRIGGERED**
4. Create informant participant (dummy person as informant)
5. Add warning to event remarks
6. Trigger: Close marriage link (to person B)
7. Trigger: Skip informational link (marriage exists)

**Result:**
- ✅ Dummy person created
- ✅ Informant participant created (dummy)
- ✅ Marriage link closed (actual spouse widowed)
- ❌ No link to dummy person
- ⚠️ **WARNING in event remarks**

**Event Remarks:**
```
CREATION: UI | ⚠️ INFORMANT WARNING: Informant claims spouse but differs from marriage record. Marriage spouse: John Doe (ID: def-456)
```

**Family Links:**
```sql
-- Marriage link to actual spouse (updated)
source='marriage_registration', end_date='2024-01-15', notes='[Ended by death]'
-- No link to dummy person
```

**Fix Required:**
- Option 1: Merge dummy person with actual spouse (person B)
- Option 2: Use `REPLACE_INFORMANT_SPOUSE` to replace dummy with actual spouse

---

### Case 4: Not Married, Existing Spouse Selected ✅

**Scenario:**
- Deceased has NO marriage in database
- User selects existing person as spouse via PersonPicker
- De facto partnership (common-law, never married)

**Flow:**
1. User searches via PersonPicker → Finds person
2. User selects person as spouse → Links to existing person_id
3. Death create handler validates:
   - Marriage exists? ❌ No
   - Skip validation (no marriage to check)
4. Create informant participant (role='informant', informantType='SPOUSE')
5. **Trigger: Create informational spouse link** (no marriage found)
6. Trigger: Immediately close link (end_date = death_date)

**Result:**
- ✅ Informant participant created
- ✅ **Informational spouse link created** (source='death_registration')
- ✅ Link immediately closed (relationship ended by death)
- ❌ No warning

**Event Remarks:** `CREATION: UI`

**Family Links:**
```sql
-- Informational link created and closed
INSERT INTO family_links_forward (
  person_id: spouse_id,
  related_person_id: deceased_id,
  relationship_type: 'spouse',
  source: 'death_registration',
  start_date: NULL,
  end_date: '2024-01-15',
  notes: '[Informational - no marriage record found. Reported by informant on death form]'
)
```

**Family Tree Display:**
- Shows dotted line relationship (informational)
- Labeled as "Reported on death form"

---

### Case 5: Not Married, Dummy Spouse Created ✅

**Scenario:**
- Deceased has NO marriage in database
- User enters manual spouse details (no PersonPicker match)
- De facto partnership with unregistered partner

**Flow:**
1. User enters manual spouse details → No PersonPicker match
2. Create dummy person (status='active')
3. Death create handler validates:
   - Marriage exists? ❌ No
   - Skip validation (no marriage to check)
4. Create informant participant (role='informant', informantType='SPOUSE')
5. **Trigger: Create informational spouse link** (no marriage found)
6. Trigger: Immediately close link (end_date = death_date)

**Result:**
- ✅ Dummy person created
- ✅ Informant participant created (dummy)
- ✅ **Informational spouse link created** (source='death_registration')
- ✅ Link immediately closed
- ❌ No warning

**Event Remarks:** `CREATION: UI`

**Family Links:**
```sql
-- Informational link created and closed
INSERT INTO family_links_forward (
  person_id: dummy_spouse_id,
  related_person_id: deceased_id,
  relationship_type: 'spouse',
  source: 'death_registration',
  start_date: NULL,
  end_date: '2024-01-15',
  notes: '[Informational - no marriage record found. Reported by informant on death form]'
)
```

**Note:** Dummy person may need registration/merge later

---

### Case 6: Other Informant (Child/Parent/Friend) ✅

**Scenario:**
- Informant is NOT spouse (child, parent, sibling, friend, etc.)
- Always creates new person (no PersonPicker for non-spouse)

**Flow:**
1. User selects informant type: OTHER (child/parent/etc.)
2. User enters informant details inline
3. Create new person (status='review')
4. Create seed birth event (mock event for person)
5. Create informant participant (role='informant', informantType='OTHER')
6. No spouse validation (not spouse)
7. No family link creation (informant is not family)

**Result:**
- ✅ Informant person created
- ✅ Seed birth event created
- ✅ Informant participant created
- ❌ No family link
- ❌ No warning

**Event Remarks:** `CREATION: UI`

**Family Links:** None

---

## Correction Scenarios

### Correction Actions

| Action | Use Case | Changes |
|--------|----------|---------|
| `UPDATE_INFORMANT` | Wrong person selected as informant | Replace entire informant participant |
| `REMOVE_INFORMANT_SPOUSE` | Informant wrongly marked as spouse | Change relationship from SPOUSE to OTHER |
| `REPLACE_INFORMANT_SPOUSE` | Wrong spouse selected | Replace spouse informant with correct spouse |

---

### Correction 1: UPDATE_INFORMANT

**Use Case:** Wrong person selected as informant (any relationship type)

**Example:**
- Created death with person A as informant (child)
- Actually should be person B (sibling)

**Action:**
```json
{
  "action": "UPDATE_INFORMANT",
  "eventId": "death-event-uuid",
  "informantData": {
    "personId": "person-B-uuid",
    "relationship": "SIBLING"
  },
  "reason": "Wrong informant selected - should be sibling not child"
}
```

**Flow:**
1. Deactivate old informant participant (person A)
2. Create new informant participant (person B)
3. Update event remarks

**Result:**
- Old informant: status='inactive', ended_at=now
- New informant: status='active'
- No family link changes (informant is metadata)

---

### Correction 2: REMOVE_INFORMANT_SPOUSE

**Use Case:** Informant was mistakenly marked as spouse

**Example:**
- Created death with person A as SPOUSE informant
- Actually person A is a CHILD (mistake)

**Action:**
```json
{
  "action": "REMOVE_INFORMANT_SPOUSE",
  "eventId": "death-event-uuid",
  "reason": "Informant is child, not spouse"
}
```

**Flow:**
1. Find informant with informantType='SPOUSE'
2. Update relationship_details: informantType='SPOUSE' → 'OTHER'
3. Close informational spouse link (if exists)
4. Update event remarks

**Result:**
- Informant relationship changed from SPOUSE to OTHER
- Informational link closed (if existed)
- Person still same, just relationship corrected

**Family Links:**
```sql
-- If informational link existed, close it
UPDATE family_links_forward
SET end_date = now,
    notes = notes || ' [Removed - informant relationship corrected]'
WHERE source='death_registration' AND relationship_type='spouse'
```

---

### Correction 3: REPLACE_INFORMANT_SPOUSE

**Use Case:** Wrong spouse selected, need to replace with correct spouse

**Example Scenario (Case 2 Fix):**
- Created death with person A as spouse (wrong)
- Marriage exists with person B
- Need to replace A with B (correct spouse)

**Action:**
```json
{
  "action": "REPLACE_INFORMANT_SPOUSE",
  "eventId": "death-event-uuid",
  "informantData": {
    "personId": "person-B-uuid",
    "relationship": "SPOUSE"
  },
  "reason": "Replace with correct spouse from marriage record"
}
```

**Flow:**
1. Deactivate old spouse informant (person A)
2. Close old informational link (if existed)
3. Create new spouse informant participant (person B)
4. Trigger: Check marriage
   - If marriage exists to person B → No informational link
   - If no marriage → Create informational link
5. Update event remarks

**Result:**
- Old spouse informant: status='inactive'
- New spouse informant: status='active' (person B)
- Informational link behavior depends on marriage existence

**Example for Case 2 (Marriage exists):**
```sql
-- Old informant deactivated
-- New informant created (person B)
-- No informational link (marriage to person B already exists and closed)
```

**Example for Case 4 (No marriage):**
```sql
-- Old informant deactivated
-- Old informational link closed
-- New informant created (person B)
-- New informational link created (source='death_registration')
```

---

## Database Trigger Behavior

### Trigger Logic Flow

```sql
-- TRIGGER: on_event_participant_insert_or_update

-- 1. Handle SUBJECT (deceased)
IF ep.role = 'subject' AND is_ready THEN
  -- Close all spouse links for deceased
  UPDATE family_links_forward
  SET end_date = death_date, notes = notes || ' [Ended by death]'
  WHERE person_id = deceased_id
    AND relationship_type = 'spouse'
    AND end_date IS NULL
END IF

-- 2. Handle INFORMANT (spouse type)
IF ep.role = 'informant' AND is_ready THEN
  -- Check if informantType = SPOUSE
  IF relationship_details->>'informantType' = 'SPOUSE' THEN
    -- Get deceased person
    deceased_id := (SELECT person_id FROM event_participant WHERE role='subject')

    -- Check if marriage exists
    marriage_count := (SELECT COUNT(*) FROM family_links_forward
                       WHERE person_id = deceased_id
                       AND relationship_type = 'spouse'
                       AND source = 'marriage_registration')

    -- Only create informational link if NO marriage
    IF marriage_count = 0 THEN
      -- Create informational spouse link
      INSERT INTO family_links_forward (
        person_id: informant_spouse_id,
        related_person_id: deceased_id,
        relationship_type: 'spouse',
        source: 'death_registration',
        end_date: death_date,  -- Immediately closed
        notes: '[Informational - no marriage record found. Reported by informant on death form]'
      )
    END IF
  END IF
END IF
```

### Trigger Summary Table

| Participant Role | Relationship Details | Marriage Exists? | Trigger Action |
|-----------------|---------------------|-----------------|----------------|
| subject | N/A | ✅ Yes | Close marriage link |
| subject | N/A | ❌ No | No action (no links to close) |
| informant | informantType='SPOUSE' | ✅ Yes | No action (marriage link already closed by subject) |
| informant | informantType='SPOUSE' | ❌ No | Create + close informational link |
| informant | informantType='OTHER' | N/A | No action (not spouse) |

---

## API Examples

### Create: Case 1 (Married, Correct Spouse)

**Request:**
```json
{
  "record": {
    "entry": [
      {
        "resource": {
          "resourceType": "Patient",
          "id": "deceased-123",
          "deceasedBoolean": true,
          "identifier": [{ "value": "birth-crvs-id" }]
        }
      },
      {
        "resource": {
          "resourceType": "Patient",
          "id": "spouse-456",
          "identifier": [
            {
              "type": { "coding": [{ "code": "EXTERNAL_PERSON_ID" }] },
              "value": "spouse-person-uuid"
            }
          ]
        }
      },
      {
        "resource": {
          "resourceType": "RelatedPerson",
          "patient": { "reference": "Patient/spouse-456" },
          "relationship": { "coding": [{ "code": "SPOUSE" }] }
        }
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "eventId": "death-event-uuid",
  "deceasedId": "deceased-person-uuid",
  "wasLinkedToBirthRecord": true,
  "participants": [
    { "role": "subject", "person_id": "deceased-person-uuid" },
    { "role": "informant", "person_id": "spouse-person-uuid" }
  ]
}
```

---

### Create: Case 2 (Married, Wrong Spouse - Warning)

**Request:** (Same structure, but EXTERNAL_PERSON_ID is wrong person)

**Response:**
```json
{
  "success": true,
  "eventId": "death-event-uuid",
  "deceasedId": "deceased-person-uuid",
  "participants": [
    { "role": "subject", "person_id": "deceased-person-uuid" },
    { "role": "informant", "person_id": "wrong-person-uuid" }
  ],
  "warnings": [
    {
      "type": "informant_mismatch",
      "message": "Informant claims spouse but differs from marriage record. Marriage spouse: Jane Smith (ID: correct-spouse-uuid)"
    }
  ]
}
```

**Event in DB:**
```sql
remarks: "CREATION: UI | ⚠️ INFORMANT WARNING: Informant claims spouse but differs from marriage record. Marriage spouse: Jane Smith (ID: correct-spouse-uuid)"
```

---

### Create: Case 4 (Not Married, Spouse Selected - Informational Link)

**Request:** (Same structure, no marriage exists)

**Response:**
```json
{
  "success": true,
  "eventId": "death-event-uuid",
  "deceasedId": "deceased-person-uuid",
  "participants": [
    { "role": "subject", "person_id": "deceased-person-uuid" },
    { "role": "informant", "person_id": "spouse-person-uuid" }
  ]
}
```

**Family Link Created:**
```sql
INSERT INTO family_links_forward (
  person_id: "spouse-person-uuid",
  related_person_id: "deceased-person-uuid",
  relationship_type: 'spouse',
  source: 'death_registration',
  source_event_id: death_event_id,
  end_date: '2024-01-15',
  notes: '[Informational - no marriage record found. Reported by informant on death form]'
)
```

---

### Correction: REPLACE_INFORMANT_SPOUSE

**Request:**
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

**Response:**
```json
{
  "success": true,
  "action": "REPLACE_INFORMANT_SPOUSE",
  "oldInformant": {
    "id": "old-participant-id",
    "person_id": "wrong-spouse-uuid"
  },
  "newInformant": {
    "id": "new-participant-id",
    "person_id": "correct-spouse-uuid",
    "isDummy": false
  }
}
```

---

### Correction: REMOVE_INFORMANT_SPOUSE

**Request:**
```json
{
  "action": "REMOVE_INFORMANT_SPOUSE",
  "eventId": "death-event-uuid",
  "reason": "Informant is child, not spouse - relationship mistaken"
}
```

**Response:**
```json
{
  "success": true,
  "action": "REMOVE_INFORMANT_SPOUSE",
  "informant": {
    "id": "participant-id",
    "person_id": "person-uuid"
  }
}
```

**Database Changes:**
```sql
-- Informant participant updated
UPDATE event_participant
SET relationship_details = '{"type": "informant", "relationship": "OTHER", "informantType": "OTHER"}'
WHERE id = 'participant-id'

-- Informational link closed (if existed)
UPDATE family_links_forward
SET end_date = now,
    notes = notes || ' [Removed - informant relationship corrected]'
WHERE source='death_registration' AND person_id='person-uuid'
```

---

## Decision Tree

```
Death Registration Flow
│
├─── Extract Deceased
│    ├── Has birth record? → UPDATE person (status='deceased')
│    └── No birth record? → INSERT person (status='deceased')
│
├─── Extract Informant
│    │
│    ├─── Informant Type = SPOUSE?
│    │    ├── PersonPicker used?
│    │    │   ├── Yes → Link to existing person_id
│    │    │   └── No → Create dummy person
│    │    │
│    │    └── Validate against marriage
│    │        ├── Marriage exists?
│    │        │   ├── Yes → Selected = Marriage spouse?
│    │        │   │   ├── Yes → ✅ Case 1 (no warning)
│    │        │   │   └── No → ⚠️ Case 2/3 (warning added)
│    │        │   │
│    │        │   └── No → ✅ Case 4/5 (trigger creates informational link)
│    │        │
│    │        └── Create informant participant (role='informant')
│    │
│    └─── Informant Type = OTHER?
│         └── Create new person (status='review')
│             └── Create informant participant (role='informant')
│
└─── Database Trigger
     ├── Subject role → Close spouse links (end_date = death_date)
     └── Informant role (spouse type) → Create informational link if no marriage
```

---

## Summary

### Key Principles

1. **Informant = Metadata, Not Family Structure**
   - Informant participant records who reported death
   - Does NOT automatically create family relationships

2. **Marriage is Source of Truth**
   - Marriage registration creates legal spouse links
   - Death form spouse is supplementary information only

3. **Informational Links for Unmarried Partnerships**
   - Created when informant claims spouse but no marriage exists
   - Immediately closed (end_date = death_date)
   - Labeled as "[Informational - no marriage record found]"

4. **Validation Detects Mismatches**
   - Warns when informant spouse differs from marriage record
   - Flags for review in event remarks
   - Corrections available to fix mistakes

5. **Corrections Handle Mistakes**
   - UPDATE_INFORMANT: Change any informant
   - REMOVE_INFORMANT_SPOUSE: Fix wrong relationship type
   - REPLACE_INFORMANT_SPOUSE: Replace wrong spouse with correct one

### All Scenarios Covered

| # | Scenario | Informational Link? | Warning? | Correction Available? |
|---|----------|--------------------|---------|-----------------------|
| 1 | Married + Correct spouse | ❌ No | ❌ No | ✅ REPLACE if needed |
| 2 | Married + Wrong spouse | ❌ No | ⚠️ Yes | ✅ REPLACE to fix |
| 3 | Married + Dummy spouse | ❌ No | ⚠️ Yes | ✅ REPLACE to fix |
| 4 | Not married + Spouse | ✅ Yes | ❌ No | ✅ REPLACE/REMOVE |
| 5 | Not married + Dummy | ✅ Yes | ❌ No | ✅ REPLACE/REMOVE |
| 6 | Other informant | ❌ No | ❌ No | ✅ UPDATE |
