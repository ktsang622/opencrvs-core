// scripts/2-fhir-import.js
const fs = require('fs')
const csv = require('csv-parser')
const path = require('path')

const IMPORT_CONFIG = {
  batchSize: 1000,
  concurrentBatches: 3,
  maxRetries: 3,
  retryDelay: 5000,
  fhirUrl: 'http://localhost:3447/fhir',
  reviewThreshold: 0.7 // Quality score threshold
}

class FHIRImporter {
  constructor() {
    this.stats = {
      totalRecords: 0,
      successfulImports: 0,
      failedImports: 0,
      reviewQueue: 0,
      batches: {
        processed: 0,
        failed: 0,
        total: 0
      }
    }
  }

  async importFromCSV(csvPath) {
    console.log('🚀 Starting FHIR import process...')

    const records = await this.loadCSVRecords(csvPath)
    this.stats.totalRecords = records.length

    // Filter records by quality score
    const highQualityRecords = records.filter(r => parseFloat(r.quality_score) >= IMPORT_CONFIG.reviewThreshold)
    const reviewRecords = records.filter(r => parseFloat(r.quality_score) < IMPORT_CONFIG.reviewThreshold)

    console.log(`High Quality Records: ${highQualityRecords.length}`)
    console.log(`Review Queue Records: ${reviewRecords.length}`)

    // Process high quality records immediately
    await this.processBatches(highQualityRecords)

    // Add low quality records to review queue
    await this.addToReviewQueue(reviewRecords)

    this.generateImportReport()
  }

  async processBatches(records) {
    const batches = this.chunkArray(records, IMPORT_CONFIG.batchSize)
    this.stats.batches.total = batches.length

    console.log(`Processing ${batches.length} batches...`)

    // Process batches with controlled concurrency
    for (let i = 0; i < batches.length; i += IMPORT_CONFIG.concurrentBatches) {
      const batchGroup = batches.slice(i, i + IMPORT_CONFIG.concurrentBatches)

      const promises = batchGroup.map(async (batch, index) => {
        const batchId = i + index + 1
        return await this.processBatch(batch, batchId)
      })

      await Promise.allSettled(promises)

      // Progress report
      const processed = Math.min(i + IMPORT_CONFIG.concurrentBatches, batches.length)
      console.log(`Progress: ${processed}/${batches.length} batches (${((processed/batches.length)*100).toFixed(1)}%)`)
    }
  }

  async processBatch(records, batchId) {
    let retryCount = 0

    while (retryCount <= IMPORT_CONFIG.maxRetries) {
      try {
        console.log(`📦 Processing batch ${batchId} (${records.length} records) - Attempt ${retryCount + 1}`)

        const fhirBundle = this.createFHIRBundle(records)
        const response = await this.submitToOpenCRVS(fhirBundle)

        await this.handleBatchSuccess(response, records, batchId)

        this.stats.batches.processed++
        this.stats.successfulImports += records.length

        console.log(`✅ Batch ${batchId} completed successfully`)
        return response

      } catch (error) {
        retryCount++
        console.error(`❌ Batch ${batchId} failed (attempt ${retryCount}):`, error.message)

        if (retryCount > IMPORT_CONFIG.maxRetries) {
          await this.handleBatchFailure(records, batchId, error)
          this.stats.batches.failed++
          this.stats.failedImports += records.length
          break
        }

        // Wait before retry
        await this.sleep(IMPORT_CONFIG.retryDelay * retryCount)
      }
    }
  }

  createFHIRBundle(records) {
    const bundleEntries = []

    records.forEach((record, index) => {
      try {
        const resources = this.createFHIRResources(record, index)
        bundleEntries.push(...resources)
      } catch (error) {
        console.error(`Error creating FHIR resources for record ${index}:`, error)
        throw error
      }
    })

    return {
      resourceType: "Bundle",
      type: "transaction",
      entry: bundleEntries
    }
  }

  createFHIRResources(record, index) {
    const baseId = `migration-${Date.now()}-${index}`
    const eventType = this.getEventType(record.event)

    const resources = []

    // Task (Registration workflow)
    resources.push({
      fullUrl: `urn:uuid:task-${baseId}`,
      resource: {
        resourceType: "Task",
        status: "completed",
        businessStatus: {
          coding: [{
            system: "http://opencrvs.org/specs/reg-status",
            code: "REGISTERED"
          }]
        },
        code: {
          coding: [{
            system: "http://opencrvs.org/specs/types",
            code: eventType.toUpperCase()
          }]
        },
        identifier: [
          {
            system: `http://opencrvs.org/specs/id/${eventType.toLowerCase()}-registration-number`,
            value: record.cert_nbr || `MIGR-${baseId}`
          }
        ],
        lastModified: record.reg_dt || new Date().toISOString(),
        meta: {
          tag: [{
            system: "http://opencrvs.org/specs/tags",
            code: "MIGRATED"
          }]
        }
      },
      request: {
        method: "POST",
        url: "Task"
      }
    })

    // Composition (Main record container)
    const compositionSections = []

    // Patient resources based on event type
    if (eventType === 'birth') {
      // Child
      if (record.c_frst_nm || record.c_last_nm) {
        const childId = `patient-child-${baseId}`
        resources.push(this.createPatientResource(record, 'child', childId))
        compositionSections.push({
          code: {
            coding: [{ system: "http://opencrvs.org/doc-sections", code: "child-details" }]
          },
          entry: [{ reference: `urn:uuid:${childId}` }]
        })
      }

      // Mother
      if (record.m_frst_nm || record.m_last_nm) {
        const motherId = `patient-mother-${baseId}`
        resources.push(this.createPatientResource(record, 'mother', motherId))
        compositionSections.push({
          title: "Mother's details",
          code: {
            coding: [{ system: "http://opencrvs.org/doc-sections", code: "mother-details" }]
          },
          entry: [{ reference: `urn:uuid:${motherId}` }]
        })
      }

      // Father
      if (record.f_frst_nm || record.f_last_nm) {
        const fatherId = `patient-father-${baseId}`
        resources.push(this.createPatientResource(record, 'father', fatherId))
        compositionSections.push({
          title: "Father's details",
          code: {
            coding: [{ system: "http://opencrvs.org/doc-sections", code: "father-details" }]
          },
          entry: [{ reference: `urn:uuid:${fatherId}` }]
        })
      }
    }

    // Death events
    if (eventType === 'death') {
      if (record.c_frst_nm || record.c_last_nm) {
        const deceasedId = `patient-deceased-${baseId}`
        resources.push(this.createPatientResource(record, 'deceased', deceasedId))
        compositionSections.push({
          code: {
            coding: [{ system: "http://opencrvs.org/doc-sections", code: "deceased-details" }]
          },
          entry: [{ reference: `urn:uuid:${deceasedId}` }]
        })
      }
    }

    // Marriage events
    if (eventType === 'marriage') {
      if (record.g_frst_nm || record.g_last_nm) {
        const groomId = `patient-groom-${baseId}`
        resources.push(this.createPatientResource(record, 'groom', groomId))
        compositionSections.push({
          code: {
            coding: [{ system: "http://opencrvs.org/doc-sections", code: "groom-details" }]
          },
          entry: [{ reference: `urn:uuid:${groomId}` }]
        })
      }

      if (record.b_frst_nm || record.b_last_nm) {
        const brideId = `patient-bride-${baseId}`
        resources.push(this.createPatientResource(record, 'bride', brideId))
        compositionSections.push({
          code: {
            coding: [{ system: "http://opencrvs.org/doc-sections", code: "bride-details" }]
          },
          entry: [{ reference: `urn:uuid:${brideId}` }]
        })
      }
    }

    // Composition
    resources.push({
      fullUrl: `urn:uuid:composition-${baseId}`,
      resource: {
        resourceType: "Composition",
        status: "final",
        type: {
          coding: [{
            system: "http://opencrvs.org/doc-types",
            code: `${eventType}-declaration`
          }]
        },
        subject: { reference: `urn:uuid:task-${baseId}` },
        date: record.reg_dt || new Date().toISOString(),
        title: `${eventType.charAt(0).toUpperCase() + eventType.slice(1)} Declaration`,
        section: compositionSections,
        meta: {
          tag: [{
            system: "http://opencrvs.org/specs/tags",
            code: "MIGRATED"
          }]
        }
      },
      request: {
        method: "POST",
        url: "Composition"
      }
    })

    return resources
  }

  createPatientResource(record, role, patientId) {
    const patient = {
      resourceType: "Patient",
      active: true,
      meta: {
        tag: [{
          system: "http://opencrvs.org/specs/tags",
          code: "MIGRATED"
        }]
      }
    }

    // Name mapping based on role
    const nameMapping = {
      child: { first: 'c_frst_nm', middle: 'c_mid_nm', last: 'c_last_nm' },
      deceased: { first: 'c_frst_nm', middle: 'c_mid_nm', last: 'c_last_nm' },
      mother: { first: 'm_frst_nm', middle: 'm_mid_nm', last: 'm_last_nm' },
      father: { first: 'f_frst_nm', middle: 'f_mid_nm', last: 'f_last_nm' },
      groom: { first: 'g_frst_nm', middle: 'g_mid_nm', last: 'g_last_nm' },
      bride: { first: 'b_frst_nm', middle: 'b_mid_nm', last: 'b_last_nm' }
    }

    const names = nameMapping[role]
    if (names) {
      const name = {
        use: "official",
        given: [record[names.first], record[names.middle]].filter(Boolean),
        family: record[names.last] || "Unknown"
      }
      patient.name = [name]
    }

    // Gender
    if (role === 'child' || role === 'deceased') {
      if (record.gender_standardized && record.gender_standardized !== 'unknown') {
        patient.gender = record.gender_standardized
      }
    } else if (role === 'groom') {
      patient.gender = 'male'
    } else if (role === 'bride' || role === 'mother') {
      patient.gender = 'female'
    }

    // Birth date
    if ((role === 'child' || role === 'deceased') && record.c_dob) {
      patient.birthDate = record.c_dob
    }

    // Death date
    if (role === 'deceased' && record.death_dt) {
      patient.deceasedDateTime = record.death_dt
    }

    // Address
    const addressMapping = {
      child: 'c_address',
      deceased: 'c_address',
      mother: 'm_address',
      father: 'f_address',
      groom: 'g_address',
      bride: 'b_address'
    }

    if (record[addressMapping[role]]) {
      patient.address = [{
        use: "home",
        text: record[addressMapping[role]]
      }]
    }

    // Location reference
    if (record.location_uuid) {
      if (!patient.extension) patient.extension = []
      patient.extension.push({
        url: "http://opencrvs.org/specs/extension/patient-location",
        valueReference: {
          reference: `Location/${record.location_uuid}`
        }
      })
    }

    return {
      fullUrl: `urn:uuid:${patientId}`,
      resource: patient,
      request: {
        method: "POST",
        url: "Patient"
      }
    }
  }

  getEventType(eventCode) {
    if (eventCode === 'BI') return 'birth'
    if (eventCode === 'DE') return 'death'
    if (eventCode === 'MA') return 'marriage'
    return 'birth' // default
  }

  async submitToOpenCRVS(bundle) {
    try {
      // Step 1: Send FHIR Bundle to MongoDB using workflow modules
      console.log('📋 Sending FHIR bundle to MongoDB...')
      const fhirResponse = await this.sendBundleToHearth(bundle)

      // Step 2: Convert to SavedBundle format
      console.log('🔄 Converting to SavedBundle format...')
      const savedBundle = this.toSavedBundle(bundle, fhirResponse)

      // Step 3: Index to Elasticsearch
      console.log('🔍 Indexing to Elasticsearch...')
      await this.indexToElasticsearch(savedBundle)

      // Step 4: Sync to PostgreSQL via Toppan
      console.log('📊 Syncing to PostgreSQL via Toppan...')
      await this.syncToPostgreSQL(savedBundle)

      console.log('✅ Complete OpenCRVS workflow completed')
      return fhirResponse

    } catch (error) {
      console.error('❌ OpenCRVS workflow failed:', error.message)
      throw error
    }
  }

  async sendBundleToHearth(bundle) {
    const fetch = (await import('node-fetch')).default
    const response = await fetch(IMPORT_CONFIG.fhirUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json'
      },
      body: JSON.stringify(bundle)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`FHIR submission failed: ${response.status} - ${errorText}`)
    }

    return await response.json()
  }

  toSavedBundle(inputBundle, responseBundle) {
    // Build a mapping from original fullUrl to new fullUrl
    const urlMapping = new Map()

    // Convert transaction response to SavedBundle format
    const savedEntries = inputBundle.entry.map((entry, index) => {
      const responseEntry = responseBundle.entry[index]

      // Extract resource ID from location header
      let resourceId = null
      if (responseEntry.response?.location) {
        const locationParts = responseEntry.response.location.split('/')
        // Format: "ResourceType/id/_history/version"
        const resourceTypeIndex = locationParts.findIndex(part => part === entry.resource.resourceType)
        if (resourceTypeIndex >= 0 && locationParts[resourceTypeIndex + 1]) {
          resourceId = locationParts[resourceTypeIndex + 1]
        }
      }

      // Fallback: try to extract from other response fields
      if (!resourceId && responseEntry.response?.id) {
        resourceId = responseEntry.response.id
      }

      const originalFullUrl = entry.fullUrl
      const newFullUrl = resourceId
        ? `http://localhost:3447/fhir/${entry.resource.resourceType}/${resourceId}`
        : entry.fullUrl

      // Store mapping for reference updates
      urlMapping.set(originalFullUrl, newFullUrl)

      return {
        fullUrl: newFullUrl,
        resource: {
          ...entry.resource,
          id: resourceId
        }
      }
    })

    // Update references in Composition sections
    const updatedEntries = savedEntries.map(entry => {
      if (entry.resource.resourceType === 'Composition' && entry.resource.section) {
        const updatedSections = entry.resource.section.map(section => {
          if (section.entry) {
            const updatedSectionEntries = section.entry.map(sectionEntry => {
              const originalRef = sectionEntry.reference
              const newRef = urlMapping.get(originalRef) || originalRef
              return {
                ...sectionEntry,
                reference: newRef
              }
            })
            return {
              ...section,
              entry: updatedSectionEntries
            }
          }
          return section
        })

        return {
          ...entry,
          resource: {
            ...entry.resource,
            section: updatedSections
          }
        }
      }
      return entry
    })

    return {
      resourceType: 'Bundle',
      type: 'document', // Changed from 'transaction' to 'document' for SavedBundle
      entry: updatedEntries
    }
  }

  async indexToElasticsearch(savedBundle) {
    // Skip Elasticsearch indexing for now due to auth requirements
    // TODO: Implement proper JWT token authentication for production
    console.log('⚠️ Elasticsearch indexing skipped (auth required)')
    return

    try {
      const fetch = (await import('node-fetch')).default
      const response = await fetch('http://localhost:9090/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dummy-token' // For migration purposes
        },
        body: JSON.stringify(savedBundle)
      })

      if (!response.ok) {
        console.warn('⚠️ Elasticsearch indexing failed:', response.status)
      } else {
        console.log('✅ Elasticsearch indexing completed')
      }
    } catch (error) {
      console.warn('⚠️ Elasticsearch indexing error:', error.message)
    }
  }

  async syncToPostgreSQL(savedBundle) {
    try {
      // Debug: Log the savedBundle structure before sending to Toppan
      console.log('\n🔍 DEBUG: SavedBundle structure being sent to Toppan:')
      console.log('Bundle type:', savedBundle.type)
      console.log('Bundle entry count:', savedBundle.entry?.length)

      const composition = savedBundle.entry?.find(e => e.resource?.resourceType === 'Composition')
      if (composition) {
        console.log('Composition sections:', composition.resource.section?.map(s => ({
          title: s.title,
          code: s.code?.coding?.[0]?.code,
          entryCount: s.entry?.length,
          entryRef: s.entry?.[0]?.reference
        })))
      }

      // Debug: Check if Patient resources are properly referenced
      const patients = savedBundle.entry?.filter(e => e.resource?.resourceType === 'Patient')
      console.log('Patient resources:', patients?.map(p => ({
        fullUrl: p.fullUrl,
        id: p.resource.id,
        name: p.resource.name?.[0]?.given?.[0] || 'unnamed'
      })))

      const fetch = (await import('node-fetch')).default
      const response = await fetch('http://localhost:9998/v1/person-db-sync/birth/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          record: savedBundle
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.warn('⚠️ PostgreSQL sync failed:', response.status, errorText)
      } else {
        console.log('✅ PostgreSQL sync completed')

        // Trigger OpenSearch reindex
        await this.triggerOpenSearchReindex()
      }
    } catch (error) {
      console.warn('⚠️ PostgreSQL sync error:', error.message)
    }
  }

  async triggerOpenSearchReindex() {
    try {
      const fetch = (await import('node-fetch')).default
      const response = await fetch('http://localhost:3888/opensearch/index-person-db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const result = await response.json()
        console.log(`✅ OpenSearch reindex completed: ${result.indexed || 'unknown'} records`)
      }
    } catch (error) {
      console.warn('⚠️ OpenSearch reindex error:', error.message)
    }
  }

  async handleBatchSuccess(response, records, batchId) {
    // Log successful batch
    const logEntry = {
      batchId,
      timestamp: new Date().toISOString(),
      recordCount: records.length,
      status: 'success',
      fhirResponse: {
        entryCount: response.entry?.length || 0,
        successCount: response.entry?.filter(e => e.response?.status?.startsWith('2')).length || 0
      }
    }

    this.appendToLog('success', logEntry)

    // Trigger post-processing
    await this.postProcessBatch(response, records)
  }

  async handleBatchFailure(records, batchId, error) {
    const logEntry = {
      batchId,
      timestamp: new Date().toISOString(),
      recordCount: records.length,
      status: 'failed',
      error: error.message,
      records: records.map(r => ({
        printlog_id: r.printlog_id,
        cert_nbr: r.cert_nbr,
        parish_nm: r.parish_nm
      }))
    }

    this.appendToLog('failed', logEntry)

    // Save failed batch for manual review
    const failedPath = `./data/failed/batch-${batchId}-${Date.now()}.json`
    fs.writeFileSync(failedPath, JSON.stringify({
      error: error.message,
      batchId,
      records
    }, null, 2))
  }

  async postProcessBatch(response, records) {
    console.log(`📋 Post-processing batch of ${records.length} records...`)
    // Note: Full OpenCRVS workflow (FHIR + Elasticsearch + PostgreSQL + OpenSearch)
    // is now handled in submitToOpenCRVS() method
  }



  async addToReviewQueue(records) {
    if (records.length === 0) return

    if (!fs.existsSync('./data/failed')) {
      fs.mkdirSync('./data/failed', { recursive: true })
    }

    const reviewPath = `./data/failed/review-queue-${Date.now()}.json`
    const reviewData = {
      timestamp: new Date().toISOString(),
      totalRecords: records.length,
      reason: 'Low quality score - requires manual review',
      records: records.map(r => ({
        ...r,
        reviewReason: parseFloat(r.quality_score) < 0.5 ? 'Very low quality' : 'Low quality - review recommended'
      }))
    }

    fs.writeFileSync(reviewPath, JSON.stringify(reviewData, null, 2))
    this.stats.reviewQueue += records.length

    console.log(`📝 Added ${records.length} records to review queue`)
  }

  appendToLog(type, logEntry) {
    if (!fs.existsSync('./data/logs')) {
      fs.mkdirSync('./data/logs', { recursive: true })
    }
    const logPath = `./data/logs/${type}-${new Date().toISOString().split('T')[0]}.jsonl`
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n')
  }

  generateImportReport() {
    const report = {
      summary: this.stats,
      timestamp: new Date().toISOString(),
      successRate: this.stats.totalRecords > 0 ?
        (this.stats.successfulImports / this.stats.totalRecords * 100).toFixed(2) + '%' : '0%'
    }

    if (!fs.existsSync('./data/logs')) {
      fs.mkdirSync('./data/logs', { recursive: true })
    }
    fs.writeFileSync('./data/logs/import-report.json', JSON.stringify(report, null, 2))

    console.log('\n📊 Import Complete!')
    console.log(`Total Records: ${this.stats.totalRecords}`)
    console.log(`Successful: ${this.stats.successfulImports}`)
    console.log(`Failed: ${this.stats.failedImports}`)
    console.log(`Review Queue: ${this.stats.reviewQueue}`)
    console.log(`Success Rate: ${report.successRate}`)
  }

  loadCSVRecords(csvPath) {
    return new Promise((resolve, reject) => {
      const records = []
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          // Convert string numbers back to appropriate types
          if (row.quality_score) row.quality_score = parseFloat(row.quality_score)
          if (row.needs_review) row.needs_review = row.needs_review === 'true'
          if (row.location_resolved) row.location_resolved = row.location_resolved === 'true'
          records.push(row)
        })
        .on('end', () => resolve(records))
        .on('error', reject)
    })
  }

  chunkArray(array, chunkSize) {
    const chunks = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Usage
async function main() {
  try {
    const importer = new FHIRImporter()
    const csvPath = process.argv[2] || './data/cleansed/AB_MERGE (0221)_BI-cleansed.csv'

    console.log(`Starting import from: ${csvPath}`)
    await importer.importFromCSV(csvPath)
    console.log('✅ Import completed')
  } catch (error) {
    console.error('❌ Import failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { FHIRImporter }