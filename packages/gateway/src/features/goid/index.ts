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

import { ServerRoute } from '@hapi/hapi'
import { goidVerifyHandler } from './handler'
import * as Joi from 'joi'

const goidVerifyRequestSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required()
})

export const goidRoutes: ServerRoute[] = [
  {
    method: 'POST',
    path: '/api/goid/verify',
    handler: goidVerifyHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Verify identity via goID service',
      validate: {
        payload: goidVerifyRequestSchema
      }
    }
  }
]
