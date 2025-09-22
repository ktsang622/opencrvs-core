#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse')
const { randomUUID } = require('crypto')
const { program } = require('commander')

function generateShortId() {
  return Math.random().toString(36).substr(2, 8)
}

function generateDeterministicId(name, dob, type) {
  // Create deterministic ID based on name and DOB for consistent deduplication
  const nameStr = name ? `${name.firstNames || ''}-${name.middleName || ''}-${name.familyName || ''}` : 'UNKNOWN'
  const dobStr = dob || '1900-01-01'
  const input = `${type}-${nameStr}-${dobStr}`.toUpperCase().replace(/[^A-Z0-9-]/g, '')

  // Simple hash function for deterministic short ID
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substr(0, 8).toUpperCase()
}

const CONFIG = {
  authUrl: process.env.AUTH_URL || 'http://localhost:4040',
  graphQlUrl: process.env.GRAPHQL_URL || 'http://localhost:7070/graphql',
  hearthUrl: process.env.FHIR_URL || 'http://localhost:3447/fhir',
  username: process.env.MIGRATION_USERNAME || 'dhenry.ht',
  password: process.env.MIGRATION_PASSWORD || 'test',
  totpCode: process.env.MIGRATION_TOTP || '000000'
}

program
  .requiredOption('-f, --file <path>', 'Path to cleansed CSV file')
  .option('-l, --limit <n>', 'Process only N rows', (value) => parseInt(value, 10))
  .option('--skip <n>', 'Skip N rows before processing', (value) => parseInt(value, 10), 0)
  .option('-b, --batch-size <n>', 'Number of rows per batch', (value) => parseInt(value, 10), 50)
  .parse(process.argv)

const options = program.opts()

async function authenticate() {
  const loginResponse = await fetch(`${CONFIG.authUrl}/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: CONFIG.username,
      password: CONFIG.password
    })
  })

  if (!loginResponse.ok) {
    const text = await loginResponse.text()
    throw new Error(`Authentication failed (${loginResponse.status}): ${text}`)
  }

  const loginBody = await loginResponse.json()

  if (loginBody.token) {
    return { userToken: loginBody.token }
  }

  if (!loginBody.nonce) {
    throw new Error('Authentication response missing nonce and token')
  }

  const verifyResponse = await fetch(`${CONFIG.authUrl}/verifyCode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nonce: loginBody.nonce,
      code: CONFIG.totpCode
    })
  })

  if (!verifyResponse.ok) {
    const text = await verifyResponse.text()
    throw new Error(`2FA verification failed (${verifyResponse.status}): ${text}`)
  }

  const verifyBody = await verifyResponse.json()
  if (!verifyBody.token) {
    throw new Error('2FA verification did not return a token')
  }

  return { userToken: verifyBody.token }
}

async function graphQlRequest(query, variables, token) {
  const response = await fetch(CONFIG.graphQlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  })

  const body = await response.json().catch(async () => {
    throw new Error(`Gateway response is not JSON (status ${response.status})`)
  })

  if (!response.ok || body.errors) {
    console.error('GraphQL error payload:', JSON.stringify(body, null, 2))
    const message = body.errors
      ? body.errors.map((err) => err.message || JSON.stringify(err)).join('; ')
      : `HTTP ${response.status}: ${JSON.stringify(body)}`
    throw new Error(message || `GraphQL request failed with status ${response.status}`)
  }

  return body.data
}

function convertExcelDate(serialDate) {
  if (!serialDate || serialDate === 'NULL') return null

  // If it's already a valid date string (YYYY-MM-DD), return as is
  if (typeof serialDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(serialDate.trim())) {
    return serialDate.trim()
  }

  // Convert string to number if it's a string number
  const serialNumber = typeof serialDate === 'string' ? parseFloat(serialDate) : serialDate

  // Check if it's a valid Excel serial date (should be a positive number)
  if (isNaN(serialNumber) || serialNumber <= 0) return null

  // Excel epoch starts on January 1, 1900, but Excel incorrectly treats 1900 as a leap year
  // Excel serial date 1 = January 1, 1900
  // We need to account for this leap year bug (add 1 day for dates after Feb 28, 1900)
  const excelEpoch = new Date(1900, 0, 1) // January 1, 1900
  const msPerDay = 24 * 60 * 60 * 1000

  // Subtract 1 because Excel serial date 1 = January 1, 1900 (not January 0)
  // Add 1 day to account for Excel's leap year bug for 1900
  const adjustedSerial = serialNumber > 59 ? serialNumber + 1 : serialNumber
  const targetDate = new Date(excelEpoch.getTime() + (adjustedSerial - 1) * msPerDay)

  // Format as YYYY-MM-DD
  const year = targetDate.getFullYear()
  const month = String(targetDate.getMonth() + 1).padStart(2, '0')
  const day = String(targetDate.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function normalizeDate(value) {
  if (!value || value === 'NULL') return undefined

  const trimmed = typeof value === 'string' ? value.trim() : value

  // Try Excel serial date conversion first
  const converted = convertExcelDate(trimmed)
  if (converted) return converted

  // If not an Excel date, return undefined for invalid dates
  return undefined
}

function cleanNameForGraphQL(nameObject) {
  if (!nameObject) return undefined

  // Remove internal flags that shouldn't be sent to GraphQL
  const { _isReferenceNote, ...cleanedName } = nameObject
  return cleanedName
}

function normaliseName(first = '', middle = '', family = '', isChild = false) {
  const cleanse = (value) =>
    value && value !== 'NULL' ? value.trim() : ''

  let cleanedFirst = cleanse(first)
  const cleanedMiddle = cleanse(middle)
  const cleanedFamily = cleanse(family)

  // Check if first name is a reference note (like "RE REG ON PAGE 164 #120 1994")
  const isReferenceNote = cleanedFirst && (
    cleanedFirst.includes('RE REG ON PAGE') ||
    cleanedFirst.includes('REG ON PAGE') ||
    cleanedFirst.includes('SEE PAGE') ||
    /PAGE\s+\d+.*#\d+/.test(cleanedFirst) ||
    /^\d{4}$/.test(cleanedFirst) // Just a year
  )

  if (isReferenceNote) {
    // Replace # with Nr. to make it valid, but this is still clearly a reference
    const sanitizedReference = cleanedFirst.replace(/#/g, 'Nr.')
    return {
      use: 'en',
      firstNames: sanitizedReference,
      middleName: cleanedMiddle || undefined,
      familyName: cleanedFamily || undefined,
      _isReferenceNote: true // Flag for comment generation
    }
  }

  if (isChild) {
    // For children: combine first and middle names, leave family name undefined if missing
    const combinedFirstNames = [cleanedFirst, cleanedMiddle].filter(Boolean).join(' ')
    return {
      use: 'en',
      firstNames: combinedFirstNames || undefined,
      familyName: cleanedFamily || undefined,
      _originalFamilyName: cleanedFamily, // Keep track of original value
      _needsFamilyNameFromParent: !cleanedFamily // Flag if we need to inherit from parent
    }
  } else {
    // For parents: keep original structure
    return {
      use: 'en',
      firstNames: cleanedFirst || undefined,
      middleName: cleanedMiddle || undefined,
      familyName: cleanedFamily || undefined
    }
  }
}

function normalizeAddressText(raw) {
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

function buildCompleteAddress(addressText, locationResource, row) {
  if (!addressText) {
    return undefined
  }

  const clean = (value) => (value && value !== 'NULL' ? value.trim() : undefined)

  // Build a complete address using location context
  const parish = locationResource ? locationResource.name : clean(row.parish_nm)
  const stateName = locationResource?.partOf?.reference?.includes('BARBUDA') ? 'Barbuda' : 'Antigua'
  const stateUuid = locationResource?.partOf?.reference?.replace('Location/', '') ||
                   (stateName === 'Barbuda' ? 'BARBUDA_UUID' : 'ee206508-d08e-4c58-ba74-2b466d091b7b')

  return {
    type: 'PRIMARY_ADDRESS',
    use: 'home',
    city: addressText, // Put the address as city/town instead of line
    state: stateUuid,
    country: 'ATG',
    district: locationResource ? locationResource.id : clean(row.location_uuid),
    text: `${addressText}, ${parish}, ${stateName}`
  }
}

function normaliseAddress(raw, locationResource, row) {
  const addressText = normalizeAddressText(raw)
  return buildCompleteAddress(addressText, locationResource, row)
}

function getSharedAddress(fatherAddr, motherAddr, locationResource, row) {
  const normalizedFather = normalizeAddressText(fatherAddr)
  const normalizedMother = normalizeAddressText(motherAddr)

  // If addresses are the same or very similar, use one shared address
  if (normalizedFather && normalizedMother) {
    if (normalizedFather === normalizedMother) {
      return buildCompleteAddress(normalizedFather, locationResource, row)
    }

    // Check if one address contains the other (e.g., "TINDALE" vs "TINDALE ROAD")
    if (normalizedFather.includes(normalizedMother) || normalizedMother.includes(normalizedFather)) {
      const longerAddress = normalizedFather.length > normalizedMother.length ? normalizedFather : normalizedMother
      return buildCompleteAddress(longerAddress, locationResource, row)
    }
  }

  // If only one parent has an address, use that
  if (normalizedFather && !normalizedMother) {
    return buildCompleteAddress(normalizedFather, locationResource, row)
  }
  if (normalizedMother && !normalizedFather) {
    return buildCompleteAddress(normalizedMother, locationResource, row)
  }

  return undefined
}

function buildLocationIndex(locations) {
  const byId = new Map()
  const byName = new Map()

  const normalise = (value) =>
    value && value !== 'NULL'
      ? value
          .toString()
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
      : undefined

  locations.forEach((location) => {
    if (location.id) {
      byId.set(location.id, location)
    }
    const identifiers = [location.name, ...(location.alias || [])]
    identifiers.forEach((value) => {
      if (!value) return
      const variations = new Set()
      variations.add(value)
      variations.add(value.replace(/\bST[.\s]/gi, 'Saint '))
      variations.add(value.replace(/\bSAINT\b/gi, 'St '))

      variations.forEach((variant) => {
        const key = normalise(variant)
        if (key && !byName.has(key)) {
          byName.set(key, location.id)
        }
      })
    })
  })

  return { byId, byName, normalise }
}

function resolveLocation(row, index) {
  const clean = (value) => (value && value !== 'NULL' ? value.trim() : undefined)
  const directId = clean(row.location_uuid)
  if (directId && index.byId.has(directId)) {
    return index.byId.get(directId)
  }

  const variants = new Set()
  const parish = clean(row.parish_nm)
  const locationUuid = clean(row.location_uuid)

  ;[locationUuid, parish]
    .filter(Boolean)
    .forEach((value) => {
      variants.add(index.normalise(value))
      variants.add(index.normalise(value?.replace(/\bST[.\s]/gi, 'Saint ')))
      variants.add(index.normalise(value?.replace(/\bSAINT\b/gi, 'St ')))
    })

  for (const key of variants) {
    if (!key) continue
    if (index.byName.has(key)) {
      return index.byId.get(index.byName.get(key))
    }
    if (key.endsWith('S') && index.byName.has(key.slice(0, -1))) {
      return index.byId.get(index.byName.get(key.slice(0, -1)))
    }
  }

  throw new Error(`Unable to resolve location for parish "${row.parish_nm ?? 'UNKNOWN'}"`)
}

function buildFallbackAddress(row) {
  const clean = (value) => (value && value !== 'NULL' ? value.trim() : undefined)
  return {
    country: clean(row.country) || 'ATG',
    state: clean(row.state_uuid) || undefined,
    district: clean(row.location_uuid) || undefined,
    city: undefined, // Don't use parish_nm as city since it's actually the district
    postalCode: clean(row.postal_code) || undefined,
    line: Array(16).fill(''),
    partOf: clean(row.location_uuid) || undefined
  }
}

function analyzeInformantDescription(iDesc, row = {}) {
  if (!iDesc || iDesc === 'NULL') {
    return { type: 'OTHER', isHospitalDelivery: false, comments: null }
  }

  const desc = iDesc.toLowerCase().trim()

  // Check for hospital/health institution delivery
  const isHospitalDelivery = desc.includes('certificate from hospital') ||
                            desc.includes('hospital certificate') ||
                            desc.includes('medical certificate')

  // Extract hospital name if mentioned
  let hospitalName = null
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

  // First check for explicit relationship words (using word boundaries to avoid false matches)
  if (desc.includes('mother') || desc.includes('mom')) {
    informantType = 'MOTHER'
  } else if (desc.includes('father') || desc.includes('dad')) {
    informantType = 'FATHER'
  } else if (/\b(son|daughter)\b/.test(desc)) {
    informantType = 'EXTENDED_FAMILY'
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

  // Add as comment for affidavit cases
  let comments = null
  if (hasAffidavit) {
    comments = iDesc.trim()
  }

  return {
    type: informantType,
    isHospitalDelivery,
    hospitalName,
    comments
  }
}

function findHealthFacilityByName(hospitalName, locationIndex) {
  if (!hospitalName) return null

  const normalizedName = hospitalName.toLowerCase().trim()

  // Try to match against known health facilities
  for (const [id, location] of locationIndex.byId) {
    if (location.type?.coding?.[0]?.code === 'HEALTH_FACILITY') {
      const locationName = location.name?.toLowerCase()
      if (locationName && locationName.includes(normalizedName)) {
        return location
      }
    }
  }

  return null
}

function buildQuestionnaireEntries(hasMother, hasFather, hasInformant = false) {
  const entries = []

  // Child fields
  entries.push({
    fieldId: 'birth.child.child-view-group.reasonForLateRegistration',
    value: 'MIGRATION'
  })

  if (hasInformant) {
    entries.push({
      fieldId: 'birth.informant.informant-view-group.informantIdType',
      value: 'NONE'
    })
  }

  if (hasMother) {
    entries.push({
      fieldId: 'birth.mother.mother-view-group.motherIdType',
      value: 'NONE'
    })
    entries.push({
      fieldId: 'birth.mother.mother-view-group.countryPrimaryMother',
      value: 'ATG'
    })
    entries.push({
      fieldId: 'birth.mother.mother-view-group.internationalStatePrimaryMother',
      value: 'ee206508-d08e-4c58-ba74-2b466d091b7b'
    })
    entries.push({
      fieldId: 'birth.mother.mother-view-group.internationalDistrictPrimaryMother',
      value: '266fab9d-9d10-4c56-9271-6d81a920ccb5'
    })
  }

  if (hasFather) {
    entries.push({
      fieldId: 'birth.father.father-view-group.fatherIdType',
      value: 'NONE'
    })
    entries.push({
      fieldId: 'birth.father.father-view-group.countryPrimaryFather',
      value: 'ATG'
    })
    entries.push({
      fieldId: 'birth.father.father-view-group.internationalStatePrimaryFather',
      value: 'ee206508-d08e-4c58-ba74-2b466d091b7b'
    })
    entries.push({
      fieldId: 'birth.father.father-view-group.internationalDistrictPrimaryFather',
      value: '266fab9d-9d10-4c56-9271-6d81a920ccb5'
    })
  }

  return entries
}

async function loadLocationsFromHearth() {
  const locations = []
  const hearthBase = CONFIG.hearthUrl.endsWith('/')
    ? CONFIG.hearthUrl
    : `${CONFIG.hearthUrl}/`
  let nextUrl = new URL('Location', hearthBase)
  nextUrl.searchParams.set('_count', '200')

  while (nextUrl) {
    const response = await fetch(nextUrl.href)
    if (!response.ok) {
      throw new Error(
        `Unable to load locations from Hearth (${response.status}): ${nextUrl.href}`
      )
    }
    const bundle = await response.json()
    const entries = bundle.entry || []
    entries.forEach((entry) => {
      if (entry.resource?.resourceType === 'Location') {
        locations.push(entry.resource)
      }
    })

    const nextLink = (bundle.link || []).find((link) => link.relation === 'next')
    if (nextLink?.url) {
      try {
        nextUrl = new URL(nextLink.url)
        if (!nextUrl.pathname.includes('Location')) {
          nextUrl = new URL(nextLink.url, CONFIG.hearthUrl)
        }
      } catch (err) {
        nextUrl = new URL(nextLink.url, hearthBase)
      }
    } else {
      nextUrl = null
    }
  }

  return buildLocationIndex(locations)
}

function mapRowToBirthInput(row, locationIndex) {
  const clean = (value) => (value && value !== 'NULL' && value.trim() !== '' ? value.trim() : undefined)

  const childFamilyName = clean(row.c_last_nm) || undefined
  const childGender = (clean(row.c_sex) || '').toLowerCase()
  const locationResource = resolveLocation(row, locationIndex)

  const childName = normaliseName(row.c_frst_nm, row.c_mid_nm, childFamilyName, true)

  const motherPresent = Boolean(
    clean(row.m_frst_nm) ||
      clean(row.m_last_nm)
  )

  const fatherPresent = Boolean(
    clean(row.f_frst_nm) ||
      clean(row.f_last_nm)
  )

  const motherName = motherPresent
    ? normaliseName(row.m_frst_nm, row.m_mid_nm, row.m_last_nm)
    : undefined
  const fatherName = fatherPresent
    ? normaliseName(row.f_frst_nm, row.f_mid_nm, row.f_last_nm)
    : undefined

  // Define parent DOBs for deterministic ID generation
  const motherDob = normalizeDate(row.m_dob) || '1900-01-01'
  const fatherDob = normalizeDate(row.f_dob) || '1900-01-01'

  // Inherit family name from parents for better deduplication, if child doesn't have one
  let finalChildName = childName
  let familyNameInheritanceComment = null

  if (childName._needsFamilyNameFromParent) {
    // Prefer father's family name, then mother's
    const inheritedFamilyName = fatherName?.familyName || motherName?.familyName

    if (inheritedFamilyName) {
      finalChildName = {
        use: 'en',
        firstNames: childName.firstNames,
        familyName: inheritedFamilyName
      }

      const parentSource = fatherName?.familyName ? "father's" : "mother's"
      familyNameInheritanceComment = `Child's family name inherited from ${parentSource} for deduplication purposes (original had no family name)`
    } else {
      // Neither parent has a family name, keep as undefined
      finalChildName = {
        use: 'en',
        firstNames: childName.firstNames,
        familyName: undefined
      }
    }
  }

  // Get shared address if parents live together
  const sharedAddress = getSharedAddress(row.f_address, row.m_address, locationResource, row)

  const informantName = clean(row.i_name)

  // Always do fresh analysis for accurate name matching
  const freshAnalysis = analyzeInformantDescription(row.i_desc, row)

  // Use pre-computed analysis if available, but prioritize fresh analysis for parent name matches
  let informantAnalysis
  if (row.informant_type_analyzed && row.is_hospital_delivery !== undefined) {
    // If fresh analysis found clear parent match (MOTHER/FATHER), use that instead of pre-computed
    if (freshAnalysis.type === 'MOTHER' || freshAnalysis.type === 'FATHER') {
      informantAnalysis = freshAnalysis
    } else {
      // Use pre-computed analysis from enhanced CSV
      // Build comments from multiple sources
      let comments = []
      if (clean(row.has_affidavit) === 'true' && clean(row.analysis_comments)) {
        comments.push(clean(row.analysis_comments))
      } else if (clean(row.i_desc)) {
        // Only add i_desc if not already captured in affidavit comments
        comments.push(`Informant Details: ${clean(row.i_desc)}`)
      }
      if (normalizeDate(row.reg_dt)) {
        comments.push(`Registration Date: ${normalizeDate(row.reg_dt)}`)
      }

      informantAnalysis = {
        type: clean(row.informant_type_analyzed) || 'OTHER',
        isHospitalDelivery: clean(row.is_hospital_delivery) === 'true',
        hospitalName: clean(row.hospital_name) || null,
        comments: comments.length > 0 ? comments.join('; ') : null
      }
    }
  } else {
    // Fallback to fresh analysis
    const baseAnalysis = freshAnalysis

    // Add registration date and informant details to comments
    let comments = []
    if (baseAnalysis.comments && !clean(row.i_desc)) {
      // Only add base analysis comments if i_desc is not present to avoid duplication
      comments.push(baseAnalysis.comments)
    }
    if (clean(row.i_desc)) {
      comments.push(`Informant Details: ${clean(row.i_desc)}`)
    }
    if (normalizeDate(row.reg_dt)) {
      comments.push(`Registration Date: ${normalizeDate(row.reg_dt)}`)
    }

    informantAnalysis = {
      ...baseAnalysis,
      comments: comments.length > 0 ? comments.join('; ') : null
    }
  }

  const manualInformantType = clean(row.informant_type_mapped)?.toUpperCase()

  // Valid informant types for birth registrations
  const validInformantTypes = ['MOTHER', 'FATHER', 'GRANDMOTHER', 'GRANDFATHER', 'EXTENDED_FAMILY', 'HEALTHCARE_PROVIDER', 'HEALTH_FACILITY', 'LEGAL_GUARDIAN', 'OTHER']

  // For hospital deliveries, use MOTHER if mother is present, otherwise use analysis
  let informantType
  if (informantAnalysis.isHospitalDelivery && motherPresent) {
    informantType = 'MOTHER'
  } else {
    // Prioritize intelligent analysis when there are clear parent name matches
    const validManualType = manualInformantType && validInformantTypes.includes(manualInformantType) ? manualInformantType : null

    // If analysis found MOTHER or FATHER (clear name matches), use that instead of manual override
    if (informantAnalysis.type === 'MOTHER' || informantAnalysis.type === 'FATHER') {
      informantType = informantAnalysis.type
    } else {
      // Otherwise use manual type or fall back to analysis
      informantType = validManualType || informantAnalysis.type
    }
  }
  // Validate informant type against available parents
  if (informantType === 'MOTHER' && !motherPresent) {
    informantType = fatherPresent ? 'FATHER' : 'OTHER'
  }
  if (informantType === 'FATHER' && !fatherPresent) {
    informantType = motherPresent ? 'MOTHER' : 'OTHER'
  }
  // Final validation - ensure informant type is valid for OpenCRVS
  if (!informantType || !validInformantTypes.includes(informantType)) {
    if (motherPresent) {
      informantType = 'MOTHER'
    } else if (fatherPresent) {
      informantType = 'FATHER'
    } else {
      informantType = 'OTHER'
    }
  }

  const registrationDraftId = clean(row.entry_nbr)
    ? `draft-${clean(row.entry_yr) || '0000'}-${clean(row.entry_nbr)}`
    : randomUUID()

  const normalizedRegDate = normalizeDate(row.reg_dt)
  const createdAt = normalizedRegDate ? `${normalizedRegDate}T00:00:00.000Z` : new Date().toISOString()

  // Build comments array for registration status
  let statusComments = []
  let allComments = []

  // Add page number if available
  if (clean(row.page_nbr)) {
    allComments.push(`Source page number: ${clean(row.page_nbr)}`)
  }

  // Note: Registration date is already included in informant analysis comments

  // Add informant analysis comments
  if (informantAnalysis.comments) {
    allComments.push(informantAnalysis.comments)
  }

  // Add DOB missing comments for parents
  if (motherPresent && !normalizeDate(row.m_dob)) {
    allComments.push("Mother's date of birth not provided in source, assigned default 1900-01-01")
  }

  if (fatherPresent && !normalizeDate(row.f_dob)) {
    allComments.push("Father's date of birth not provided in source, assigned default 1900-01-01")
  }

  // Add comments for reference notes in parent names
  if (motherName && motherName._isReferenceNote) {
    allComments.push(`Mother name field contains reference note: ${clean(row.m_frst_nm)}`)
  }

  if (fatherName && fatherName._isReferenceNote) {
    allComments.push(`Father name field contains reference note: ${clean(row.f_frst_nm)}`)
  }

  // Add family name inheritance comment if applicable
  if (familyNameInheritanceComment) {
    allComments.push(familyNameInheritanceComment)
  }

  // Combine all comments into one comment entry
  if (allComments.length > 0) {
    statusComments.push({
      comment: allComments.join('; '),
      createdAt: createdAt
    })
  }

  // Build the eventLocation using address structure for proper name resolution
  let eventLocationAddress = buildFallbackAddress(row)

  if (locationResource) {
    // Get parent location ID for state field
    const parentId = locationResource.partOf?.reference?.replace('Location/', '')
    eventLocationAddress = {
      ...eventLocationAddress,
      state: parentId || eventLocationAddress.state,
      district: locationResource.id,
      partOf: locationResource.id
    }
  }

  // Determine delivery location based on informant analysis
  let eventLocation

  if (informantAnalysis.isHospitalDelivery) {
    // Try to find the specific health facility if hospital name was extracted
    let healthFacilityId = null
    if (informantAnalysis.hospitalName) {
      const healthFacility = findHealthFacilityByName(informantAnalysis.hospitalName, locationIndex)
      if (healthFacility) {
        healthFacilityId = healthFacility.id
      }
    }

    if (healthFacilityId) {
      // Use specific health facility
      eventLocation = {
        _fhirID: healthFacilityId
      }
    } else {
      // Hospital delivery but no specific facility found - use address with type
      eventLocation = {
        type: 'OTHER',
        address: eventLocationAddress
      }
    }
  } else {
    // Regular birth - use address
    eventLocation = {
      type: 'OTHER',
      address: eventLocationAddress
    }
  }

  const birthInput = {
    createdAt,
    registration: {
      // draftId: registrationDraftId, // Removed to enable deduplication
      informantType,
      contactPhoneNumber: clean(row.i_phone) || clean(row.i_address),
      contactEmail: clean(row.i_email) || 'not.provided@migration.test',
      status: [
        {
          timestamp: createdAt,
          timeLoggedMS: 0,
          ...(statusComments.length > 0 && { comments: statusComments })
        }
      ]
    },
    child: {
      name: [finalChildName],
      gender: childGender === 'male' || childGender === 'female' ? childGender : 'unknown',
      birthDate: normalizeDate(row.c_dob),
      identifier: [],
      address: normaliseAddress(row.c_address, locationResource, row) ? [normaliseAddress(row.c_address, locationResource, row)] : undefined
    },
    eventLocation,
    mother: motherPresent
      ? {
          detailsExist: true,
          name: [cleanNameForGraphQL(motherName)],
          birthDate: normalizeDate(row.m_dob) || '1900-01-01',
          nationality: clean(row.m_nationality)
            ? [clean(row.m_nationality)]
            : ['ATG'],
          identifier: [
            {
              id: clean(row.m_id) || `MIGRATION-M-${generateDeterministicId(motherName, motherDob, 'MOTHER')}`,
              type: 'NONE'
            }
          ],
          address: sharedAddress
            ? [sharedAddress]
            : (normaliseAddress(row.m_address, locationResource, row)
              ? [normaliseAddress(row.m_address, locationResource, row)]
              : undefined),
          occupation: clean(row.m_occn)
        }
      : {
          detailsExist: false,
          reasonNotApplying: 'Not Provided'
        },
    father: fatherPresent
      ? {
          detailsExist: true,
          name: [cleanNameForGraphQL(fatherName)],
          nationality: clean(row.f_nationality)
            ? [clean(row.f_nationality)]
            : ['ATG'],
          identifier: [
            {
              id: clean(row.f_id) || `MIGRATION-F-${generateDeterministicId(fatherName, fatherDob, 'FATHER')}`,
              type: 'NONE'
            }
          ],
          ageOfIndividualInYears: clean(row.f_age)
            ? Number(clean(row.f_age))
            : undefined,
          birthDate: normalizeDate(row.f_dob) || '1900-01-01',
          address: sharedAddress
            ? [sharedAddress]
            : (normaliseAddress(row.f_address, locationResource, row)
              ? [normaliseAddress(row.f_address, locationResource, row)]
              : undefined),
          occupation: clean(row.f_occn)
        }
      : {
          detailsExist: false,
          reasonNotApplying: 'Not Provided'
        },
    ...(informantType === 'OTHER' && !motherPresent && !fatherPresent ? {
      informant: {
        name: [{
          use: 'en',
          firstNames: clean(row.i_name) || 'INFORMANT',
          familyName: 'MIGRATION'
        }],
        identifier: [{
          id: `MIGRATION-I-${generateShortId()}`,
          type: 'NONE'
        }],
        nationality: ['ATG'],
        birthDate: '1900-01-01',
        address: normaliseAddress(row.i_address, locationResource, row) ? [normaliseAddress(row.i_address, locationResource, row)] : undefined
      }
    } : {}),
    // attendantAtBirth: clean(row.dr_name) || 'NURSE',
    // birthType: clean(row.birth_type) || 'SINGLE',
    // weightAtBirth: clean(row.birth_weight) ? parseFloat(clean(row.birth_weight)) : 3.0,
    questionnaire: buildQuestionnaireEntries(motherPresent, fatherPresent, informantType === 'OTHER')
  }

  return birthInput
}

async function createBirth(details, token) {
  const mutation = `
    mutation CreateBirth($details: BirthRegistrationInput!) {
      createBirthRegistration(details: $details) {
        compositionId
        trackingId
        isPotentiallyDuplicate
      }
    }
  `

  const data = await graphQlRequest(mutation, { details }, token)
  return data.createBirthRegistration
}

async function exchangeForRecordToken(userToken, compositionId) {
  const authUrl = new URL('/token', CONFIG.authUrl)
  authUrl.searchParams.set(
    'grant_type',
    'urn:opencrvs:oauth:grant-type:token-exchange'
  )
  authUrl.searchParams.set('subject_token', userToken)
  authUrl.searchParams.set(
    'subject_token_type',
    'urn:ietf:params:oauth:token-type:access_token'
  )
  authUrl.searchParams.set(
    'requested_token_type',
    'urn:opencrvs:oauth:token-type:single_record_token'
  )
  authUrl.searchParams.set('record_id', compositionId)

  const response = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`
    }
  })

  const body = await response.json().catch(async () => {
    throw new Error(
      `Record token exchange response not JSON (status ${response.status})`
    )
  })

  if (!response.ok || !body.access_token) {
    throw new Error(
      `Record token exchange failed (${response.status}): ${JSON.stringify(body)}`
    )
  }

  return body.access_token
}

async function confirmBirth(
  compositionId,
  registrationNumber,
  identifiers,
  token
) {
  const mutation = `
    mutation Confirm($id: ID!, $details: ConfirmRegistrationInput!) {
      confirmRegistration(id: $id, details: $details)
    }
  `

  const details = {
    registrationNumber,
    identifiers: identifiers?.filter((id) => id && id.value)
  }

  const data = await graphQlRequest(
    mutation,
    {
      id: compositionId,
      details
    },
    token
  )

  return data.confirmRegistration
}

async function fetchRegistrationById(compositionId, token) {
  const query = `
    query Fetch($id: ID!) {
      fetchBirthRegistration(id: $id) {
        id
        registration {
          registrationNumber
          informantType
          status {
            type
            timestamp
          }
        }
        child {
          name {
            firstNames
            familyName
          }
          gender
          birthDate
        }
      }
    }
  `

  const data = await graphQlRequest(query, { id: compositionId }, token)
  return data.fetchBirthRegistration
}

function buildIdentifierPayload(row) {
  const clean = (value) => (value && value !== 'NULL' ? value.trim() : undefined)
  const identifiers = []
  if (clean(row.entry_nbr)) {
    identifiers.push({
      type: 'LEGACY_ENTRY_NUMBER',
      value: String(clean(row.entry_nbr))
    })
  }
  if (clean(row.page_nbr)) {
    identifiers.push({
      type: 'LEGACY_PAGE_NUMBER',
      value: String(clean(row.page_nbr))
    })
  }
  if (clean(row.printlog_id)) {
    identifiers.push({
      type: 'LEGACY_PRINTLOG_ID',
      value: String(clean(row.printlog_id))
    })
  }
  return identifiers
}

async function migrateRow(row, token) {
  if (!globalThis.locationIndex) {
    throw new Error('Location index not initialised')
  }
  const details = mapRowToBirthInput(row, globalThis.locationIndex)
  // console.log('   • Payload:', JSON.stringify(details, null, 2)) // Commented for performance

  // Debug: Log duplicate search criteria for verification
  console.log(`   • Deduplication data - Child: ${details.child?.name?.[0]?.firstNames || 'N/A'} ${details.child?.name?.[0]?.familyName || '[no family name]'}, DOB: ${details.child?.birthDate || 'N/A'}`)

  const created = await createBirth(details, token.userToken)

  if (!created?.compositionId) {
    throw new Error('createBirthRegistration did not return compositionId')
  }

  // Check for potential duplicates
  if (created.isPotentiallyDuplicate) {
    const childName = `${details.child?.name?.[0]?.firstNames || ''}.trim() ${details.child?.name?.[0]?.familyName || ''}`.trim()
    const dob = details.child?.birthDate || 'Unknown'
    console.log(`🚨 POTENTIAL DUPLICATE DETECTED for ${childName} (DOB: ${dob})`)
    console.log(`   • Composition ID: ${created.compositionId}`)
    console.log(`   • Tracking ID: ${created.trackingId}`)
    console.log('   • This record will NOT be auto-confirmed due to duplicate detection')

    // Return early without confirming the registration
    return {
      created: {
        ...created,
        isDuplicateSkipped: true,
        reason: 'Potential duplicate detected by OpenCRVS deduplication system'
      },
      fetched: null
    }
  }

  const recordToken = await exchangeForRecordToken(
    token.userToken,
    created.compositionId
  )

  const clean = (value) => (value && value !== 'NULL' ? value.trim() : undefined)
  const legacyRegistrationNumber = clean(row.cert_nbr)

  await confirmBirth(
    created.compositionId,
    legacyRegistrationNumber || `MIGR-${randomUUID().slice(0, 8).toUpperCase()}`,
    buildIdentifierPayload(row),
    recordToken
  )

  let fetched
  try {
    fetched = await fetchRegistrationById(
      created.compositionId,
      token.userToken
    )
  } catch (error) {
    console.warn(
      `⚠️ Unable to fetch record ${created.compositionId} for verification: ${error.message}`
    )
  }

  return {
    created,
    fetched
  }
}

async function loadRows(filePath) {
  const absolute = path.resolve(process.cwd(), filePath)
  if (!fs.existsSync(absolute)) {
    throw new Error(`File not found: ${absolute}`)
  }

  const rows = []

  await new Promise((resolve, reject) => {
    fs.createReadStream(absolute)
      .pipe(
        parse({
          columns: true,
          bom: true,
          skip_empty_lines: true,
          trim: true
        })
      )
      .on('data', (row) => rows.push(row))
      .on('error', reject)
      .on('end', resolve)
  })

  return rows
}

async function main() {
  try {
    const rows = await loadRows(options.file)
    const effectiveRows = rows.slice(options.skip)
    const limitedRows = options.limit
      ? effectiveRows.slice(0, options.limit)
      : effectiveRows

    if (limitedRows.length === 0) {
      console.log('No rows to process after applying skip/limit options.')
      return
    }

    console.log(`Loaded ${rows.length} rows. Processing ${limitedRows.length}.`)

    const token = await authenticate()
    console.log('✅ Authenticated successfully')

    globalThis.locationIndex = await loadLocationsFromHearth()
    console.log(
      `✅ Loaded ${globalThis.locationIndex.byId.size} locations from Hearth`
    )

    const batchSize = options.batchSize
    const failures = []
    const duplicates = []
    let processedCount = 0
    let duplicateCount = 0

    for (let i = 0; i < limitedRows.length; i += batchSize) {
      const batch = limitedRows.slice(i, i + batchSize)
      console.log(`\n=== Processing batch ${(i / batchSize) + 1} (rows ${i + 1}-${i + batch.length}) ===`)

      for (let index = 0; index < batch.length; index++) {
        const row = batch[index]
        const globalIndex = i + index
        const label = row.cert_nbr || row.entry_nbr || `row-${options.skip + globalIndex + 1}`
        console.log(`\n▶ Processing record ${globalIndex + 1}/${limitedRows.length} (${label})`)

        try {
          const result = await migrateRow(row, token)

          if (result.created.isDuplicateSkipped) {
            duplicateCount += 1
            duplicates.push({
              label,
              compositionId: result.created.compositionId,
              trackingId: result.created.trackingId,
              reason: result.created.reason
            })
            console.log(`   • ⏭️  SKIPPED: ${result.created.reason}`)
          } else {
            processedCount += 1
            console.log(
              `   • Created composition ${result.created.compositionId} (tracking ${result.created.trackingId})`
            )
            if (result.fetched) {
              console.log(
                `   • Confirmed registration number ${
                  result.fetched.registration?.registrationNumber || 'UNKNOWN'
                }`
              )
              console.log(
                `   • Child: ${
                  result.fetched.child?.name?.[0]?.firstNames || 'N/A'
                } ${result.fetched.child?.name?.[0]?.familyName || ''}`
              )
            }
          }
        } catch (error) {
          console.error(`❌ Failed to process record (${label}): ${error.message}`)
          failures.push({ label, error: error.message })
        }
      }
      console.log(`=== Completed batch ${(i / batchSize) + 1} ===`)
    }

    console.log('\n📊 Migration summary')
    console.log(`   • Successfully processed: ${processedCount}`)
    console.log(`   • Potential duplicates skipped: ${duplicateCount}`)
    console.log(`   • Failures: ${failures.length}`)

    if (duplicates.length > 0) {
      console.log('\n🚨 Potential duplicates detected:')
      duplicates.forEach((duplicate) =>
        console.log(`     - ${duplicate.label}: ${duplicate.compositionId} (${duplicate.trackingId})`)
      )
    }

    if (failures.length > 0) {
      console.log('\n❌ Failed records:')
      failures.forEach((failure) =>
        console.log(`     - ${failure.label}: ${failure.error}`)
      )
    }
  } catch (error) {
    console.error('Migration aborted:', error.message)
    console.error(error.stack)
    process.exitCode = 1
  }
}

main()
