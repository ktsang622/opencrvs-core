# Death Spouse Correction Design

## Philosophy

**Spouse in death form is INFORMATIONAL ONLY** - it's administrative data for the death certificate, not a legal family relationship.

### Key Principles

1. **Marriage creates legal relationship** (solid line) → `source='marriage_registration'`
2. **Death form creates informational note** (dotted line) → `source='death_registration'`
3. **Marriage takes precedence** - If marriage exists, don't create informational link
4. **Person data updates** - Should go through person API, not death correction

## Correction Actions

### 1. ADD_SPOUSE_INFO
**When to use:** Registrar forgot to add spouse in original death form

**Behavior:**
```typescript
// 1. Check if deceased has marriage spouse
const marriageSpouse = await pool.query(`
  SELECT * FROM family_links_forward
  WHERE (person_id = $1 OR related_person_id = $1)
    AND relationship_type = 'spouse'
    AND source = 'marriage_registration'
    AND end_date IS NULL  -- Still married at death
`, [deceasedPersonId])

if (marriageSpouse.rows.length > 0) {
  // Marriage exists - no need for informational link
  return {
    status: 'noop',
    message: 'Deceased has marriage record, spouse already linked via marriage event'
  }
}

// 2. No marriage found - create informational link
await insertEventParticipant({
  role: 'spouse',
  is_informational: true,
  // ... trigger will create family_links_forward
})
```

**Result:** Dotted line in family tree (only if no marriage)

### 2. REMOVE_SPOUSE_INFO
**When to use:** Spouse was incorrectly added (e.g., deceased was single)

**Behavior:**
```typescript
// Only remove informational links from death registration
// NEVER touch marriage links!
await pool.query(`
  UPDATE family_links_forward
  SET end_date = $1,
      notes = COALESCE(notes, '') || ' [Removed via correction]'
  WHERE source_event_id = $2
    AND relationship_type = 'spouse'
    AND source = 'death_registration'  -- ← Key: only death-sourced
    AND end_date IS NULL
`, [now, deathEventId])

await deactivateEventParticipant(spouseParticipantId, now, 'REMOVE_SPOUSE_INFO')
```

**Result:** Removes dotted line only, marriage solid line untouched

### 3. REPLACE_SPOUSE_INFO
**When to use:** Wrong person selected from PersonPicker (e.g., picked ex-spouse instead of current spouse)

**Behavior:**
```typescript
// 1. Check if marriage spouse exists
const marriageSpouse = await getMarriageSpouse(deceasedPersonId)
if (marriageSpouse) {
  return {
    error: 'Cannot replace informational spouse - deceased has marriage record',
    marriageSpouseId: marriageSpouse.id
  }
}

// 2. Close old informational link
await closeInformationalSpouseLink(oldSpouseId)

// 3. Create new informational link
await createInformationalSpouseLink(newSpouseId)
```

**Result:** Replaces dotted line (fails if marriage exists)

### 4. ~~UPDATE_SPOUSE_SAME~~ ❌ REMOVED
**Why removed:** Person data (name, national_id, DOB) should be updated via Person API, not event correction.

**Alternative approach:**
```bash
# Update person details directly
PUT /v1/person/{spouse_person_id}
{
  "national_id": "new-value",
  "given_name": "corrected-name"
}
```

## Edge Cases

### Case 1: Deceased had marriage, then divorced, then remarried
```
Timeline:
- 2010: Marriage to Spouse A (solid line, closed at divorce)
- 2015: Divorce (closes marriage link)
- 2018: Marriage to Spouse B (solid line, active)
- 2023: Death (Spouse B listed in death form)
```

**Result:**
- Spouse A: Solid line (closed at 2015)
- Spouse B: Solid line (active, auto-closed at death)
- Death form spouse: **No additional link** (marriage to B already exists)

### Case 2: Deceased never married but had common-law spouse
```
Timeline:
- No marriage event
- Death form lists common-law spouse
```

**Result:**
- Death spouse: Dotted line (informational, closed at death)
- Notes: "Informational from death registration - not legal marriage"

### Case 3: Marriage exists but different person listed in death form
```
Timeline:
- Marriage to Spouse A (solid line)
- Death form lists Spouse B (???)
```

**Current problem:** Creates both solid + dotted lines (confusing!)

**Recommended behavior:**
```typescript
if (marriageSpouse && deathSpouse && marriageSpouse.id !== deathSpouse.id) {
  // Warn registrar but allow override
  return {
    warning: 'Death form spouse differs from marriage record',
    marriageSpouse: { id: 'A', name: 'Spouse A' },
    deathSpouse: { id: 'B', name: 'Spouse B' },
    action: 'Marriage record takes precedence - no informational link created'
  }
}
```

## Database Queries for Implementation

### Check if Marriage Spouse Exists
```sql
-- Returns spouse from marriage event (if exists and was active at death)
SELECT flf.related_person_id AS spouse_id,
       p.given_name || ' ' || p.family_name AS spouse_name,
       flf.source,
       flf.end_date
FROM family_links_forward flf
JOIN person p ON p.id = flf.related_person_id
WHERE flf.person_id = $1  -- deceased person
  AND flf.relationship_type = 'spouse'
  AND flf.source = 'marriage_registration'
ORDER BY flf.start_date DESC
LIMIT 1;
```

### Safe Informational Link Creation
```typescript
async function createInformationalSpouseIfNoMarriage(
  deceasedPersonId: string,
  spousePersonId: string,
  deathEventId: string
) {
  // Check marriage first
  const marriage = await checkMarriageSpouse(deceasedPersonId)

  if (marriage) {
    console.log(`ℹ️ Skipping informational spouse - marriage exists: ${marriage.spouse_name}`)
    return {
      created: false,
      reason: 'marriage_exists',
      marriageSpouse: marriage
    }
  }

  // Safe to create informational link
  await insertEventParticipant({
    role: 'spouse',
    person_id: spousePersonId,
    event_id: deathEventId,
    is_informational: true
  })

  return { created: true, type: 'informational' }
}
```

## Family Tree Display Rules

```typescript
// Family tree rendering logic
function getSpouseDisplay(person) {
  const spouses = person.relationships
    .filter(r => r.type === 'spouse')
    .sort((a, b) => {
      // Priority: marriage > informational
      if (a.source === 'marriage_registration') return -1
      if (b.source === 'marriage_registration') return 1
      return 0
    })

  return spouses.map(s => ({
    id: s.spouse_id,
    name: s.spouse_name,
    lineStyle: s.source === 'marriage_registration' ? 'solid' : 'dotted',
    label: s.source === 'marriage_registration' ? 'Spouse (married)' : 'Spouse (informational)',
    closed: s.end_date !== null
  }))
}
```

## Migration Path

### Phase 1: Update Correction Handler (Current)
- Keep 4 actions for now
- Add marriage check to prevent duplicates

### Phase 2: Remove UPDATE_SPOUSE_SAME
- Remove from death correction
- Create separate Person Update API

### Phase 3: Rename Actions (Breaking Change)
- `ADD_SPOUSE` → `ADD_SPOUSE_INFO`
- `REMOVE_SPOUSE` → `REMOVE_SPOUSE_INFO`
- `REPLACE_SPOUSE` → `REPLACE_SPOUSE_INFO`

## Summary

✅ **DO:**
- Create informational spouse link ONLY if no marriage exists
- Allow removal of informational links (never touch marriage)
- Check for marriage before creating informational relationship

❌ **DON'T:**
- Create duplicate spouse relationships (marriage + informational for same person)
- Modify person data via event correction
- Allow replacing marriage-based relationships

🎯 **Goal:** Death form spouse is **supplementary information**, not a legal relationship declaration.
