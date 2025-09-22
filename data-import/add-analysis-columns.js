#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse')
const { stringify } = require('csv-stringify')

function analyzeInformantDescription(iDesc, row = {}) {
  if (!iDesc || iDesc === 'NULL') {
    return {
      informant_type_analyzed: 'OTHER',
      is_hospital_delivery: 'false',
      hospital_name: '',
      has_affidavit: 'false',
      analysis_comments: ''
    }
  }

  const desc = iDesc.toLowerCase().trim()

  // Check for hospital/health institution delivery
  const isHospitalDelivery = desc.includes('certificate from hospital') ||
                            desc.includes('hospital certificate') ||
                            desc.includes('medical certificate')

  // Extract hospital name if mentioned
  let hospitalName = ''
  if (isHospitalDelivery) {
    // Look for patterns like "certificate from [hospital name]"
    const hospitalMatch = desc.match(/certificate from ([^,]+)/i)
    if (hospitalMatch) {
      hospitalName = hospitalMatch[1].trim()
    }
  }

  // Check for affidavit cases
  const hasAffidavit = desc.includes('affidavit') || desc.includes('sworn') || desc.includes('affidavis')

  // Determine informant type with enhanced name matching
  let informantType = 'OTHER'

  // First check for explicit relationship words
  if (desc.includes('mother') || desc.includes('mom')) {
    informantType = 'MOTHER'
  } else if (desc.includes('father') || desc.includes('dad')) {
    informantType = 'FATHER'
  } else if (desc.includes('son')) {
    informantType = 'SON'
  } else if (desc.includes('daughter')) {
    informantType = 'DAUGHTER'
  } else if (desc.includes('grandmother')) {
    informantType = 'GRANDMOTHER'
  } else if (desc.includes('grandfather')) {
    informantType = 'GRANDFATHER'
  } else if (isHospitalDelivery) {
    informantType = 'HEALTHCARE_PROVIDER'
  } else if (hasAffidavit && row) {
    // For affidavits, try to match names against parents
    const clean = (value) => (value && value !== 'NULL' ? value.trim() : '')
    const motherFirstName = clean(row.m_frst_nm)?.toLowerCase()
    const motherLastName = clean(row.m_last_nm)?.toLowerCase()
    const fatherFirstName = clean(row.f_frst_nm)?.toLowerCase()
    const fatherLastName = clean(row.f_last_nm)?.toLowerCase()

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

  return {
    informant_type_analyzed: informantType,
    is_hospital_delivery: isHospitalDelivery ? 'true' : 'false',
    hospital_name: hospitalName,
    has_affidavit: hasAffidavit ? 'true' : 'false',
    analysis_comments: hasAffidavit ? iDesc.trim() : ''
  }
}

async function processCSV(inputFile, outputFile) {
  return new Promise((resolve, reject) => {
    const output = []
    let headerProcessed = false

    fs.createReadStream(inputFile)
      .pipe(parse({ columns: true, quote: '"', escape: '"' }))
      .on('data', (row) => {
        if (!headerProcessed) {
          // Add new column headers
          const analysis = analyzeInformantDescription('')
          Object.keys(analysis).forEach(key => {
            if (!(key in row)) {
              row[key] = ''
            }
          })
          headerProcessed = true
        }

        // Analyze the i_desc field with full row context for name matching
        const analysis = analyzeInformantDescription(row.i_desc, row)

        // Add analysis results to row
        Object.assign(row, analysis)

        output.push(row)
      })
      .on('end', () => {
        // Write the enhanced CSV
        stringify(output, {
          header: true,
          quoted: true,
          quote: '"',
          escape: '"'
        }, (err, csvString) => {
          if (err) {
            reject(err)
            return
          }

          fs.writeFileSync(outputFile, csvString)
          console.log(`Enhanced CSV written to: ${outputFile}`)
          console.log(`Added analysis columns: informant_type_analyzed, is_hospital_delivery, hospital_name, has_affidavit, analysis_comments`)
          console.log(`Processed ${output.length} rows`)
          resolve()
        })
      })
      .on('error', reject)
  })
}

if (require.main === module) {
  const inputFile = process.argv[2]
  const outputFile = process.argv[3]

  if (!inputFile || !outputFile) {
    console.error('Usage: node add-analysis-columns.js <input.csv> <output.csv>')
    process.exit(1)
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`)
    process.exit(1)
  }

  processCSV(inputFile, outputFile)
    .then(() => {
      console.log('Analysis columns added successfully!')
    })
    .catch((err) => {
      console.error('Error processing CSV:', err)
      process.exit(1)
    })
}

module.exports = { analyzeInformantDescription, processCSV }