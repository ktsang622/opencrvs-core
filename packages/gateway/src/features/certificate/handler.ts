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
import { FHIR_URL } from '@gateway/constants'
import { generateCertificate } from './service'

/**
 * Generate certificate via certificate-service
 *
 * This handler fetches registration data via GraphQL query to FHIR,
 * transforms it using country config, and calls the certificate-service.
 *
 * POST /certificate/generate
 * Body: { compositionId: string, eventType: "birth" | "death" | "marriage" }
 */
export async function generateCertificateHandler(
  request: Request,
  h: ResponseToolkit
) {
  try {
    const { compositionId, eventType } = request.payload as {
      compositionId: string
      eventType: 'birth' | 'death' | 'marriage'
    }

    const authToken = request.headers.authorization || ''

    // Fetch registration data using the GraphQL query
    const data = await fetchRegistrationData(compositionId, eventType, authToken)

    if (!data) {
      return h
        .response({
          error: 'Registration not found',
          message: `Could not fetch registration data for ${compositionId}`
        })
        .code(404)
    }

    // Generate certificate
    const pdfBuffer = await generateCertificate(
      data,
      eventType,
      compositionId,
      authToken
    )

    return h
      .response(pdfBuffer)
      .type('application/pdf')
      .header(
        'Content-Disposition',
        `inline; filename="certificate-${compositionId}.pdf"`
      )
  } catch (error: any) {
    console.error('[Certificate Handler] Error:', error)
    return h
      .response({
        error: 'Failed to generate certificate',
        message: error.message
      })
      .code(500)
  }
}

/**
 * Fetch registration data using GraphQL query
 * Same query structure as the countryconfig handler
 */
async function fetchRegistrationData(
  compositionId: string,
  eventType: string,
  authToken: string
): Promise<any> {
  const query = getGraphQLQuery(eventType)

  const response = await fetch(`${FHIR_URL.replace('/fhir', '')}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authToken
    },
    body: JSON.stringify({
      query,
      variables: { id: compositionId }
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `GraphQL query failed: ${response.status} ${response.statusText} - ${errorText}`
    )
  }

  const result = await response.json()

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`)
  }

  const queryName = `fetch${capitalize(eventType)}Registration`
  return result.data?.[queryName]
}

/**
 * Get GraphQL query based on event type
 * (Same as countryconfig handler)
 */
function getGraphQLQuery(eventType: string): string {
  const queryName = `fetch${capitalize(eventType)}Registration`

  return `
    query ${queryName}ForCertificate($id: ID!) {
      ${queryName}(id: $id) {
        id
        child {
          id
          name {
            use
            firstNames
            middleName
            familyName
          }
          birthDate
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

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
