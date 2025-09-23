#!/usr/bin/env node
// data-migration/scripts/1-data-preparation.js
// Consolidates: Excel→CSV conversion, cleaning, standardization, quality grading, review queue

const fs = require('fs')
const path = require('path')

const PIPELINE_CONFIG = {
  inputDir: '../data/source',
  outputDir: '../data/processed',
  qualityThresholds: {
    HIGH: 0.9,     // Auto-approve for import
    MEDIUM: 0.7,   // Requires review
    LOW: 0.5       // Requires manual correction
  },
  batchSize: 1000,
  requiredFields: ['c_frst_nm', 'c_dob', 'parish_nm']
}

class DataPreparationPipeline {
  constructor() {
    this.stats = {
      totalRecords: 0,
      highQuality: 0,
      mediumQuality: 0,
      lowQuality: 0,
      failed: 0
    }
    this.locationMapping = this.loadLocationMapping()
    this.setupDirectories()
  }

  setupDirectories() {
    const dirs = [
      `${PIPELINE_CONFIG.outputDir}/high-quality`,
      `${PIPELINE_CONFIG.outputDir}/medium-quality`,
      `${PIPELINE_CONFIG.outputDir}/low-quality`,
      `${PIPELINE_CONFIG.outputDir}/failed`,
      `${PIPELINE_CONFIG.outputDir}/review-queue`,
      `${PIPELINE_CONFIG.outputDir}/reports`
    ]

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    })
  }

  async processAllFiles() {
    console.log('🚀 Starting Data Preparation Pipeline')
    console.log('=====================================')

    const sourceFiles = fs.readdirSync(PIPELINE_CONFIG.inputDir)
      .filter(file => file.endsWith('.csv'))
      .filter(file => !file.includes('backup'))  // Skip backup files

    // Warn if Excel files are found
    const xlsxFiles = fs.readdirSync(PIPELINE_CONFIG.inputDir)
      .filter(file => file.endsWith('.xlsx') && !file.includes('backup'))
    if (xlsxFiles.length > 0) {
      console.log(`⚠️  Found ${xlsxFiles.length} XLSX files. Run 'node 0-xlsx-to-csv.js' first to convert them.`)
    }

    console.log(`📂 Found ${sourceFiles.length} source files`)

    for (const file of sourceFiles) {
      console.log(`\n📝 Processing: ${file}`)
      const inputPath = path.join(PIPELINE_CONFIG.inputDir, file)
      const baseName = path.basename(file, path.extname(file))

      try {
        const records = await this.loadAndConvertFile(inputPath)
        console.log(`   Loaded ${records.length} records`)

        await this.processRecords(records, baseName)

      } catch (error) {
        console.error(`❌ Failed to process ${file}:`, error.message)
      }
    }

    this.generatePipelineReport()
    console.log('\n✅ Data Preparation Pipeline Complete')
  }

  async loadAndConvertFile(filePath) {
    const ext = path.extname(filePath).toLowerCase()

    if (ext === '.csv') {
      return this.parseCSV(filePath)
    } else {
      throw new Error(`Unsupported file type: ${ext}. Please run 'node 0-xlsx-to-csv.js' first to convert Excel files.`)
    }
  }

  parseCSV(csvFilePath) {
    const data = fs.readFileSync(csvFilePath, 'utf8')
    const lines = data.split('\n').filter(line => line.trim())

    if (lines.length === 0) return []

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

  async processRecords(records, baseName) {
    this.stats.totalRecords += records.length

    const processed = {
      high: [],
      medium: [],
      low: [],
      failed: []
    }

    for (let i = 0; i < records.length; i++) {
      const record = records[i]

      try {
        // Step 1: Clean and standardize
        const cleaned = this.cleanRecord(record)

        // Step 2: Add analysis columns
        const analyzed = this.addAnalysisColumns(cleaned)

        // Step 3: Quality assessment
        const graded = this.assessQuality(analyzed)

        // Step 4: Route to appropriate quality bucket
        if (graded.quality_score >= PIPELINE_CONFIG.qualityThresholds.HIGH) {
          processed.high.push(graded)
          this.stats.highQuality++
        } else if (graded.quality_score >= PIPELINE_CONFIG.qualityThresholds.MEDIUM) {
          processed.medium.push(graded)
          this.stats.mediumQuality++
        } else if (graded.quality_score >= PIPELINE_CONFIG.qualityThresholds.LOW) {
          processed.low.push(graded)
          this.stats.lowQuality++
        } else {
          processed.failed.push({
            original: record,
            issues: graded.issues || ['Quality score too low'],
            quality_score: graded.quality_score
          })
          this.stats.failed++
        }

      } catch (error) {
        processed.failed.push({
          original: record,
          issues: [error.message],
          quality_score: 0
        })
        this.stats.failed++
      }
    }

    // Write quality-graded files
    await this.writeQualityFiles(processed, baseName)

    // Create review queue for medium/low quality
    await this.createReviewQueue(processed.medium.concat(processed.low), baseName)

    console.log(`   ✅ High Quality: ${processed.high.length}`)
    console.log(`   ⚠️  Medium Quality: ${processed.medium.length}`)
    console.log(`   🔍 Low Quality: ${processed.low.length}`)
    console.log(`   ❌ Failed: ${processed.failed.length}`)
  }

  cleanRecord(record) {
    const cleaned = { ...record }

    // Clean names
    const nameFields = ['c_frst_nm', 'c_mid_nm', 'c_last_nm', 'm_frst_nm', 'f_frst_nm', 'm_last_nm', 'f_last_nm']
    for (const field of nameFields) {
      if (cleaned[field]) {
        cleaned[field] = this.cleanName(cleaned[field])
      }
    }

    // Clean and standardize dates
    const dateFields = ['c_dob', 'reg_dt', 'm_dob', 'f_dob', 'death_dt', 'marriage_dt']
    for (const field of dateFields) {
      if (cleaned[field]) {
        const cleanDate = this.parseDate(cleaned[field])
        cleaned[field] = cleanDate || cleaned[field]
      }
    }

    // Add clean birth_date column
    cleaned.birth_date = this.parseDate(cleaned.c_dob) || ''

    // Standardize gender
    cleaned.gender_standardized = this.standardizeGender(cleaned.c_sex)

    // Clean and normalize location
    cleaned.parish_normalized = this.normalizeLocation(cleaned.parish_nm)

    // Process addresses - normalize and prepare for structured output
    cleaned.c_address_normalized = this.normalizeAddressText(cleaned.c_address)
    cleaned.m_address_normalized = this.normalizeAddressText(cleaned.m_address)
    cleaned.f_address_normalized = this.normalizeAddressText(cleaned.f_address)
    cleaned.i_address_normalized = this.normalizeAddressText(cleaned.i_address)

    return cleaned
  }

  addAnalysisColumns(record) {
    let analyzed = { ...record }

    // Resolve location UUID
    const locationResult = this.resolveLocation(analyzed.parish_nm || analyzed.parish_normalized)
    analyzed.location_uuid = locationResult.uuid
    analyzed.location_resolved = locationResult.resolved

    // Build structured address fields for all addresses
    analyzed = this.buildAddressFields(analyzed, 'c_address', locationResult)
    analyzed = this.buildAddressFields(analyzed, 'm_address', locationResult)
    analyzed = this.buildAddressFields(analyzed, 'f_address', locationResult)
    analyzed = this.buildAddressFields(analyzed, 'i_address', locationResult)

    // Add shared address logic for parents (from proven import script)
    analyzed.shared_address = this.getSharedAddress(analyzed.f_address_normalized, analyzed.m_address_normalized, locationResult)

    // Map informant type with enhanced name matching
    analyzed.informant_type_mapped = this.mapInformantType(analyzed.i_desc, analyzed)

    // Detect hospital delivery
    analyzed.is_hospital_delivery = this.detectHospitalDelivery(analyzed)
    analyzed.hospital_name = analyzed.is_hospital_delivery ? this.extractHospitalName(analyzed) : ''

    // Analyze informant relationship
    analyzed.informant_type_analyzed = this.analyzeInformantType(analyzed)

    // Check for affidavit
    analyzed.has_affidavit = this.detectAffidavit(analyzed)

    // Add analysis comments
    analyzed.analysis_comments = this.generateAnalysisComments(analyzed)

    // Add metadata comments for registration info
    analyzed.registration_comments = this.buildRegistrationComments(analyzed)

    // Pre-build legacy identifiers (used in import)
    analyzed.legacy_identifiers = this.buildLegacyIdentifiers(analyzed)

    // Pre-build registration draft ID (used in import)
    analyzed.registration_draft_id = this.buildRegistrationDraftId(analyzed)

    return analyzed
  }

  assessQuality(record) {
    const issues = []
    let score = 1.0

    // Required field checks
    PIPELINE_CONFIG.requiredFields.forEach(field => {
      if (!record[field] || record[field] === 'NULL' || record[field] === '') {
        issues.push(`Missing required field: ${field}`)
        score -= 0.2
      }
    })

    // Date validation
    if (!record.birth_date) {
      issues.push('Invalid or missing birth date')
      score -= 0.3
    }

    // Location validation
    if (!record.location_resolved) {
      issues.push('Location not resolved')
      score -= 0.2
    }

    // Name completeness
    if (!record.c_frst_nm || !record.c_last_nm) {
      issues.push('Incomplete child name')
      score -= 0.1
    }

    // Parent information completeness
    const hasMotherInfo = record.m_frst_nm && record.m_last_nm
    const hasFatherInfo = record.f_frst_nm && record.f_last_nm

    if (!hasMotherInfo && !hasFatherInfo) {
      issues.push('Missing parent information')
      score -= 0.1
    }

    // Bonus for additional quality indicators
    if (record.cert_nbr) score += 0.1
    if (record.reg_dt) score += 0.05
    if (record.is_hospital_delivery) score += 0.05

    return {
      ...record,
      quality_score: Math.max(0, Math.min(1, score)),
      issues: issues,
      needs_review: issues.length > 0 || score < PIPELINE_CONFIG.qualityThresholds.MEDIUM
    }
  }

  async writeQualityFiles(processed, baseName) {
    const qualities = ['high', 'medium', 'low']

    for (const quality of qualities) {
      if (processed[quality].length > 0) {
        const fileName = `${baseName}_${quality}_quality.csv`
        const filePath = path.join(PIPELINE_CONFIG.outputDir, `${quality}-quality`, fileName)
        await this.writeCSV(filePath, processed[quality])
      }
    }

    // Write failed records
    if (processed.failed.length > 0) {
      const failedPath = path.join(PIPELINE_CONFIG.outputDir, 'failed', `${baseName}_failed.json`)
      fs.writeFileSync(failedPath, JSON.stringify(processed.failed, null, 2))
    }
  }

  async createReviewQueue(records, baseName) {
    if (records.length === 0) return

    const reviewFile = {
      sourceFile: baseName,
      created: new Date().toISOString(),
      totalRecords: records.length,
      records: records.map(record => ({
        ...record,
        reviewStatus: 'pending',
        reviewComments: '',
        reviewedBy: '',
        reviewedAt: null
      }))
    }

    const reviewPath = path.join(PIPELINE_CONFIG.outputDir, 'review-queue', `${baseName}_review.json`)
    fs.writeFileSync(reviewPath, JSON.stringify(reviewFile, null, 2))

    console.log(`   📋 Created review queue: ${records.length} records`)
  }

  // Helper methods (condensed versions of the existing logic)

  cleanName(name) {
    if (!name || name === 'NULL') return ''
    return name.trim()
      .replace(/[^\w\s'-]/g, '')
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  parseDate(dateValue) {
    if (!dateValue || dateValue === 'NULL' || dateValue === '') return null

    // Handle datetime strings like "1944-01-22 00:00:00.0000000"
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateValue.trim())) {
      return dateValue.trim().substring(0, 10)
    }

    // Handle Excel serial numbers
    if (typeof dateValue === 'number' && dateValue > 0) {
      const excelEpoch = new Date(1900, 0, 1)
      const msPerDay = 24 * 60 * 60 * 1000
      const adjustedSerial = dateValue > 59 ? dateValue + 1 : dateValue
      const targetDate = new Date(excelEpoch.getTime() + (adjustedSerial - 1) * msPerDay)

      if (!isNaN(targetDate.getTime()) && targetDate.getFullYear() > 1900) {
        const year = targetDate.getFullYear()
        const month = String(targetDate.getMonth() + 1).padStart(2, '0')
        const day = String(targetDate.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
    }

    return null
  }

  standardizeGender(gender) {
    if (!gender) return 'unknown'
    const g = gender.toString().toLowerCase()
    if (g === 'm' || g === 'male' || g === '1') return 'male'
    if (g === 'f' || g === 'female' || g === '2') return 'female'
    return 'unknown'
  }

  normalizeLocation(location) {
    if (!location) return ''
    return location.trim().toUpperCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ')
  }

  resolveLocation(parishName) {
    if (!parishName) return { uuid: null, resolved: false }

    const normalized = parishName.trim().toUpperCase()
    const mapped = this.locationMapping.parishes && this.locationMapping.parishes[normalized]

    if (mapped) {
      return { uuid: mapped.uuid, resolved: true }
    }

    return { uuid: null, resolved: false }
  }

  normalizeAddressText(raw) {
    if (!raw || raw === 'NULL') {
      return ''
    }
    return raw.trim()
      .toUpperCase()
      .replace(/\bRD\.?\b/g, 'ROAD')
      .replace(/\bST\.?\b/g, 'STREET')
      .replace(/\bAVE\.?\b/g, 'AVENUE')
      .replace(/\bBLVD\.?\b/g, 'BOULEVARD')
      .replace(/\bPL\.?\b/g, 'PLACE')
      .replace(/\bDR\.?\b/g, 'DRIVE')
      .replace(/\bCT\.?\b/g, 'COURT')
      .replace(/\s+/g, ' ')
      .trim()
  }

  buildAddressFields(record, addressField, locationResult) {
    const normalizedField = `${addressField}_normalized`
    const addressText = record[normalizedField] || ''

    if (!addressText) {
      // Create empty address structure
      record[`${addressField}_type`] = ''
      record[`${addressField}_use`] = ''
      record[`${addressField}_city`] = ''
      record[`${addressField}_state`] = ''
      record[`${addressField}_country`] = 'ATG'
      record[`${addressField}_district`] = ''
      record[`${addressField}_text`] = ''
      return record
    }

    // Build structured address using proven logic from import script
    const parish = locationResult.resolved ? this.getParishNameFromUuid(locationResult.uuid) : (record.parish_nm || 'UNKNOWN')
    const stateUuid = locationResult.uuid ? this.getStateUuidFromParish(locationResult.uuid) : ''
    const stateName = this.getStateNameFromUuid(stateUuid)

    record[`${addressField}_type`] = 'PRIMARY_ADDRESS'
    record[`${addressField}_use`] = 'home'
    record[`${addressField}_city`] = addressText
    record[`${addressField}_state`] = stateUuid
    record[`${addressField}_country`] = 'ATG'
    record[`${addressField}_district`] = locationResult.uuid || ''
    record[`${addressField}_text`] = `${addressText}, ${parish}, ${stateName}`

    return record
  }

  getStateUuidFromParish(parishUuid) {
    // Look up the parent state UUID from the parish mapping
    for (const parish of Object.values(this.locationMapping.parishes || {})) {
      if (parish.uuid === parishUuid && parish.parentRef) {
        // Extract UUID from parentRef like "Location/ee206508-d08e-4c58-ba74-2b466d091b7b"
        return parish.parentRef.replace('Location/', '')
      }
    }
    // Default fallback to Antigua if parish not found
    return 'ee206508-d08e-4c58-ba74-2b466d091b7b'
  }

  getParishNameFromUuid(parishUuid) {
    for (const parish of Object.values(this.locationMapping.parishes || {})) {
      if (parish.uuid === parishUuid) {
        return parish.name
      }
    }
    return 'UNKNOWN'
  }

  getStateNameFromUuid(stateUuid) {
    if (stateUuid === '180ccd05-c737-4e8b-bfbe-d86590be7ef7') {
      return 'Barbuda'
    }
    return 'Antigua'  // Default for Antigua or unknown
  }

  getSharedAddress(fatherAddr, motherAddr, locationResult) {
    const normalizedFather = this.normalizeAddressText(fatherAddr)
    const normalizedMother = this.normalizeAddressText(motherAddr)

    // If addresses are the same or very similar, use one shared address
    if (normalizedFather && normalizedMother) {
      if (normalizedFather === normalizedMother) {
        return this.buildCompleteAddress(normalizedFather, locationResult)
      }

      // Check if one address contains the other (e.g., "TINDALE" vs "TINDALE ROAD")
      if (normalizedFather.includes(normalizedMother) || normalizedMother.includes(normalizedFather)) {
        const longerAddress = normalizedFather.length > normalizedMother.length ? normalizedFather : normalizedMother
        return this.buildCompleteAddress(longerAddress, locationResult)
      }
    }

    // If only one parent has an address, use that
    if (normalizedFather && !normalizedMother) {
      return this.buildCompleteAddress(normalizedFather, locationResult)
    }
    if (normalizedMother && !normalizedFather) {
      return this.buildCompleteAddress(normalizedMother, locationResult)
    }

    return ''
  }

  buildCompleteAddress(addressText, locationResult) {
    if (!addressText) {
      return ''
    }

    // Build a complete address using location context (from proven import script)
    const parish = locationResult.resolved ? this.getParishNameFromUuid(locationResult.uuid) : 'UNKNOWN'
    const stateUuid = locationResult.uuid ? this.getStateUuidFromParish(locationResult.uuid) : 'ee206508-d08e-4c58-ba74-2b466d091b7b'
    const stateName = this.getStateNameFromUuid(stateUuid)

    return `${addressText}, ${parish}, ${stateName}`
  }

  mapInformantType(description, record = {}) {
    if (!description || description === 'NULL') {
      return 'OTHER'
    }

    const desc = description.toLowerCase().trim()

    // Check for hospital/health institution delivery
    const isHospitalDelivery = desc.includes('certificate from hospital') ||
                              desc.includes('hospital certificate') ||
                              desc.includes('medical certificate')

    // Check for affidavit cases
    const hasAffidavit = desc.includes('affidavit') || desc.includes('sworn') || desc.includes('affidavis')

    // Determine informant type with enhanced name matching
    let informantType = 'OTHER'

    // First check for explicit relationship words (using word boundaries to avoid false matches)
    if (desc.includes('mother') || desc.includes('mom')) {
      informantType = 'MOTHER'
    } else if (desc.includes('father') || desc.includes('dad')) {
      informantType = 'FATHER'
    } else if (/\b(son|daughter)\b/.test(desc)) {
      informantType = 'SON' // Using SON as generic for children
    } else if (desc.includes('grandmother')) {
      informantType = 'GRANDMOTHER'
    } else if (desc.includes('grandfather')) {
      informantType = 'GRANDFATHER'
    } else if (isHospitalDelivery) {
      informantType = 'HEALTHCARE_PROVIDER'
    } else if (hasAffidavit && record) {
      // For affidavits, try to match names against parents
      const clean = (value) => (value && value !== 'NULL' ? value.trim() : '')
      const motherFirstName = clean(record.m_frst_nm)?.toLowerCase()
      const motherLastName = clean(record.m_last_nm)?.toLowerCase()
      const fatherFirstName = clean(record.f_frst_nm)?.toLowerCase()
      const fatherLastName = clean(record.f_last_nm)?.toLowerCase()

      const motherPresent = Boolean(motherFirstName || motherLastName)
      const fatherPresent = Boolean(fatherFirstName || fatherLastName)

      // Check if mother's name appears in the description
      const motherNameMatch = (motherFirstName && desc.includes(motherFirstName)) ||
                             (motherLastName && desc.includes(motherLastName))

      // Check if father's name appears in the description
      const fatherNameMatch = (fatherFirstName && desc.includes(fatherFirstName)) ||
                             (fatherLastName && desc.includes(fatherLastName))

      // Prefer informant based on name match and presence
      if (motherNameMatch && motherPresent && fatherNameMatch && fatherPresent) {
        // Both names match, prefer mother as primary informant
        informantType = 'MOTHER'
      } else if (motherNameMatch && motherPresent) {
        informantType = 'MOTHER'
      } else if (fatherNameMatch && fatherPresent) {
        informantType = 'FATHER'
      } else if (motherPresent) {
        // Default to mother if present but no explicit match
        informantType = 'MOTHER'
      } else if (fatherPresent) {
        // Default to father if present but no explicit match
        informantType = 'FATHER'
      }
    }

    return informantType
  }

  detectHospitalDelivery(record) {
    const indicators = [record.i_desc, record.analysis_comments, record.bptsml_nm]
    return indicators.some(field =>
      field && field.toLowerCase().includes('hospital')
    )
  }

  extractHospitalName(record) {
    if (record.i_desc && record.i_desc.toLowerCase().includes('hospital')) {
      return 'hospital'
    }
    return ''
  }

  analyzeInformantType(record) {
    return this.mapInformantType(record.i_desc)
  }

  detectAffidavit(record) {
    const indicators = [record.i_desc, record.analysis_comments]
    return indicators.some(field =>
      field && field.toLowerCase().includes('affidavit')
    )
  }

  generateAnalysisComments(record) {
    const comments = []

    if (record.has_affidavit) comments.push('Affidavit detected')
    if (record.is_hospital_delivery) comments.push('Hospital delivery')
    if (!record.location_resolved) comments.push('Location not resolved')
    if (record.informant_type_mapped === 'OTHER') comments.push('Informant type unclear')

    return comments.join('; ')
  }

  buildRegistrationComments(record) {
    const clean = (value) => (value && value !== 'NULL' ? value.trim() : undefined)
    const comments = []

    // Add informant details
    if (clean(record.i_desc)) {
      comments.push(`Informant Details: ${clean(record.i_desc)}`)
    }

    // Add registration date
    if (clean(record.reg_dt)) {
      const regDate = this.parseDate(record.reg_dt)
      if (regDate) {
        comments.push(`Registration Date: ${regDate}`)
      }
    }

    // Add page number if available
    if (clean(record.page_nbr)) {
      comments.push(`Source page number: ${clean(record.page_nbr)}`)
    }

    // Add entry information
    if (clean(record.entry_nbr)) {
      comments.push(`Entry number: ${clean(record.entry_nbr)}`)
    }

    if (clean(record.entry_yr)) {
      comments.push(`Entry year: ${clean(record.entry_yr)}`)
    }

    return comments.join('; ')
  }

  buildLegacyIdentifiers(record) {
    const clean = (value) => (value && value !== 'NULL' ? value.trim() : undefined)
    const identifiers = []

    if (clean(record.entry_nbr)) {
      identifiers.push({
        type: 'LEGACY_ENTRY_NUMBER',
        value: String(clean(record.entry_nbr))
      })
    }

    if (clean(record.page_nbr)) {
      identifiers.push({
        type: 'LEGACY_PAGE_NUMBER',
        value: String(clean(record.page_nbr))
      })
    }

    return JSON.stringify(identifiers)
  }

  buildRegistrationDraftId(record) {
    const clean = (value) => (value && value !== 'NULL' ? value.trim() : undefined)

    return clean(record.entry_nbr)
      ? `draft-${clean(record.entry_yr) || '0000'}-${clean(record.entry_nbr)}`
      : `draft-auto-${Date.now()}`
  }

  loadLocationMapping() {
    try {
      const mappingPath = path.join(__dirname, '../config/location-uuid-mapping.json')
      return JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
    } catch (error) {
      console.warn('⚠️  Location mapping file not found')
      return { parishes: {} }
    }
  }

  async writeCSV(outputPath, data) {
    if (data.length === 0) return

    const headers = Object.keys(data[0])
    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...data.map(row => headers.map(header => {
        const value = (row[header] || '').toString()
        return `"${value.replace(/"/g, '""')}"`
      }).join(','))
    ].join('\n')

    fs.writeFileSync(outputPath, csvContent, 'utf8')
  }

  generatePipelineReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.stats,
      qualityDistribution: {
        high: `${((this.stats.highQuality / this.stats.totalRecords) * 100).toFixed(1)}%`,
        medium: `${((this.stats.mediumQuality / this.stats.totalRecords) * 100).toFixed(1)}%`,
        low: `${((this.stats.lowQuality / this.stats.totalRecords) * 100).toFixed(1)}%`,
        failed: `${((this.stats.failed / this.stats.totalRecords) * 100).toFixed(1)}%`
      },
      nextSteps: {
        readyForImport: `${this.stats.highQuality} records in high-quality/`,
        needsReview: `${this.stats.mediumQuality + this.stats.lowQuality} records in review-queue/`,
        needsManualFix: `${this.stats.failed} records in failed/`
      }
    }

    const reportPath = path.join(PIPELINE_CONFIG.outputDir, 'reports', 'pipeline-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

    console.log('\n📊 Pipeline Summary:')
    console.log(`   Total Records: ${this.stats.totalRecords}`)
    console.log(`   ✅ High Quality (ready for import): ${this.stats.highQuality} (${report.qualityDistribution.high})`)
    console.log(`   ⚠️  Medium Quality (needs review): ${this.stats.mediumQuality} (${report.qualityDistribution.medium})`)
    console.log(`   🔍 Low Quality (needs review): ${this.stats.lowQuality} (${report.qualityDistribution.low})`)
    console.log(`   ❌ Failed (needs manual fix): ${this.stats.failed} (${report.qualityDistribution.failed})`)
    console.log(`\n📁 Output Locations:`)
    console.log(`   Ready for import: ${PIPELINE_CONFIG.outputDir}/high-quality/`)
    console.log(`   Needs review: ${PIPELINE_CONFIG.outputDir}/review-queue/`)
    console.log(`   Failed records: ${PIPELINE_CONFIG.outputDir}/failed/`)
  }
}

// Usage
async function main() {
  try {
    const pipeline = new DataPreparationPipeline()
    await pipeline.processAllFiles()
  } catch (error) {
    console.error('❌ Pipeline failed:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { DataPreparationPipeline }