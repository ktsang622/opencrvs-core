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
import {
  syncRecordCreation,
  syncRecordCorrection,
  syncDeathRecordCreation,
  syncDeathRecordCorrection
} from './client'
import { isToppanEnabled } from './guards'

export async function syncToppanBirthRecordCreation(record: any, token: string) {
  console.log(
    '🔍 syncToppanBirthRecordCreation called, isToppanEnabled:',
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

export async function syncToppanBirthRecordCorrection(
  recordInput: any,
  eventType: EVENT_TYPE,
  token: string
) {
  console.log(
    '🔍 syncToppanBirthRecordCorrection called, isToppanEnabled:',
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

// Backward compatibility exports
export const syncBirthRecordCreation = syncToppanBirthRecordCreation
export const syncBirthRecordCorrection = syncToppanBirthRecordCorrection

export async function syncToppanDeathRecordCreation(record: any, token: string) {
  console.log(
    '🔍 syncToppanDeathRecordCreation called, isToppanEnabled:',
    isToppanEnabled(),
    'hasRecord:',
    !!record
  )
  if (!isToppanEnabled() || !record) return

  try {
    await syncDeathRecordCreation(record, token)
  } catch (error) {
    console.error('Failed to sync death record creation with Toppan:', error)
  }
}

export async function syncToppanDeathRecordCorrection(
  recordInput: any,
  eventType: EVENT_TYPE,
  token: string
) {
  console.log(
    '🔍 syncToppanDeathRecordCorrection called, isToppanEnabled:',
    isToppanEnabled(),
    'eventType:',
    eventType
  )
  if (!isToppanEnabled() || eventType !== 'DEATH') return

  try {
    await syncDeathRecordCorrection(recordInput, token)
  } catch (error) {
    console.error('Failed to sync death record correction with Toppan:', error)
  }
}
