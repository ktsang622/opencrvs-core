# Death Registration Informant Architecture

## Overview

Death registration has been refactored to correctly separate **informant metadata** from **family relationships**.

## Key Principles

### 1. **Informant ≠ Family Relationship**

- **Informant** = Person who reported the death (stored in `event_participant` with `role='informant'`)
- **Family relationships** = Come from birth/marriage registrations, NOT death form

### 2. **Death Event Participants**

Death events have only TWO participant types:

| Role | Description | Creates Family Link? |
|------|-------------|---------------------|
| `subject` | The deceased person | ❌ No (closes existing spouse links) |
| `informant` | Person who reported death | ❌ No (just metadata) |

### 3. **Informant Types**

Informant relationship is stored in `relationship_details`:

```json
{
  "type": "informant",
  "relationship": "SPOUSE" | "CHILD" | "PARENT" | "SIBLING" | "OTHER",
  "informantType": "SPOUSE" | "OTHER"
}
```

## Implementation Details

### Database Trigger (init/database.sql)

**OLD behavior (REMOVED):**
```sql
-- ❌ Created informational spouse link from death form
IF ep.role = 'spouse' AND is_ready THEN
  PERFORM upsert_family_link_forward_shadow(...)
END IF
```

**NEW behavior:**
```sql
-- ✅ Only closes existing spouse links when person dies
IF ep.role = 'subject' AND is_ready THEN
  UPDATE family_links_forward
  SET end_date = death_date,
      notes = notes || ' [Ended by death]'
  WHERE (person_id = ep.person_id OR related_person_id = ep.person_id)
    AND relationship_type = 'spouse'
    AND end_date IS NULL
END IF
```

### Death Create Handler (create.ts)

**Changes:**
1. ✅ Spouse participant uses `role='informant'` (NOT `role='spouse'`)
2. ✅ Removed mother/father handling (legacy from birth handler)
3. ✅ Added informant spouse validation against marriage record
4. ✅ Adds event remarks for mismatched informant (Case 2 & 3)

**Informant Spouse Validation:**

```typescript
// Validates if informant claiming spouse matches marriage record
async function validateInformantSpouse(deceasedPersonId, informantSpouseId) {
  // Query marriage spouse from family_links_forward
  const marriageSpouse = await findMarriageSpouse(deceasedPersonId)

  if (!marriageSpouse) {
    return null // No marriage - no validation needed
  }

  if (marriageSpouse.id !== informantSpouseId) {
    return {
      warning: "Informant claims spouse but differs from marriage record",
      marriageSpouseId: marriageSpouse.id
    }
  }

  return null // Match - all good
}
```

**Event Remarks:**

When mismatch detected, event.remarks includes:
```
CREATION: UI | ⚠️ INFORMANT WARNING: Informant claims spouse but differs from marriage record. Marriage spouse: John Doe (ID: xxx)
```

## Case Scenarios

### Case 1: Married, Informant is Correct Spouse ✅
- User selects spouse via PersonPicker
- `validateInformantSpouse()` checks marriage record
- **Match found** → No warning
- Informant participant created with `role='informant'`
- Marriage link updated with `end_date = death_date`

### Case 2: Married, Informant is Wrong Person ⚠️
- User selects WRONG person via PersonPicker
- `validateInformantSpouse()` checks marriage record
- **Mismatch detected** → Warning added to event remarks
- Informant participant created with `role='informant'`
- Event flagged for review

**Event Remarks:**
```
⚠️ INFORMANT WARNING: Informant claims spouse but differs from marriage record. Marriage spouse: Jane Smith (ID: abc-123)
```

### Case 3: Married, Informant is Dummy Person ⚠️
- User creates NEW person (no PersonPicker match)
- Dummy person created
- `validateInformantSpouse()` checks marriage record
- **Mismatch detected** (dummy ID ≠ marriage spouse ID)
- Warning added to event remarks
- Dummy person needs merge/correction

**Event Remarks:**
```
⚠️ INFORMANT WARNING: Informant claims spouse but differs from marriage record. Marriage spouse: Jane Smith (ID: abc-123)
```

### Case 4: Not Married, Informant Claims Spouse ✅
- User creates new person or selects via PersonPicker
- `validateInformantSpouse()` checks marriage record
- **No marriage found** → No warning needed
- Informant participant created with `role='informant'`
- No family link created (correct behavior)

## Death Correction Handler

**Status:** ⚠️ DEPRECATED - Needs Redesign

The current correction handler (`death/correction.ts`) was designed for spouse family link corrections:
- `ADD_SPOUSE`
- `REMOVE_SPOUSE`
- `REPLACE_SPOUSE`

**Problem:** These actions don't make sense with new architecture where:
- Spouse is informant metadata, NOT family participant
- Family links come from marriage, NOT death

**TODO: Redesign for:**
- `UPDATE_INFORMANT` - Change who the informant is
- `UPDATE_DEATH_DETAILS` - Change death date, place, cause
- `UPDATE_DECEASED_PERSON` - Link to correct deceased person

## Migration Notes

### Before (OLD Architecture)
```
Death Form:
├── Deceased (subject)
├── Mother (family participant) ❌
├── Father (family participant) ❌
└── Spouse (family participant) ❌
     └── Creates family_links_forward

Database Trigger:
└── Creates informational spouse link
```

### After (NEW Architecture)
```
Death Form:
├── Deceased (subject)
└── Informant (metadata only) ✅
     ├── Type: SPOUSE | CHILD | PARENT | OTHER
     └── NO family link creation

Database Trigger:
└── Closes existing spouse links (end_date = death_date)

Validation:
└── If informant claims spouse → Check marriage record → Warn if mismatch
```

## Benefits

1. **Data Integrity**: Family links only from authoritative sources (birth/marriage)
2. **Clear Separation**: Informant is metadata, not family structure
3. **Validation**: Detects data quality issues (wrong informant selected)
4. **Audit Trail**: Event remarks document mismatches for review
5. **Simplified Logic**: No complex informational vs legal link management

## API Impact

### Death Create Request
```json
{
  "record": {
    "entry": [
      {
        "resource": {
          "resourceType": "Patient",
          "id": "deceased-uuid",
          "deceasedBoolean": true
        }
      },
      {
        "resource": {
          "resourceType": "RelatedPerson",
          "patient": { "reference": "Patient/informant-uuid" },
          "relationship": { "coding": [{ "code": "SPOUSE" }] }
        }
      }
    ]
  }
}
```

### Death Create Response (with warning)
```json
{
  "success": true,
  "eventId": "death-event-uuid",
  "deceasedId": "person-id",
  "warning": "Informant spouse mismatch detected - see event remarks"
}
```

## Testing Checklist

- [ ] Case 1: Married person dies, correct spouse is informant → No warning
- [ ] Case 2: Married person dies, wrong person claims spouse → Warning in remarks
- [ ] Case 3: Married person dies, dummy person created as spouse → Warning in remarks
- [ ] Case 4: Unmarried person dies, informant claims spouse → No warning
- [ ] Database trigger closes spouse links correctly
- [ ] No family links created from death form
- [ ] Mother/father removed from death form
- [ ] Correction handler documented as deprecated

## Related Files

- `/home/ktsang/opencrvs-core/init/database.sql` - Database trigger (lines 403-415)
- `/home/ktsang/opencrvs-core/packages/toppan/src/person-db-sync/death/create.ts` - Create handler
- `/home/ktsang/opencrvs-core/packages/toppan/src/person-db-sync/death/correction.ts` - Correction handler (DEPRECATED)
- `/home/ktsang/opencrvs-core/packages/toppan/DEATH_SPOUSE_DESIGN.md` - Original design (now superseded)
- `/home/ktsang/opencrvs-core/packages/toppan/DEATH_SPOUSE_IMPLEMENTATION.md` - Original implementation (now superseded)
