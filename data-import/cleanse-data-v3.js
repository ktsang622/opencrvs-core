#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

function convertExcelDate(serialDate) {
  if (!serialDate || serialDate === 'NULL' || serialDate === '') return null

  // Handle datetime strings like "1944-01-22 00:00:00.0000000"
  if (typeof serialDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(serialDate.trim())) {
    return serialDate.trim().substring(0, 10) // Extract just YYYY-MM-DD part
  }

  // Convert string to number if it's a string number
  const serialNumber = typeof serialDate === 'string' ? parseFloat(serialDate) : serialDate

  // Check if it's a valid Excel serial date (should be a positive number)
  if (isNaN(serialNumber) || serialNumber <= 0) return null

  // Excel epoch starts on January 1, 1900, but Excel incorrectly treats 1900 as a leap year
  const excelEpoch = new Date(1900, 0, 1)
  const msPerDay = 24 * 60 * 60 * 1000

  // Add 1 day to account for Excel's leap year bug for 1900
  const adjustedSerial = serialNumber > 59 ? serialNumber + 1 : serialNumber
  const targetDate = new Date(excelEpoch.getTime() + (adjustedSerial - 1) * msPerDay)

  // Format as YYYY-MM-DD
  const year = targetDate.getFullYear()
  const month = String(targetDate.getMonth() + 1).padStart(2, '0')
  const day = String(targetDate.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function cleanseRecord(record) {
  const cleaned = [...record] // Copy the record

  // Column indices based on CSV header
  const columns = {
    c_dob: 15,     // Child date of birth
    reg_dt: 23,    // Registration date
    m_dob: 32,     // Mother date of birth (if exists)
    f_dob: 33,     // Father date of birth (if exists)
    death_dt: 36,  // Death date (if exists)
    marriage_dt: 44 // Marriage date (if exists)
  }

  // Convert all date fields
  for (const [fieldName, index] of Object.entries(columns)) {
    if (cleaned[index]) {
      const convertedDate = convertExcelDate(cleaned[index])
      cleaned[index] = convertedDate || cleaned[index] // Keep original if conversion fails
    }
  }

  // Add clean birth_date column (this will be appended)
  const cleanBirthDate = convertExcelDate(cleaned[columns.c_dob]) || ''

  return {
    record: cleaned,
    birthDate: cleanBirthDate,
    issues: []
  }
}

function parseCSVLine(line) {
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

function cleanse(inputFile, outputFile) {
  console.log(`🧹 Cleansing data from ${inputFile}...`)

  const data = fs.readFileSync(inputFile, 'utf8')
  const lines = data.split('\n').filter(line => line.trim())
  const header = lines[0]
  const records = lines.slice(1)

  console.log(`📊 Processing ${records.length} records...`)

  // Add birth_date column to header
  const headerFields = parseCSVLine(header)
  headerFields.push('birth_date')
  const enhancedHeader = headerFields.map(field => `"${field.replace(/"/g, '')}"`).join(',')

  const cleansedLines = [enhancedHeader]
  const issues = []

  for (let i = 0; i < records.length; i++) {
    const record = parseCSVLine(records[i])
    const result = cleanseRecord(record)

    // Append the clean birth_date column
    result.record.push(result.birthDate)
    const enhancedRecord = result.record.map(field => `"${(field || '').toString().replace(/"/g, '')}"`).join(',')
    cleansedLines.push(enhancedRecord)

    if (result.issues.length > 0) {
      issues.push({
        line: i + 2, // +2 because we start from line 1 and skip header
        issues: result.issues
      })
    }
  }

  // Write cleansed data
  fs.writeFileSync(outputFile, cleansedLines.join('\n'))

  // Report results
  console.log(`✅ Cleansed data written to ${outputFile}`)
  console.log(`📈 Total records processed: ${records.length}`)
  console.log(`🎯 Added clean birth_date column`)

  if (issues.length > 0) {
    console.log(`⚠️  Records with issues: ${issues.length}`)
    issues.slice(0, 10).forEach(issue => {
      console.log(`   Line ${issue.line}: ${issue.issues.join(', ')}`)
    })
    if (issues.length > 10) {
      console.log(`   ... and ${issues.length - 10} more`)
    }
  }

  // Show sample of birth_date conversions
  console.log('\n📅 Sample birth_date conversions:')
  const sampleData = fs.readFileSync(outputFile, 'utf8').split('\n').slice(1, 6)
  sampleData.forEach((line, i) => {
    if (line.trim()) {
      const fields = line.split(',')
      const originalDob = fields[15] // c_dob column
      const cleanBirthDate = fields[fields.length - 1] // last column
      console.log(`   Row ${i + 1}: ${originalDob} → ${cleanBirthDate}`)
    }
  })
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.log('Usage: node cleanse-data-v3.js <input.csv> <output.csv>')
    process.exit(1)
  }

  const [inputFile, outputFile] = args
  cleanse(inputFile, outputFile)
}

module.exports = { cleanse, convertExcelDate }