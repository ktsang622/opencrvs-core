# Death Registration Error Handling Philosophy

## Core Principle: **Event-Driven Data Integrity**

> **The person database should ALWAYS reflect the current state of event participants, regardless of data quality issues.**

## Philosophy

### 1. **Events are Source of Truth**
- Event participant records define reality
- Person database is derived/synchronized from events
- Corrections update events → Person DB updates automatically

### 2. **Never Block Valid Operations**
- If event data is valid, database MUST update
- Data quality warnings = soft failures (logged, not blocking)
- Hard failures only for impossible states (missing required data, duplicate IDs)

### 3. **Warnings vs Errors**

| Type | When to Use | Behavior | Example |
|------|-------------|----------|---------|
| **Error** | Data integrity violation | Block transaction, rollback | Deceased = Spouse (same UUID) |
| **Warning** | Data quality issue | Allow transaction, add to remarks | Informant spouse ≠ marriage spouse |
| **Info** | Expected edge case | Allow transaction, log | No informational link needed (marriage exists) |

---

## Error Handling by Scenario

### ✅ **ALLOW with WARNING**

#### Scenario: Informant spouse differs from marriage record (Case 2)
```typescript
// ✅ CORRECT: Allow transaction, add warning
if (marriageSpouse && informantSpouse && marriageSpouse.id !== informantSpouse.id) {
  warnings.push(`Informant differs from marriage record: ${marriageSpouse.name}`)
  // Continue transaction...
  await insertEventParticipant(...)
  await upsertEvent({ remarks: `⚠️ WARNING: ${warnings.join(', ')}` })
}
```

**Why?**
- Event data is valid (informant was correctly recorded)
- Person DB should reflect what was entered
- Warning flags for later review/correction

#### Scenario: Changing informant from spouse to non-spouse
```typescript
// ✅ CORRECT: Allow change, close informational link automatically
if (currentInformantType === 'SPOUSE' && newInformantType !== 'SPOUSE') {
  await closeInformationalSpouseLink()
  linkAction = 'closed_informational_spouse_link'
  // Continue transaction, person DB updated
}
```

**Why?**
- Correction is valid (user wants to change relationship type)
- Database can handle cleanup (close link)
- Person DB reflects new informant state

---

### ❌ **BLOCK with ERROR**

#### Scenario: Deceased and spouse are same person
```typescript
// ✅ CORRECT: Block transaction
if (deceasedId === spouseId) {
  return h.response({
    error: 'Deceased and spouse cannot be the same person'
  }).code(400)
  // Transaction rolled back
}
```

**Why?**
- Logical impossibility (cannot be spouse to yourself)
- Database would enter invalid state
- Must reject at API level

#### Scenario: Missing required data
```typescript
// ✅ CORRECT: Block transaction
if (!deceased || !task || !compositionId) {
  return h.response({
    error: 'Missing required data'
  }).code(400)
}
```

**Why?**
- Cannot create valid event record
- Person DB cannot sync without event data

---

## Refactoring: Before vs After

### ❌ **BEFORE (Wrong Approach)**

```typescript
// BLOCKS valid correction if informational link exists
if (currentInformantType === 'SPOUSE' && newInformantType !== 'SPOUSE') {
  const linkExists = await checkInformationalLink()
  if (linkExists) {
    return h.response({
      error: 'Cannot change - link exists'
    }).code(400) // ❌ Blocks entire transaction
  }
}
```

**Problem:**
- User cannot correct mistake
- Person DB stuck in wrong state
- Requires manual database intervention

---

### ✅ **AFTER (Correct Approach)**

```typescript
// ALLOWS correction, handles cleanup automatically
if (currentInformantType === 'SPOUSE' && newInformantType !== 'SPOUSE') {
  const { rowCount } = await closeInformationalLink()
  if (rowCount > 0) {
    linkAction = 'closed_informational_spouse_link'
    console.log('✅ Closed link automatically')
  }
  // Continue transaction, person DB updated
}
```

**Benefits:**
- Correction succeeds
- Database cleanup automatic
- Person DB reflects corrected state
- User gets feedback on what happened

---

## Transaction Safety

### All corrections wrapped in transactions:

```typescript
await withTransaction(async (tx) => {
  await acquireEventAdvisoryLock(eventId, tx)  // Prevent concurrent edits

  // 1. Deactivate old participant
  await deactivateEventParticipant(oldId, now, reason, tx)

  // 2. Create new participant
  await insertEventParticipant(newParticipant, tx)

  // 3. Clean up related data (family links, etc.)
  await cleanupRelatedData(tx)

  // 4. Update event metadata
  await upsertEvent({ remarks: '...', last_update_at: now }, tx)
})

// ✅ If any step fails, entire transaction rolls back
// ✅ Person DB stays consistent
// ✅ No partial updates
```

---

## Response Format

### Success with Actions
```json
{
  "success": true,
  "action": "UPDATE_INFORMANT",
  "oldInformant": { "id": "...", "person_id": "...", "informantType": "SPOUSE" },
  "newInformant": { "id": "...", "person_id": "...", "informantType": "OTHER" },
  "linkAction": "closed_informational_spouse_link",
  "warnings": []  // Empty if no data quality issues
}
```

### Success with Warnings
```json
{
  "success": true,
  "action": "CREATE_DEATH_EVENT",
  "eventId": "...",
  "deceasedId": "...",
  "warnings": [
    {
      "type": "informant_mismatch",
      "message": "Informant claims spouse but differs from marriage record",
      "marriageSpouseId": "abc-123",
      "informantSpouseId": "xyz-789"
    }
  ]
}
```

### Hard Error (Transaction Blocked)
```json
{
  "error": "Deceased and spouse cannot be the same person",
  "details": {
    "deceasedCrvsId": "person-123",
    "spouseCrvsId": "person-123"
  }
}
```

---

## Summary

### ✅ **DO:**
- Allow corrections that update event participants
- Automatically clean up related data (family links)
- Add warnings for data quality issues
- Log actions taken (linkAction field)
- Keep person DB in sync with events

### ❌ **DON'T:**
- Block corrections due to data cleanup concerns
- Require manual intervention for valid operations
- Leave person DB in inconsistent state
- Return errors for fixable issues

### 🎯 **Goal:**
**Person database is always an accurate reflection of event participant state, with warnings for data quality review.**

---

## Real-World Example

**Scenario:** Death created with wrong informant (Case 2)

1. **Creation (with warning):**
   ```
   POST /events/death/create
   - Deceased: John Doe
   - Informant: Wrong Person (claims spouse)
   - Marriage exists: Jane Smith (actual spouse)

   Result: ✅ Created, ⚠️ Warning added to event.remarks
   Person DB: Updated with wrong informant (reflects reality)
   ```

2. **Correction (automatic cleanup):**
   ```
   POST /events/death/correction
   - Action: REPLACE_INFORMANT_SPOUSE
   - New informant: Jane Smith (correct spouse)

   Result: ✅ Corrected
   - Old informant deactivated
   - New informant created
   - No informational link (marriage exists)
   Person DB: Updated with correct informant
   ```

3. **Final State:**
   ```
   Event participants:
   - Subject: John Doe (deceased)
   - Informant: Jane Smith (spouse) ✅

   Family links:
   - John Doe ↔ Jane Smith (marriage, closed at death) ✅

   Person DB: ✅ Consistent with events
   Event remarks: History of correction
   ```

**Key:** Person DB updated at every step, reflecting event state.
