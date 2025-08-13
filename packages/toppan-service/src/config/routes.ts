import { ServerRoute } from '@hapi/hapi';
import { searchPersonHandler, detailedPersonSearchHandler, advancedPersonSearchHandler, debugHandler } from '../features/person-search/handler';
import { familyTreeInitHandler, familyTreeExpandHandler } from '../features/family-tree/handler';
import { personEventsHandler, eventParticipantsHandler, personRelationshipsHandler } from '../features/person-events/handler';
import { indexPersonDbHandler } from '../features/opensearch/handler';


export const routes: ServerRoute[] = [
  // Health check
  {
    method: 'GET',
    path: '/ping',
    handler: () => ({ status: 'ok', service: 'toppan-service' }),
    options: {
      auth: false,
      tags: ['api'],
      description: 'Health check endpoint'
    }
  },

  // Person search routes
  {
    method: 'POST',
    path: '/person-search',
    handler: searchPersonHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Search for persons'
    }
  },
  {
    method: 'POST',
    path: '/person-search/detailed',
    handler: detailedPersonSearchHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Search for persons with detailed data'
    }
  },

  // Family tree routes
  {
    method: 'GET',
    path: '/tree/init/{person_id}',
    handler: familyTreeInitHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Initialize family tree for a person'
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
  },

  // Person events routes
  {
    method: 'GET',
    path: '/person/{personId}/events',
    handler: personEventsHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Get person events'
    }
  },
  {
    method: 'GET',
    path: '/person/{personId}/relationships',
    handler: personRelationshipsHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Get person relationships'
    }
  },
  {
    method: 'GET',
    path: '/event/{eventId}/participants',
    handler: eventParticipantsHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Get event participants'
    }
  },

  // Additional search routes
  {
    method: 'POST',
    path: '/person-search/advance',
    handler: advancedPersonSearchHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Advanced person search with family relationships'
    }
  },

  // Debug route
  {
    method: 'GET',
    path: '/debug',
    handler: debugHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Debug endpoint'
    }
  },

  // OpenSearch indexing route
  {
    method: 'POST',
    path: '/opensearch/index-person-db',
    handler: indexPersonDbHandler,
    options: {
      auth: false,
      tags: ['api'],
      description: 'Index person database to OpenSearch'
    }
  },


];