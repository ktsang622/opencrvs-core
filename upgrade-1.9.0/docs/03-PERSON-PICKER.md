# Person Picker / Family Tree Integration

## Overview

The Person Picker is a custom form field that allows users to search for existing persons in the Toppan database and link them to registration records. This enables family tree relationships and prevents duplicate person entries.

## Feature Summary

- **Purpose:** Search and select existing persons from Toppan DB
- **Use Cases:** Link mother/father in birth registration, link deceased in death registration
- **Integration:** PostgreSQL (Toppan DB) + OpenSearch indexing
- **Components:** PersonPicker button, PersonInfoCard display

---

## Commits

| Commit | Description |
|--------|-------------|
| `470efdc417` | refactor: PersonSearchButton to PersonPicker |
| `b614aa89c1` | feat: migrate OpenSearch indexing to toppan-service |
| `143af67847` | Implement death registration with PersonPicker field population |
| `5591854c81` | Add visual indicator for deceased persons in PersonPicker |
| `bea4cbda99` | Add validation to prevent duplicate person selection |
| `694decd9b0` | Fix NONE identifier display in PersonInfoCard |
| `0c74d6b3e8` | Add person search function in opencrvs, gateway, client |

---

## Architecture

```
┌─────────────────┐     ┌───────────────┐     ┌─────────────────┐
│  PersonPicker   │────▶│    Gateway    │────▶│  Toppan Service │
│   (Client)      │     │  /person-search│     │   (Node.js)     │
└─────────────────┘     └───────────────┘     └─────────────────┘
                                                      │
                              ┌───────────────────────┼───────────────────────┐
                              ▼                       ▼                       ▼
                       ┌─────────────┐        ┌─────────────┐         ┌─────────────┐
                       │ OpenSearch  │        │ PostgreSQL  │         │   Family    │
                       │  (Index)    │        │ (Toppan DB) │         │    Tree     │
                       └─────────────┘        └─────────────┘         └─────────────┘
```

---

## Components

### PersonPicker.tsx

Main component for person search:

```typescript
interface PersonPickerProps {
  fieldName: string
  onSelect: (person: Person) => void
  excludeIds?: string[]  // Prevent duplicate selection
  allowDeceased?: boolean
}

// Usage in form
<PersonPicker
  fieldName="motherId"
  onSelect={handleMotherSelect}
  excludeIds={[fatherId]}
/>
```

### PersonInfoCard.tsx

Display component for selected person:

```typescript
interface PersonInfoCardProps {
  person: Person
  onUnlink?: () => void
  showDeceasedIndicator?: boolean
}

// Displays:
// - Full name
// - Date of birth
// - Gender
// - National ID
// - Deceased status (if applicable)
```

---

## Search API

### POST /person-search/search

**Request:**
```json
{
  "query": "Jane Doe",
  "filters": {
    "gender": "female",
    "minBirthDate": "1980-01-01",
    "maxBirthDate": "2000-12-31"
  },
  "excludeIds": ["uuid-1", "uuid-2"],
  "limit": 10
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "person-uuid",
      "firstName": "Jane",
      "familyName": "Doe",
      "dateOfBirth": "1990-05-15",
      "gender": "female",
      "nationalId": "1234567890",
      "isDeceased": false,
      "registrationNumber": "BRN-2020-00001"
    }
  ],
  "total": 1
}
```

---

## Files Changed

### packages/client

| File | Description |
|------|-------------|
| `src/components/form/PersonPicker.tsx` | New - Main picker component |
| `src/components/form/PersonInfoCard.tsx` | New - Display component |
| `src/components/form/FormFieldGenerator.tsx` | Modified - Add PERSON_PICKER case |
| `src/forms/index.ts` | Modified - Export new types |

### packages/gateway

| File | Description |
|------|-------------|
| `src/features/person-search/handler.ts` | New - Search API handler |
| `src/features/person-search/index.ts` | New - Route definitions |
| `src/config/routes.ts` | Modified - Register routes |

### packages/toppan-service

| File | Description |
|------|-------------|
| `src/search/opensearch.ts` | Person indexing |
| `src/search/queries.ts` | Search queries |
| `src/sync/indexer.ts` | Index sync from PostgreSQL |

---

## Database Schema

### persons table (Toppan DB)

```sql
CREATE TABLE persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  family_name VARCHAR(100) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender VARCHAR(10) NOT NULL,
  national_id VARCHAR(50),
  registration_number VARCHAR(50),
  is_deceased BOOLEAN DEFAULT FALSE,
  death_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### family_links table

```sql
CREATE TABLE family_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID REFERENCES persons(id),
  related_person_id UUID REFERENCES persons(id),
  relationship_type VARCHAR(20) NOT NULL, -- 'mother', 'father', 'spouse', 'child'
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## OpenSearch Index

### Person Index Mapping

```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "firstName": { "type": "text" },
      "familyName": { "type": "text" },
      "fullName": { "type": "text" },
      "dateOfBirth": { "type": "date" },
      "gender": { "type": "keyword" },
      "nationalId": { "type": "keyword" },
      "isDeceased": { "type": "boolean" }
    }
  }
}
```

---

## Form Configuration

### Add PersonPicker to birth form

```typescript
{
  name: 'motherPersonPicker',
  type: 'PERSON_PICKER',
  label: {
    defaultMessage: 'Search for mother',
    id: 'form.field.label.searchMother'
  },
  options: {
    relationshipType: 'mother',
    allowDeceased: false
  },
  conditionals: [
    {
      action: 'hide',
      expression: 'values.motherId !== undefined'
    }
  ]
}
```

---

## Integration with Webhooks

When a person is selected, their external ID is passed to webhooks:

```typescript
// Webhook payload includes
{
  "mother": {
    "externalId": "toppan-person-uuid",
    "firstName": "Jane",
    "familyName": "Doe"
  }
}
```

---

## Duplicate Prevention

```typescript
// In FormFieldGenerator or parent component
const selectedPersonIds = [
  values.motherId,
  values.fatherId
].filter(Boolean)

// Pass to PersonPicker
<PersonPicker
  excludeIds={selectedPersonIds}
  onSelect={handleSelect}
/>
```

---

## Migration Steps

### 1. Copy client components

```bash
cp packages/client/src/components/form/PersonPicker.tsx <target>
cp packages/client/src/components/form/PersonInfoCard.tsx <target>
```

### 2. Copy gateway handlers

```bash
cp -r packages/gateway/src/features/person-search <target>
```

### 3. Apply FormFieldGenerator changes

```bash
git diff 470efdc417~1..470efdc417 -- packages/client/src/components/form/FormFieldGenerator.tsx
```

### 4. Set up OpenSearch index

```bash
# Create index
curl -X PUT "localhost:9200/persons" -H 'Content-Type: application/json' -d @index-mapping.json
```

### 5. Initial data sync

```bash
# Run indexer to populate from PostgreSQL
npm run sync:persons
```

---

## Testing

1. Ensure Toppan service is running
2. Ensure OpenSearch has person data indexed
3. Navigate to birth registration form
4. Click "Search for mother" button
5. Enter search term
6. Select a person from results
7. Verify PersonInfoCard displays correctly
8. Verify form fields are populated
