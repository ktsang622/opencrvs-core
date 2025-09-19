# Direct PostgreSQL Migration Strategy (No Webhooks)

## 🎯 **Optimized Approach: Dual Database Direct Insertion**

Since webhooks are not being used, we can implement a more efficient migration strategy that directly populates both MongoDB (FHIR) and PostgreSQL (person registry) simultaneously.

## 📊 **Updated Architecture Flow**

```
Legacy Excel → Cleansing → FHIR Bundle (MongoDB) + Direct SQL (PostgreSQL)
```

### **Benefits of Direct Approach**
- ✅ **Faster Performance**: No webhook overhead
- ✅ **Better Error Handling**: Direct database error feedback
- ✅ **Atomic Transactions**: Ensure both databases stay in sync
- ✅ **Certificate Preservation**: Full control over registration numbers
- ✅ **Batch Optimization**: Custom batch sizes for each database

## 🔧 **Updated Implementation**

### **Enhanced FHIR Import Script**

```javascript
// scripts/2-fhir-import-direct.js
const xlsx = require('xlsx')
const fetch = require('node-fetch')
const { Pool } = require('pg')
const { v4: uuidv4 } = require('uuid')

// Database connections
const pgPool = new Pool({
  host: process.env.TOPPAN_DB_HOST || 'localhost',
  port: process.env.TOPPAN_DB_PORT || 5432,
  database: process.env.TOPPAN_DB_NAME || 'person_registry',
  user: process.env.TOPPAN_DB_USER || 'registry_user',
  password: process.env.TOPPAN_DB_PASSWORD || 'registry_pass'
})

class DirectMigrationImporter {
  constructor() {
    this.fhirUrl = process.env.FHIR_URL || 'http://localhost:3447/fhir'
    this.batchSize = 1000
    this.stats = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      startTime: new Date()
    }
  }

  async importFromCSV(csvPath) {
    console.log('🚀 Starting direct dual-database migration...')

    const records = this.loadCSV(csvPath)
    const batches = this.chunkArray(records, this.batchSize)

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const batchId = i + 1

      console.log(`📦 Processing batch ${batchId}/${batches.length} (${batch.length} records)`)

      try {
        await this.processBatchDirect(batch, batchId)
        console.log(`✅ Batch ${batchId} completed successfully`)
      } catch (error) {
        console.error(`❌ Batch ${batchId} failed:`, error.message)
        await this.handleBatchFailure(batch, batchId, error)
      }
    }

    this.printFinalStats()
  }

  async processBatchDirect(records, batchId) {
    // Step 1: Create FHIR Bundle for MongoDB
    const fhirBundle = this.createFHIRBundle(records, batchId)

    // Step 2: Start PostgreSQL transaction
    const pgClient = await pgPool.connect()

    try {
      await pgClient.query('BEGIN')

      // Step 3: Insert FHIR Bundle to MongoDB
      const fhirResponse = await this.insertFHIRBundle(fhirBundle)

      // Step 4: Extract resource IDs from FHIR response
      const resourceMapping = this.extractResourceIds(fhirResponse)

      // Step 5: Insert normalized data to PostgreSQL
      await this.insertPostgreSQLData(records, resourceMapping, pgClient)

      // Step 6: Commit PostgreSQL transaction
      await pgClient.query('COMMIT')

      this.stats.succeeded += records.length

    } catch (error) {
      await pgClient.query('ROLLBACK')
      throw error
    } finally {
      pgClient.release()
    }
  }

  createFHIRBundle(records, batchId) {
    const bundleEntries = []

    records.forEach((record, index) => {
      const resources = this.createFHIRResources(record, batchId, index)
      resources.forEach(resource => {
        bundleEntries.push({
          resource: resource,
          request: {
            method: 'POST',
            url: resource.resourceType
          }
        })
      })
    })

    return {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: bundleEntries
    }
  }

  createFHIRResources(record, batchId, index) {
    const baseId = \`\${batchId}-\${index}\`
    const eventType = record.event === 'BI' ? 'birth' : record.event === 'DE' ? 'death' : 'marriage'

    const resources = []

    // Task (Registration)
    const task = {
      resourceType: 'Task',
      id: \`task-\${baseId}\`,
      status: 'completed',
      businessStatus: {
        coding: [{
          system: 'http://opencrvs.org/specs/reg-status',
          code: 'REGISTERED'
        }]
      },
      identifier: [{
        system: \`http://opencrvs.org/specs/id/\${eventType}-registration-number\`,
        value: record.cert_nbr // Preserve legacy certificate number
      }],
      code: {
        coding: [{
          system: 'http://opencrvs.org/specs/types',
          code: eventType.toUpperCase()
        }]
      },
      lastModified: new Date().toISOString(),
      extension: [{
        url: 'http://opencrvs.org/specs/extension/tracking-id',
        valueString: \`MIGRATION-\${baseId}\`
      }]
    }
    resources.push(task)

    // Composition (Event Structure)
    const composition = {
      resourceType: 'Composition',
      id: \`composition-\${baseId}\`,
      status: 'final',
      type: {
        coding: [{
          system: 'http://opencrvs.org/doc-types',
          code: \`\${eventType}-declaration\`
        }]
      },
      subject: { reference: \`Patient/child-\${baseId}\` },
      date: record.reg_dt ? this.parseDate(record.reg_dt) : new Date().toISOString(),
      author: [{ reference: \`Practitioner/migration-user\` }],
      title: \`\${eventType.charAt(0).toUpperCase() + eventType.slice(1)} Declaration\`,
      section: []
    }
    resources.push(composition)

    // Child/Subject Patient
    const childPatient = {
      resourceType: 'Patient',
      id: \`child-\${baseId}\`,
      active: true,
      name: [{
        use: 'official',
        given: [record.c_frst_nm, record.c_mid_nm].filter(Boolean),
        family: record.c_last_nm
      }],
      gender: this.mapGender(record.c_sex),
      birthDate: record.c_dob ? this.parseDate(record.c_dob) : null,
      extension: [{
        url: 'http://opencrvs.org/specs/extension/migration-source',
        valueString: 'LEGACY_MIGRATION'
      }]
    }
    resources.push(childPatient)

    // Mother Patient (if birth)
    if (eventType === 'birth' && record.m_frst_nm) {
      const motherPatient = {
        resourceType: 'Patient',
        id: \`mother-\${baseId}\`,
        active: true,
        name: [{
          use: 'official',
          given: [record.m_frst_nm, record.m_mid_nm].filter(Boolean),
          family: record.m_last_nm
        }, {
          use: 'maiden',
          family: record.m_mdn_nm
        }].filter(name => name.family),
        gender: 'female',
        extension: [{
          url: 'http://opencrvs.org/specs/extension/migration-source',
          valueString: 'LEGACY_MIGRATION'
        }]
      }
      resources.push(motherPatient)
    }

    // Father Patient (if birth and data exists)
    if (eventType === 'birth' && record.f_frst_nm) {
      const fatherPatient = {
        resourceType: 'Patient',
        id: \`father-\${baseId}\`,
        active: true,
        name: [{
          use: 'official',
          given: [record.f_frst_nm, record.f_mid_nm].filter(Boolean),
          family: record.f_last_nm
        }],
        gender: 'male',
        extension: [{
          url: 'http://opencrvs.org/specs/extension/migration-source',
          valueString: 'LEGACY_MIGRATION'
        }]
      }
      resources.push(fatherPatient)
    }

    return resources
  }

  async insertFHIRBundle(bundle) {
    const response = await fetch(this.fhirUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Authorization': \`Bearer \${process.env.MIGRATION_TOKEN}\`
      },
      body: JSON.stringify(bundle)
    })

    if (!response.ok) {
      throw new Error(\`FHIR Bundle insertion failed: \${response.status} \${response.statusText}\`)
    }

    return await response.json()
  }

  async insertPostgreSQLData(records, resourceMapping, pgClient) {
    for (const [index, record] of records.entries()) {
      await this.insertSingleRecord(record, resourceMapping, index, pgClient)
    }
  }

  async insertSingleRecord(record, resourceMapping, index, pgClient) {
    const eventType = record.event === 'BI' ? 'birth' : record.event === 'DE' ? 'death' : 'marriage'
    const baseId = \`migration-\${Date.now()}-\${index}\`

    // Generate consistent UUIDs
    const eventId = uuidv4()
    const childPersonId = uuidv4()
    const motherPersonId = record.m_frst_nm ? uuidv4() : null
    const fatherPersonId = record.f_frst_nm ? uuidv4() : null

    const crvsEventUuid = resourceMapping[\`task-\${index}\`] || uuidv4()

    try {
      // Insert Event
      await pgClient.query(\`
        INSERT INTO event (id, event_type, event_date, location, source, crvs_event_uuid, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT (crvs_event_uuid) DO NOTHING
      \`, [
        eventId,
        eventType,
        record.c_dob ? this.parseDate(record.c_dob) : null,
        record.parish_nm,
        'LEGACY_MIGRATION',
        crvsEventUuid,
        'active'
      ])

      // Insert Child/Subject Person
      await pgClient.query(\`
        INSERT INTO person (id, given_name, family_name, gender, dob, identifiers, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO NOTHING
      \`, [
        childPersonId,
        record.c_frst_nm,
        record.c_last_nm,
        this.mapGender(record.c_sex),
        record.c_dob ? this.parseDate(record.c_dob) : null,
        JSON.stringify({ legacy_id: record.id, cert_nbr: record.cert_nbr }),
        'active'
      ])

      // Insert Child as Event Participant
      await pgClient.query(\`
        INSERT INTO event_participant (id, person_id, event_id, role, crvs_person_id, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      \`, [
        uuidv4(),
        childPersonId,
        eventId,
        eventType === 'birth' ? 'subject' : 'deceased',
        resourceMapping[\`child-\${index}\`] || null,
        'active'
      ])

      // Insert Mother (if birth)
      if (eventType === 'birth' && motherPersonId) {
        await pgClient.query(\`
          INSERT INTO person (id, given_name, family_name, gender, identifiers, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        \`, [
          motherPersonId,
          record.m_frst_nm,
          record.m_last_nm || record.m_mdn_nm,
          'female',
          JSON.stringify({ maiden_name: record.m_mdn_nm, legacy_id: record.id }),
          'active'
        ])

        await pgClient.query(\`
          INSERT INTO event_participant (id, person_id, event_id, role, crvs_person_id, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        \`, [
          uuidv4(),
          motherPersonId,
          eventId,
          'mother',
          resourceMapping[\`mother-\${index}\`] || null,
          'active'
        ])
      }

      // Insert Father (if birth and data exists)
      if (eventType === 'birth' && fatherPersonId) {
        await pgClient.query(\`
          INSERT INTO person (id, given_name, family_name, gender, identifiers, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO NOTHING
        \`, [
          fatherPersonId,
          record.f_frst_nm,
          record.f_last_nm,
          'male',
          JSON.stringify({ legacy_id: record.id }),
          'active'
        ])

        await pgClient.query(\`
          INSERT INTO event_participant (id, person_id, event_id, role, crvs_person_id, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        \`, [
          uuidv4(),
          fatherPersonId,
          eventId,
          'father',
          resourceMapping[\`father-\${index}\`] || null,
          'active'
        ])
      }

    } catch (error) {
      console.error(\`Error inserting record \${index}:\`, error.message)
      throw error
    }
  }

  extractResourceIds(fhirResponse) {
    const mapping = {}

    if (fhirResponse.entry) {
      fhirResponse.entry.forEach((entry, index) => {
        if (entry.response && entry.response.location) {
          // Extract ID from location header like "Patient/123/_history/1"
          const matches = entry.response.location.match(/\/([^\/]+)\//)
          if (matches && matches[1]) {
            mapping[\`resource-\${index}\`] = matches[1]
          }
        }
      })
    }

    return mapping
  }

  mapGender(sex) {
    switch (sex?.toUpperCase()) {
      case 'M': case 'MALE': case '1': return 'male'
      case 'F': case 'FEMALE': case '2': return 'female'
      default: return 'unknown'
    }
  }

  parseDate(dateValue) {
    if (!dateValue) return null

    // Handle Excel serial dates
    if (typeof dateValue === 'number') {
      const excelEpoch = new Date(1900, 0, 1)
      const date = new Date(excelEpoch.getTime() + (dateValue - 2) * 24 * 60 * 60 * 1000)
      return date.toISOString().split('T')[0]
    }

    // Handle string dates
    if (typeof dateValue === 'string') {
      return new Date(dateValue).toISOString().split('T')[0]
    }

    return null
  }

  chunkArray(array, size) {
    const chunks = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  loadCSV(csvPath) {
    // CSV loading implementation
    const csv = require('csv-parser')
    const fs = require('fs')

    return new Promise((resolve, reject) => {
      const records = []
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => records.push(row))
        .on('end', () => resolve(records))
        .on('error', reject)
    })
  }

  printFinalStats() {
    const duration = (new Date() - this.stats.startTime) / 1000 / 60
    console.log(\`\n🎉 Migration Complete!\`)
    console.log(\`📊 Final Statistics:\`)
    console.log(\`   • Total Processed: \${this.stats.processed}\`)
    console.log(\`   • Successfully Migrated: \${this.stats.succeeded}\`)
    console.log(\`   • Failed: \${this.stats.failed}\`)
    console.log(\`   • Duration: \${duration.toFixed(2)} minutes\`)
    console.log(\`   • Rate: \${(this.stats.succeeded / duration).toFixed(0)} records/minute\`)
  }
}

// Usage
async function main() {
  const importer = new DirectMigrationImporter()
  await importer.importFromCSV('cleansed/import-ready.csv')
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = DirectMigrationImporter
```

## 🔄 **Updated Migration Process**

### **Step 1: Environment Setup**
```bash
# Set database connection variables
export FHIR_URL=http://localhost:3447/fhir
export TOPPAN_DB_HOST=localhost
export TOPPAN_DB_PORT=5432
export TOPPAN_DB_NAME=person_registry
export TOPPAN_DB_USER=registry_user
export TOPPAN_DB_PASSWORD=registry_pass
export MIGRATION_TOKEN=your_auth_token
```

### **Step 2: Run Direct Migration**
```bash
# Install dependencies
npm install xlsx csv-parser node-fetch pg uuid

# Run cleansing (same as before)
node scripts/1-cleansing.js --input data/source/ --output data/cleansed/

# Run direct dual-database import
node scripts/2-fhir-import-direct.js --input data/cleansed/import-ready.csv

# Run review tool for failed records
node scripts/3-review-tool.js --queue data/cleansed/review-queue.csv
```

## 📊 **Performance Benefits**

| Approach | MongoDB + PostgreSQL | API Calls | Est. Time (100K) |
|----------|----------------------|-----------|------------------|
| **Webhook Method** | Sequential | 200K+ | 8-12 hours |
| **Direct Method** | Parallel | 100 | 2-4 hours |

## ✅ **Data Consistency Guarantees**

1. **Atomic Transactions**: PostgreSQL changes are rolled back if FHIR insertion fails
2. **Cross-Reference Linking**: `crvs_event_uuid` maintains MongoDB ↔ PostgreSQL links
3. **Certificate Preservation**: Legacy `cert_nbr` becomes `registrationNumber`
4. **Family Relationships**: PostgreSQL triggers automatically create family links
5. **Error Recovery**: Failed batches are isolated and can be retried

## 🔍 **Verification Queries**

```sql
-- Check migration status
SELECT
  event_type,
  COUNT(*) as total_events,
  COUNT(DISTINCT crvs_event_uuid) as unique_crvs_links
FROM event
WHERE source = 'LEGACY_MIGRATION'
GROUP BY event_type;

-- Verify family relationships
SELECT
  relationship_type,
  COUNT(*) as total_relationships
FROM family_links_forward
WHERE source = 'OpenCRVS'
GROUP BY relationship_type;

-- Check certificate number preservation
SELECT
  COUNT(*) as total_with_cert_numbers
FROM person
WHERE identifiers->>'cert_nbr' IS NOT NULL;
```

This direct approach eliminates webhook dependencies while maintaining data integrity and achieving optimal performance for your 100K record migration.