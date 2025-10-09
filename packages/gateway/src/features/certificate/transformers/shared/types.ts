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
 * Shared types for certificate transformers
 */

export interface CertificateDTO {
  certificateType: string
  templateName: string
  registrationNumber?: string
  registrationDate?: string
  registrar?: string
  registrarOffice?: string
  dateRegistered?: string
  lateRegistration?: boolean
  amendments?: Amendment[]
  fieldAmendments?: Record<string, number>
  parish?: string
  contactEmail?: string
  child?: PersonDTO
  mother?: PersonDTO
  father?: PersonDTO
  informant?: InformantDTO
  [key: string]: any // Allow additional country-specific fields
}

export interface PersonDTO {
  firstName?: string
  middleName?: string
  surname?: string
  dateOfBirth?: string
  placeOfBirth?: string
  sex?: string
  nationality?: string
  occupation?: string
  addressOne?: string
  addressTwo?: string
  countryOfBirth?: string
  [key: string]: any // Allow additional fields
}

export interface InformantDTO extends PersonDTO {
  relationship?: string
  otherRelationship?: string
}

export interface Amendment {
  type: string
  date: string
  section: string
  fields: Record<string, string>
  description: string
  amendmentNumber: number
}

export interface TransformResult {
  amendments: Amendment[]
  fieldAmendments: Record<string, number>
}

export type EventType = 'birth' | 'death' | 'marriage'

export interface CertificateTransformer {
  transformBundleToCertificateDTO(bundle: any, eventType: EventType): CertificateDTO
}
