/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * OpenCRVS is also distributed under the terms of the Civil Registration
 * & Healthcare Disclaimer located at http://opencrvs.org/license.
 *
 * Copyright (C) The OpenCRVS Authors located at https://github.com/opencrvs/opencrvs-core/blob/master/AUTHORS.
 */

import { Request, ResponseToolkit } from '@hapi/hapi'
import fetch from 'node-fetch'
import { GATEWAY_URL, CERTIFICATE_SERVICE_URL } from '@countryconfig/constants'
import { logger } from '@countryconfig/logger'

/**
 * Handler for printing certificates via Toppan certificate-service (GraphQL version)
 *
 * This version uses GraphQL to get already-transformed data instead of raw FHIR Bundle
 *
 * POST /certificates/toppan/print
 * Body: { compositionId: string, eventType: "birth" | "death" | "marriage" }
 */
export async function toppanPrintHandlerV2(
  request: Request,
  h: ResponseToolkit
) {
  try {
    const { compositionId, eventType } = request.payload as {
      compositionId: string
      eventType: 'birth' | 'death' | 'marriage'
    }

    logger.info(`[Toppan Print V2] Generating certificate for ${eventType} - ${compositionId}`)

    // Step 1: Fetch registration data via GraphQL (already transformed!)
    const authHeader = request.headers.authorization
    const registrationData = await fetchRegistrationViaGraphQL(compositionId, eventType, authHeader)

    if (!registrationData) {
      return h.response({
        error: 'Registration not found',
        message: `Could not fetch registration data for ${compositionId}`
      }).code(404)
    }

    logger.info(`[Toppan Print V2] Fetched registration data via GraphQL`)

    // Step 1.5: Resolve location UUIDs to names
    await resolveLocationNames(registrationData, authHeader)

    // Step 2: Transform GraphQL response to CertificateRequest DTO (much simpler!)
    const certificateRequest = transformGraphQLToCertificateRequest(registrationData, eventType, compositionId)

    logger.info(`[Toppan Print V2] Transformed to CertificateRequest with ${certificateRequest.amendments?.length || 0} amendments`)
    logger.info(`[Toppan Print V2] DEBUG - Child data:`, JSON.stringify(certificateRequest.child, null, 2))
    logger.info(`[Toppan Print V2] DEBUG - Mother data:`, JSON.stringify(certificateRequest.mother, null, 2))
    logger.info(`[Toppan Print V2] DEBUG - Father data:`, JSON.stringify(certificateRequest.father, null, 2))
    logger.info(`[Toppan Print V2] DEBUG - Registration:`, JSON.stringify({
      registrationNumber: certificateRequest.registrationNumber,
      registrationDate: certificateRequest.registrationDate,
      registrar: certificateRequest.registrar,
      parish: certificateRequest.parish
    }, null, 2))

    // Step 3: Call certificate-service to generate PDF
    const certificateResponse = await fetch(`${CERTIFICATE_SERVICE_URL}/api/certificates/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(certificateRequest)
    })

    if (!certificateResponse.ok) {
      const errorText = await certificateResponse.text()
      logger.error(`[Toppan Print V2] Certificate-service error: ${certificateResponse.status} ${errorText}`)
      throw new Error(`Certificate-service error: ${certificateResponse.status} ${errorText}`)
    }

    // Step 4: Parse response and return PDF
    const responseData = await certificateResponse.json()

    if (!responseData.success || !responseData.pdf || !responseData.pdf.base64) {
      throw new Error('Certificate-service did not return PDF data')
    }

    // Decode base64 PDF
    const pdfBuffer = Buffer.from(responseData.pdf.base64, 'base64')
    logger.info(`[Toppan Print V2] Successfully generated PDF (${pdfBuffer.length} bytes)`)
    logger.info(`[Toppan Print V2] Certificate: ${responseData.certificateNumber}, Pages: ${responseData.pages}, Amendments: ${responseData.amendments}`)

    return h.response(pdfBuffer)
      .type('application/pdf')
      .header('Content-Disposition', `inline; filename="certificate-${compositionId}.pdf"`)

  } catch (error: any) {
    logger.error('[Toppan Print V2] Error generating certificate:', error)
    return h.response({
      error: 'Failed to generate certificate',
      message: error.message
    }).code(500)
  }
}

/**
 * Resolve location UUIDs to location names
 * Modifies the data object in place
 */
async function resolveLocationNames(data: any, authHeader: string): Promise<void> {
  const locationCache = new Map<string, string>()

  async function getLocationName(locationId: string): Promise<string> {
    if (!locationId) return ''
    if (locationCache.has(locationId)) return locationCache.get(locationId)!

    try {
      const response = await fetch(`${GATEWAY_URL}/locations/${locationId}`, {
        method: 'GET',
        headers: {
          Authorization: authHeader
        }
      })

      if (!response.ok) {
        logger.warn(`[Toppan Print V2] Failed to fetch location ${locationId}: ${response.status}`)
        return locationId // Return UUID as fallback
      }

      const location = await response.json()
      const name = location.name || locationId
      locationCache.set(locationId, name)
      return name
    } catch (error: any) {
      logger.error(`[Toppan Print V2] Error fetching location ${locationId}:`, error.message)
      return locationId // Return UUID as fallback
    }
  }

  async function resolveAddress(address: any): Promise<void> {
    if (!address) return
    if (address.district) {
      address.district = await getLocationName(address.district)
    }
    if (address.state) {
      address.state = await getLocationName(address.state)
    }
    if (address.city) {
      address.city = await getLocationName(address.city)
    }
    if (address.country) {
      const countryName = countryCodeToName(address.country)
      if (countryName) {
        address.country = countryName
      }
    }
  }

  // Resolve mother's address locations
  if (Array.isArray(data.mother?.address)) {
    for (const address of data.mother.address) {
      await resolveAddress(address)
    }
  }

  // Resolve father's address locations
  if (Array.isArray(data.father?.address)) {
    for (const address of data.father.address) {
      await resolveAddress(address)
    }
  }

  // Resolve informant address locations
  if (Array.isArray(data.informant?.address)) {
    for (const address of data.informant.address) {
      await resolveAddress(address)
    }
  }

  // Resolve event location (name + address parts)
  if (data.eventLocation) {
    if (!data.eventLocation.name && data.eventLocation.id) {
      data.eventLocation.name = await getLocationName(data.eventLocation.id)
    }
    await resolveAddress(data.eventLocation.address)
  }

  logger.info(`[Toppan Print V2] Resolved ${locationCache.size} location UUIDs to names`)
}

/**
 * Fetch registration data via GraphQL
 * Uses the appropriate query based on event type
 */
async function fetchRegistrationViaGraphQL(
  compositionId: string,
  eventType: string,
  authHeader: string
): Promise<any> {
  const query = getGraphQLQuery(eventType)

  const response = await fetch(`${GATEWAY_URL}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader
    },
    body: JSON.stringify({
      query,
      variables: { id: compositionId }
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error('[Toppan Print V2] GraphQL request failed:', errorText)
    throw new Error(`GraphQL query failed: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const result = await response.json()

  if (result.errors) {
    logger.error('[Toppan Print V2] GraphQL errors:', result.errors)
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`)
  }

  // Extract data based on event type
  const queryName = `fetch${capitalize(eventType)}Registration`
  return result.data?.[queryName]
}

/**
 * Get GraphQL query based on event type
 */
function getGraphQLQuery(eventType: string): string {
  const queryName = `fetch${capitalize(eventType)}Registration`

  // For death certificates, query 'deceased' instead of 'child'
  const personField = eventType === 'death' ? 'deceased' : 'child'
  const dateField = eventType === 'death' ? 'deathDate' : 'birthDate'

  // This matches the client's GET_BIRTH_REGISTRATION_FOR_CERTIFICATE query
  // See: packages/client/src/views/DataProvider/birth/queries.ts:365-655
  return `
    query ${queryName}ForCertificate($id: ID!) {
      ${queryName}(id: $id) {
        id
        ${personField} {
          id
          name {
            use
            firstNames
            middleName
            familyName
          }
          birthDate
          ${eventType === 'death' ? 'deathDate' : ''}
          gender
        }
        mother {
          id
          name {
            use
            firstNames
            middleName
            familyName
            marriedLastName
          }
          birthDate
          maritalStatus
          dateOfMarriage
          educationalAttainment
          nationality
          occupation
          detailsExist
          reasonNotApplying
          ageOfIndividualInYears
          exactDateOfBirthUnknown
          identifier {
            id
            type
            otherType
          }
          address {
            type
            line
            district
            state
            city
            postalCode
            country
          }
          telecom {
            system
            value
          }
        }
        father {
          id
          name {
            use
            firstNames
            middleName
            familyName
          }
          birthDate
          maritalStatus
          dateOfMarriage
          educationalAttainment
          nationality
          occupation
          detailsExist
          reasonNotApplying
          ageOfIndividualInYears
          exactDateOfBirthUnknown
          identifier {
            id
            type
            otherType
          }
          address {
            type
            line
            district
            state
            city
            postalCode
            country
          }
          telecom {
            system
            value
          }
        }
        informant {
          id
          relationship
          otherRelationship
          name {
            use
            firstNames
            middleName
            familyName
          }
          occupation
          address {
            type
            line
            district
            state
            city
            postalCode
            country
          }
          telecom {
            system
            value
          }
        }
        registration {
          id
          type
          trackingId
          registrationNumber
          assignment {
            practitionerId
            firstName
            lastName
            officeName
          }
          status {
            id
            type
            timestamp
          }
        }
        eventLocation {
          id
          name
          alias
          address {
            line
            city
            district
            state
            postalCode
            country
          }
        }
        history {
          date
          action
          regStatus
          note
          reason
          otherReason
          comments {
            comment
          }
          location {
            id
            name
          }
          office {
            id
            name
            alias
            address {
              state
              district
            }
          }
          user {
            id
            role {
              id
            }
            name {
              firstNames
              familyName
              use
            }
            avatar {
              data
              type
            }
            fullHonorificName
          }
          signature {
            data
            type
          }
          input {
            valueCode
            valueId
            value
          }
          output {
            valueCode
            valueId
            value
          }
          certificates {
            hasShowedVerifiedDocument
            certificateTemplateId
            collector {
              relationship
              otherRelationship
              name {
                use
                firstNames
                familyName
              }
            }
            certifier {
              name {
                use
                firstNames
                familyName
              }
            }
          }
          duplicateOf
          potentialDuplicates
        }
      }
    }
  `
}

/**
 * Transform GraphQL response to CertificateRequest DTO
 * Much simpler than parsing raw FHIR!
 */
function transformGraphQLToCertificateRequest(
  data: any,
  eventType: string,
  compositionId: string
): any {
  // Extract amendments from history
  const amendments = extractAmendmentsFromHistory(data.history || [])

  const parish = determineParish(data.eventLocation)
  const registrar = determineRegistrar(data)
  const registrationDate = extractRegistrationDate(data.registration)

  const childName = getPrimaryHumanName(data.child?.name)
  const deceasedName = getPrimaryHumanName(data.deceased?.name)
  const motherName = getPrimaryHumanName(data.mother?.name)
  const fatherName = getPrimaryHumanName(data.father?.name)
  const informantName = getPrimaryHumanName(data.informant?.name)

  const motherAddress = formatAddressLines(data.mother?.address?.[0])
  const fatherAddress = formatAddressLines(data.father?.address?.[0])
  const informantAddress = formatAddressLines(data.informant?.address?.[0])

  return {
    certificateType: eventType,
    templateName: `antigua-${eventType}-v1`,

    // Child section (for birth certificates)
    child: data.child ? {
      firstName: trimOrUndefined(childName?.firstNames),
      middleName: trimOrUndefined(childName?.middleName),
      surname: trimOrUndefined(childName?.familyName),
      sex: mapSex(data.child.gender),
      dateOfBirth: trimOrUndefined(data.child.birthDate),
      placeOfBirth: buildPlaceOfBirth(data.eventLocation)
    } : undefined,

    // Deceased section (for death certificates)
    deceased: data.deceased ? {
      firstName: trimOrUndefined(deceasedName?.firstNames),
      middleName: trimOrUndefined(deceasedName?.middleName),
      surname: trimOrUndefined(deceasedName?.familyName),
      sex: mapSex(data.deceased.gender),
      dateOfBirth: trimOrUndefined(data.deceased.birthDate),
      dateOfDeath: trimOrUndefined(data.deceased.deathDate)
    } : undefined,

    // Mother section (already transformed!)
    mother: data.mother ? {
      firstName: trimOrUndefined(motherName?.firstNames),
      middleName: trimOrUndefined(motherName?.middleName),
      surname: trimOrUndefined(motherName?.familyName),
      maidenName: trimOrUndefined(motherName?.marriedLastName),
      dateOfBirth: trimOrUndefined(data.mother.birthDate),
      occupation: trimOrUndefined(data.mother.occupation),
      countryOfBirth: countryCodeToName(data.mother.address?.[0]?.country),
      nationality: countryCodeToName(data.mother.nationality?.[0]),
      addressOne: motherAddress.addressOne,
      addressTwo: motherAddress.addressTwo
    } : undefined,

    // Father section (already transformed!)
    father: data.father ? {
      firstName: trimOrUndefined(fatherName?.firstNames),
      middleName: trimOrUndefined(fatherName?.middleName),
      surname: trimOrUndefined(fatherName?.familyName),
      dateOfBirth: trimOrUndefined(data.father.birthDate),
      occupation: trimOrUndefined(data.father.occupation),
      countryOfBirth: countryCodeToName(data.father.address?.[0]?.country),
      nationality: countryCodeToName(data.father.nationality?.[0]),
      addressOne: fatherAddress.addressOne,
      addressTwo: fatherAddress.addressTwo
    } : undefined,

    // Informant section (already has relationship!)
    informant: data.informant ? {
      firstName: trimOrUndefined(informantName?.firstNames),
      middleName: trimOrUndefined(informantName?.middleName),
      surname: trimOrUndefined(informantName?.familyName),
      relationship: mapRelationship(data.informant.relationship),
      profession: trimOrUndefined(data.informant.occupation),
      addressOne: informantAddress.addressOne,
      addressTwo: informantAddress.addressTwo
    } : undefined,

    // Registration metadata (already extracted!)
    registrationNumber: data.registration?.registrationNumber || 'UNKNOWN',
    registrationDate,
    registrar,
    parish,

    // Calculate late registration
    lateRegistration: calculateLateRegistration(
      eventType === 'death' ? data.deceased?.deathDate : data.child?.birthDate,
      registrationDate,
      eventType
    ),

    // Record URL
    recordUrl: `${process.env.CLIENT_APP_URL || 'http://localhost:3000'}/record/${compositionId}`,

    // Amendments
    amendments
  }
}

/**
 * Extract registration date from registration.status array
 * Looks for REGISTERED or CERTIFIED status
 */
function extractRegistrationDate(registration: any): string {
  if (!registration) return new Date().toISOString().split('T')[0]

  // First try to find REGISTERED status
  const registeredStatus = registration.status?.find(
    (s: any) => s.type === 'REGISTERED'
  )

  if (registeredStatus?.timestamp) {
    return registeredStatus.timestamp.split('T')[0]
  }

  // Fallback to CERTIFIED status
  const certifiedStatus = registration.status?.find(
    (s: any) => s.type === 'CERTIFIED'
  )

  if (certifiedStatus?.timestamp) {
    return certifiedStatus.timestamp.split('T')[0]
  }

  // Final fallback
  return new Date().toISOString().split('T')[0]
}

/**
 * Extract amendments from GraphQL history array
 */
function extractAmendmentsFromHistory(history: any[]): any[] {
  const corrections = history.filter(h => h.action === 'CORRECTED')

  const amendments: any[] = []

  for (const correction of corrections) {
    if (!correction.input || !correction.output) continue

    // Compare input vs output to find changes
    for (const outputField of correction.output) {
      const inputField = correction.input.find(
        (i: any) => i.valueCode === outputField.valueCode && i.valueId === outputField.valueId
      )

      if (inputField && inputField.value !== outputField.value) {
        const section = capitalize(outputField.valueCode || 'Unknown')
        amendments.push({
          type: mapCorrectionReason(correction.reason, outputField.valueCode),
          date: correction.date?.split('T')[0] || new Date().toISOString().split('T')[0],
          section: section, // Must be capitalized: "Child", "Mother", "Father"
          fields: {
            [outputField.valueId]: `${inputField.value || 'N/A'} → ${outputField.value || 'N/A'}`
          },
          description: selectAmendmentDescription(correction)
        })
      }
    }
  }

  return amendments
}

/**
 * Map relationship code to display name
 */
function mapRelationship(relationship: string | undefined): string {
  if (!relationship) return 'Other'

  const map: Record<string, string> = {
    'MOTHER': 'Mother',
    'FATHER': 'Father',
    'SPOUSE': 'Spouse',
    'OTHER': 'Other',
    'GRANDFATHER': 'Grandfather',
    'GRANDMOTHER': 'Grandmother',
    'LEGAL_GUARDIAN': 'Legal Guardian'
  }

  return map[relationship] || relationship
}

/**
 * Map correction reason to amendment type
 */
function mapCorrectionReason(reason: string | undefined, section: string): string {
  // Certificate-service only accepts specific amendment types based on what changed
  // Valid types: ChangeOfName, BirthNameAndParticularsChanged, FathersNameAndParticularsChanged, etc.

  if (section === 'child' || section === 'childDetails') {
    return 'BirthNameAndParticularsChanged'
  } else if (section === 'father' || section === 'fatherDetails') {
    return 'FathersNameAndParticularsChanged'
  } else if (section === 'mother' || section === 'motherDetails') {
    return 'MothersNameAndParticularsChanged'
  }

  // Default to name change
  return 'ChangeOfName'
}

/**
 * Calculate if registration is late
 */
function calculateLateRegistration(
  eventDate: string | undefined,
  registrationDate: string | undefined,
  eventType: string
): boolean {
  if (!eventDate || !registrationDate) return false

  const event = new Date(eventDate)
  const registered = new Date(registrationDate)
  const daysDiff = Math.floor((registered.getTime() - event.getTime()) / (1000 * 60 * 60 * 24))

  // Different thresholds for different event types
  const threshold = eventType === 'birth' ? 45 : 7

  return daysDiff > threshold
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function getPrimaryHumanName(names: any): any | undefined {
  if (!names) return undefined
  const nameArray = Array.isArray(names) ? names : [names]
  if (!nameArray.length) return undefined
  return nameArray.find((n: any) => n?.use === 'en') || nameArray[0]
}

function trimOrUndefined(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

function mapSex(sex: string | undefined): string | undefined {
  if (!sex) return undefined
  const normalized = sex.toLowerCase()
  if (normalized === 'male') {
    return 'Male'
  }
  if (normalized === 'female') {
    return 'Female'
  }
  return capitalize(normalized)
}

function determineRegistrar(data: any): string {
  const assignment = data.registration?.assignment
  if (assignment) {
    const nameFromAssignment = joinNonEmpty([assignment.firstName, assignment.lastName])
    if (nameFromAssignment) {
      return nameFromAssignment
    }
    if (assignment.officeName) {
      return assignment.officeName
    }
  }

  const historyEntries = Array.isArray(data.history) ? data.history : []

  const registeredEntry = historyEntries.find(
    (history: any) => history?.regStatus === 'REGISTERED' && history.user?.name
  )

  if (registeredEntry?.user?.name) {
    const userName = getPrimaryHumanName(registeredEntry.user.name)
    const registrarFromHistory = joinNonEmpty([userName?.firstNames, userName?.familyName])
    if (registrarFromHistory) {
      return registrarFromHistory
    }
  }

  for (const history of historyEntries) {
    const certificates = Array.isArray(history?.certificates) ? history.certificates : []
    for (const certificate of certificates) {
      const certifierName = getPrimaryHumanName(certificate?.certifier?.name)
      const registrarFromCertificate = joinNonEmpty([certifierName?.firstNames, certifierName?.familyName])
      if (registrarFromCertificate) {
        return registrarFromCertificate
      }
    }
  }

  return 'Unknown Registrar'
}

function joinNonEmpty(parts: Array<string | undefined | null>): string | undefined {
  const filtered = parts
    .map(part => (typeof part === 'string' ? part.trim() : ''))
    .filter(part => part.length > 0)

  if (!filtered.length) {
    return undefined
  }

  return filtered.join(' ')
}

function joinWithComma(parts: Array<string | undefined>): string | undefined {
  const filtered = parts.filter((part): part is string => Boolean(part && part.length))
  if (!filtered.length) {
    return undefined
  }
  return filtered.join(', ')
}

function formatAddressLines(address: any | undefined): { addressOne?: string; addressTwo?: string } {
  if (!address) {
    return {}
  }

  const lines = Array.isArray(address.line) ? address.line : []
  const primaryLine = trimOrUndefined(lines[0]) || trimOrUndefined(lines[1])

  const locality = joinWithComma([
    trimOrUndefined(address.city),
    trimOrUndefined(address.district)
  ])

  const region = joinWithComma([
    trimOrUndefined(address.state),
    trimOrUndefined(address.country)
  ])

  const addressOne = primaryLine || locality || region
  const additionalSegments: string[] = []

  if (addressOne !== primaryLine && primaryLine) {
    additionalSegments.push(primaryLine)
  }
  if (addressOne !== locality && locality) {
    additionalSegments.push(locality)
  }
  if (addressOne !== region && region) {
    additionalSegments.push(region)
  }

  return {
    addressOne,
    addressTwo: additionalSegments.length ? additionalSegments.join(', ') : undefined
  }
}

function buildPlaceOfBirth(eventLocation: any): string | undefined {
  if (!eventLocation) return undefined

  const name = trimOrUndefined(eventLocation.name)
  const addressLines = formatAddressLines(eventLocation.address)
  const addressCombined = joinWithComma([
    addressLines.addressOne,
    addressLines.addressTwo
  ])

  if (name && addressCombined && !addressCombined.includes(name)) {
    return `${name} (${addressCombined})`
  }

  return name || addressCombined || undefined
}

function determineParish(eventLocation: any): string {
  if (!eventLocation?.address) {
    return 'Unknown Parish'
  }

  return (
    trimOrUndefined(eventLocation.address.district) ||
    trimOrUndefined(eventLocation.address.state) ||
    trimOrUndefined(eventLocation.address.city) ||
    'Unknown Parish'
  )
}

function selectAmendmentDescription(correction: any): string {
  const note = trimOrUndefined(correction?.note)
  if (note) {
    return note
  }

  if (Array.isArray(correction?.comments)) {
    const comment = correction.comments
      .map((entry: any) => trimOrUndefined(entry?.comment))
      .find(Boolean)
    if (comment) {
      return comment
    }
  }

  const otherReason = trimOrUndefined(correction?.otherReason)
  if (otherReason) {
    return otherReason
  }

  const reason = trimOrUndefined(correction?.reason)
  if (reason) {
    return reason
  }

  return 'Correction'
}

const REGION_DISPLAY_NAMES =
  typeof Intl !== 'undefined' && typeof (Intl as any).DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

const COUNTRY_CODE_FALLBACK: Record<string, string> = {
  ATG: 'Antigua and Barbuda'
}

function countryCodeToName(code?: string | null): string | undefined {
  const normalized = trimOrUndefined(code)
  if (!normalized) {
    return undefined
  }

  const upper = normalized.toUpperCase()

  if (REGION_DISPLAY_NAMES) {
    try {
      const displayName = REGION_DISPLAY_NAMES.of(upper)
      if (displayName && typeof displayName === 'string') {
        return displayName
      }
    } catch {
      // Fallback handled below
    }
  }

  if (COUNTRY_CODE_FALLBACK[upper]) {
    return COUNTRY_CODE_FALLBACK[upper]
  }

  return normalized
}
