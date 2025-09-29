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

import { Db } from 'mongodb'

/*
 * Fix missing businessStatus.coding field in Task and Task_history collections.
 * This ensures all tasks have the required businessStatus.coding structure
 * that getBusinessStatus() function expects.
 */
export const up = async (db: Db) => {
  console.log('Fixing missing businessStatus.coding in Task records...')

  // Fix Task collection
  const taskResult = await db.collection('Task').updateMany(
    {
      $or: [
        { businessStatus: { $exists: false } },
        { businessStatus: null },
        { 'businessStatus.coding': { $exists: false } },
        { 'businessStatus.coding': null },
        { 'businessStatus.coding': [] },
        { 'businessStatus.coding': { $size: 0 } }
      ]
    },
    {
      $set: {
        businessStatus: {
          coding: [
            {
              system: 'http://opencrvs.org/specs/reg-status',
              code: 'DECLARED'
            }
          ]
        }
      }
    }
  )

  // Fix Task_history collection
  const taskHistoryResult = await db.collection('Task_history').updateMany(
    {
      $or: [
        { businessStatus: { $exists: false } },
        { businessStatus: null },
        { 'businessStatus.coding': { $exists: false } },
        { 'businessStatus.coding': null },
        { 'businessStatus.coding': [] },
        { 'businessStatus.coding': { $size: 0 } }
      ]
    },
    {
      $set: {
        businessStatus: {
          coding: [
            {
              system: 'http://opencrvs.org/specs/reg-status',
              code: 'DECLARED'
            }
          ]
        }
      }
    }
  )

  console.log(`Fixed ${taskResult.modifiedCount} Task records`)
  console.log(`Fixed ${taskHistoryResult.modifiedCount} Task_history records`)
}

export const down = async (db: Db) => {
  // Rollback by removing the businessStatus field from records that were set to default
  await db.collection('Task').updateMany(
    {
      'businessStatus.coding': {
        $elemMatch: {
          system: 'http://opencrvs.org/specs/reg-status',
          code: 'DECLARED'
        }
      }
    },
    {
      $unset: { businessStatus: '' }
    }
  )

  await db.collection('Task_history').updateMany(
    {
      'businessStatus.coding': {
        $elemMatch: {
          system: 'http://opencrvs.org/specs/reg-status',
          code: 'DECLARED'
        }
      }
    },
    {
      $unset: { businessStatus: '' }
    }
  )
}