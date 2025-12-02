# OpenSearch Person Search Integration

## Overview

Custom person search implementation using OpenSearch (separate from OpenCRVS search service). This provides fast, fuzzy search capabilities for the Toppan person database, enabling the PersonPicker and Family Tree features.

## Feature Summary

- **Purpose:** Fast person search with fuzzy matching
- **Technology:** OpenSearch (not OpenCRVS search service)
- **Index:** `person_read` / `person_write` aliases
- **Integration:** Gateway proxy → Toppan Service → OpenSearch

---

## Commits

| Commit | Description |
|--------|-------------|
| `0c74d6b3e8` | Add person search function in opencrvs, gateway, client |
| `b614aa89c1` | feat: migrate OpenSearch indexing to toppan-service |
| `ecd5524193` | refactor toppan-service and family-tree |
| `13c6c31b91` | Add comprehensive migration comments to all Toppan customizations |

---

## Architecture

```
┌─────────────────┐     ┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Client      │────▶│    Gateway    │────▶│  Toppan Service │────▶│   OpenSearch    │
│ (PersonPicker)  │     │ /person-search│     │   (Node.js)     │     │    Cluster      │
└─────────────────┘     └───────────────┘     └─────────────────┘     └─────────────────┘
                                                      │
                                                      ▼
                                              ┌─────────────────┐
                                              │   PostgreSQL    │
                                              │   (Toppan DB)   │
                                              │   - Source of   │
                                              │     truth       │
                                              └─────────────────┘
```

---

## Gateway Endpoints

### POST /person-search

Basic person search with minimal response.

**Request:**
```json
{
  "query": "Jane Doe",
  "filters": {
    "gender": "female"
  },
  "size": 10
}
```

**Response:**
```json
{
  "hits": [
    {
      "uuid": "person-uuid",
      "name": "Jane Doe",
      "nationalId": "1234567890",
      "dateOfBirth": "1990-05-15",
      "score": 12.5
    }
  ],
  "total": 1
}
```

### POST /person-search/detailed

Detailed person search with full data.

**Response includes:**
- `given_name`, `family_name`
- `gender`
- `place_of_birth`
- `identifiers` array (all ID types)

### GET /person/{personId}/events

Get all events (birth, death) for a person.

### GET /event/{eventId}/participants

Get all participants in an event.

### GET /tree/init/{personId}

Initialize family tree from a person.

### POST /tree/expand

Expand a family tree node.

### GET /event/{eventId}/person

Get person ID from event ID and role.

---

## Files Changed

### packages/gateway

| File | Path | Description |
|------|------|-------------|
| `handler.ts` | `src/features/person-search/handler.ts` | Search handlers |
| `index.ts` | `src/features/person-search/index.ts` | Route definitions |
| `constants.ts` | `src/constants.ts` | TOPPAN_SERVICE_URL constant |
| `routes.ts` | `src/config/routes.ts` | Register personSearchRoutes |

### packages/toppan-service

| File | Description |
|------|-------------|
| `src/features/search/opensearch.ts` | OpenSearch client setup |
| `src/features/search/indexer.ts` | Index management |
| `src/features/search/queries.ts` | Search query builders |
| `src/features/person/routes.ts` | Person API routes |

---

## OpenSearch Index

### Index Configuration

```json
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "name_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding"]
        }
      }
    }
  },
  "aliases": {
    "person_read": {},
    "person_write": {}
  }
}
```

### Document Mapping

```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "given_name": {
        "type": "text",
        "analyzer": "name_analyzer",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "family_name": {
        "type": "text",
        "analyzer": "name_analyzer",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "full_name": { "type": "text", "analyzer": "name_analyzer" },
      "dob": { "type": "date" },
      "gender": { "type": "keyword" },
      "place_of_birth": { "type": "text" },
      "is_deceased": { "type": "boolean" },
      "identifiers": {
        "type": "nested",
        "properties": {
          "type": { "type": "keyword" },
          "value": { "type": "keyword" }
        }
      }
    }
  }
}
```

---

## Sync Process

### PostgreSQL → OpenSearch

```typescript
// toppan-service/src/features/search/indexer.ts

async function syncPersonToIndex(person: Person) {
  const document = {
    id: person.id,
    given_name: person.first_name,
    family_name: person.family_name,
    full_name: `${person.first_name} ${person.family_name}`,
    dob: person.date_of_birth,
    gender: person.gender,
    is_deceased: person.is_deceased,
    identifiers: [
      { type: 'NATIONAL_ID', value: person.national_id },
      { type: 'BIRTH_REGISTRATION', value: person.registration_number }
    ]
  }

  await opensearchClient.index({
    index: 'person_write',
    id: person.id,
    body: document
  })
}
```

### Trigger Sync on Registration

```typescript
// Called from webhook handler after birth/death registration
async function onRegistrationComplete(event: RegistrationEvent) {
  const persons = extractPersons(event)
  for (const person of persons) {
    await syncPersonToIndex(person)
  }
}
```

---

## Search Query Builder

```typescript
// toppan-service/src/features/search/queries.ts

function buildPersonSearchQuery(params: SearchParams) {
  const { query, filters, size = 10 } = params

  const must: any[] = []
  const filter: any[] = []

  // Full text search on name
  if (query) {
    must.push({
      multi_match: {
        query,
        fields: ['full_name^3', 'given_name^2', 'family_name^2'],
        fuzziness: 'AUTO',
        prefix_length: 1
      }
    })
  }

  // Gender filter
  if (filters?.gender) {
    filter.push({ term: { gender: filters.gender } })
  }

  // Exclude deceased if specified
  if (filters?.excludeDeceased) {
    filter.push({ term: { is_deceased: false } })
  }

  return {
    query: {
      bool: { must, filter }
    },
    size
  }
}
```

---

## Environment Variables

```env
# Toppan Service
TOPPAN_SERVICE_URL=http://localhost:7070

# OpenSearch (in toppan-service)
OPENSEARCH_URL=http://localhost:9200
OPENSEARCH_USERNAME=admin
OPENSEARCH_PASSWORD=admin
```

---

## Migration Steps

### 1. Copy gateway person-search

```bash
cp -r packages/gateway/src/features/person-search <target>/packages/gateway/src/features/
```

### 2. Add TOPPAN_SERVICE_URL constant

```typescript
// packages/gateway/src/constants.ts
export const TOPPAN_SERVICE_URL = process.env.TOPPAN_SERVICE_URL || 'http://localhost:7070'
```

### 3. Register routes

```typescript
// packages/gateway/src/config/routes.ts
import { personSearchRoutes } from '@gateway/features/person-search'

// In route registration
server.route(personSearchRoutes)
```

### 4. Deploy toppan-service

```bash
cp -r packages/toppan-service <target>/packages/
```

### 5. Create OpenSearch index

```bash
curl -X PUT "localhost:9200/persons" -H 'Content-Type: application/json' -d @index-config.json
```

### 6. Initial data sync

```bash
# Run full sync from PostgreSQL to OpenSearch
npm run sync:full
```

---

## Testing

1. **Start services:**
   ```bash
   docker-compose up -d opensearch
   cd packages/toppan-service && npm run dev
   ```

2. **Create index and sync:**
   ```bash
   npm run opensearch:init
   npm run sync:persons
   ```

3. **Test search:**
   ```bash
   curl -X POST http://localhost:7070/person-search \
     -H 'Content-Type: application/json' \
     -d '{"query": "Jane"}'
   ```

4. **Test via gateway:**
   ```bash
   curl -X POST http://localhost:7070/person-search \
     -H 'Content-Type: application/json' \
     -d '{"query": "Jane", "size": 5}'
   ```

---

## Differences from OpenCRVS Search

| Aspect | OpenCRVS Search | Toppan Person Search |
|--------|-----------------|----------------------|
| Data Source | FHIR records | PostgreSQL (Toppan DB) |
| Index | Registration records | Persons only |
| Purpose | Find registrations | Find persons for linking |
| Scope | Full system search | Person picker only |
| Service | search package | toppan-service |
