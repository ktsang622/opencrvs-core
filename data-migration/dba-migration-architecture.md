# DBA Perspective: Migration Architecture & Implementation Strategy

## 🏗️ Migration Architecture Overview

### **Environment Setup with countryconfig-atg**

```bash
# Separate migration environment
countryconfig-atg/     # ← Migration-specific configuration
├── src/form/migration/         # ← Migration-specific form configs
├── src/data-seeding/          # ← ATG location seeding
├── scripts/migration/         # ← Migration scripts
└── src/cleansing/             # ← Data cleansing utilities
```

## 1️⃣ **Review Queue System for Incomplete Records**

### **Database Schema for Review Queue**
```sql
-- New table for migration review queue
CREATE TABLE migration_review_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_record_id text NOT NULL, -- Legacy printlog_id
    event_type text NOT NULL,       -- 'birth', 'death', 'marriage'

    -- Original source data (for reference)
    source_data jsonb NOT NULL,

    -- Enriched/processed data (what we tried to create)
    processed_data jsonb,

    -- Missing required fields
    missing_fields text[] NOT NULL,

    -- Data quality issues
    quality_issues jsonb,

    -- Review status
    review_status text DEFAULT 'pending' CHECK (review_status IN ('pending', 'in_review', 'approved', 'rejected', 'requires_manual_data')),

    -- Priority based on completeness
    priority integer DEFAULT 3 CHECK (priority BETWEEN 1 AND 5), -- 1=critical, 5=low

    -- Migration metadata
    migration_batch_id text,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    reviewed_at timestamp,
    reviewed_by text,
    resolution_notes text,

    -- Cleansing results
    location_uuid_resolved boolean DEFAULT false,
    informant_type_resolved boolean DEFAULT false,

    UNIQUE(source_record_id, migration_batch_id)
);

-- Indexes for efficient querying
CREATE INDEX idx_migration_review_status ON migration_review_queue (review_status);
CREATE INDEX idx_migration_review_priority ON migration_review_queue (priority, created_at);
CREATE INDEX idx_migration_review_event_type ON migration_review_queue (event_type);
CREATE INDEX idx_migration_review_batch ON migration_review_queue (migration_batch_id);

-- Full-text search on missing fields and issues
CREATE INDEX idx_migration_review_missing_fields_gin ON migration_review_queue USING gin (missing_fields);
CREATE INDEX idx_migration_review_quality_issues_gin ON migration_review_queue USING gin (quality_issues);
```

### **Review Queue Population Logic**
```typescript
const evaluateRecordForReview = (legacyRecord: any, processedData: any) => {
  const missingFields = []
  const qualityIssues = {}
  let priority = 5 // Default low priority

  // Check for critical missing fields
  if (!processedData.child?.name?.[0]?.firstNamesEng) {
    missingFields.push('child.name.firstNamesEng')
    priority = Math.min(priority, 1) // Critical
  }

  if (!processedData.eventLocation?.id) {
    missingFields.push('eventLocation.id')
    priority = Math.min(priority, 2) // High
  }

  if (!processedData.registration?.informantType || processedData.registration.informantType === 'OTHER') {
    missingFields.push('informantType')
    qualityIssues.informantType = {
      issue: 'Could not map informant relationship',
      sourceValue: legacyRecord.i_desc,
      suggestion: 'Manual review required'
    }
    priority = Math.min(priority, 3) // Medium
  }

  // Calculate quality score
  const totalFields = Object.keys(processedData).length
  const completeFields = totalFields - missingFields.length
  const qualityScore = completeFields / totalFields

  return {
    needsReview: missingFields.length > 0 || qualityScore < 0.8,
    missingFields,
    qualityIssues,
    priority,
    qualityScore
  }
}
```

## 2️⃣ **Location UUID Cleansing from Endpoints**

### **Pre-Migration Location Cleansing Pipeline**
```typescript
// Step 1: Extract unique parish names from CSV
const extractUniqueParishes = async (csvData: any[]) => {
  const parishes = new Set()
  csvData.forEach(record => {
    if (record.parish_nm && record.parish_nm !== 'NULL') {
      parishes.add(record.parish_nm.trim())
    }
  })
  return Array.from(parishes)
}

// Step 2: Query OpenCRVS location endpoint for each parish
const resolveParishesToUUIDs = async (parishes: string[]) => {
  const locationMap = new Map()
  const unresolved = []

  for (const parish of parishes) {
    try {
      // Call OpenCRVS location search API
      const response = await fetch(`${OPENCRVS_API}/location/search`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({
          name: parish,
          type: 'ADMIN_STRUCTURE'
        })
      })

      const locations = await response.json()

      if (locations.length === 1) {
        // Exact match found
        locationMap.set(parish, locations[0].id)
      } else if (locations.length > 1) {
        // Multiple matches - need manual resolution
        unresolved.push({
          parish,
          candidates: locations,
          issue: 'multiple_matches'
        })
      } else {
        // No matches - need to create location
        unresolved.push({
          parish,
          candidates: [],
          issue: 'not_found'
        })
      }
    } catch (error) {
      unresolved.push({
        parish,
        error: error.message,
        issue: 'api_error'
      })
    }
  }

  return { locationMap, unresolved }
}

// Step 3: Store location mapping in database
CREATE TABLE migration_location_mapping (
    parish_name text PRIMARY KEY,
    location_uuid uuid,
    location_name text,
    resolution_status text CHECK (resolution_status IN ('resolved', 'manual_required', 'not_found')),
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp,
    manual_mapping boolean DEFAULT false
);
```

### **Location Resolution Fallback Strategy**
```typescript
const getLocationUUID = async (parishName: string): Promise<string> => {
  // 1. Check pre-built mapping table
  const mapped = await db.query(
    'SELECT location_uuid FROM migration_location_mapping WHERE parish_name = $1',
    [parishName]
  )
  if (mapped.rows[0]?.location_uuid) {
    return mapped.rows[0].location_uuid
  }

  // 2. Try fuzzy matching against existing locations
  const fuzzyMatch = await fuzzyMatchLocation(parishName)
  if (fuzzyMatch && fuzzyMatch.confidence > 0.8) {
    return fuzzyMatch.uuid
  }

  // 3. Use default jurisdiction location
  const defaultLocation = await getDefaultJurisdictionLocation()

  // 4. Log for manual resolution
  await logLocationResolutionRequired(parishName, defaultLocation.uuid)

  return defaultLocation.uuid
}
```

## 3️⃣ **CSV Processing Enhancement**

### **Enhanced CSV Structure with Cleansing Metadata**
```csv
printlog_id,parish_nm,location_uuid,location_resolved,informant_type_mapped,quality_score,needs_review
0,St. Mary Parish,12345-uuid-location,true,MOTHER,0.85,false
1,Unknown Parish,,false,OTHER,0.65,true
```

### **Pre-Processing Pipeline**
```typescript
const preprocessCSV = async (csvPath: string) => {
  // 1. Load and validate CSV
  const rawData = await loadCSV(csvPath)

  // 2. Run location cleansing
  const { locationMap, unresolved } = await resolveParishesToUUIDs(
    extractUniqueParishes(rawData)
  )

  // 3. Enhance each row with cleansing metadata
  const enhancedData = rawData.map(row => ({
    ...row,
    location_uuid: locationMap.get(row.parish_nm) || null,
    location_resolved: !!locationMap.get(row.parish_nm),
    informant_type_mapped: mapInformantType(row.i_desc),
    quality_score: calculateQualityScore(row),
    needs_review: shouldRequireReview(row)
  }))

  // 4. Generate cleansing report
  const cleansingReport = {
    totalRecords: rawData.length,
    locationsResolved: Array.from(locationMap.keys()).length,
    locationsUnresolved: unresolved.length,
    recordsNeedingReview: enhancedData.filter(r => r.needs_review).length,
    averageQualityScore: enhancedData.reduce((acc, r) => acc + r.quality_score, 0) / enhancedData.length
  }

  return { enhancedData, cleansingReport, unresolved }
}
```

## 4️⃣ **DBA Perspective: Database Architecture**

### **Migration-Safe Database Design**

#### **A. Transaction Isolation Strategy**
```sql
-- Use read committed isolation for migration
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- Create migration in stages to avoid long locks
INSERT INTO person (id, given_name, family_name, gender, dob)
VALUES (...);

INSERT INTO event (id, event_type, crvs_event_uuid, event_date)
VALUES (...);

INSERT INTO event_participant (person_id, event_id, role, status)
VALUES (...);

-- Commit in batches of 1000 records
COMMIT;
```

#### **B. Performance Optimization**
```sql
-- Temporary indexes for migration performance
CREATE INDEX CONCURRENTLY idx_temp_migration_parish ON event (location)
WHERE source = 'LEGACY_MIGRATION';

CREATE INDEX CONCURRENTLY idx_temp_migration_source_id ON event (metadata->>'source_id')
WHERE source = 'LEGACY_MIGRATION';

-- Disable triggers during bulk migration (if safe)
ALTER TABLE family_link DISABLE TRIGGER trg_create_reverse_family_link;

-- Re-enable after migration
ALTER TABLE family_link ENABLE TRIGGER trg_create_reverse_family_link;
```

#### **C. Data Integrity Safeguards**
```sql
-- Migration validation constraints
ALTER TABLE event ADD CONSTRAINT chk_migration_source
CHECK (source != 'LEGACY_MIGRATION' OR metadata ? 'migration_batch_id');

-- Prevent accidental data corruption
CREATE OR REPLACE FUNCTION prevent_migration_data_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.source = 'LEGACY_MIGRATION' AND TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Cannot update migrated records without explicit migration flag';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_migration_data
  BEFORE UPDATE ON event
  FOR EACH ROW EXECUTE FUNCTION prevent_migration_data_update();
```

### **Rollback Strategy**
```sql
-- Migration rollback capability
CREATE TABLE migration_batch_log (
    batch_id text PRIMARY KEY,
    started_at timestamp DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp,
    records_processed integer,
    records_successful integer,
    records_failed integer,
    rollback_executed boolean DEFAULT false
);

-- Rollback function
CREATE OR REPLACE FUNCTION rollback_migration_batch(p_batch_id text)
RETURNS void AS $$
BEGIN
  -- Delete in reverse dependency order
  DELETE FROM family_link WHERE source_event_id IN (
    SELECT id FROM event WHERE metadata->>'migration_batch_id' = p_batch_id
  );

  DELETE FROM event_participant WHERE event_id IN (
    SELECT id FROM event WHERE metadata->>'migration_batch_id' = p_batch_id
  );

  DELETE FROM event WHERE metadata->>'migration_batch_id' = p_batch_id;

  DELETE FROM person WHERE status = 'migration_temp'
    AND created_at >= (SELECT started_at FROM migration_batch_log WHERE batch_id = p_batch_id);

  UPDATE migration_batch_log
  SET rollback_executed = true
  WHERE batch_id = p_batch_id;

  RAISE NOTICE 'Migration batch % rolled back successfully', p_batch_id;
END;
$$ LANGUAGE plpgsql;
```

## 5️⃣ **Implementation Roadmap**

### **Phase 1: Infrastructure Setup (Week 1-2)**
1. **countryconfig-atg Environment**
   - Set up migration-specific form configurations
   - Create relaxed field requirements
   - Add migration mode detection

2. **Database Schema Extensions**
   - Create migration review queue tables
   - Add location mapping tables
   - Set up migration batch tracking

3. **API Endpoints**
   - Location resolution service
   - Review queue management API
   - Migration batch monitoring

### **Phase 2: Data Cleansing (Week 3)**
1. **CSV Pre-processing**
   - Extract unique parishes
   - Query location endpoints
   - Generate location mapping table

2. **Data Quality Assessment**
   - Calculate quality scores per record
   - Identify records needing review
   - Generate cleansing reports

### **Phase 3: Migration Pipeline (Week 4-5)**
1. **Batch Processing**
   - Process 1000 records per batch
   - Implement transaction rollback safety
   - Generate per-batch reports

2. **Review Queue Population**
   - Auto-populate incomplete records
   - Implement priority scoring
   - Create review dashboard

### **Phase 4: Manual Review & Cleanup (Week 6)**
1. **Review Dashboard**
   - Prioritized queue interface
   - Bulk resolution tools
   - Quality improvement tracking

2. **Data Enhancement**
   - Manual location mapping
   - Informant type resolution
   - Final quality validation

## **Key DBA Recommendations:**

1. **🔒 Safety First**: Use transaction isolation and batch processing
2. **📊 Monitor Performance**: Track migration speed and database load
3. **🔄 Rollback Ready**: Implement comprehensive rollback procedures
4. **📈 Quality Tracking**: Maintain quality metrics throughout process
5. **🔍 Audit Trail**: Log every decision and transformation for compliance

This architecture ensures data integrity while providing flexibility for manual review and quality improvement.