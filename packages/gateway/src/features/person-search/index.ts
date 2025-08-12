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
  detailedPersonSearchHandler,
  personEventsHandler,
  eventParticipantsHandler,
  familyTreeInitHandler,
  familyTreeExpandHandler
} from './handler'

export const personSearchRoutes = [
  {
    method: 'POST',
    path: '/person-search',
    handler: searchPersonHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Search for persons via family-tree API'
    }
  },
  {
    method: 'POST',
    path: '/person-search/detailed',
    handler: detailedPersonSearchHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Search for persons with detailed data via family-tree API'
    }
  },
  {
    method: 'GET',
    path: '/person/{personId}/events',
    handler: personEventsHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Get person events via family-tree API'
    }
  },
  {
    method: 'GET',
    path: '/event/{eventId}/participants',
    handler: eventParticipantsHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Get event participants via family-tree API'
    }
  },
  {
    method: 'GET',
    path: '/tree/init/{person_id}',
    handler: familyTreeInitHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Initialize family tree'
    }
  },
  {
    method: 'POST',
    path: '/tree/expand',
    handler: familyTreeExpandHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Expand family tree node'
    }
  }
]
