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

/**
 * Certificate Service Integration
 *
 * This service integrates OpenCRVS with the Toppan Certificate Service for generating
 * digitally signed birth/death/marriage certificates with visual digital seal.
 *
 * Flow:
 * 1. Fetch registration data from FHIR via GraphQL
 * 2. Resolve location UUIDs to human-readable names
 * 3. Transform GraphQL data to certificate DTO format
 * 4. Call certificate-service API to generate PDF
 * 5. Return PDF buffer to client
 */

import fetch from 'node-fetch'
import {
  CERTIFICATE_SERVICE_URL,
  COUNTRY_CONFIG_URL,
  CLIENT_APP_URL
} from '@gateway/constants'

interface CertificateConfig {
  templates: Record<string, string>
  addressFormat: { hierarchy: string[]; separator: string }
  locationHierarchy: string[]
  amendmentTypes: Record<string, string>
  lateRegistrationThreshold: Record<string, number>
  countryCodes: Record<string, string>
}

let configCache: CertificateConfig | null = null
let configCacheTime = 0
const CONFIG_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

/**
 * Fetch certificate configuration from countryconfig
 */
async function getCertificateConfig(): Promise<CertificateConfig> {
  const now = Date.now()

  if (configCache && now - configCacheTime < CONFIG_CACHE_DURATION) {
    return configCache
  }

  const response = await fetch(`${COUNTRY_CONFIG_URL}/certificate-config`)

  if (!response.ok) {
    throw new Error(
      `Failed to fetch certificate config: ${response.status} ${response.statusText}`
    )
  }

  const config = (await response.json()) as CertificateConfig
  configCache = config
  configCacheTime = now

  return config
}

/**
 * Generate certificate PDF via certificate-service
 */
export async function generateCertificate(
  data: any,
  eventType: string,
  compositionId: string,
  authToken: string
): Promise<Buffer> {
  // 1. Fetch config from countryconfig
  const config = await getCertificateConfig()

  // 2. Resolve location UUIDs to names
  await resolveLocationNames(data, authToken)

  // 3. Transform to CertificateRequest DTO
  const certificateRequest = transformToCertificateRequest(
    data,
    eventType,
    compositionId,
    config
  )

  // 4. Call certificate-service
  const response = await fetch(`${CERTIFICATE_SERVICE_URL}/api/certificates/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(certificateRequest)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Certificate-service error: ${response.status} ${errorText}`
    )
  }

  const responseData = await response.json()

  if (!responseData.success || !responseData.pdf || !responseData.pdf.base64) {
    throw new Error('Certificate-service did not return PDF data')
  }

  return Buffer.from(responseData.pdf.base64, 'base64')
}

/**
 * Resolve location UUIDs to location names
 */
async function resolveLocationNames(data: any, authToken: string): Promise<void> {
  const locationCache = new Map<string, string>()

  async function getLocationName(locationId: string): Promise<string> {
    if (!locationId) return ''
    if (locationCache.has(locationId)) return locationCache.get(locationId)!

    try {
      const response = await fetch(
        `${process.env.GATEWAY_URL || 'http://localhost:7070'}/locations/${locationId}`,
        {
          method: 'GET',
          headers: {
            Authorization: authToken
          }
        }
      )

      if (!response.ok) {
        return locationId // Return UUID as fallback
      }

      const location = await response.json()
      const name = location.name || locationId
      locationCache.set(locationId, name)
      return name
    } catch (error: any) {
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
  }

  // Resolve addresses for all persons
  if (Array.isArray(data.mother?.address)) {
    for (const address of data.mother.address) {
      await resolveAddress(address)
    }
  }

  if (Array.isArray(data.father?.address)) {
    for (const address of data.father.address) {
      await resolveAddress(address)
    }
  }

  if (Array.isArray(data.informant?.address)) {
    for (const address of data.informant.address) {
      await resolveAddress(address)
    }
  }

  if (data.eventLocation) {
    if (!data.eventLocation.name && data.eventLocation.id) {
      data.eventLocation.name = await getLocationName(data.eventLocation.id)
    }
    await resolveAddress(data.eventLocation.address)
  }
}

/**
 * Transform GraphQL data to CertificateRequest DTO
 * (This is the transformation logic from toppan-print-handler-v2.ts)
 */
function transformToCertificateRequest(
  data: any,
  eventType: string,
  compositionId: string,
  config: CertificateConfig
): any {
  const amendments = extractAmendmentsFromHistory(data.history || [], config)
  const parish = determineParish(data.eventLocation, config)
  const registrar = determineRegistrar(data)
  const registrationDate = extractRegistrationDate(data.registration)

  const childName = getPrimaryHumanName(data.child?.name)
  const motherName = getPrimaryHumanName(data.mother?.name)
  const fatherName = getPrimaryHumanName(data.father?.name)
  const informantName = getPrimaryHumanName(data.informant?.name)

  const motherAddress = formatAddressLines(data.mother?.address?.[0])
  const fatherAddress = formatAddressLines(data.father?.address?.[0])
  const informantAddress = formatAddressLines(data.informant?.address?.[0])

  return {
    certificateType: eventType,
    templateName: config.templates[eventType] || `antigua-${eventType}-v1`,

    child: data.child
      ? {
          firstName: trimOrUndefined(childName?.firstNames),
          middleName: trimOrUndefined(childName?.middleName),
          surname: trimOrUndefined(childName?.familyName),
          sex: mapSex(data.child.gender),
          dateOfBirth: trimOrUndefined(data.child.birthDate),
          placeOfBirth: buildPlaceOfBirth(data.eventLocation)
        }
      : undefined,

    mother: data.mother
      ? {
          firstName: trimOrUndefined(motherName?.firstNames),
          middleName: trimOrUndefined(motherName?.middleName),
          surname: trimOrUndefined(motherName?.familyName),
          maidenName: trimOrUndefined(motherName?.marriedLastName),
          dateOfBirth: trimOrUndefined(data.mother.birthDate),
          occupation: trimOrUndefined(data.mother.occupation),
          countryOfBirth: countryCodeToName(
            data.mother.address?.[0]?.country,
            config
          ),
          nationality: countryCodeToName(data.mother.nationality?.[0], config),
          addressOne: motherAddress.addressOne,
          addressTwo: motherAddress.addressTwo
        }
      : undefined,

    father: data.father
      ? {
          firstName: trimOrUndefined(fatherName?.firstNames),
          middleName: trimOrUndefined(fatherName?.middleName),
          surname: trimOrUndefined(fatherName?.familyName),
          dateOfBirth: trimOrUndefined(data.father.birthDate),
          occupation: trimOrUndefined(data.father.occupation),
          countryOfBirth: countryCodeToName(
            data.father.address?.[0]?.country,
            config
          ),
          nationality: countryCodeToName(data.father.nationality?.[0], config),
          addressOne: fatherAddress.addressOne,
          addressTwo: fatherAddress.addressTwo
        }
      : undefined,

    informant: data.informant
      ? {
          firstName: trimOrUndefined(informantName?.firstNames),
          middleName: trimOrUndefined(informantName?.middleName),
          surname: trimOrUndefined(informantName?.familyName),
          relationship: mapRelationship(data.informant.relationship),
          profession: trimOrUndefined(data.informant.occupation),
          addressOne: informantAddress.addressOne,
          addressTwo: informantAddress.addressTwo
        }
      : undefined,

    registrationNumber: data.registration?.registrationNumber || 'UNKNOWN',
    registrationDate,
    registrar,
    parish,

    lateRegistration: calculateLateRegistration(
      data.child?.birthDate,
      registrationDate,
      eventType,
      config
    ),

    recordUrl: `${CLIENT_APP_URL}/record/${compositionId}`,

    amendments
  }
}

// Helper functions (copied from toppan-print-handler-v2.ts)

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
  if (normalized === 'male') return 'Male'
  if (normalized === 'female') return 'Female'
  return capitalize(normalized)
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function determineRegistrar(data: any): string {
  const assignment = data.registration?.assignment
  if (assignment) {
    const nameFromAssignment = joinNonEmpty([
      assignment.firstName,
      assignment.lastName
    ])
    if (nameFromAssignment) return nameFromAssignment
    if (assignment.officeName) return assignment.officeName
  }

  const historyEntries = Array.isArray(data.history) ? data.history : []

  const registeredEntry = historyEntries.find(
    (history: any) => history?.regStatus === 'REGISTERED' && history.user?.name
  )

  if (registeredEntry?.user?.name) {
    const userName = getPrimaryHumanName(registeredEntry.user.name)
    const registrarFromHistory = joinNonEmpty([
      userName?.firstNames,
      userName?.familyName
    ])
    if (registrarFromHistory) return registrarFromHistory
  }

  for (const history of historyEntries) {
    const certificates = Array.isArray(history?.certificates)
      ? history.certificates
      : []
    for (const certificate of certificates) {
      const certifierName = getPrimaryHumanName(certificate?.certifier?.name)
      const registrarFromCertificate = joinNonEmpty([
        certifierName?.firstNames,
        certifierName?.familyName
      ])
      if (registrarFromCertificate) return registrarFromCertificate
    }
  }

  return 'Unknown Registrar'
}

function joinNonEmpty(parts: Array<string | undefined | null>): string | undefined {
  const filtered = parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)

  if (!filtered.length) return undefined
  return filtered.join(' ')
}

function joinWithComma(parts: Array<string | undefined>): string | undefined {
  const filtered = parts.filter((part): part is string =>
    Boolean(part && part.length)
  )
  if (!filtered.length) return undefined
  return filtered.join(', ')
}

function formatAddressLines(
  address: any | undefined
): { addressOne?: string; addressTwo?: string } {
  if (!address) return {}

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
    addressTwo: additionalSegments.length
      ? additionalSegments.join(', ')
      : undefined
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

function determineParish(eventLocation: any, config: CertificateConfig): string {
  if (!eventLocation?.address) return 'Unknown Parish'

  return (
    trimOrUndefined(eventLocation.address.district) ||
    trimOrUndefined(eventLocation.address.state) ||
    trimOrUndefined(eventLocation.address.city) ||
    'Unknown Parish'
  )
}

function extractRegistrationDate(registration: any): string {
  if (!registration) return new Date().toISOString().split('T')[0]

  const registeredStatus = registration.status?.find(
    (s: any) => s.type === 'REGISTERED'
  )

  if (registeredStatus?.timestamp) {
    return registeredStatus.timestamp.split('T')[0]
  }

  const certifiedStatus = registration.status?.find(
    (s: any) => s.type === 'CERTIFIED'
  )

  if (certifiedStatus?.timestamp) {
    return certifiedStatus.timestamp.split('T')[0]
  }

  return new Date().toISOString().split('T')[0]
}

function extractAmendmentsFromHistory(
  history: any[],
  config: CertificateConfig
): any[] {
  const corrections = history.filter((h) => h.action === 'CORRECTED')
  const amendments: any[] = []

  for (const correction of corrections) {
    if (!correction.input || !correction.output) continue

    for (const outputField of correction.output) {
      const inputField = correction.input.find(
        (i: any) =>
          i.valueCode === outputField.valueCode &&
          i.valueId === outputField.valueId
      )

      if (inputField && inputField.value !== outputField.value) {
        const section = capitalize(outputField.valueCode || 'Unknown')
        amendments.push({
          type: mapCorrectionReason(outputField.valueCode, config),
          date:
            correction.date?.split('T')[0] ||
            new Date().toISOString().split('T')[0],
          section: section,
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

function mapCorrectionReason(section: string, config: CertificateConfig): string {
  const normalized = section?.toLowerCase()
  return (
    config.amendmentTypes[normalized] ||
    config.amendmentTypes.default ||
    'ChangeOfName'
  )
}

function selectAmendmentDescription(correction: any): string {
  const note = trimOrUndefined(correction?.note)
  if (note) return note

  if (Array.isArray(correction?.comments)) {
    const comment = correction.comments
      .map((entry: any) => trimOrUndefined(entry?.comment))
      .find(Boolean)
    if (comment) return comment
  }

  const otherReason = trimOrUndefined(correction?.otherReason)
  if (otherReason) return otherReason

  const reason = trimOrUndefined(correction?.reason)
  if (reason) return reason

  return 'Correction'
}

function calculateLateRegistration(
  eventDate: string | undefined,
  registrationDate: string | undefined,
  eventType: string,
  config: CertificateConfig
): boolean {
  if (!eventDate || !registrationDate) return false

  const event = new Date(eventDate)
  const registered = new Date(registrationDate)
  const daysDiff = Math.floor(
    (registered.getTime() - event.getTime()) / (1000 * 60 * 60 * 24)
  )

  const threshold =
    config.lateRegistrationThreshold[eventType] ||
    (eventType === 'birth' ? 45 : 7)

  return daysDiff > threshold
}

function mapRelationship(relationship: string | undefined): string {
  if (!relationship) return 'Other'

  const map: Record<string, string> = {
    MOTHER: 'Mother',
    FATHER: 'Father',
    SPOUSE: 'Spouse',
    OTHER: 'Other',
    GRANDFATHER: 'Grandfather',
    GRANDMOTHER: 'Grandmother',
    LEGAL_GUARDIAN: 'Legal Guardian'
  }

  return map[relationship] || relationship
}

const REGION_DISPLAY_NAMES =
  typeof Intl !== 'undefined' && typeof (Intl as any).DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

function countryCodeToName(
  code?: string | null,
  config?: CertificateConfig
): string | undefined {
  const normalized = trimOrUndefined(code)
  if (!normalized) return undefined

  const upper = normalized.toUpperCase()

  if (REGION_DISPLAY_NAMES) {
    try {
      const displayName = REGION_DISPLAY_NAMES.of(upper)
      if (displayName && typeof displayName === 'string') {
        return displayName
      }
    } catch {
      // Fallback below
    }
  }

  if (config?.countryCodes[upper]) {
    return config.countryCodes[upper]
  }

  return normalized
}
