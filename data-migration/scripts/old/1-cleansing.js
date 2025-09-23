// scripts/1-cleansing.js
const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

const CLEANSING_CONFIG = {
  batchSize: 5000,
  outputFormat: 'csv',
  validationRules: {
    requiredFields: ['c_frst_nm', 'c_last_nm', 'parish_nm', 'event'],
    dateFields: ['c_dob', 'reg_dt', 'death_dt', 'marriage_dt'],
    nameFields: ['c_frst_nm', 'c_mid_nm', 'c_last_nm', 'm_frst_nm', 'f_frst_nm']
  }
}

class DataCleanser {
  constructor() {
    this.locationMapping = this.loadLocationMapping()
    this.stats = {
      totalRecords: 0,
      cleanedRecords: 0,
      failedRecords: 0,
      issuesFound: {}
    }
  }

  async cleanseExcelFiles(sourceDir, outputDir) {
    console.log('🧹 Starting data cleansing process...')

    const excelFiles = fs.readdirSync(sourceDir)
      .filter(file => file.endsWith('.xlsx'))

    for (const file of excelFiles) {
      console.log(`Processing: ${file}`)
      await this.processExcelFile(
        path.join(sourceDir, file),
        path.join(outputDir, file.replace('.xlsx', '-cleansed.csv'))
      )
    }

    this.generateCleansingReport(outputDir)
  }

  async processExcelFile(inputPath, outputPath) {
    const workbook = XLSX.readFile(inputPath)
    const sheetName = workbook.SheetNames[0]
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])

    this.stats.totalRecords += rawData.length

    const cleanedData = []
    const failedData = []

    for (const record of rawData) {
      try {
        const cleaned = await this.cleanseRecord(record)
        if (cleaned) {
          cleanedData.push(cleaned)
          this.stats.cleanedRecords++
        } else {
          failedData.push({
            original: record,
            issues: cleaned.issues || ['Unknown validation failure']
          })
          this.stats.failedRecords++
        }
      } catch (error) {
        failedData.push({
          original: record,
          issues: [error.message]
        })
        this.stats.failedRecords++
      }
    }

    // Write cleansed data
    await this.writeCSV(outputPath, cleanedData)

    // Write failed records for manual review
    if (failedData.length > 0) {
      const failedPath = outputPath.replace('.csv', '-FAILED.json')
      fs.writeFileSync(failedPath, JSON.stringify(failedData, null, 2))
    }
  }

  async cleanseRecord(record) {
    const issues = []
    const cleaned = { ...record }

    // 1. Validate required fields
    for (const field of CLEANSING_CONFIG.validationRules.requiredFields) {
      if (!record[field] || record[field] === 'NULL' || record[field] === '') {
        issues.push(`Missing required field: ${field}`)
      }
    }

    // 2. Clean and validate names
    CLEANSING_CONFIG.validationRules.nameFields.forEach(field => {
      if (record[field]) {
        cleaned[field] = this.cleanName(record[field])
      }
    })

    // 3. Parse and validate dates
    CLEANSING_CONFIG.validationRules.dateFields.forEach(field => {
      if (record[field] && record[field] !== 'NULL') {
        const parsed = this.parseDate(record[field])
        if (parsed) {
          cleaned[field] = parsed.toISOString().split('T')[0] // YYYY-MM-DD
        } else {
          issues.push(`Invalid date format: ${field}`)
        }
      }
    })

    // 4. Resolve location UUID
    const locationResult = await this.resolveLocation(record.parish_nm)
    cleaned.location_uuid = locationResult.uuid
    cleaned.location_resolved = locationResult.resolved
    if (!locationResult.resolved) {
      issues.push(`Location not resolved: ${record.parish_nm}`)
    }

    // 5. Map informant type
    cleaned.informant_type_mapped = this.mapInformantType(record.i_desc)

    // 6. Standardize gender
    cleaned.gender_standardized = this.standardizeGender(record.c_sex)

    // 7. Calculate quality score
    cleaned.quality_score = this.calculateQualityScore(cleaned, issues)

    // 8. Add clean birth_date column for easy migration
    if (cleaned.c_dob) {
      const birthDate = this.parseDate(cleaned.c_dob)
      cleaned.birth_date = birthDate ? birthDate.toISOString().split('T')[0] : ''
    } else {
      cleaned.birth_date = ''
    }

    // 9. Determine if manual review needed
    cleaned.needs_review = issues.length > 0 || cleaned.quality_score < 0.8

    // Track issues
    issues.forEach(issue => {
      this.stats.issuesFound[issue] = (this.stats.issuesFound[issue] || 0) + 1
    })

    return issues.length > 3 ? null : cleaned // Fail if too many issues
  }

  cleanName(name) {
    if (!name || name === 'NULL') return ''
    return name
      .trim()
      .replace(/[^\w\s'-]/g, '') // Remove special chars except apostrophes, hyphens
      .replace(/\s+/g, ' ') // Normalize whitespace
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  parseDate(dateValue) {
    if (!dateValue || dateValue === 'NULL' || dateValue === '') return null

    // Handle datetime strings like "1944-01-22 00:00:00.0000000"
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateValue.trim())) {
      const dateOnly = dateValue.trim().substring(0, 10) // Extract YYYY-MM-DD
      const parsed = new Date(dateOnly)
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
        return parsed
      }
    }

    // Handle Excel date serials
    if (typeof dateValue === 'number' && dateValue > 0) {
      // Excel epoch starts on January 1, 1900, but Excel incorrectly treats 1900 as a leap year
      const excelEpoch = new Date(1900, 0, 1)
      const msPerDay = 24 * 60 * 60 * 1000
      const adjustedSerial = dateValue > 59 ? dateValue + 1 : dateValue
      const targetDate = new Date(excelEpoch.getTime() + (adjustedSerial - 1) * msPerDay)

      if (!isNaN(targetDate.getTime()) && targetDate.getFullYear() > 1900) {
        return targetDate
      }
    }

    // Handle other string formats
    const formats = [
      /^\d{2}\/\d{2}\/\d{4}$/,
      /^\d{2}-\d{2}-\d{4}$/
    ]

    for (const format of formats) {
      if (format.test(dateValue)) {
        const parsed = new Date(dateValue)
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
          return parsed
        }
      }
    }

    return null
  }

  async resolveLocation(parishName) {
    if (!parishName || parishName === 'NULL') {
      return { uuid: null, resolved: false }
    }

    // Check pre-built mapping
    const normalized = parishName.trim().toUpperCase()
    const mapped = this.locationMapping.parishes[normalized]
    if (mapped) {
      return { uuid: mapped.uuid, resolved: true }
    }

    // Fuzzy matching for common variations
    const fuzzyMatch = this.fuzzyMatchLocation(parishName)
    if (fuzzyMatch) {
      return { uuid: fuzzyMatch, resolved: true }
    }

    return { uuid: null, resolved: false }
  }

  fuzzyMatchLocation(parishName) {
    const normalized = parishName.trim().toLowerCase()

    // Try partial matches
    const parishes = Object.keys(this.locationMapping.parishes)
    for (const parish of parishes) {
      const parishLower = parish.toLowerCase()
      if (parishLower.includes(normalized) || normalized.includes(parishLower)) {
        return this.locationMapping.parishes[parish].uuid
      }
    }

    return null
  }

  loadLocationMapping() {
    try {
      const mappingPath = path.join(__dirname, '../config/location-uuid-mapping.json')
      return JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
    } catch (error) {
      console.warn('Location mapping file not found, creating empty mapping')
      return { parishes: {}, states: {}, country: null }
    }
  }

  mapInformantType(description) {
    if (!description) return 'OTHER'

    const desc = description.toLowerCase()
    if (desc.includes('mother') || desc.includes('mom')) return 'MOTHER'
    if (desc.includes('father') || desc.includes('dad')) return 'FATHER'
    if (desc.includes('husband') || desc.includes('wife') || desc.includes('spouse')) return 'SPOUSE'
    if (desc.includes('son')) return 'SON'
    if (desc.includes('daughter')) return 'DAUGHTER'
    if (desc.includes('grandmother') || desc.includes('grandma')) return 'GRANDMOTHER'
    if (desc.includes('grandfather') || desc.includes('grandpa')) return 'GRANDFATHER'

    return 'OTHER'
  }

  standardizeGender(gender) {
    if (!gender) return 'unknown'
    const g = gender.toString().toLowerCase()
    if (g === 'm' || g === 'male' || g === '1') return 'male'
    if (g === 'f' || g === 'female' || g === '2') return 'female'
    return 'unknown'
  }

  calculateQualityScore(record, issues) {
    const totalFields = 20 // Key fields we care about
    let completedFields = 0

    // Count completed essential fields
    if (record.c_frst_nm) completedFields++
    if (record.c_last_nm) completedFields++
    if (record.c_dob) completedFields++
    if (record.gender_standardized !== 'unknown') completedFields++
    if (record.location_resolved) completedFields += 2 // Weight location higher
    if (record.informant_type_mapped !== 'OTHER') completedFields++
    if (record.m_frst_nm) completedFields++
    if (record.f_frst_nm) completedFields++
    if (record.reg_dt) completedFields++
    if (record.cert_nbr) completedFields += 2 // Weight cert number higher

    const baseScore = completedFields / totalFields
    const penaltyScore = Math.max(0, baseScore - (issues.length * 0.1))

    return Math.round(penaltyScore * 100) / 100
  }

  async writeCSV(outputPath, data) {
    if (data.length === 0) return

    const headers = Object.keys(data[0])
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const value = row[header] || ''
        // Escape commas and quotes
        return `"${value.toString().replace(/"/g, '""')}"`
      }).join(','))
    ].join('\n')

    fs.writeFileSync(outputPath, csvContent, 'utf8')
  }

  generateCleansingReport(outputDir) {
    const report = {
      summary: this.stats,
      timestamp: new Date().toISOString(),
      recommendations: this.generateRecommendations()
    }

    fs.writeFileSync(
      path.join(outputDir, 'cleansing-report.json'),
      JSON.stringify(report, null, 2)
    )

    console.log('\n📊 Cleansing Complete!')
    console.log(`Total Records: ${this.stats.totalRecords}`)
    console.log(`Cleaned: ${this.stats.cleanedRecords}`)
    console.log(`Failed: ${this.stats.failedRecords}`)
    console.log(`Success Rate: ${((this.stats.cleanedRecords / this.stats.totalRecords) * 100).toFixed(1)}%`)
  }

  generateRecommendations() {
    const recommendations = []

    if (this.stats.failedRecords > this.stats.totalRecords * 0.1) {
      recommendations.push('High failure rate detected - review data quality')
    }

    const topIssues = Object.entries(this.stats.issuesFound)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)

    recommendations.push('Top issues requiring attention:')
    topIssues.forEach(([issue, count]) => {
      recommendations.push(`- ${issue}: ${count} records`)
    })

    return recommendations
  }
}

// Usage
async function main() {
  try {
    const cleanser = new DataCleanser()
    await cleanser.cleanseExcelFiles('./data/source', './data/cleansed')
    console.log('✅ Cleansing completed')
  } catch (error) {
    console.error('❌ Cleansing failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { DataCleanser }