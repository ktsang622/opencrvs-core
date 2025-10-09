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

interface FHIRBundle {
  resourceType: 'Bundle'
  entry: Array<{
    resource: any
  }>
}

interface Task {
  resourceType: 'Task'
  id: string
  businessStatus?: {
    coding?: Array<{
      code: string
    }>
  }
  input?: Array<{
    type?: {
      text?: string
    }
    valueString?: string
    valueBoolean?: boolean
    valueInteger?: number
    valueCode?: string
    valueId?: string
  }>
  output?: Array<{
    type?: {
      text?: string
    }
    valueString?: string
    valueBoolean?: boolean
    valueInteger?: number
    valueCode?: string
    valueId?: string
  }>
  lastModified?: string
  reason?: {
    text?: string
  }
}

interface Patient {
  resourceType: 'Patient'
  id: string
  name?: Array<{
    use?: string
    family?: string
    given?: string[]
  }>
  gender?: string
  birthDate?: string
  address?: Array<{
    line?: string[]
    city?: string
    district?: string
    state?: string
    country?: string
  }>
  extension?: Array<{
    url: string
    valueString?: string
  }>
}

interface Composition {
  resourceType: 'Composition'
  id: string
  identifier?: {
    value?: string
  }
  date?: string
  section?: Array<{
    code?: {
      coding?: Array<{
        code: string
      }>
    }
    entry?: Array<{
      reference: string
    }>
  }>
}

/**
 * Handler for printing certificates via Toppan certificate-service
 *
 * POST /api/countryconfig/certificates/toppan/print
 * Body: { compositionId: string, eventType: "birth" | "death" | "marriage" }
 */
export async function toppanPrintHandler(
  request: Request,
  h: ResponseToolkit
) {
  try {
    const { compositionId, eventType } = request.payload as {
      compositionId: string
      eventType: 'birth' | 'death' | 'marriage'
    }

    logger.info(`[Toppan Print] Generating certificate for ${eventType} - ${compositionId}`)

    // Step 1: Fetch FHIR Bundle from workflow service via /records/{id}/view
    const authHeader = request.headers.authorization
    const bundle = await fetch(`${GATEWAY_URL}/records/${compositionId}/view`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      }
    }).then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch record: ${res.status} ${res.statusText}`)
      }
      return res.json()
    }) as FHIRBundle

    logger.info(`[Toppan Print] Fetched FHIR Bundle with ${bundle.entry?.length || 0} resources`)

    // Step 2: Extract data from FHIR Bundle
    const certificateRequest = await transformBundleToCertificateRequest(bundle, eventType)

    logger.info(`[Toppan Print] Transformed to CertificateRequest with ${certificateRequest.amendments?.length || 0} amendments`)

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
      logger.error(`[Toppan Print] Certificate-service error: ${certificateResponse.status} ${errorText}`)
      throw new Error(`Certificate-service error: ${certificateResponse.status} ${errorText}`)
    }

    // Step 4: Return PDF
    const pdfBuffer = await certificateResponse.buffer()
    logger.info(`[Toppan Print] Successfully generated PDF (${pdfBuffer.length} bytes)`)

    return h.response(pdfBuffer)
      .type('application/pdf')
      .header('Content-Disposition', `inline; filename="certificate-${compositionId}.pdf"`)

  } catch (error: any) {
    logger.error('[Toppan Print] Error generating certificate:', error)
    return h.response({
      error: 'Failed to generate certificate',
      message: error.message
    }).code(500)
  }
}

/**
 * Transform FHIR Bundle to CertificateRequest DTO
 */
async function transformBundleToCertificateRequest(
  bundle: FHIRBundle,
  eventType: string
): Promise<any> {
  const resources = bundle.entry?.map(e => e.resource) || []

  // Extract resources by type
  const composition = resources.find(r => r.resourceType === 'Composition') as Composition
  const patients = resources.filter(r => r.resourceType === 'Patient') as Patient[]
  const tasks = resources.filter(r => r.resourceType === 'Task') as Task[]

  // Extract child/mother/father/deceased based on composition sections
  const child = findPatientByCode(composition, patients, 'child')
  const mother = findPatientByCode(composition, patients, 'mother')
  const father = findPatientByCode(composition, patients, 'father')
  const deceased = findPatientByCode(composition, patients, 'deceased')
  const informant = findPatientByCode(composition, patients, 'informant')

  // Extract registration details
  const registrationNumber = composition?.identifier?.value || 'UNKNOWN'
  const registrationDate = composition?.date || new Date().toISOString()

  // Extract amendments from Task history
  const amendments = extractAmendments(tasks)

  return {
    certificateType: eventType,
    templateName: `antigua-${eventType}-v1`,
    child: child ? transformPatientToPerson(child) : undefined,
    mother: mother ? transformPatientToPerson(mother) : undefined,
    father: father ? transformPatientToPerson(father) : undefined,
    deceased: deceased ? transformPatientToPerson(deceased) : undefined,
    informant: informant ? transformPatientToPerson(informant) : undefined,
    registrationNumber,
    registrationDate: registrationDate.split('T')[0], // ISO date only
    registrar: 'Registrar Name', // TODO: Extract from Task
    parish: 'Parish Name', // TODO: Extract from Location
    amendments,
    recordUrl: `https://localhost:3000/record/${composition?.id || ''}`
  }
}

/**
 * Find Patient resource by composition section code
 */
function findPatientByCode(
  composition: Composition,
  patients: Patient[],
  code: string
): Patient | undefined {
  const section = composition?.section?.find(
    s => s.code?.coding?.[0]?.code === code
  )

  if (!section?.entry?.[0]?.reference) {
    return undefined
  }

  const patientId = section.entry[0].reference.split('/')[1]
  return patients.find(p => p.id === patientId)
}

/**
 * Transform FHIR Patient to CertificateRequest PersonSection
 */
function transformPatientToPerson(patient: Patient): any {
  const name = patient.name?.[0]
  const address = patient.address?.[0]

  return {
    firstName: name?.given?.[0] || '',
    middleName: name?.given?.[1] || undefined,
    surname: name?.family || '',
    sex: patient.gender === 'male' ? 'Male' : patient.gender === 'female' ? 'Female' : undefined,
    dateOfBirth: patient.birthDate || undefined,
    addressOne: address?.line?.[0] || undefined,
    addressTwo: address?.line?.[1] || undefined,
    nationality: address?.country || undefined
  }
}

/**
 * Extract amendments from Task resources
 */
function extractAmendments(tasks: Task[]): any[] {
  // Filter to correction tasks only
  const correctionTasks = tasks.filter(
    task => task.businessStatus?.coding?.[0]?.code === 'CORRECTED'
  )

  const amendments: any[] = []

  for (const task of correctionTasks) {
    if (!task.input || !task.output) {
      continue
    }

    // Compare input vs output to find changes
    for (const outputField of task.output) {
      const fieldKey = outputField.type?.text || outputField.valueId || ''
      const inputField = task.input.find(
        i => i.type?.text === fieldKey || i.valueId === fieldKey
      )

      const oldValue = getFieldValue(inputField)
      const newValue = getFieldValue(outputField)

      if (oldValue !== newValue) {
        const [valueCode, valueId] = fieldKey.split('.')

        amendments.push({
          type: 'Correction',
          date: task.lastModified?.split('T')[0] || new Date().toISOString().split('T')[0],
          section: valueCode || 'Unknown',
          fields: {
            [valueId || fieldKey]: `${oldValue || 'N/A'} → ${newValue || 'N/A'}`
          },
          description: task.reason?.text || 'Correction'
        })
      }
    }
  }

  logger.info(`[Transform] Extracted ${amendments.length} amendments from ${correctionTasks.length} correction tasks`)

  return amendments
}

/**
 * Extract value from Task input/output field
 */
function getFieldValue(field: any): string {
  if (!field) return ''
  if (field.valueString !== undefined) return field.valueString
  if (field.valueBoolean !== undefined) return String(field.valueBoolean)
  if (field.valueInteger !== undefined) return String(field.valueInteger)
  if (field.valueCode !== undefined) return field.valueCode
  if (field.valueId !== undefined) return field.valueId
  return ''
}
