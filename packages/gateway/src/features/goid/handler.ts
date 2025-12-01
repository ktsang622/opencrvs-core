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
import fetch from '@gateway/fetch'
import { GOID_SERVICE_URL } from '@gateway/constants'

interface GoIDVerifyRequest {
  username: string
  password: string
}

interface GoIDVerifyResponse {
  success: boolean
  data?: {
    firstNames: string
    familyName: string
    gender: string
    birthDate: string
    nationality: string
    nationalId: string
  }
  error?: string
}

export async function goidVerifyHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
): Promise<Hapi.ResponseObject> {
  const payload = request.payload as GoIDVerifyRequest

  if (!payload.username || !payload.password) {
    return h
      .response({
        success: false,
        error: 'Username and password are required'
      })
      .code(400)
  }

  try {
    const response = await fetch(`${GOID_SERVICE_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: payload.username,
        password: payload.password
      })
    })

    const data: GoIDVerifyResponse = await response.json()

    if (!response.ok) {
      console.error('[goID] Verification failed:', data.error)
      return h
        .response({
          success: false,
          error: data.error || 'Verification failed'
        })
        .code(response.status)
    }

    return h.response(data).code(200)
  } catch (error: any) {
    console.error('[goID] Service error:', error.message)
    return h
      .response({
        success: false,
        error: 'goID service unavailable'
      })
      .code(503)
  }
}
