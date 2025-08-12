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

import * as Hapi from '@hapi/hapi'
import fetch from 'node-fetch'
import { TOPPAN_SERVICE_URL } from '@gateway/constants'

export async function searchPersonHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  const payload = request.payload as any

  try {
    // Proxy to toppan-service API
    const response = await fetch(`${TOPPAN_SERVICE_URL}/person-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Toppan-service API error: ${response.status}`)
    }

    const data = await response.json()

    // Transform the response to minimal format
    const results =
      data.hits?.map((hit: any) => ({
        uuid: hit.id,
        name: hit.full_name,
        nationalId:
          hit.identifiers?.find((id: any) => id.type === 'NATIONAL_ID')
            ?.value ||
          hit.identifiers?.find(
            (id: any) => id.value?.trim() && id.type !== 'crvs'
          )?.value ||
          '',
        dateOfBirth: hit.dob || 'N/A',
        score: hit._score
      })) || []

    return h.response({ hits: results, total: data.total }).code(200)
  } catch (error) {
    console.error('Person search error:', error)
    return h.response({ error: 'Search failed' }).code(500)
  }
}

export async function detailedPersonSearchHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  const payload = request.payload as any

  try {
    // Proxy to toppan-service API
    const response = await fetch(
      `${TOPPAN_SERVICE_URL}/person-search/detailed`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    if (!response.ok) {
      throw new Error(`Toppan-service API error: ${response.status}`)
    }

    const data = await response.json()

    // Transform the response to detailed format
    const results =
      data.hits?.map((hit: any) => ({
        uuid: hit.id,
        name: hit.full_name,
        given_name: hit.given_name,
        family_name: hit.family_name,
        nationalId:
          hit.identifiers?.find((id: any) => id.type === 'NATIONAL_ID')
            ?.value || '',
        dateOfBirth: hit.dob || 'N/A',
        gender: hit.gender,
        place_of_birth: hit.place_of_birth,
        identifiers: hit.identifiers,
        score: hit._score
      })) || []

    return h.response({ hits: results, total: data.total }).code(200)
  } catch (error) {
    console.error('Person search error:', error)
    return h.response({ error: 'Search failed' }).code(500)
  }
}

export async function personEventsHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  const { personId } = request.params
  console.log('Gateway: Received request for person events:', personId)
  console.log('Gateway: Request URL:', request.url)

  try {
    const targetUrl = `${TOPPAN_SERVICE_URL}/person/${personId}/events`
    console.log('Gateway: Calling toppan-service at:', targetUrl)

    // Proxy to toppan-service API
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Toppan-service API error: ${response.status}`)
    }

    const data = await response.json()

    return h.response(data).code(200)
  } catch (error) {
    console.error('Person events error:', error)
    return h.response({ error: 'Events fetch failed' }).code(500)
  }
}

export async function eventParticipantsHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  const { eventId } = request.params

  try {
    const targetUrl = `${TOPPAN_SERVICE_URL}/event/${eventId}/participants`
    console.log('Gateway: Calling toppan-service at:', targetUrl)

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Toppan-service API error: ${response.status}`)
    }

    const data = await response.json()

    return h.response(data).code(200)
  } catch (error) {
    console.error('Event participants error:', error)
    return h.response({ error: 'Participants fetch failed' }).code(500)
  }
}

export async function familyTreeInitHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  const { person_id } = request.params

  try {
    const targetUrl = `${TOPPAN_SERVICE_URL}/tree/init/${person_id}`
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Toppan-service API error: ${response.status}`)
    }

    const data = await response.json()
    return h.response(data).code(200)
  } catch (error) {
    console.error('Family tree init error:', error)
    return h.response({ error: 'Family tree init failed' }).code(500)
  }
}

export async function familyTreeExpandHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  const payload = request.payload as any

  try {
    const targetUrl = `${TOPPAN_SERVICE_URL}/tree/expand`
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Toppan-service API error: ${response.status}`)
    }

    const data = await response.json()
    return h.response(data).code(200)
  } catch (error) {
    console.error('Family tree expand error:', error)
    return h.response({ error: 'Family tree expand failed' }).code(500)
  }
}
