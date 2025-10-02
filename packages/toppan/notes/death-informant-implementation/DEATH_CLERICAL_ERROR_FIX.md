# Death Clerical Error Fix - Informational Link Deletion

## Problem Identified

When correcting a clerical error (informant wrongly marked as spouse), the informational spouse link was **not being removed** from the family tree.

---

## The Issue

### Scenario: Clerical Error
```
Death Registration (MISTAKE):
- Deceased: John Doe
- Informant: Jane Smith (marked as SPOUSE) ❌ WRONG
  Actually: Jane is his CHILD
```

### What Happened (OLD CODE):

1. **Death Create** creates informational link:
   ```sql
   -- Trigger creates link (because no marriage exists)
   INSERT INTO family_links_forward (
     person_id: jane-id,
     related_person_id: john-id,
     relationship_type: 'spouse',
     source: 'death_registration',
     end_date: '2024-01-15',  -- Already closed at death
     notes: '[Informational - no marriage record found...]'
   )
   ```

2. **Correction** tries to close it:
   ```sql
   -- ❌ PROBLEM: Query looks for NULL end_date, but link already has end_date!
   UPDATE family_links_forward
   SET end_date = now,
       notes = notes || ' [Removed...]'
   WHERE source_event_id = death-event
     AND relationship_type = 'spouse'
     AND source = 'death_registration'
     AND end_date IS NULL  -- ← No match! Link already closed!

   -- Result: rowCount = 0, nothing updated
   ```

3. **Family Tree** still shows Jane as spouse! 😱
   ```
   Family Tree for John Doe:
   - Spouse: Jane Smith ❌ WRONG! (should not appear)
   ```

---

## Root Cause

**Informational spouse links are immediately closed** by the trigger (end_date = death_date), so they **cannot be found** by queries looking for `end_date IS NULL`.

### Trigger Code (init/database.sql:462-469)
```sql
-- Create informational spouse link
PERFORM upsert_family_link_forward_shadow(...)

-- Immediately close it (relationship ends at death)
UPDATE family_links_forward
SET end_date = COALESCE(ev.event_date, CURRENT_DATE),  -- ← Already closed!
    notes = COALESCE(notes, '') || ' [Informational...]'
WHERE source_event_id = ep.event_id
  AND relationship_type = 'spouse'
  AND end_date IS NULL
```

---

## The Fix

### Philosophy: **DELETE erroneous data, don't just mark it**

For clerical errors (data entered incorrectly), the family link should **never have existed** → DELETE it entirely.

### Implementation

#### 1. UPDATE_INFORMANT (changing spouse to non-spouse)

**Before:**
```typescript
// ❌ Tried to close link, but couldn't find it
UPDATE family_links_forward
SET end_date = now
WHERE ... AND end_date IS NULL  // ← Never finds it
```

**After:**
```typescript
// ✅ DELETE the erroneous link
DELETE FROM family_links_forward
WHERE source_event_id = death-event
  AND relationship_type = 'spouse'
  AND source = 'death_registration'
  AND (person_id = old-informant OR related_person_id = old-informant)
```

#### 2. REMOVE_INFORMANT_SPOUSE

**Before:**
```typescript
// ❌ Tried to close link
UPDATE family_links_forward
SET end_date = now
WHERE ... AND end_date IS NULL
```

**After:**
```typescript
// ✅ DELETE the erroneous link
DELETE FROM family_links_forward
WHERE source_event_id = death-event
  AND relationship_type = 'spouse'
  AND source = 'death_registration'
  AND (person_id = informant OR related_person_id = informant)
```

#### 3. REPLACE_INFORMANT_SPOUSE

**Before:**
```typescript
// ❌ Tried to close old link
UPDATE family_links_forward
SET end_date = now, notes = notes || ' [Replaced...]'
WHERE ... AND end_date IS NULL
```

**After:**
```typescript
// ✅ DELETE old erroneous link
DELETE FROM family_links_forward
WHERE source_event_id = death-event
  AND relationship_type = 'spouse'
  AND source = 'death_registration'
  AND (person_id = old-spouse OR related_person_id = old-spouse)

// Trigger will create new informational link for new spouse (if no marriage)
```

---

## Why DELETE Instead of UPDATE?

### Option A: UPDATE (mark as corrected)
```sql
UPDATE family_links_forward
SET notes = notes || ' [CORRECTED - entered in error]'
WHERE ...
```

**Problem:** Link still appears in family tree queries:
```sql
-- Family tree query
SELECT * FROM family_links_forward
WHERE person_id = 'john-doe'
  AND relationship_type = 'spouse'

-- Result: Shows Jane as spouse (with correction note)
-- ❌ Confusing! She was never actually his spouse
```

### Option B: DELETE ✅
```sql
DELETE FROM family_links_forward
WHERE ...
```

**Benefit:** Link completely removed from family tree:
```sql
-- Family tree query
SELECT * FROM family_links_forward
WHERE person_id = 'john-doe'
  AND relationship_type = 'spouse'

-- Result: No row
-- ✅ Correct! Jane was never his spouse (clerical error)
```

---

## Audit Trail Preserved

**Question:** Don't we lose history if we DELETE?

**Answer:** No! Audit trail preserved in `event_participant`:

```sql
-- Query correction history
SELECT * FROM event_participant
WHERE event_id = death-event
  AND role = 'informant'
ORDER BY created_at DESC

Results:
1. ep-2 (active)   - Current: Jane as CHILD ✅
2. ep-1 (inactive) - Previous: Jane as SPOUSE (corrected) ✅
```

**Logs show:**
```
event_participant:
- Old: { person: jane, informantType: 'SPOUSE', status: 'inactive', ended_at: '2024-01-15' }
- New: { person: jane, informantType: 'CHILD', status: 'active' }

event.remarks:
"CORRECTION: UPDATE_INFORMANT - Changed from SPOUSE to CHILD (clerical error)"
```

---

## Complete Flow Example

### Step 1: Death Created (with mistake)
```
POST /death/create
Input: Informant = Jane (marked as SPOUSE)

Database:
  event_participant:
    - { person: jane, role: 'informant', informantType: 'SPOUSE', status: 'active' }

  family_links_forward:
    - { person: jane, related: john, type: 'spouse', source: 'death_registration',
        end_date: '2024-01-15' }

Family Tree: Shows Jane as spouse ❌
```

### Step 2: Correction Applied
```
POST /death/correction
{
  "action": "UPDATE_INFORMANT",
  "informantData": { "personId": "jane-id", "relationship": "CHILD" }
}

Database Changes:
  event_participant:
    - OLD: { status: 'inactive', ended_at: '2024-01-15' }
    - NEW: { person: jane, role: 'informant', informantType: 'OTHER',
             relationship: 'CHILD', status: 'active' }

  family_links_forward:
    - DELETE (link removed entirely)

Response:
{
  "success": true,
  "action": "UPDATE_INFORMANT",
  "linkAction": "deleted_erroneous_spouse_link"
}

Family Tree: Jane no longer shown as spouse ✅
```

---

## Comparison: DELETE vs UPDATE/CLOSE

### Scenario: Informant mistakenly marked as spouse

| Approach | Family Tree Result | Audit Trail | Correctness |
|----------|-------------------|-------------|-------------|
| **UPDATE (old)** | ❌ Still shows spouse link | ✅ Preserved | ❌ Wrong (shows erroneous data) |
| **CLOSE (tried)** | ❌ Still shows spouse link | ✅ Preserved | ❌ Wrong + didn't work (end_date already set) |
| **DELETE (new)** | ✅ No spouse link | ✅ Preserved in event_participant | ✅ Correct (data never should have existed) |

---

## Files Changed

### correction.ts

1. **handleUpdateInformant** (lines 208-224)
   - Changed: `UPDATE ... SET end_date` → `DELETE`
   - linkAction: `'deleted_erroneous_spouse_link'`

2. **handleRemoveInformantSpouse** (lines 281-301)
   - Changed: `UPDATE ... SET end_date` → `DELETE`
   - linkAction: `'deleted_erroneous_spouse_link'` or `'no_link_found'`

3. **handleReplaceInformantSpouse** (lines 344-351)
   - Changed: `UPDATE ... SET end_date` → `DELETE`
   - Trigger will create new link for replacement spouse (if no marriage)

---

## Testing Checklist

- [ ] Create death with spouse informant (no marriage) → Link created
- [ ] Correct to non-spouse relationship → Link deleted ✅
- [ ] Family tree query → No spouse link shown ✅
- [ ] Event participant history → Shows correction ✅
- [ ] Create death with spouse informant → Correct to different spouse → Old link deleted, new link created ✅
- [ ] REMOVE_INFORMANT_SPOUSE → Link deleted ✅

---

## Summary

✅ **Fixed:** Informational spouse links now **deleted** when correcting clerical errors

✅ **Benefit:** Family tree accurately reflects corrected data (no ghost relationships)

✅ **Preserved:** Audit trail maintained in event_participant history

✅ **Philosophy:** Data entered in error should be removed, not just marked closed
