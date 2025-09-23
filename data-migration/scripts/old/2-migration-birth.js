// scripts/2-migration-birth.js
const fetch = require('node-fetch')
const fs = require('fs')
const path = require('path')

const MIGRATION_CONFIG = {
  opencrvsUrl: process.env.OPENCRVS_URL || 'http://localhost:5001',
  batchSize: parseInt(process.env.BATCH_SIZE) || 5,
  delayBetweenBatches: parseInt(process.env.DELAY_MS) || 10000,
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  autoConfirm: process.env.AUTO_CONFIRM === 'true' || false
}

class BirthMigrationTool {
  constructor() {
    this.stats = {
      totalRecords: 0,
      successfulImports: 0,
      duplicatesSkipped: 0,
      failures: 0,
      retries: 0
    }
    this.authToken = null
    this.locationCache = new Map()
  }

  async authenticate() {
    try {
      const response = await fetch(`${MIGRATION_CONFIG.opencrvsUrl}/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: process.env.OPENCRVS_USERNAME || 'e.mayuka',
          password: process.env.OPENCRVS_PASSWORD || 'test'
        })
      })

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`)
      }

      const data = await response.json()
      this.authToken = data.token
      console.log('✅ Authentication successful')
      return true
    } catch (error) {
      console.error('❌ Authentication failed:', error.message)
      return false
    }
  }

  async loadLocations() {
    try {
      const response = await fetch(`${MIGRATION_CONFIG.opencrvsUrl}/location?type=ADMIN_STRUCTURE`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      })

      if (!response.ok) {
        throw new Error(`Failed to load locations: ${response.statusText}`)
      }

      const locations = await response.json()

      // Cache locations by name and UUID
      locations.forEach(location => {
        this.locationCache.set(location.name?.toUpperCase(), location)
        this.locationCache.set(location.id, location)
      })

      console.log(`✅ Loaded ${locations.length} locations`)
      return true
    } catch (error) {
      console.error('❌ Failed to load locations:', error.message)
      return false
    }
  }

  async migrateFromCSV(csvFilePath, outputDir) {
    console.log(`🚀 Starting birth migration from ${csvFilePath}`)

    if (!await this.authenticate()) {
      throw new Error('Authentication failed')
    }

    if (!await this.loadLocations()) {
      throw new Error('Failed to load locations')
    }

    const records = this.parseCSV(csvFilePath)
    console.log(`📊 Found ${records.length} records to migrate`)

    this.stats.totalRecords = records.length

    // Create output directories
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const duplicatesFile = path.join(outputDir, 'duplicates.json')
    const failuresFile = path.join(outputDir, 'failures.json')
    const successFile = path.join(outputDir, 'successful.json')

    const duplicates = []
    const failures = []
    const successful = []

    // Process in batches
    const batchSize = MIGRATION_CONFIG.batchSize
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      console.log(`\n=== Processing batch ${Math.floor(i/batchSize) + 1} (rows ${i + 1}-${Math.min(i + batchSize, records.length)}) ===`)

      for (const record of batch) {
        const result = await this.processRecord(record, i + batch.indexOf(record) + 1)

        switch (result.status) {
          case 'success':
            successful.push(result)
            this.stats.successfulImports++
            break
          case 'duplicate':
            duplicates.push(result)
            this.stats.duplicatesSkipped++
            break
          case 'failure':
            failures.push(result)
            this.stats.failures++
            break
        }
      }

      // Save intermediate results
      if (duplicates.length > 0) {
        fs.writeFileSync(duplicatesFile, JSON.stringify(duplicates, null, 2))
      }
      if (failures.length > 0) {
        fs.writeFileSync(failuresFile, JSON.stringify(failures, null, 2))
      }
      if (successful.length > 0) {
        fs.writeFileSync(successFile, JSON.stringify(successful, null, 2))
      }

      // Delay between batches
      if (i + batchSize < records.length) {
        console.log(`⏳ Waiting ${MIGRATION_CONFIG.delayBetweenBatches}ms before next batch...`)
        await this.sleep(MIGRATION_CONFIG.delayBetweenBatches)
      }
    }

    this.generateMigrationReport(outputDir)
    return this.stats
  }

  parseCSV(csvFilePath) {
    const data = fs.readFileSync(csvFilePath, 'utf8')
    const lines = data.split('\n').filter(line => line.trim())

    if (lines.length === 0) {
      throw new Error('CSV file is empty')
    }

    const headers = this.parseCSVLine(lines[0])
    const records = []

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i])
      if (values.length >= headers.length) {
        const record = {}
        headers.forEach((header, index) => {
          record[header.replace(/"/g, '')] = values[index]?.replace(/"/g, '') || ''
        })
        records.push(record)
      }
    }

    return records
  }

  parseCSVLine(line) {
    const result = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    result.push(current.trim())
    return result
  }

  async processRecord(record, recordNumber) {
    try {
      console.log(`▶ Processing record ${recordNumber}/${this.stats.totalRecords} (${record.printlog_id || 'No ID'})`)

      // Build FHIR composition
      const composition = this.buildBirthComposition(record)

      if (!composition) {
        return {
          status: 'failure',
          record,
          error: 'Failed to build valid composition',
          recordNumber
        }
      }

      // Submit to OpenCRVS
      const result = await this.submitBirthRegistration(composition)

      if (result.success) {
        console.log(`✅ Record ${recordNumber} imported successfully - Tracking ID: ${result.trackingId}`)
        return {
          status: 'success',
          record,
          trackingId: result.trackingId,
          compositionId: result.compositionId,
          recordNumber
        }
      } else if (result.isDuplicate) {
        console.log(`🚨 Record ${recordNumber} flagged as potential duplicate - Tracking ID: ${result.trackingId}`)
        return {
          status: 'duplicate',
          record,
          trackingId: result.trackingId,
          compositionId: result.compositionId,
          recordNumber
        }
      } else {
        console.log(`❌ Record ${recordNumber} failed: ${result.error}`)
        return {
          status: 'failure',
          record,
          error: result.error,
          recordNumber
        }
      }

    } catch (error) {
      console.log(`❌ Record ${recordNumber} failed with exception: ${error.message}`)
      return {
        status: 'failure',
        record,
        error: error.message,
        recordNumber
      }
    }
  }

  buildBirthComposition(record) {
    try {
      // Use clean birth_date if available, fallback to c_dob
      const birthDate = record.birth_date || this.parseDate(record.c_dob)

      if (!birthDate) {
        throw new Error('No valid birth date found')
      }

      // Get location
      const locationResource = this.resolveLocation(record.parish_nm, record.location_uuid)
      if (!locationResource) {
        throw new Error(`Location not found: ${record.parish_nm}`)
      }

      // Build child name
      const childName = this.buildName(record.c_frst_nm, record.c_mid_nm, record.c_last_nm || record.m_last_nm || record.f_last_nm)

      if (!childName.use || !childName.family) {
        throw new Error('Child name incomplete')
      }

      // Build composition
      const composition = {
        resourceType: 'Bundle',
        type: 'document',
        entry: [{
          resource: {
            resourceType: 'Composition',
            id: `birth-${record.printlog_id || Date.now()}`,
            status: 'preliminary',
            type: {
              coding: [{
                system: 'http://opencrvs.org/doc-types',
                code: 'birth-declaration'
              }]
            },
            class: {
              coding: [{
                system: 'http://opencrvs.org/doc-classes',
                code: 'crvs-document'
              }]
            },
            title: 'Birth Declaration',
            section: [{
              title: 'Birth Registration',
              code: {
                coding: [{
                  system: 'http://opencrvs.org/sections',
                  code: 'birth-registration'
                }]
              }
            }]
          }
        }],
        meta: {
          lastUpdated: new Date().toISOString()
        },
        // OpenCRVS specific fields
        child: {
          name: [childName],
          gender: this.standardizeGender(record.gender_standardized || record.c_sex),
          birthDate: birthDate,
          identifier: []
        },
        eventLocation: {
          address: {
            line: [record.c_address || ''],
            district: locationResource.name,
            state: locationResource.partOf?.display,
            country: 'ATG'
          }
        }
      }

      // Add mother information if available
      if (record.m_frst_nm) {
        const motherName = this.buildName(record.m_frst_nm, record.m_mid_nm, record.m_last_nm)
        composition.mother = {
          detailsExist: true,
          name: [motherName],
          birthDate: record.m_dob || '1900-01-01',
          identifier: []
        }
      }

      // Add father information if available
      if (record.f_frst_nm) {
        const fatherName = this.buildName(record.f_frst_nm, record.f_mid_nm, record.f_last_nm)
        composition.father = {
          detailsExist: true,
          name: [fatherName],
          birthDate: record.f_dob || '1900-01-01',
          identifier: []
        }
      }

      // Add informant information
      const informantType = record.informant_type_mapped || 'OTHER'
      composition.informant = {
        relationship: informantType,
        individual: {
          name: [this.buildName(record.i_name, '', '')],
          address: {
            line: [record.i_address || '']
          }
        }
      }

      // Add registration information
      if (record.reg_dt) {
        composition.registration = {
          status: [{
            timestamp: record.reg_dt,
            timeLoggedMS: 0
          }]
        }
      }

      return composition

    } catch (error) {
      console.error(`Failed to build composition for record ${record.printlog_id}:`, error.message)
      return null
    }
  }

  parseDate(dateValue) {
    if (!dateValue || dateValue === 'NULL' || dateValue === '') return null

    // Handle datetime strings like "1944-01-22 00:00:00.0000000"
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateValue.trim())) {
      return dateValue.trim().substring(0, 10) // Extract YYYY-MM-DD
    }

    return null
  }

  buildName(first, middle, last) {
    const given = [first, middle].filter(n => n && n !== 'NULL' && n.trim()).map(n => n.trim())
    const family = last && last !== 'NULL' ? last.trim() : ''

    return {
      use: 'en',
      given: given.length > 0 ? given : ['Unknown'],
      family: family || 'Unknown'
    }
  }

  standardizeGender(gender) {
    if (!gender) return 'unknown'
    const g = gender.toString().toLowerCase()
    if (g === 'm' || g === 'male' || g === '1') return 'male'
    if (g === 'f' || g === 'female' || g === '2') return 'female'
    return 'unknown'
  }

  resolveLocation(parishName, locationUuid) {
    // Try UUID first
    if (locationUuid && this.locationCache.has(locationUuid)) {
      return this.locationCache.get(locationUuid)
    }

    // Try parish name
    if (parishName) {
      const normalized = parishName.trim().toUpperCase()
      if (this.locationCache.has(normalized)) {
        return this.locationCache.get(normalized)
      }

      // Try partial matching
      for (const [key, location] of this.locationCache) {
        if (typeof key === 'string' && (key.includes(normalized) || normalized.includes(key))) {
          return location
        }
      }
    }

    return null
  }

  async submitBirthRegistration(composition) {
    try {
      const response = await fetch(`${MIGRATION_CONFIG.opencrvsUrl}/create-birth-registration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(composition)
      })

      const result = await response.json()

      if (response.ok) {
        return {
          success: true,
          trackingId: result.trackingId || result.id,
          compositionId: result.compositionId || result.id,
          isDuplicate: false
        }
      } else if (response.status === 409 || result.message?.includes('duplicate')) {
        return {
          success: false,
          isDuplicate: true,
          trackingId: result.trackingId || result.id,
          compositionId: result.compositionId || result.id,
          error: result.message || 'Duplicate detected'
        }
      } else {
        return {
          success: false,
          isDuplicate: false,
          error: result.message || `HTTP ${response.status}`
        }
      }
    } catch (error) {
      return {
        success: false,
        isDuplicate: false,
        error: error.message
      }
    }
  }

  generateMigrationReport(outputDir) {
    const report = {
      summary: this.stats,
      timestamp: new Date().toISOString(),
      successRate: ((this.stats.successfulImports / this.stats.totalRecords) * 100).toFixed(1),
      duplicateRate: ((this.stats.duplicatesSkipped / this.stats.totalRecords) * 100).toFixed(1),
      failureRate: ((this.stats.failures / this.stats.totalRecords) * 100).toFixed(1)
    }

    fs.writeFileSync(
      path.join(outputDir, 'migration-report.json'),
      JSON.stringify(report, null, 2)
    )

    console.log('\n📊 Migration Summary:')
    console.log(`   • Total Records: ${this.stats.totalRecords}`)
    console.log(`   • Successful: ${this.stats.successfulImports}`)
    console.log(`   • Duplicates: ${this.stats.duplicatesSkipped}`)
    console.log(`   • Failures: ${this.stats.failures}`)
    console.log(`   • Success Rate: ${report.successRate}%`)
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Usage
async function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.log('Usage: node 2-migration-birth.js <input.csv> <output-dir>')
    console.log('')
    console.log('Environment variables:')
    console.log('  OPENCRVS_URL=http://localhost:5001')
    console.log('  OPENCRVS_USERNAME=e.mayuka')
    console.log('  OPENCRVS_PASSWORD=test')
    console.log('  BATCH_SIZE=5')
    console.log('  DELAY_MS=10000')
    console.log('  MAX_RETRIES=3')
    process.exit(1)
  }

  try {
    const migrator = new BirthMigrationTool()
    const stats = await migrator.migrateFromCSV(args[0], args[1])

    console.log('\n✅ Migration completed successfully')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { BirthMigrationTool }