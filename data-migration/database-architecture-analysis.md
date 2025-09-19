# OpenCRVS Database Architecture Analysis for Migration

## Current Database Architecture Overview

OpenCRVS uses a **dual-database architecture** with clear separation of concerns:

### 1. **MongoDB (Primary Registration Storage)**
- **Database**: `opencrvs` (via FHIR/Hearth)
- **Purpose**: Primary vital registration storage using FHIR R4 standard
- **Key Collections**:
  - User management (Users, Systems, Audit logs)
  - FHIR resources (Patient, Task, Composition, Bundle)
  - Registration workflow state management
  - Document attachments and metadata

### 2. **PostgreSQL (Person Registry & Family Tree)**
- **Database**: `person_registry`
- **Purpose**: Normalized person data and family relationships
- **Key Tables**:
  - `person` - Individual person records with identifiers
  - `event` - Vital events linked to OpenCRVS UUIDs
  - `event_participant` - Person roles in events (father, mother, child, etc.)
  - `family_link` / `family_links_forward` - Family relationships
  - `sync_request` - Cross-system synchronization tracking

## Data Flow Architecture

```
Client Registration → Gateway → Workflow → MongoDB (FHIR) → Toppan Service → PostgreSQL
```

### Registration Creation Flow
1. **Client** submits birth/death/marriage registration via GraphQL
2. **Gateway** validates and routes to workflow service
3. **Workflow** creates FHIR Bundle and stores in MongoDB (Hearth)
4. **Toppan Integration** receives webhook and maps FHIR → PostgreSQL
5. **PostgreSQL** stores normalized person and relationship data

### Key Integration Points
- **GraphQL API**: `createBirthRegistration`, `createDeathRegistration`, `createMarriageRegistration`
- **FHIR Storage**: MongoDB via Hearth FHIR server (`FHIR_URL`)
- **Toppan Service**: Custom integration for family tree (`TOPPAN_SERVICE_URL`)
- **Cross-reference**: `crvs_event_uuid` links MongoDB FHIR resources to PostgreSQL events

## MongoDB Schema Analysis

### Core FHIR Resources
- **Patient**: Person data (child, mother, father, deceased, bride, groom)
- **Task**: Registration workflow state and metadata
- **Composition**: Event composition linking all participants
- **Bundle**: Complete registration package
- **RelatedPerson**: Informant and witness data
- **Location**: Event and jurisdiction locations

### User Management Schema
```typescript
interface User {
  name: HumanName[]
  username: string
  email: string
  role: string
  practitionerId: string
  primaryOfficeId: string
  status: 'PENDING' | 'ACTIVE' | 'DISABLED' | 'DEACTIVATED'
  searches: AdvancedSearchParameters[]
  auditHistory: AuditHistory[]
}
```

## PostgreSQL Schema Analysis

### Core Person Registry
```sql
-- Person entity with full name generation
CREATE TABLE person (
  id uuid PRIMARY KEY,
  given_name text NOT NULL,
  family_name text NOT NULL,
  full_name text GENERATED ALWAYS AS (given_name || ' ' || family_name) STORED,
  gender text CHECK (gender IN ('male', 'female', 'other', 'unknown')),
  dob date,
  place_of_birth text,
  place_of_birth_uuid uuid,
  identifiers jsonb,
  status text DEFAULT 'active',
  death_date date,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- Event tracking with OpenCRVS cross-reference
CREATE TABLE event (
  id uuid PRIMARY KEY,
  event_type text NOT NULL, -- 'birth', 'death', 'marriage'
  event_date date,
  location text,
  source text,
  metadata jsonb,
  crvs_event_uuid uuid NOT NULL UNIQUE, -- Links to MongoDB
  duplicates uuid[],
  status text,
  last_update_at timestamp,
  remarks text,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- Person participation in events
CREATE TABLE event_participant (
  id uuid PRIMARY KEY,
  person_id uuid REFERENCES person(id),
  event_id uuid REFERENCES event(id),
  role text NOT NULL, -- 'father', 'mother', 'subject', 'groom', 'bride', etc.
  relationship_details jsonb,
  crvs_person_id uuid, -- Links to MongoDB Patient resource
  status text DEFAULT 'active',
  ended_at timestamp,
  remarks text,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

-- Family relationships with temporal tracking
CREATE TABLE family_links_forward (
  id uuid PRIMARY KEY,
  person_id uuid NOT NULL,
  related_person_id uuid NOT NULL,
  relationship_type relationship_type_enum NOT NULL,
  source_event_id uuid REFERENCES event(id),
  start_date date,
  end_date date,
  source text DEFAULT 'OpenCRVS',
  period daterange GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED
);
```

### Advanced Features
- **Temporal Relationships**: Family links track start/end dates
- **Automatic Triggers**: Create family relationships from event participants
- **Bidirectional Views**: `family_links_bidirectional` provides reverse relationships
- **Constraint Enforcement**: Unique active father per birth event
- **Advisory Locking**: Prevents concurrent family relationship conflicts

## Migration Strategy for Legacy Data

### 1. **Data Routing Strategy**
Since the legacy data contains all event types in a single table, we need to:

1. **Event Type Detection**: Use `event` field to route records
   - `"BI"` → Birth Registration
   - `"DE"` → Death Registration
   - `"MA"` → Marriage Registration (inferred from marriage_dt presence)

2. **Dual Storage Approach**: Migrate to both databases simultaneously
   - **MongoDB**: Create proper FHIR Bundle structures
   - **PostgreSQL**: Create normalized person and relationship records

### 2. **MongoDB Migration (FHIR Bundle Creation)**
```typescript
// For each legacy record, create:
const birthBundle: Bundle = {
  resourceType: "Bundle",
  type: "document",
  entry: [
    composition,    // Links all resources
    task,          // Registration metadata
    patient_child, // From c_* fields
    patient_mother,// From m_* fields
    patient_father,// From f_* fields
    relatedPerson_informant, // From i_* fields
    location_event // From parish_nm
  ]
}
```

### 3. **PostgreSQL Migration (Normalized Data)**
```sql
-- Insert person records
INSERT INTO person (id, given_name, family_name, gender, dob, identifiers, status)
VALUES (uuid_generate_v4(), 'John', 'Doe', 'male', '1990-01-01', '[]'::jsonb, 'active');

-- Insert event record
INSERT INTO event (event_type, event_date, crvs_event_uuid, source, metadata)
VALUES ('birth', '2024-01-01', uuid_generate_v4(), 'LEGACY_MIGRATION', '{}'::jsonb);

-- Insert event participants
INSERT INTO event_participant (person_id, event_id, role, status)
VALUES
  (child_id, event_id, 'subject', 'active'),
  (mother_id, event_id, 'mother', 'active'),
  (father_id, event_id, 'father', 'active');

-- Family relationships created automatically via triggers
```

### 4. **Data Synchronization Points**
- **Cross-Reference UUIDs**: Maintain `crvs_event_uuid` linking
- **Person Identity Matching**: Use names, DOB, gender for deduplication
- **Status Mapping**: Legacy `certificate_status` → OpenCRVS workflow states
- **Location Mapping**: Legacy `parish_nm` → OpenCRVS location hierarchy

### 5. **Data Quality Challenges**
- **Name Standardization**: Combine multiple name fields consistently
- **Date Parsing**: Handle various date formats and Excel serials
- **Relationship Detection**: Infer relationships from shared addresses/names
- **Duplicate Prevention**: Detect same person across multiple events

### 6. **Migration Validation**
- **Record Count Verification**: Source vs target record counts
- **Relationship Integrity**: Verify family links created correctly
- **Cross-Reference Validation**: Ensure MongoDB ↔ PostgreSQL linking
- **Search Functionality**: Test record retrieval after migration

## Technical Implementation Notes

### Environment Configuration
```bash
# MongoDB (FHIR Store)
FHIR_URL=http://localhost:3447/fhir

# PostgreSQL (Person Registry)
TOPPAN_DB_HOST=localhost
TOPPAN_DB_PORT=5432
TOPPAN_DB_NAME=person_registry
TOPPAN_DB_USER=registry_user
TOPPAN_DB_PASSWORD=registry_pass
```

### Key Integration Files
- **Database Connection**: `/packages/toppan/src/database.ts`
- **FHIR Mapping**: `/packages/workflow/src/integrations/toppan/mappers.ts`
- **GraphQL Schema**: `/packages/gateway/src/graphql/schema.d.ts`
- **User Management**: `/packages/user-mgnt/src/model/user.ts`

This dual-database architecture provides both FHIR compliance for international interoperability and efficient family tree queries for local workflows.