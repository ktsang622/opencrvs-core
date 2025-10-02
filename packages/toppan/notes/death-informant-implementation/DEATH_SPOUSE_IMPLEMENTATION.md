# Death Spouse Implementation - Final Summary

## ✅ What We Implemented

Successfully updated death spouse handling to prevent duplicate relationships and ensure data integrity.

## Key Changes

### 1. Database Trigger Update ([init/database.sql:403-458](init/database.sql#L403))

**Before:** Always created informational spouse link
```sql
-- OLD: Created duplicate if marriage exists
IF ep.role = 'spouse' THEN
  -- Create link (no marriage check)
  PERFORM upsert_family_link_forward_shadow(...)
END IF;
```

**After:** Only creates informational link if NO marriage exists
```sql
-- NEW: Check for marriage first
SELECT COUNT(*) INTO v_marriage_count
FROM family_links_forward
WHERE (person_id = deceased_id OR related_person_id = deceased_id)
  AND relationship_type = 'spouse'
  AND source = 'marriage_registration'
  AND (end_date IS NULL OR end_date >= death_date);

-- Only create if no marriage
IF v_marriage_count = 0 THEN
  PERFORM upsert_family_link_forward_shadow(...)
  -- Notes: '[Informational - no marriage record found]'
ELSE
  RAISE NOTICE 'Death spouse skipped - marriage exists'
END IF;
```

### 2. Death Correction Handler ([death/correction.ts](death/correction.ts))

#### Actions Available

| Action | When to Use | Marriage Check | What It Does |
|--------|-------------|----------------|--------------|
| **ADD_SPOUSE** | Registrar forgot to add spouse | ✅ Blocks if marriage exists | Creates informational link |
| **REMOVE_SPOUSE** | Spouse was wrongly added | ❌ No check needed | Removes informational link only |
| **REPLACE_SPOUSE** | Wrong person selected from PersonPicker | ✅ Blocks if marriage exists | Replaces informational link |
| ~~UPDATE_SPOUSE_SAME~~ | ❌ **REMOVED** | N/A | Person updates go through Person API |

#### Safeguards Implemented

**ADD_SPOUSE - Marriage Check:**
```typescript
// Check if marriage spouse exists
const marriageSpouse = await checkMarriageExists(deceasedPersonId)
if (marriageSpouse) {
  return {
    error: 'marriage_spouse_exists',
    message: 'Marriage record takes precedence',
    marriageSpouse: { id, name, source }
  }
}
// Only create if no marriage
```

**REMOVE_SPOUSE - Only Informational:**
```sql
-- Only removes death-sourced links (not marriage)
UPDATE family_links_forward
SET end_date = $1,
    notes = COALESCE(notes, '') || ' [Removed via correction]'
WHERE source_event_id = death_event_id
  AND relationship_type = 'spouse'
  AND source = 'death_registration'  -- ← KEY: Only informational
  AND end_date IS NULL
```

**REPLACE_SPOUSE - Marriage Check:**
```typescript
// Check marriage before replacing
const marriageCount = await checkMarriageExists(deceasedPersonId)
if (marriageCount > 0) {
  return {
    error: 'marriage_spouse_exists',
    message: 'Cannot replace - marriage record exists'
  }
}
// Only replace if no marriage
```

## Flow Diagrams

### CREATE Flow (Death Registration)

```
Death Registration Created
    ↓
Spouse Listed in Form?
    ├─ YES → Check Marriage Exists?
    │         ├─ YES (marriage exists)
    │         │   └─ ⚠️ SKIP informational link
    │         │       └─ Log: "Death spouse skipped - marriage exists"
    │         │           └─ Family tree shows: Marriage (solid line) only
    │         │
    │         └─ NO (no marriage)
    │             └─ ✅ CREATE informational link
    │                 └─ source='death_registration'
    │                     └─ Auto-close at death_date
    │                         └─ Family tree shows: Dotted line
    │
    └─ NO → No spouse link created
```

### CORRECTION Flow

```
Correction Request (ADD_SPOUSE)
    ↓
Check Marriage Exists?
    ├─ YES (marriage exists)
    │   └─ ❌ REJECT with error
    │       └─ "Marriage record takes precedence"
    │
    └─ NO (no marriage)
        └─ ✅ CREATE informational link
            └─ Dotted line in family tree

Correction Request (REMOVE_SPOUSE)
    ↓
Find Informational Link
    ├─ Found → ✅ REMOVE
    │          └─ Close link (source='death_registration' only)
    │              └─ Marriage links untouched
    │
    └─ Not Found → NOOP (204)

Correction Request (REPLACE_SPOUSE)
    ↓
Check Marriage Exists?
    ├─ YES (marriage exists)
    │   └─ ❌ REJECT with error
    │
    └─ NO (no marriage)
        ├─ Close old informational link
        └─ Create new informational link
```

## Scenarios Explained

### Scenario 1: Deceased Had Marriage (Most Common)
```
Timeline:
- 2020: Marriage Event (Spouse A)
  → family_links_forward: source='marriage_registration' (solid line)
- 2023: Death Event (Spouse A listed in form)
  → Trigger checks: marriage exists? YES
  → Trigger skips: No informational link created
  → Result: Only solid line shown (from marriage)
```

**Correction Attempts:**
- ADD_SPOUSE → ❌ Blocked ("Marriage exists")
- REMOVE_SPOUSE → No informational link to remove (NOOP)
- REPLACE_SPOUSE → ❌ Blocked ("Marriage exists")

### Scenario 2: Deceased Never Married
```
Timeline:
- No marriage event
- 2023: Death Event (Common-law Spouse B listed in form)
  → Trigger checks: marriage exists? NO
  → Trigger creates: Informational link (source='death_registration')
  → Result: Dotted line shown (informational only)
```

**Correction Attempts:**
- ADD_SPOUSE → ❌ Already exists (409)
- REMOVE_SPOUSE → ✅ Removes dotted line
- REPLACE_SPOUSE → ✅ Replaces with different person (dotted line)

### Scenario 3: Deceased Was Divorced, Then Had New Partner
```
Timeline:
- 2015: Marriage Event (Spouse A)
  → family_links_forward: source='marriage_registration' (solid line)
- 2020: Divorce
  → Update: end_date=2020 (solid line closed)
- 2023: Death Event (Partner B listed - never married)
  → Trigger checks: marriage exists AND active? NO (divorced)
  → Trigger creates: Informational link for Partner B (dotted line)
  → Result:
    - Spouse A: Closed solid line (1990-2000)
    - Partner B: Dotted line (informational, closed at death)
```

## Family Tree Display Rules

```typescript
// Spouse display logic
function getSpouses(person) {
  const spouses = person.relationships.filter(r => r.type === 'spouse')

  return spouses.map(s => ({
    id: s.spouse_id,
    name: s.spouse_name,
    lineStyle: s.source === 'marriage_registration' ? 'solid' : 'dotted',
    label: s.source === 'marriage_registration'
      ? 'Spouse (married)'
      : 'Spouse (informational)',
    period: `${s.start_date} - ${s.end_date || 'present'}`,
    isClosed: s.end_date !== null
  }))
}
```

## Database Schema

### family_links_forward - Source Field Usage

| Source | Created By | Line Style | Meaning | Can Correct? |
|--------|-----------|------------|---------|--------------|
| `marriage_registration` | Marriage event | Solid | Legal marriage | No (marriage API only) |
| `death_registration` | Death event (trigger) | Dotted | Informational from death form | Yes (death correction) |

### Queries

**Check if marriage exists:**
```sql
SELECT COUNT(*) as count
FROM family_links_forward
WHERE person_id = $1
  AND relationship_type = 'spouse'
  AND source = 'marriage_registration'
  AND (end_date IS NULL OR end_date >= $2);  -- Still married at death
```

**Get informational spouse link:**
```sql
SELECT * FROM family_links_forward
WHERE source_event_id = $1  -- death event id
  AND relationship_type = 'spouse'
  AND source = 'death_registration'
  AND end_date IS NOT NULL;  -- All informational links are closed
```

## API Changes

### Death Correction Endpoint

**URL:** `POST /v1/person-db-sync/death/correction`

**Actions (3 total, removed UPDATE_SPOUSE_SAME):**

1. **ADD_SPOUSE**
```json
{
  "action": "ADD_SPOUSE",
  "eventId": "death-event-uuid",
  "spouseData": {
    "spouseId": "person-uuid-from-picker",
    "reason": "Spouse was missing in original registration"
  }
}
```

**Response:**
- 201: Created (if no marriage)
- 409: `marriage_spouse_exists` (if marriage exists)

2. **REMOVE_SPOUSE**
```json
{
  "action": "REMOVE_SPOUSE",
  "eventId": "death-event-uuid",
  "reason": "Deceased was actually single"
}
```

3. **REPLACE_SPOUSE**
```json
{
  "action": "REPLACE_SPOUSE",
  "eventId": "death-event-uuid",
  "spouseData": {
    "spouseId": "new-person-uuid",
    "expectedPersonId": "old-person-uuid"  // Optimistic lock
  }
}
```

## Testing Checklist

- [ ] **Create death with spouse (no marriage)** → Dotted line appears
- [ ] **Create death with spouse (has marriage)** → No dotted line (trigger skips)
- [ ] **ADD_SPOUSE when marriage exists** → 409 error
- [ ] **ADD_SPOUSE when no marriage** → Creates dotted line
- [ ] **REMOVE_SPOUSE** → Only removes informational (marriage untouched)
- [ ] **REPLACE_SPOUSE when marriage exists** → 409 error
- [ ] **REPLACE_SPOUSE when no marriage** → Replaces dotted line
- [ ] **Person update (name, national_id)** → Use Person API (not death correction)

## Files Changed

1. ✅ [init/database.sql](init/database.sql#L403) - Trigger with marriage check
2. ✅ [death/correction.ts](death/correction.ts) - 3 actions with safeguards
3. ✅ [database.ts](database.ts#L95) - Added `findExistingSpouseParticipant()`
4. ✅ [routes.ts](routes.ts#L110) - Death correction route enabled

## Summary

**Problem Solved:**
- ❌ Before: Created duplicate spouse relationships (marriage + informational)
- ✅ After: Informational links only when NO marriage exists

**Design Principle:**
> Marriage events are the source of truth for legal relationships.
> Death form spouse is supplementary information, never replaces marriage.

**Correction Philosophy:**
> Corrections modify event data (relationships), not person data.
> Person updates (name, ID) go through Person API.
