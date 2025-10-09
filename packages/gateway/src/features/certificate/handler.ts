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
import { viewDeclaration } from '@gateway/workflow'
import { getAuthHeader } from '@opencrvs/commons/http'
import { findAssignment } from '@opencrvs/commons/assignment'
import { findResourceFromBundleById, Practitioner } from '@opencrvs/commons/types'

/**
 * Generate certificate via certificate-service DIRECTLY
 *
 * Flow:
 * 1. Fetch FHIR bundle from /records/{id}/view
 * 2. Transform FHIR to certificate DTO
 * 3. Call certificate-service API directly
 * 4. Return PDF
 *
 * POST /certificate/generate
 * Body: { compositionId: string, eventType: "birth" | "death" | "marriage" }
 */
export async function generateCertificateHandler(
  request: Request,
  h: ResponseToolkit
) {
  try {
    const { format } = request.query as { format?: string }
    const requestedFormat = format?.toLowerCase()

    const { compositionId, eventType } = request.payload as {
      compositionId: string
      eventType: 'birth' | 'death' | 'marriage'
    }

    const authHeader = getAuthHeader(request)
    const CERTIFICATE_SERVICE_URL = process.env.CERTIFICATE_SERVICE_URL || 'http://localhost:3890'

    console.log(`[Certificate] Generating ${eventType} certificate for ${compositionId}`)

    // Step 1: Fetch FHIR bundle from workflow service
    let bundle
    try {
      bundle = await viewDeclaration(compositionId, authHeader)
    } catch (error: any) {
      console.error('[Certificate] Failed to fetch FHIR bundle:', error.message)
      return h
        .response({
          error: 'Failed to fetch registration data',
          message: error.message || 'Could not fetch record'
        })
        .code(404)
    }

    // Step 2: Transform FHIR → Certificate DTO
    const certificateRequest = transformBundleToCertificateDTO(bundle, eventType)

    console.log(`[Certificate] Calling certificate-service with template: ${certificateRequest.templateName}`)

    // Step 3: Call certificate-service API
    const certResponse = await fetch(`${CERTIFICATE_SERVICE_URL}/api/certificates/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(certificateRequest)
    })

    if (!certResponse.ok) {
      const errorText = await certResponse.text()
      console.error('[Certificate] Certificate-service error:', errorText)
      return h
        .response({
          error: 'Failed to generate certificate',
          message: `Certificate-service error: ${certResponse.status}`
        })
        .code(certResponse.status)
    }

    const certData = await certResponse.json()

    // Step 4: Extract desired format and return
    if (requestedFormat === 'jpg') {
      const normalizePage = (page: any, index: number) => ({
        pageNumber: page?.pageNumber ?? page?.page ?? index + 1,
        filename:
          page?.filename ||
          `certificate-${compositionId}-page-${(page?.pageNumber ?? index + 1)
            .toString()
            .padStart(2, '0')}.jpg`,
        contentType: page?.contentType || 'image/jpeg',
        sizeBytes: page?.sizeBytes,
        base64: page?.base64
      })

      const jpgPages =
        Array.isArray(certData.jpgPages) && certData.jpgPages.length > 0
          ? certData.jpgPages
              .filter((page: any) => page?.base64)
              .map((page: any, index: number) => normalizePage(page, index))
          : []

      if (jpgPages.length > 0) {
        console.log(
          `[Certificate] Successfully generated ${jpgPages.length} JPG preview page(s)`
        )
        return h
          .response({ pages: jpgPages })
          .type('application/json')
      }

      if (certData.jpg?.base64) {
        console.log(
          '[Certificate] JPG preview requested but multi-page data missing, returning single-page preview'
        )
        return h
          .response({
            pages: [normalizePage(certData.jpg, 0)]
          })
          .type('application/json')
      }

      console.warn(
        '[Certificate] JPG preview requested but not available, falling back to PDF response'
      )
    }

    if (!certData.pdf || !certData.pdf.base64) {
      console.error('[Certificate] No PDF in response')
      return h
        .response({
          error: 'Invalid certificate response',
          message: 'Certificate-service did not return PDF data'
        })
        .code(500)
    }

    const pdfBuffer = Buffer.from(certData.pdf.base64, 'base64')
    console.log(`[Certificate] Successfully generated PDF (${pdfBuffer.length} bytes)`)

    return h
      .response(pdfBuffer)
      .type('application/pdf')
      .header(
        'Content-Disposition',
        `inline; filename="certificate-${compositionId}.pdf"`
      )
  } catch (error: any) {
    console.error('[Certificate] Error:', error)
    return h
      .response({
        error: 'Failed to generate certificate',
        message: error.message
      })
      .code(500)
  }
}

/**
 * Transform FHIR Bundle to Certificate DTO
 */
function transformBundleToCertificateDTO(bundle: any, eventType: string): any {
  const resources = bundle.entry?.map((e: any) => e.resource) || []

  // Debug: log all resource types in the bundle
  // const resourceTypes = resources.map((r: any) => r.resourceType)
  // console.log('[Certificate] Resource types in bundle:', resourceTypes)

  const composition = resources.find((r: any) => r.resourceType === 'Composition')
  const patients = resources.filter((r: any) => r.resourceType === 'Patient')
  const tasks = resources.filter((r: any) => r.resourceType === 'Task')
  const relatedPersons = resources.filter((r: any) => r.resourceType === 'RelatedPerson')

  // Find patients by section code
  const child = findPatientBySection(composition, patients, 'child-details')
  const mother = findPatientBySection(composition, patients, 'mother-details')
  const father = findPatientBySection(composition, patients, 'father-details')

  // Find informant (RelatedPerson with patient reference)
  const informantSection = composition?.section?.find((s: any) => s.code?.coding?.[0]?.code === 'informant-details')
  const informantRef = informantSection?.entry?.[0]?.reference
  const informant = informantRef ? relatedPersons.find((rp: any) => informantRef.includes(rp.id)) : null

  // Get registration info
  const registeredTask = tasks.find((t: any) => t.businessStatus?.coding?.[0]?.code === 'REGISTERED')
  const registrationNumber = getTaskValue(registeredTask, 'registrationNumber') || composition?.identifier?.value

  // Get registration date from composition.date (which is the registration timestamp)
  const registrationDate = composition?.date
  // console.log('[Certificate] Registration date from composition:', registrationDate)

  // Get registrar info using the same function as GraphQL resolvers
  const assignment = findAssignment(bundle)
  let registrarName = 'Unknown Registrar'
  let officeName = ''

  if (assignment) {
    const practitioner = findResourceFromBundleById<Practitioner>(bundle, assignment.practitioner.id)
    if (practitioner?.name?.[0]) {
      const firstName = practitioner.name[0].given?.join(' ') || ''
      const lastName = practitioner.name[0].family || ''
      registrarName = `${firstName} ${lastName}`.trim()
    }
    officeName = assignment.office.name || ''
  }

  // console.log('[Certificate] Registrar name:', registrarName)
  // console.log('[Certificate] Office name:', officeName)

  // Get informant type from task input
  const informantType = getTaskValue(registeredTask, 'informantType') || ''

  // Get contact email from task input
  const contactEmail = getTaskValue(registeredTask, 'contactEmail') || ''

  // Check if late registration (birth date > 1 month before registration)
  const birthDate = child?.birthDate ? new Date(child.birthDate) : null
  const regDate = registrationDate ? new Date(registrationDate) : null
  const lateRegistration = birthDate && regDate ?
    (regDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24) > 30 : false

  // Extract amendments from history
  const { amendments, fieldAmendments } = extractAmendments(bundle)
  console.log('[Certificate] Extracted amendments:', JSON.stringify(amendments, null, 2))
  console.log('[Certificate] Field amendments map:', JSON.stringify(fieldAmendments, null, 2))

  return {
    certificateType: eventType,
    templateName: `antigua-${eventType}-v1`,
    registrationNumber,
    registrationDate: registrationDate?.split('T')[0],
    registrar: registrarName,
    registrarOffice: officeName,
    dateRegistered: registrationDate?.split('T')[0],
    lateRegistration,
    amendments,
    fieldAmendments,
    parish: 'St. Johns',
    contactEmail,
    child: child ? {
      firstName: getPatientName(child, 'given'),
      surname: getPatientName(child, 'family'),
      dateOfBirth: child.birthDate,
      placeOfBirth: 'St. Johns',
      sex: child.gender === 'male' ? 'Male' : 'Female'
    } : undefined,
    mother: mother ? {
      firstName: getPatientName(mother, 'given'),
      middleName: getPatientMiddleName(mother),
      surname: getPatientName(mother, 'family'),
      dateOfBirth: mother.birthDate,
      nationality: getNationality(mother),
      occupation: getExtensionValue(mother, 'occupation'),
      address: getAddress(mother)
    } : undefined,
    father: father ? {
      firstName: getPatientName(father, 'given'),
      middleName: getPatientMiddleName(father),
      surname: getPatientName(father, 'family'),
      dateOfBirth: father.birthDate,
      nationality: getNationality(father),
      occupation: getExtensionValue(father, 'occupation'),
      address: getAddress(father)
    } : undefined,
    informant: (() => {
      const relationship = informant?.relationship?.coding?.[0]?.code || informantType
      const otherRelationship = getExtensionValue(informant, 'other-relationship') || ''

      // If informant is MOTHER or FATHER, use their patient data
      let informantData
      if (relationship === 'MOTHER' && mother) {
        informantData = {
          firstName: getPatientName(mother, 'given'),
          middleName: getPatientMiddleName(mother),
          surname: getPatientName(mother, 'family'),
          occupation: getExtensionValue(mother, 'occupation'),
          nationality: getNationality(mother),
          dateOfBirth: mother.birthDate,
          address: getAddress(mother)
        }
      } else if (relationship === 'FATHER' && father) {
        informantData = {
          firstName: getPatientName(father, 'given'),
          middleName: getPatientMiddleName(father),
          surname: getPatientName(father, 'family'),
          occupation: getExtensionValue(father, 'occupation'),
          nationality: getNationality(father),
          dateOfBirth: father.birthDate,
          address: getAddress(father)
        }
      } else if (informant) {
        // For other relationships, use informant's own data
        informantData = {
          firstName: getPersonName(informant, 'given'),
          middleName: getPersonMiddleName(informant),
          surname: getPersonName(informant, 'family'),
          occupation: getExtensionValue(informant, 'occupation'),
          nationality: getNationality(informant),
          dateOfBirth: informant.birthDate,
          address: getAddress(informant)
        }
      } else {
        return undefined
      }

      return {
        ...informantData,
        relationship,
        otherRelationship
      }
    })()
  }
}

function findPatientBySection(composition: any, patients: any[], sectionCode: string): any {
  const section = composition?.section?.find((s: any) => s.code?.coding?.[0]?.code === sectionCode)
  const ref = section?.entry?.[0]?.reference
  if (!ref) return null
  return patients.find((p: any) => ref.includes(p.id))
}

function getPatientName(patient: any, part: 'given' | 'family'): string {
  const name = patient.name?.find((n: any) => n.use === 'en') || patient.name?.[0]
  if (part === 'given') return name?.given?.join(' ') || ''
  return name?.family || ''
}

function getPatientMiddleName(patient: any): string {
  const name = patient.name?.find((n: any) => n.use === 'en') || patient.name?.[0]
  return name?.given?.[1] || '' // Middle name is typically the second given name
}

function getPersonName(person: any, part: 'given' | 'family'): string {
  // RelatedPerson names are in array format
  const name = person.name?.find((n: any) => n.use === 'en') || person.name?.[0]
  if (part === 'given') return name?.given?.join(' ') || ''
  return name?.family || ''
}

function getPersonMiddleName(person: any): string {
  const name = person.name?.find((n: any) => n.use === 'en') || person.name?.[0]
  return name?.given?.[1] || '' // Middle name is typically the second given name
}

function getNationality(person: any): string {
  // Extract nationality from extension
  const nationalityExt = person.extension?.find((e: any) => e.url?.includes('nationality'))
  const code = nationalityExt?.extension?.find((e: any) => e.url === 'code')?.valueCodeableConcept?.coding?.[0]?.code
  return code === 'ATG' ? 'Antigua and Barbuda' : code || 'Unknown'
}

function getAddress(person: any): string {
  const address = person.address?.find((a: any) => a.use === 'home') || person.address?.[0]
  if (!address) return ''

  // Combine address lines
  const lines = address.line?.filter((l: any) => l && l.trim()).join(', ') || ''
  const parts = [
    lines,
    address.city,
    address.district,
    address.state,
    address.postalCode,
    address.country
  ].filter(p => p && p.trim())

  return parts.join(', ')
}

function getExtensionValue(resource: any, url: string): string | undefined {
  return resource?.extension?.find((e: any) => e.url.includes(url))?.valueString
}

function getTaskValue(task: any, type: string): string | undefined {
  return task?.input?.find((i: any) => i.type?.text === type)?.valueString
}

function extractAmendments(bundle: any): { amendments: any[], fieldAmendments: Record<string, number> } {
  const resources = bundle.entry?.map((e: any) => e.resource) || []

  // Find all Task/TaskHistory resources with makeCorrection extension
  // Corrections are identified by extension, not businessStatus
  const correctedTasks = resources.filter((r: any) =>
    (r.resourceType === 'Task' || r.resourceType === 'TaskHistory') &&
    r.extension?.some((ext: any) =>
      ext.url === 'http://opencrvs.org/specs/extension/makeCorrection'
    )
  )

  if (correctedTasks.length === 0) return { amendments: [], fieldAmendments: {} }

  // Track which fields have amendments (field path -> amendment number)
  const fieldAmendments: Record<string, number> = {}

  // Transform each CORRECTED task into certificate-service amendment format
  // A single correction task may affect multiple sections (child, mother, father)
  // so we create separate amendments for each section
  let amendmentNumber = 0
  const amendments: any[] = []

  correctedTasks.forEach((task: any) => {
    const date = task.lastModified
    const reason = task.reason?.text || ''
    const otherReason = task.reason?.extension?.find((e: any) =>
      e.url === 'http://opencrvs.org/specs/extension/otherReason'
    )?.valueString || ''
    const note = task.note?.[0]?.text || ''

    // Extract input (before) and output (after) changes
    const inputs = task.input || []
    const outputs = task.output || []

    // Build map of input values by section.fieldName
    const inputMap = new Map()
    inputs.forEach((inp: any) => {
      const section = inp.valueCode  // e.g., "child", "father"
      const fieldName = inp.valueId  // e.g., "familyNameEng", "childBirthDate"
      const value = inp.valueString ?? inp.valueBoolean ?? inp.valueInteger ?? ''

      if (section && fieldName) {
        const key = `${section}.${fieldName}`
        inputMap.set(key, value)
      }
    })

    // Group changes by section and collect new values
    const changesBySection = new Map<string, Map<string, any>>()

    outputs.forEach((out: any) => {
      const section = out.valueCode  // "child", "mother", "father"
      const fieldName = out.valueId
      const newValue = out.valueString ?? out.valueBoolean ?? out.valueInteger ?? ''

      if (section && fieldName) {
        const key = `${section}.${fieldName}`
        const oldValue = inputMap.get(key)
        // Only include if value actually changed
        if (oldValue !== newValue) {
          if (!changesBySection.has(section)) {
            changesBySection.set(section, new Map())
          }
          changesBySection.get(section)!.set(fieldName, newValue)
        }
      }
    })

    // Format date as "DD MMM YYYY" (e.g., "15 Jan 2024")
    const formattedDate = date ? formatAmendmentDate(date) : ''

    // Create separate amendment for each section that has changes
    changesBySection.forEach((sectionFields, section) => {
      amendmentNumber++

      // Determine amendment type based on section and fields changed
      const amendmentType = determineAmendmentType(section, sectionFields)

      // Convert section to proper case (child -> Child, mother -> Mother, father -> Father)
      const sectionProper = section.charAt(0).toUpperCase() + section.slice(1).toLowerCase()

      // Build fields object with new values only (PascalCase field names)
      const fields: Record<string, string> = {}
      const changedFieldDescriptions: string[] = []

      sectionFields.forEach((value, fieldName) => {
        // Skip internal/non-displayable fields
        if (shouldSkipField(fieldName)) {
          return
        }

        // Map FHIR field names to certificate field names (PascalCase)
        const certFieldName = mapFieldNameToPascalCase(fieldName)
        fields[certFieldName] = String(value)

        // Track this field amendment for superscript markers (lowercase section, camelCase field)
        const fieldPathCamelCase = `${section}.${mapFieldName(fieldName)}`
        fieldAmendments[fieldPathCamelCase] = amendmentNumber

        // Build description of what changed (old value -> new value)
        const key = `${section}.${fieldName}`
        const oldValue = inputMap.get(key)
        const newValue = value

        if (oldValue !== undefined && oldValue !== '') {
          changedFieldDescriptions.push(
            `${certFieldName} changed from '${oldValue}' to '${newValue}'`
          )
        } else {
          changedFieldDescriptions.push(
            `${certFieldName} set to '${newValue}'`
          )
        }
      })

      // Build complete description
      const descriptionParts: string[] = []

      // Add field changes description
      if (changedFieldDescriptions.length > 0) {
        descriptionParts.push(changedFieldDescriptions.join(', '))
      }

      // Add reason (translate code to human-readable text)
      if (reason) {
        const reasonText = translateReasonCode(reason)
        descriptionParts.push(`Reason: ${reasonText}`)
      }

      // Add other reason if specified
      if (otherReason) {
        descriptionParts.push(otherReason)
      }

      // Add note/comments
      if (note) {
        descriptionParts.push(note)
      }

      const description = descriptionParts.join('. ')

      amendments.push({
        type: amendmentType,
        date: formattedDate,
        section: sectionProper,
        fields,
        description,
        amendmentNumber
      })
    })
  })

  return { amendments, fieldAmendments }
}

function determineAmendmentType(section: string, fields: Map<string, any>): string {
  const sectionLower = section.toLowerCase()
  const fieldNames = Array.from(fields.keys())

  // Check if name fields are being changed
  const hasNameChange = fieldNames.some(f =>
    f.includes('Name') || f.includes('name') || f.includes('firstName') || f.includes('familyName')
  )

  if (sectionLower === 'child') {
    return hasNameChange ? 'ChangeOfName' : 'BirthNameAndParticularsChanged'
  } else if (sectionLower === 'father') {
    // Check if details are being added (old values were empty)
    const isAdding = fieldNames.some(f => {
      const value = fields.get(f)
      return value && String(value).trim() !== ''
    })
    return isAdding ? 'FathersNameAndParticularsAdded' : 'FathersNameAndParticularsChanged'
  } else if (sectionLower === 'mother') {
    return 'MothersNameAndParticularsChanged'
  }

  return 'ChangeOfName' // Default fallback
}

function formatAmendmentDate(isoDate: string): string {
  const date = new Date(isoDate)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = date.getDate()
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

function translateReasonCode(reasonCode: string): string {
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

function shouldSkipField(fhirFieldName: string): boolean {
  // Skip internal fields that shouldn't appear in certificate amendments
  const skipFields = [
    'detailsExist',
    'exactDateOfBirthUnknown',
    'ageOfIndividualInYears',
    'fatherIdType',
    'motherIdType',
    'reasonNotApplying'
  ]
  return skipFields.includes(fhirFieldName)
}

function mapFieldName(fhirFieldName: string): string {
  // Map FHIR field names to certificate field names (camelCase) - for fieldAmendments map
  const mapping: Record<string, string> = {
    // Child fields
    'firstNamesEng': 'firstName',
    'middleNameEng': 'middleName',
    'familyNameEng': 'surname',
    'childBirthDate': 'dateOfBirth',
    'placeOfBirth': 'placeOfBirth',
    'gender': 'sex',

    // Mother/Father fields
    'dateOfBirth': 'dateOfBirth',
    'nationality': 'nationality',
    'occupation': 'occupation',
    'maritalStatus': 'maritalStatus',
    'educationalAttainment': 'educationalAttainment',

    // Address fields
    'countryPrimary': 'countryOfBirth',
    'statePrimary': 'addressTwo',
    'districtPrimary': 'addressTwo',
    'cityPrimary': 'addressOne',
    'addressLine1': 'addressOne',
    'addressLine2': 'addressTwo',
    'postalCode': 'postalCode',

    // Father-specific address fields
    'countryPrimaryFather': 'countryOfBirth',
    'statePrimaryFather': 'addressTwo',
    'districtPrimaryFather': 'addressTwo',

    // Mother-specific address fields
    'countryPrimaryMother': 'countryOfBirth',
    'statePrimaryMother': 'addressTwo',
    'districtPrimaryMother': 'addressTwo'
  }
  return mapping[fhirFieldName] || fhirFieldName
}

function mapFieldNameToPascalCase(fhirFieldName: string): string {
  // Map FHIR field names to PascalCase for amendment fields display
  const mapping: Record<string, string> = {
    // Child fields
    'firstNamesEng': 'FirstName',
    'middleNameEng': 'MiddleName',
    'familyNameEng': 'Surname',
    'childBirthDate': 'DateOfBirth',
    'placeOfBirth': 'PlaceOfBirth',
    'gender': 'Sex',

    // Mother/Father fields
    'dateOfBirth': 'DateOfBirth',
    'nationality': 'Nationality',
    'occupation': 'Occupation',
    'maritalStatus': 'MaritalStatus',
    'educationalAttainment': 'EducationalAttainment',

    // Address fields
    'countryPrimary': 'CountryOfBirth',
    'statePrimary': 'AddressTwo',
    'districtPrimary': 'AddressTwo',
    'cityPrimary': 'AddressOne',
    'addressLine1': 'AddressOne',
    'addressLine2': 'AddressTwo',
    'postalCode': 'PostalCode',

    // Father-specific address fields
    'countryPrimaryFather': 'CountryOfBirth',
    'statePrimaryFather': 'AddressTwo',
    'districtPrimaryFather': 'AddressTwo',

    // Mother-specific address fields
    'countryPrimaryMother': 'CountryOfBirth',
    'statePrimaryMother': 'AddressTwo',
    'districtPrimaryMother': 'AddressTwo'
  }
  return mapping[fhirFieldName] || fhirFieldName
}
