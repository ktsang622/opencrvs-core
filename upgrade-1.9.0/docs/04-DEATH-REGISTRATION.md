# Death Registration Enhancements

## Overview

Enhanced death registration system with support for person linking, spouse relationships, and informant architecture. Integrates with the Toppan person database to mark persons as deceased and maintain family relationships.

## Feature Summary

- **Purpose:** Death registration with person status updates
- **Features:**
  - Link deceased person from existing records
  - Link spouse relationships
  - Visual indicators for deceased persons
  - Informant details capture
  - Correction workflows

---

## Commits

| Commit | Description |
|--------|-------------|
| `1061f1cec5` | Implement death registration with informant architecture and correction workflows |
| `b5c6daba23` | Implement spouse linking in death handler |
| `5591854c81` | Add visual indicator for deceased persons in PersonPicker |
| `143af67847` | Implement death registration with person status update |
| `52f0785e75` | Update database triggers and views for modern family_links system |
| `0c71ed3c6a` | Add database migration for death spouse family link |

---

## Architecture

```
┌────────────────┐     ┌───────────────┐     ┌─────────────────┐
│   Client       │────▶│    Gateway    │────▶│     Webhook     │
│ (Death Form)   │     │               │     │   (Toppan)      │
└────────────────┘     └───────────────┘     └─────────────────┘
                                                     │
                              ┌──────────────────────┼──────────────────────┐
                              ▼                      ▼                      ▼
                       ┌─────────────┐       ┌─────────────┐        ┌─────────────┐
                       │   Update    │       │   Create    │        │   Update    │
                       │  Deceased   │       │   Family    │        │  OpenSearch │
                       │   Status    │       │    Link     │        │   Index     │
                       └─────────────┘       └─────────────┘        └─────────────┘
```

---

## Death Handler Flow

### 1. Death Registration Created

```typescript
async function handleDeathCreate(payload: WebhookPayload) {
  const { deceasedId, spouseId, deathDate } = extractDeathData(payload)

  // Mark person as deceased
  await db.query(`
    UPDATE persons
    SET is_deceased = true, death_date = $2
    WHERE id = $1
  `, [deceasedId, deathDate])

  // Create spouse family link if provided
  if (spouseId) {
    await db.query(`
      INSERT INTO family_links (person_id, related_person_id, relationship_type)
      VALUES ($1, $2, 'spouse')
    `, [deceasedId, spouseId])
  }

  // Update OpenSearch index
  await updatePersonIndex(deceasedId, { isDeceased: true })
}
```

### 2. Death Correction

```typescript
async function handleDeathCorrection(payload: WebhookPayload) {
  const { original, corrected } = payload

  // If deceased person changed
  if (original.deceasedId !== corrected.deceasedId) {
    // Unmark old person
    await unmarkDeceased(original.deceasedId)
    // Mark new person
    await markDeceased(corrected.deceasedId, corrected.deathDate)
  }

  // Update spouse link if changed
  if (original.spouseId !== corrected.spouseId) {
    await updateSpouseLink(corrected.deceasedId, corrected.spouseId)
  }
}
```

---

## Database Schema

### persons table updates

```sql
-- Add death-related columns
ALTER TABLE persons ADD COLUMN is_deceased BOOLEAN DEFAULT FALSE;
ALTER TABLE persons ADD COLUMN death_date DATE;
ALTER TABLE persons ADD COLUMN death_registration_number VARCHAR(50);
```

### family_links for spouse

```sql
-- Spouse relationship
INSERT INTO family_links (person_id, related_person_id, relationship_type)
VALUES
  ('deceased-uuid', 'spouse-uuid', 'spouse'),
  ('spouse-uuid', 'deceased-uuid', 'spouse');  -- Bidirectional
```

---

## Files Changed

### packages/toppan

| File | Description |
|------|-------------|
| `src/person-db-sync/death/create.ts` | Death creation handler |
| `src/person-db-sync/death/correction.ts` | Death correction handler |
| `src/person-db-sync/death/delete.ts` | Death deletion handler |

### packages/client

| File | Description |
|------|-------------|
| `src/components/form/PersonPicker.tsx` | Add deceased visual indicator |
| `src/components/form/PersonInfoCard.tsx` | Show deceased status |

### packages/gateway

| File | Description |
|------|-------------|
| `src/workflow/index.ts` | Route death events to handlers |

---

## Deceased Person Visual Indicator

In PersonPicker and PersonInfoCard:

```typescript
// PersonInfoCard.tsx
{person.isDeceased && (
  <DeceasedBadge>
    <WarningIcon />
    Deceased: {formatDate(person.deathDate)}
  </DeceasedBadge>
)}

// PersonPicker search results
{result.isDeceased && (
  <DeceasedLabel>Deceased</DeceasedLabel>
)}
```

---

## Informant Architecture

Death registration captures informant details:

```typescript
interface DeathInformant {
  relationship: 'spouse' | 'child' | 'parent' | 'other'
  firstName: string
  familyName: string
  contactNumber?: string
  address?: Address
}
```

### Form Fields

```typescript
// Death form informant section
{
  name: 'informantRelationship',
  type: 'SELECT',
  options: [
    { value: 'spouse', label: 'Spouse' },
    { value: 'child', label: 'Child' },
    { value: 'parent', label: 'Parent' },
    { value: 'other', label: 'Other' }
  ]
},
{
  name: 'informantFirstName',
  type: 'TEXT'
},
// ... other informant fields
```

---

## Webhook Payload Structure

### Death Registration

```json
{
  "event": "death",
  "action": "create",
  "data": {
    "registration": {
      "registrationNumber": "DRN-2024-00001",
      "registrationDate": "2024-01-15"
    },
    "deceased": {
      "externalId": "person-uuid",
      "firstName": "John",
      "familyName": "Doe",
      "dateOfDeath": "2024-01-10",
      "placeOfDeath": "Hospital",
      "causeOfDeath": "Natural causes"
    },
    "informant": {
      "relationship": "spouse",
      "firstName": "Jane",
      "familyName": "Doe"
    },
    "spouse": {
      "externalId": "spouse-uuid"
    }
  }
}
```

---

## Preventing Selection of Deceased

When `allowDeceased: false` in PersonPicker:

```typescript
// Filter out deceased persons
const filteredResults = results.filter(person => {
  if (!allowDeceased && person.isDeceased) {
    return false
  }
  return true
})
```

---

## Migration Steps

### 1. Database migrations

```sql
-- Run migration
ALTER TABLE persons ADD COLUMN is_deceased BOOLEAN DEFAULT FALSE;
ALTER TABLE persons ADD COLUMN death_date DATE;
```

### 2. Copy death handlers

```bash
cp packages/toppan/src/person-db-sync/death/*.ts <target>
```

### 3. Update workflow routing

```bash
git diff 1061f1cec5~1..1061f1cec5 -- packages/gateway/src/workflow/index.ts
```

### 4. Apply client changes

```bash
git diff 5591854c81~1..5591854c81 -- packages/client/src/components/form/
```

---

## Testing

1. Create a person via birth registration
2. Register death for that person
3. Verify:
   - Person marked as deceased in database
   - Person shows deceased indicator in search
   - Spouse link created if spouse provided
4. Test correction:
   - Change deceased person
   - Verify old person unmarked
   - Verify new person marked
5. Test prevention:
   - Try to select deceased person where not allowed
   - Verify they are filtered out
