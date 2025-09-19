# OpenCRVS Legacy Data Migration - Sequence Diagram

## Complete Migration Flow: Excel → OpenCRVS Dual Database

```mermaid
sequenceDiagram
    participant Admin as Migration Admin
    participant CS as Cleansing Script
    participant Gateway as OpenCRVS Gateway
    participant FS as FHIR Import Script
    participant Hearth as Hearth FHIR Server
    participant MongoDB as MongoDB
    participant Toppan as Toppan Service
    participant PostgreSQL as PostgreSQL
    participant RT as Review Tool
    participant Reviewer as Human Reviewer

    Note over Admin,Reviewer: Phase 1: Data Cleansing (XLSX → CSV)

    Admin->>CS: Run cleansing script on Excel files
    CS->>CS: Load AB_MERGE_BI.xlsx & AB_MERGE_OTHER.xlsx
    CS->>CS: Parse 73-column legacy schema
    CS->>CS: Validate & cleanse data fields
    CS->>Gateway: GET /locations for parish mapping
    Gateway-->>CS: Return location hierarchy & UUIDs
    CS->>CS: Map parish_nm → location UUIDs
    CS->>CS: Calculate quality scores (0-100)
    CS->>CS: Generate tracking IDs & missing fields

    alt High Quality Records (score ≥ 85)
        CS->>FS: Write to import-ready.csv
    else Low Quality Records (score < 85)
        CS->>RT: Write to review-queue.csv
    end

    CS->>Admin: Cleansing complete (stats report)

    Note over Admin,Reviewer: Phase 2: FHIR Import (Batch Processing)

    Admin->>FS: Run FHIR import on import-ready.csv
    FS->>FS: Load CSV in batches of 1000 records

    loop For each batch
        FS->>FS: Transform legacy → FHIR Bundle
        FS->>FS: Create Patient, Task, Composition resources
        FS->>FS: Set registrationNumber = cert_nbr (preserve legacy)
        FS->>FS: Set status = "REGISTERED" (skip workflow)

        FS->>Hearth: POST /fhir Bundle (transaction)

        alt Successful Import
            Hearth->>MongoDB: Store FHIR resources
            MongoDB-->>Hearth: Return resource IDs
            Hearth-->>FS: 201 Created + resource locations

            Note over FS,PostgreSQL: Direct PostgreSQL Integration (No Webhook)
            FS->>FS: Transform legacy → normalized person data
            FS->>PostgreSQL: Direct INSERT person, event, event_participant
            PostgreSQL->>PostgreSQL: Trigger: create family_links
            PostgreSQL-->>FS: Confirm person registry updated

            FS->>FS: Log successful import

        else Import Failed
            Hearth-->>FS: 400/500 Error response
            FS->>RT: Move to review-queue.csv
            FS->>FS: Log error for retry
        end
    end

    FS->>Admin: Import complete (success/failure stats)

    Note over Admin,Reviewer: Phase 3: Manual Review & Patching

    Admin->>RT: Start review tool web server
    RT->>RT: Load review-queue.csv
    RT->>Admin: Review interface available at http://localhost:3001

    loop For each problematic record
        Reviewer->>RT: View record details & issues
        RT-->>Reviewer: Display data quality problems

        alt Approve with Corrections
            Reviewer->>RT: Edit fields & approve
            RT->>RT: Update record data
            RT->>FS: Re-attempt FHIR import
            FS->>Hearth: POST corrected FHIR Bundle
            Hearth->>MongoDB: Store corrected data
            Hearth->>Toppan: Trigger PostgreSQL sync
            Toppan->>PostgreSQL: Update person registry
            RT->>Reviewer: Mark as imported successfully

        else Reject Record
            Reviewer->>RT: Reject with reason
            RT->>RT: Log rejection reason
            RT->>RT: Move to rejected.csv
            RT->>Reviewer: Mark as permanently rejected
        end
    end

    Note over Admin,Reviewer: Verification & Quality Assurance

    Admin->>MongoDB: Count imported records
    Admin->>PostgreSQL: Count person registry entries
    Admin->>Admin: Verify record counts match

    Admin->>MongoDB: Sample certificate number verification
    Admin->>Admin: Confirm legacy cert_nbr preserved

    Admin->>PostgreSQL: Verify family relationships created
    Admin->>Admin: Check parent-child, marriage links

    Admin->>Gateway: Test search functionality
    Gateway->>MongoDB: Search FHIR resources
    Gateway->>PostgreSQL: Search person registry
    Gateway-->>Admin: Return unified search results

    Admin->>Admin: Migration complete ✅
```

## Key Technical Details

### 1. **Data Transformation Stages**

| Stage | Input | Output | Key Operations |
|-------|--------|---------|----------------|
| **Cleansing** | Excel files (73 cols) | CSV files | Parish mapping, quality scoring, validation |
| **FHIR Import** | Cleansed CSV | MongoDB FHIR | Bundle creation, certificate preservation |
| **Toppan Sync** | FHIR resources | PostgreSQL | Person normalization, family links |
| **Review Tool** | Failed records | Corrected data | Manual validation, re-import |

### 2. **Error Handling Flow**

```mermaid
flowchart TD
    A[Record Processing] --> B{Quality Score ≥ 85?}
    B -->|Yes| C[Auto Import]
    B -->|No| D[Review Queue]

    C --> E{FHIR Import Success?}
    E -->|Yes| F[MongoDB Storage]
    E -->|No| G[Retry Logic]

    G --> H{Retry Count < 3?}
    H -->|Yes| C
    H -->|No| D

    D --> I[Manual Review]
    I --> J{Reviewer Decision}
    J -->|Approve| K[Corrected Import]
    J -->|Reject| L[Permanent Rejection]

    F --> M[Toppan Sync]
    K --> M
    M --> N[PostgreSQL Storage]
```

### 3. **Performance Characteristics**

| Process | Batch Size | Concurrency | Est. Time (100K records) |
|---------|------------|-------------|-------------------------|
| **Data Cleansing** | 5000 records | Single-threaded | ~30 minutes |
| **FHIR Import** | 1000 records | 5 parallel batches | ~2-5 hours |
| **Manual Review** | 1 record | Human-paced | Variable |
| **Total Migration** | - | - | ~6-8 hours + review time |

### 4. **Data Quality Gates**

```mermaid
graph LR
    A[Raw Excel Data] --> B[Cleansing Validation]
    B --> C{Quality Score}

    C -->|≥ 95| D[Auto Import - High Priority]
    C -->|85-94| E[Auto Import - Standard Queue]
    C -->|70-84| F[Review Queue - Minor Issues]
    C -->|< 70| G[Review Queue - Major Issues]

    D --> H[MongoDB + PostgreSQL]
    E --> H
    F --> I[Manual Review]
    G --> I
    I --> J{Reviewer Action}
    J -->|Fix & Approve| H
    J -->|Reject| K[Rejected Records Log]
```

## Implementation Commands

```bash
# Phase 1: Data Cleansing
node scripts/1-cleansing.js --input data-migration/ --output cleansed/

# Phase 2: FHIR Import
node scripts/2-fhir-import.js --input cleansed/import-ready.csv --batch-size 1000

# Phase 3: Review Tool
node scripts/3-review-tool.js --port 3001 --queue cleansed/review-queue.csv

# Verification
node scripts/verify-migration.js --check-counts --sample-size 1000
```

This sequence diagram illustrates the complete end-to-end migration process, showing how legacy Excel data flows through our three-phase approach into OpenCRVS's dual-database architecture while preserving certificate numbers and maintaining data quality through automated scoring and manual review processes.