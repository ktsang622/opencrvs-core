import * as Hapi from '@hapi/hapi'
import Joi from 'joi'
import { createPersonHandler } from './birth/create'
import { correctionHandler, correctionValidation } from './birth/correction'
import { deletePersonHandler } from './birth/delete'
import { retrySyncHandler, getFailedSyncsHandler } from './retry'
// import { createDeathHandler } from './death/create' // enable when ready

// Simple idempotency pre-handler (placeholder)
const withIdempotencyKey: Hapi.Lifecycle.Method = async (req, h) => {
  // If you want, persist req.headers['idempotency-key'] checks here
  return h.continue
}

const createBirthSchema = Joi.object({
  record: Joi.object().required()
})

export function getPersonDbSyncRoutes(): Hapi.ServerRoute[] {
  return [
    // CREATE (new birth registration)
    {
      method: 'POST',
      path: '/v1/person-db-sync/birth/create',
      handler: createPersonHandler,
      options: {
        tags: ['api', 'person-db-sync', 'birth', 'create'],
        description: 'Create a new birth record (UI path mirroring webhook mapping)',
        validate: { payload: createBirthSchema },
        pre: [{ method: withIdempotencyKey }],
        auth: false
      }
    },

    // CORRECTION (father add/remove/update/replace)
    {
      method: 'POST',
      path: '/v1/person-db-sync/birth/correction',
      handler: correctionHandler,
      options: {
        tags: ['api', 'person-db-sync', 'birth', 'correction'],
        description: 'Apply correction to a birth record (father add/remove/update/replace)',
        validate: correctionValidation,
        pre: [{ method: withIdempotencyKey }],
        auth: false
      }
    },

    // DELETE (placeholder)
    {
      method: 'POST',
      path: '/v1/person-db-sync/birth/delete',
      handler: deletePersonHandler,
      options: {
        tags: ['api', 'person-db-sync', 'birth', 'delete'],
        description: 'Delete a record (placeholder)',
        validate: { payload: Joi.object({ recordId: Joi.string().uuid().required() }) },
        pre: [{ method: withIdempotencyKey }],
        auth: false
      }
    },

    // RETRY failed sync request
    {
      method: 'POST',
      path: '/v1/person-db-sync/retry/{syncRequestId}',
      handler: retrySyncHandler,
      options: {
        tags: ['api', 'person-db-sync', 'retry'],
        description: 'Retry a failed sync request',
        validate: {
          params: Joi.object({
            syncRequestId: Joi.string().uuid().required()
          })
        },
        auth: false
      }
    },

    // GET failed sync requests
    {
      method: 'GET',
      path: '/v1/person-db-sync/failed',
      handler: getFailedSyncsHandler,
      options: {
        tags: ['api', 'person-db-sync', 'failed'],
        description: 'Get all failed sync requests',
        auth: false
      }
    }

    // Death route disabled for now—uncomment when you need it
    // {
    //   method: 'POST',
    //   path: '/v1/person-db-sync/death/create',
    //   handler: createDeathHandler,
    //   options: {
    //     tags: ['api', 'person-db-sync', 'death', 'create'],
    //     validate: { payload: Joi.any() },
    //     auth: false
    //   }
    // }
  ]
}
