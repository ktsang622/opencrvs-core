# Toppan Packages Overview

## Overview

Custom packages added to OpenCRVS for Toppan/Antigua deployment. These packages provide person database synchronization, certificate generation, family tree visualization, and other custom functionality.

---

## Package Summary

| Package | Port | Description | Technology |
|---------|------|-------------|------------|
| `toppan` | 7070 | Webhook handler, DB sync | Node.js/Express |
| `toppan-service` | 7070 | Person search, family tree API | Node.js/Express |
| `toppan-certificate` | 3890 | Certificate generation | .NET Core |
| `toppan-db` | - | Database schema/migrations | PostgreSQL |
| `toppan-common` | - | Shared types/utilities | TypeScript |
| `toppan-integrations` | - | External service integrations | Node.js |
| `toppan-ui` | - | Custom UI components | React |

---

## packages/toppan

### Purpose
Main webhook handler that receives events from OpenCRVS and syncs data to the Toppan PostgreSQL database.

### Structure
```
packages/toppan/
├── src/
│   ├── index.ts                    # Express server
│   ├── database.ts                 # PostgreSQL client
│   ├── person-db-sync/
│   │   ├── birth/
│   │   │   ├── create.ts          # Birth registration handler
│   │   │   ├── correction.ts      # Birth correction handler
│   │   │   └── delete.ts          # Birth deletion handler
│   │   ├── death/
│   │   │   ├── create.ts          # Death registration handler
│   │   │   ├── correction.ts      # Death correction handler
│   │   │   └── delete.ts          # Death deletion handler
│   │   ├── retry.ts               # Failed sync retry logic
│   │   └── routes.ts              # Webhook endpoints
│   ├── run-migrations.ts          # Migration runner
│   └── simple-migrations.ts       # Migration utilities
├── prod.env
├── package.json
└── tsconfig.json
```

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/db-sync` | Main webhook endpoint for registration events |
| POST | `/db-sync/retry` | Retry failed syncs |
| GET | `/health` | Health check |

### Key Files

**database.ts** - PostgreSQL connection and queries:
```typescript
export async function insertPerson(person: PersonData) {
  await pool.query(`
    INSERT INTO persons (id, first_name, family_name, dob, gender, ...)
    VALUES ($1, $2, $3, $4, $5, ...)
  `, [person.id, ...])
}

export async function linkFamilyMembers(childId: string, motherId: string, fatherId: string) {
  await pool.query(`
    INSERT INTO family_links (person_id, related_person_id, relationship_type)
    VALUES ($1, $2, 'mother'), ($1, $3, 'father')
  `, [childId, motherId, fatherId])
}
```

**birth/create.ts** - Birth registration webhook handler:
```typescript
export async function handleBirthCreate(payload: WebhookPayload) {
  // Extract child, mother, father from FHIR bundle
  const { child, mother, father } = extractPersons(payload)

  // Insert persons
  await insertPerson(child)
  if (mother) await insertPerson(mother)
  if (father) await insertPerson(father)

  // Create family links
  await linkFamilyMembers(child.id, mother?.id, father?.id)

  // Index in OpenSearch
  await indexPerson(child)
}
```

---

## packages/toppan-service

### Purpose
REST API for person search, family tree operations, and event queries. Uses OpenSearch for fast person lookup.

### Structure
```
packages/toppan-service/
├── src/
│   ├── index.ts                   # Express server
│   ├── server.ts                  # Server config
│   ├── environment.ts             # Environment variables
│   ├── config/
│   │   └── index.ts              # Configuration
│   └── features/
│       ├── search/
│       │   ├── opensearch.ts     # OpenSearch client
│       │   ├── indexer.ts        # Index management
│       │   └── queries.ts        # Search queries
│       ├── person/
│       │   └── routes.ts         # Person endpoints
│       ├── tree/
│       │   └── routes.ts         # Family tree endpoints
│       └── events/
│           └── routes.ts         # Event endpoints
├── package.json
└── tsconfig.json
```

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/person-search` | Search persons (basic) |
| POST | `/person-search/detailed` | Search persons (detailed) |
| GET | `/person/{id}/events` | Get person's events |
| GET | `/tree/init/{id}` | Initialize family tree |
| POST | `/tree/expand` | Expand tree node |
| GET | `/event/{id}/participants` | Get event participants |

---

## packages/toppan-certificate

### Purpose
.NET Core service for generating PDF certificates with QR codes and digital seals.

### Structure
```
packages/toppan-certificate/
├── src/
│   ├── CertificateService.Api/
│   │   ├── Controllers/
│   │   │   └── CertificateController.cs
│   │   ├── Program.cs
│   │   ├── Startup.cs
│   │   └── appsettings.json
│   └── CertificateService.Core/
│       ├── Services/
│       │   ├── CertificateGenerator.cs
│       │   ├── QRCodeGenerator.cs
│       │   └── DigitalSealService.cs
│       ├── Models/
│       └── Templates/
├── Dockerfile
└── package.json
```

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/certificate/generate` | Generate certificate PDF |
| GET | `/api/certificate/verify/{id}` | Verify certificate QR code |
| GET | `/api/templates` | List available templates |

---

## packages/toppan-db

### Purpose
PostgreSQL database schema, migrations, and seed data.

### Structure
```
packages/toppan-db/
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_family_links.sql
│   ├── 003_death_fields.sql
│   └── ...
├── seeds/
│   └── initial_data.sql
├── schema/
│   └── complete.sql
└── package.json
```

### Key Tables

```sql
-- persons: Core person data
CREATE TABLE persons (
  id UUID PRIMARY KEY,
  first_name VARCHAR(100),
  family_name VARCHAR(100),
  date_of_birth DATE,
  gender VARCHAR(10),
  national_id VARCHAR(50),
  registration_number VARCHAR(50),
  is_deceased BOOLEAN DEFAULT FALSE,
  death_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- family_links: Relationships between persons
CREATE TABLE family_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID REFERENCES persons(id),
  related_person_id UUID REFERENCES persons(id),
  relationship_type VARCHAR(20), -- 'mother', 'father', 'spouse', 'child'
  created_at TIMESTAMP DEFAULT NOW()
);

-- sync_queue: Failed sync retry queue
CREATE TABLE sync_queue (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50),
  payload JSONB,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## packages/toppan-common

### Purpose
Shared TypeScript types and utility functions.

### Structure
```
packages/toppan-common/
├── src/
│   ├── types/
│   │   ├── person.ts
│   │   ├── event.ts
│   │   └── family.ts
│   └── utils/
│       ├── fhir.ts           # FHIR data extraction
│       ├── validation.ts     # Input validation
│       └── date.ts           # Date utilities
└── package.json
```

---

## packages/toppan-integrations

### Purpose
Integrations with external services (future use).

### Structure
```
packages/toppan-integrations/
├── src/
│   └── index.ts
└── package.json
```

---

## packages/toppan-ui

### Purpose
Custom React UI components for Toppan features.

### Structure
```
packages/toppan-ui/
├── src/
│   ├── components/
│   │   └── FamilyTree/
│   └── index.ts
└── package.json
```

---

## Docker Configuration

### docker-compose.dev-deps.yml (additions)

```yaml
services:
  toppan-db:
    image: postgres:14
    ports:
      - "5433:5432"
    environment:
      POSTGRES_DB: toppan
      POSTGRES_USER: toppan
      POSTGRES_PASSWORD: toppan
    volumes:
      - toppan-db-data:/var/lib/postgresql/data

  opensearch:
    image: opensearchproject/opensearch:2.11.0
    ports:
      - "9200:9200"
    environment:
      - discovery.type=single-node
      - DISABLE_SECURITY_PLUGIN=true
```

### docker-compose.yml (additions)

```yaml
services:
  toppan:
    build:
      context: ./packages/toppan
    ports:
      - "7070:7070"
    environment:
      - DATABASE_URL=postgresql://toppan:toppan@toppan-db:5432/toppan
      - OPENSEARCH_URL=http://opensearch:9200

  certificate-service:
    build:
      context: ./packages/toppan-certificate
    ports:
      - "3890:3890"
```

---

## Migration Steps

### 1. Copy all packages

```bash
cp -r packages/toppan <target>/packages/
cp -r packages/toppan-service <target>/packages/
cp -r packages/toppan-certificate <target>/packages/
cp -r packages/toppan-db <target>/packages/
cp -r packages/toppan-common <target>/packages/
cp -r packages/toppan-integrations <target>/packages/
cp -r packages/toppan-ui <target>/packages/
```

### 2. Add to workspace

```json
// package.json (root)
{
  "workspaces": [
    "packages/*"
  ]
}
```

### 3. Apply docker-compose changes

```bash
git diff -- docker-compose*.yml
```

### 4. Set up database

```bash
# Start PostgreSQL
docker-compose up -d toppan-db

# Run migrations
cd packages/toppan-db && npm run migrate
```

### 5. Start services

```bash
# Start all Toppan services
docker-compose up -d toppan toppan-service certificate-service
```

---

## Dependencies Between Packages

```
toppan-common ◀─────────────────────────────┐
      │                                      │
      ▼                                      │
toppan-db ◀───── toppan ◀───── toppan-service
                   │
                   ▼
           toppan-certificate
```

---

## Environment Variables

```env
# toppan package
DATABASE_URL=postgresql://toppan:toppan@localhost:5433/toppan
OPENSEARCH_URL=http://localhost:9200

# toppan-service package
TOPPAN_DB_URL=postgresql://toppan:toppan@localhost:5433/toppan
OPENSEARCH_URL=http://localhost:9200

# toppan-certificate package
ASPNETCORE_ENVIRONMENT=Development
SIGNING_KEY_PATH=/keys/signing.key
```
