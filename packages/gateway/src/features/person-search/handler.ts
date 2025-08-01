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

export async function searchPersonHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
) {
  const payload = request.payload as any

  try {
    // Proxy to family-tree API
    const response = await fetch(
      'http://localhost:3889/api/opensearch/search-person',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    if (!response.ok) {
      throw new Error(`Family-tree API error: ${response.status}`)
    }

    const data = await response.json()

    // Transform the response to match expected format
    const results =
      data.hits?.map((hit: any) => ({
        uuid: hit.id,
        name: hit.full_name,
        nationalId: hit.identifiers?.[0]?.value || 'N/A',
        phone: hit.phone || 'N/A'
      })) || []

    return h.response(results).code(200)
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
    const targetUrl = `http://localhost:3889/api/person/${personId}/events`
    console.log('Gateway: Calling family-tree at:', targetUrl)

    // Proxy to family-tree API
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Family-tree API error: ${response.status}`)
    }

    const data = await response.json()

    return h.response(data).code(200)
  } catch (error) {
    console.error('Person events error:', error)
    return h.response({ error: 'Events fetch failed' }).code(500)
  }
}
