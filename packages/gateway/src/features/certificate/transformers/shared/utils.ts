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
 * Shared utility functions for certificate transformers
 * Used across different country implementations
 */

export function resolveNationalityCode(code: string): string {
  // Map country codes to full country names
  const countryMap: Record<string, string> = {
    'ATG': 'Antigua and Barbuda',
    'USA': 'United States',
    'GBR': 'United Kingdom',
    'CAN': 'Canada',
    'JAM': 'Jamaica',
    'BRB': 'Barbados',
    'TTO': 'Trinidad and Tobago',
    // Add more country codes as needed
  }
  return countryMap[code] || code
}

export function translateReasonCode(reasonCode: string): string {
  // Translate OpenCRVS correction reason codes to human-readable text
  const reasonMap: Record<string, string> = {
    'MATERIAL_ERROR': 'Material error in registration',
    'MATERIAL_OMISSION': 'Material omission in registration',
    'JUDICIAL_ORDER': 'Judicial order',
    'CLERICAL_ERROR': 'Clerical error',
    'OTHER': 'Other reason'
  }
  return reasonMap[reasonCode] || reasonCode
}

export function formatAmendmentDate(isoDate: string): string {
  const date = new Date(isoDate)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = date.getDate()
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

export function buildLocationMap(resources: any[]): Map<string, string> {
  const locations = resources.filter((r: any) => r.resourceType === 'Location')
  const locationMap = new Map<string, string>()
  locations.forEach((loc: any) => {
    if (loc.id && loc.name) {
      locationMap.set(loc.id, loc.name)
    }
  })
  return locationMap
}

export function getPatientName(patient: any, part: 'given' | 'family'): string {
  const name = patient.name?.find((n: any) => n.use === 'en') || patient.name?.[0]
  if (part === 'given') return name?.given?.join(' ') || ''
  return name?.family || ''
}

export function getPatientMiddleName(patient: any): string {
  const name = patient.name?.find((n: any) => n.use === 'en') || patient.name?.[0]
  return name?.given?.[1] || '' // Middle name is typically the second given name
}

export function getPersonName(person: any, part: 'given' | 'family'): string {
  // RelatedPerson names are in array format
  const name = person.name?.find((n: any) => n.use === 'en') || person.name?.[0]
  if (part === 'given') return name?.given?.join(' ') || ''
  return name?.family || ''
}

export function getPersonMiddleName(person: any): string {
  const name = person.name?.find((n: any) => n.use === 'en') || person.name?.[0]
  return name?.given?.[1] || '' // Middle name is typically the second given name
}

export function getNationality(person: any): string {
  // Extract nationality from extension
  const nationalityExt = person.extension?.find((e: any) => e.url?.includes('nationality'))
  const code = nationalityExt?.extension?.find((e: any) => e.url === 'code')?.valueCodeableConcept?.coding?.[0]?.code
  return code ? resolveNationalityCode(code) : 'Unknown'
}

export function getExtensionValue(resource: any, url: string): string | undefined {
  return resource?.extension?.find((e: any) => e.url.includes(url))?.valueString
}

export function getTaskValue(task: any, type: string): string | undefined {
  return task?.input?.find((i: any) => i.type?.text === type)?.valueString
}

export function findPatientBySection(composition: any, patients: any[], sectionCode: string): any {
  const section = composition?.section?.find((s: any) => s.code?.coding?.[0]?.code === sectionCode)
  const ref = section?.entry?.[0]?.reference
  if (!ref) return null
  return patients.find((p: any) => ref.includes(p.id))
}
