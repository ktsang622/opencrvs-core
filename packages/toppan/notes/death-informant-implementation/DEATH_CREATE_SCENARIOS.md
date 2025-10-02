# Death Registration Create Scenarios

## Informant Type Selection

| Informant Type | PersonPicker? | Person Creation | Participant Role |
|---------------|---------------|-----------------|------------------|
| Spouse | ✅ Yes | Link existing OR create new | `informant` with `relationship='SPOUSE'` |
| Other (child/parent/friend) | ❌ No | Always create new | `informant` with `relationship='OTHER'` |

## Deceased Person Scenarios

| Scenario | Has Birth Record? | Action | Person Status | Notes |
|----------|------------------|--------|---------------|-------|
| **1. Deceased with birth record** | ✅ Yes | UPDATE existing person | `deceased` | Link death to birth via CRVS ID |
| **2. Deceased without birth record** | ❌ No | INSERT new person | `deceased` | Create standalone death record |

### Scenario 1: Deceased with Birth Record
```
1. Find person by CRVS ID (from birth registration)
2. UPDATE person:
   - status = 'deceased'
   - death_date = event_date
3. INSERT death event
4. INSERT event_participant (role='subject')
5. Trigger: Close spouse links (end_date = death_date)
```

### Scenario 2: Deceased without Birth Record
```
1. INSERT new person:
   - status = 'deceased'
   - death_date = event_date
2. INSERT death event
3. INSERT event_participant (role='subject')
4. Trigger: Close spouse links (if any exist)
```

## Informant Spouse Scenarios (PersonPicker)

### Case 1: Married, Correct Spouse Selected ✅

| Step | Action | Database | Validation | Result |
|------|--------|----------|------------|--------|
| 1 | User searches spouse via PersonPicker | Query person table | - | Find existing person |
| 2 | User selects correct spouse | Link person_id | - | Spouse identified |
| 3 | Check marriage record | Query family_links_forward | Marriage exists? ✅ Yes | Found marriage link |
| 4 | Compare IDs | - | Selected ID = Marriage spouse ID? ✅ Match | Validation passed |
| 5 | Create informant participant | INSERT event_participant (role='informant') | - | Informant recorded |
| 6 | Update event remarks | event.remarks = 'CREATION: UI' | No warning | Clean event |

**Event Remarks:** `CREATION: UI`

**Family Links:**
- Marriage link: Updated with `end_date = death_date, notes = '[Ended by death]'`
- No new links created

---

### Case 2: Married, Wrong Person Selected ⚠️

| Step | Action | Database | Validation | Result |
|------|--------|----------|------------|--------|
| 1 | User searches via PersonPicker | Query person table | - | Find person A |
| 2 | User selects **WRONG** person | Link person_id (person A) | - | Wrong spouse identified |
| 3 | Check marriage record | Query family_links_forward | Marriage exists? ✅ Yes | Found marriage to person B |
| 4 | Compare IDs | - | Selected ID (A) = Marriage spouse ID (B)? ❌ Mismatch | **Validation FAILED** |
| 5 | Create informant participant | INSERT event_participant (role='informant') | - | Wrong informant recorded |
| 6 | Update event remarks | event.remarks += warning | ⚠️ Warning added | **Event flagged for review** |

**Event Remarks:**
```
CREATION: UI | ⚠️ INFORMANT WARNING: Informant claims spouse but differs from marriage record. Marriage spouse: John Doe (ID: abc-123)
```

**Family Links:**
- Marriage link (to person B): Updated with `end_date = death_date, notes = '[Ended by death]'`
- No link to wrong informant (person A)

**Fix Required:** Manual correction to update informant to correct person

---

### Case 3: Married, New Person Created (Dummy) ⚠️

| Step | Action | Database | Validation | Result |
|------|--------|----------|------------|--------|
| 1 | User enters manual details (no PersonPicker match) | - | - | No existing person |
| 2 | Create dummy person | INSERT person (status='active', new UUID) | - | Dummy spouse created |
| 3 | Check marriage record | Query family_links_forward | Marriage exists? ✅ Yes | Found marriage to person B |
| 4 | Compare IDs | - | Dummy ID (new) = Marriage spouse ID (B)? ❌ Mismatch | **Validation FAILED** |
| 5 | Create informant participant | INSERT event_participant (role='informant', person_id=dummy) | - | Dummy informant recorded |
| 6 | Update event remarks | event.remarks += warning | ⚠️ Warning added | **Event flagged for review** |

**Event Remarks:**
```
CREATION: UI | ⚠️ INFORMANT WARNING: Informant claims spouse but differs from marriage record. Marriage spouse: Jane Smith (ID: def-456)
```

**Family Links:**
- Marriage link (to person B): Updated with `end_date = death_date, notes = '[Ended by death]'`
- No link to dummy person

**Fix Required:**
1. Merge dummy person with actual spouse (person B), OR
2. Correct informant to link to actual spouse

---

### Case 4: Not Married, Spouse Selected ✅

| Step | Action | Database | Validation | Result |
|------|--------|----------|------------|--------|
| 1 | User searches via PersonPicker | Query person table | - | Find existing person |
| 2 | User selects person (claims spouse) | Link person_id | - | Spouse identified |
| 3 | Check marriage record | Query family_links_forward | Marriage exists? ❌ No | No marriage found |
| 4 | Skip validation | - | No marriage to validate | **Validation skipped** |
| 5 | Create informant participant | INSERT event_participant (role='informant') | - | Informant recorded |
| 6 | Update event remarks | event.remarks = 'CREATION: UI' | No warning | Clean event |

**Event Remarks:** `CREATION: UI`

**Family Links:** None (no marriage, no new links created)

**Note:** This is valid - deceased may have had partner but never married

---

### Case 5: Not Married, New Person Created ✅

| Step | Action | Database | Validation | Result |
|------|--------|----------|------------|--------|
| 1 | User enters manual details | - | - | No existing person |
| 2 | Create new person | INSERT person (status='active') | - | New spouse created |
| 3 | Check marriage record | Query family_links_forward | Marriage exists? ❌ No | No marriage found |
| 4 | Skip validation | - | No marriage to validate | **Validation skipped** |
| 5 | Create informant participant | INSERT event_participant (role='informant') | - | Informant recorded |
| 6 | Update event remarks | event.remarks = 'CREATION: UI' | No warning | Clean event |

**Event Remarks:** `CREATION: UI`

**Family Links:** None

**Note:** Common scenario for unmarried partnerships or missing marriage records

## Informant Other Scenarios

### Case 6: Other Informant (Child/Parent/Friend) ✅

| Step | Action | Database | Validation | Result |
|------|--------|----------|------------|--------|
| 1 | User enters informant details inline | - | - | No PersonPicker |
| 2 | Create new person | INSERT person (status='review') | - | Informant person created |
| 3 | Create seed birth event | INSERT event (type='birth', source='seed') | - | Mock birth event |
| 4 | Create seed participant | INSERT event_participant (role='subject' for seed event) | - | Link informant to seed event |
| 5 | Create informant participant | INSERT event_participant (role='informant' for death event) | - | Informant recorded |
| 6 | No spouse validation | - | Not spouse | No validation needed |
| 7 | Update event remarks | event.remarks = 'CREATION: UI' | No warning | Clean event |

**Event Remarks:** `CREATION: UI`

**Family Links:** None (informant is not family)

**Note:** Status='review' indicates person needs verification/registration

## Summary Table

| Case | Deceased Has Birth? | Informant Type | PersonPicker Used? | Marriage Exists? | Selected = Marriage Spouse? | Warning? | Family Link Created? |
|------|-------------------|----------------|-------------------|-----------------|---------------------------|----------|---------------------|
| 1 | ✅ Yes | Spouse | ✅ Yes | ✅ Yes | ✅ Match | ❌ No | ❌ No (marriage link closed) |
| 2 | ✅ Yes | Spouse | ✅ Yes | ✅ Yes | ❌ Mismatch | ⚠️ Yes | ❌ No (marriage link closed) |
| 3 | ✅ Yes | Spouse | ❌ No (dummy) | ✅ Yes | ❌ Mismatch | ⚠️ Yes | ❌ No (marriage link closed) |
| 4 | ✅ Yes | Spouse | ✅ Yes | ❌ No | N/A | ❌ No | ❌ No |
| 5 | ✅ Yes | Spouse | ❌ No (new) | ❌ No | N/A | ❌ No | ❌ No |
| 6 | ✅ Yes | Other | ❌ No | N/A | N/A | ❌ No | ❌ No |
| 1b | ❌ No | Spouse | ✅ Yes | ❌ No | N/A | ❌ No | ❌ No |
| 2b | ❌ No | Spouse | ❌ No (new) | ❌ No | N/A | ❌ No | ❌ No |
| 6b | ❌ No | Other | ❌ No | N/A | N/A | ❌ No | ❌ No |

**Legend:**
- ✅ Yes = Condition met
- ❌ No = Condition not met
- ⚠️ Yes = Warning triggered
- N/A = Not applicable

## Database Trigger Behavior

**OLD (Removed):**
```sql
IF ep.role = 'spouse' THEN
  -- Create informational family link ❌ WRONG
END IF
```

**NEW:**
```sql
IF ep.role = 'subject' THEN
  -- Close existing spouse links ✅ CORRECT
  UPDATE family_links_forward
  SET end_date = death_date, notes = notes || ' [Ended by death]'
  WHERE person_id = deceased_id AND relationship_type = 'spouse'
END IF

-- Informant role: NO TRIGGER ACTION (just metadata) ✅
```

## Correction Scenarios (Future Design)

Current correction handler is **DEPRECATED**. Future design should handle:

| Correction Type | Use Case | Action |
|----------------|----------|--------|
| ~~UPDATE_INFORMANT~~ | ~~Wrong informant selected~~ | ~~Change event_participant (role='informant')~~ |
| ~~UPDATE_DEATH_DETAILS~~ | ~~Wrong date/place~~ | ~~Update event table~~ |
| ~~UPDATE_DECEASED_PERSON~~ | ~~Wrong person marked deceased~~ | **❌ INVALID - Cannot change who died** |

**Note:** Death corrections may not be needed if OpenCRVS handles corrections through regular correction flow.

## Validation Logic Flowchart

```
Death Create Request
    ├── Extract deceased person
    │   ├── Has birth record?
    │   │   ├── Yes → UPDATE person (status='deceased')
    │   │   └── No → INSERT person (status='deceased')
    │
    ├── Extract informant
    │   ├── Type = Spouse?
    │   │   ├── Yes → PersonPicker used?
    │   │   │   ├── Yes → Link to person_id
    │   │   │   └── No → Create dummy person
    │   │   │
    │   │   └── Deceased has marriage?
    │   │       ├── Yes → Selected ID = Marriage spouse ID?
    │   │       │   ├── Yes → ✅ No warning
    │   │       │   └── No → ⚠️ Add warning to event.remarks
    │   │       │
    │   │       └── No → ✅ No validation (no marriage to check)
    │   │
    │   └── Type = Other?
    │       └── Create new person (status='review')
    │
    └── INSERT event_participant (role='informant')
```

## API Examples

### Request: Case 1 (Correct Spouse)
```json
{
  "record": {
    "entry": [
      {
        "resource": {
          "resourceType": "Patient",
          "id": "deceased-123",
          "deceasedBoolean": true,
          "identifier": [{ "value": "existing-crvs-id" }]
        }
      },
      {
        "resource": {
          "resourceType": "Patient",
          "id": "spouse-456",
          "identifier": [
            { "type": { "coding": [{ "code": "EXTERNAL_PERSON_ID" }] }, "value": "person-uuid-abc" }
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
  "deceasedId": "person-uuid-existing",
  "wasLinkedToBirthRecord": true,
  "participants": [
    { "role": "subject", "person_id": "person-uuid-existing" },
    { "role": "informant", "person_id": "person-uuid-abc" }
  ]
}
```

### Request: Case 2 (Wrong Spouse - Warning)
Same structure but `EXTERNAL_PERSON_ID` is `person-uuid-xyz` (wrong person)

**Response:**
```json
{
  "success": true,
  "eventId": "death-event-uuid",
  "deceasedId": "person-uuid-existing",
  "wasLinkedToBirthRecord": true,
  "participants": [
    { "role": "subject", "person_id": "person-uuid-existing" },
    { "role": "informant", "person_id": "person-uuid-xyz" }
  ],
  "warnings": [
    {
      "type": "informant_mismatch",
      "message": "Informant claims spouse but differs from marriage record. Marriage spouse: Jane Smith (ID: person-uuid-abc)"
    }
  ]
}
```

**Event Remarks in DB:**
```
CREATION: UI | ⚠️ INFORMANT WARNING: Informant claims spouse but differs from marriage record. Marriage spouse: Jane Smith (ID: person-uuid-abc)
```
