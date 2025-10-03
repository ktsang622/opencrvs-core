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

import {
  searchPersonHandler,
  detailedPersonSearchHandler
} from './handler'
import { TOPPAN_SERVICE_URL } from '@gateway/constants'
import { ServerRoute } from '@hapi/hapi'

export const personSearchRoutes: ServerRoute[] = [
  {
    method: 'POST',
    path: '/person-search',
    handler: searchPersonHandler,
    options: {
      auth: false as const,
      tags: ['api'],
      description: 'Search for persons via family-tree API'
    }
  },
  {
    method: 'POST',
    path: '/person-search/detailed',
    handler: detailedPersonSearchHandler,
    options: {
      auth: false as const,
      tags: ['api'],
      description: 'Search for persons with detailed data via family-tree API'
    }
  },
  {
    method: 'GET',
    path: '/person/{personId}/events',
    handler: async (req, h) =>
      h.proxy({
        uri: `${TOPPAN_SERVICE_URL}/person/${req.params.personId}/events`,
        passThrough: true
      }),
    options: {
      auth: false as const,
      tags: ['api'],
      description: 'Get person events via family-tree API'
    }
  },
  {
    method: 'GET',
    path: '/event/{eventId}/participants',
    handler: async (req, h) =>
      h.proxy({
        uri: `${TOPPAN_SERVICE_URL}/event/${req.params.eventId}/participants`,
        passThrough: true
      }),
    options: {
      auth: false as const,
      tags: ['api'],
      description: 'Get event participants via family-tree API'
    }
  },
  {
    method: 'GET',
    path: '/tree/init/{person_id}',
    handler: async (req, h) =>
      h.proxy({
        uri: `${TOPPAN_SERVICE_URL}/tree/init/${req.params.person_id}`,
        passThrough: true
      }),
    options: {
      auth: false as const,
      tags: ['api'],
      description: 'Initialize family tree'
    }
  },
  {
    method: 'POST',
    path: '/tree/expand',
    handler: async (req, h) =>
      h.proxy({
        uri: `${TOPPAN_SERVICE_URL}/tree/expand`,
        passThrough: true
      }),
    options: {
      auth: false as const,
      tags: ['api'],
      description: 'Expand family tree node',
      payload: {
        output: 'data' as const,
        parse: false
      }
    }
  },
  {
    method: 'GET',
    path: '/event/{eventId}/person',
    handler: async (req, h) =>
      h.proxy({
        uri: `${TOPPAN_SERVICE_URL}/event/${req.params.eventId}/person${req.url.search}`,
        passThrough: true
      }),
    options: {
      auth: false as const,
      tags: ['api'],
      description: 'Get person ID from event ID and role'
    }
  },
  {
    method: 'GET',
    path: '/familyTree/{personId*}',
    handler: async (req, h) =>
      h.proxy({
        uri: `${TOPPAN_SERVICE_URL}/familyTree/${req.params.personId}${req.url.search}`,
        passThrough: true
      }),
    options: {
      auth: false as const,
      tags: ['api'],
      description: 'Family tree view proxy'
    }
  }
]
