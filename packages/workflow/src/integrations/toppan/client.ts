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

import fetch from 'node-fetch'
import {
  mapRecordToCreationPayload,
  mapRecordToCorrectionPayload
} from './mappers'
import { env } from '@workflow/environment'

export async function syncRecordCreation(record: any, token: string) {
  const payload = mapRecordToCreationPayload(record)

  console.log('🔄 Syncing birth record creation with Toppan...')

  const response = await fetch(
    `${env.TOPPAN_URL}/v1/person-db-sync/birth/create`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // Note: Toppan service currently doesn't require authentication
        // Add Authorization header if needed: 'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }
  )

  if (!response.ok) {
    throw new Error(`Toppan sync failed: ${response.status}`)
  }

  console.log('✅ Birth record synced with Toppan successfully')
}

export async function syncRecordCorrection(recordInput: any, token: string) {
  const payload = mapRecordToCorrectionPayload(recordInput)

  if (!payload) return // No father correction detected

  console.log('🔄 Syncing birth record correction with Toppan...')
  console.log('📤 Sending payload to Toppan:', JSON.stringify(payload, null, 2))

  const response = await fetch(
    `${env.TOPPAN_URL}/v1/person-db-sync/birth/correction`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // Note: Toppan service currently doesn't require authentication
        // Add Authorization header if needed: 'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error(
      '❌ Toppan correction sync failed:',
      response.status,
      errorText
    )
    throw new Error(
      `Toppan correction sync failed: ${response.status} - ${errorText}`
    )
  }

  console.log('✅ Birth record correction synced with Toppan successfully')
}
