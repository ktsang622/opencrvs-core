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

import { EVENT_TYPE } from '@opencrvs/commons/types'
import { syncRecordCreation, syncRecordCorrection } from './client'
import { isToppanEnabled } from './guards'

export async function syncBirthRecordCreation(record: any, token: string) {
  console.log(
    '🔍 syncBirthRecordCreation called, isToppanEnabled:',
    isToppanEnabled(),
    'hasRecord:',
    !!record
  )
  if (!isToppanEnabled() || !record) return

  try {
    await syncRecordCreation(record, token)
  } catch (error) {
    console.error('Failed to sync birth record creation with Toppan:', error)
  }
}

export async function syncBirthRecordCorrection(
  recordInput: any,
  eventType: EVENT_TYPE,
  token: string
) {
  console.log(
    '🔍 syncBirthRecordCorrection called, isToppanEnabled:',
    isToppanEnabled(),
    'eventType:',
    eventType
  )
  if (!isToppanEnabled() || eventType !== 'BIRTH') return

  try {
    await syncRecordCorrection(recordInput, token)
  } catch (error) {
    console.error('Failed to sync birth record correction with Toppan:', error)
  }
}
