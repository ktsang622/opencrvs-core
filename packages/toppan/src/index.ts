// src/index.ts
import * as Hapi from '@hapi/hapi'

import { getPersonDbSyncRoutes } from './person-db-sync/routes'
import { runMigrations } from './run-migrations'

async function start() {
  // Run database migrations first
  console.log('🔄 Initializing Toppan service...')
  try {
    await runMigrations()
  } catch (error) {
    console.error('❌ Failed to run migrations:', error)
    process.exit(1)
  }

  const server = Hapi.server({
    port: process.env.PORT ? Number(process.env.PORT) : 9998,
    host: '0.0.0.0',
    routes: {
      cors: {
        origin: ['*'],
        additionalHeaders: ['x-request-id', 'idempotency-key']
      }
    }
  })

  // health
  server.route({
    method: 'GET',
    path: '/health',
    handler: () => ({
      ok: true,
      service: '@opencrvs/toppan',
      time: new Date().toISOString()
    })
  })

  // Main routes
  server.route(getPersonDbSyncRoutes())

  await server.start()
  console.log(`🚀 toppan service listening on ${server.info.uri}`)

  // Graceful shutdown
  const shutdown = async (sig: string) => {
    console.log(`\nReceived ${sig}. Shutting down...`)
    try {
      await server.stop({ timeout: 10000 })
      console.log('✅ Server stopped. Bye.')
      process.exit(0)
    } catch (err) {
      console.error('❌ Error during shutdown', err)
      process.exit(1)
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

process.on('unhandledRejection', (err) => {
  console.error('UnhandledRejection:', err)
  process.exit(1)
})

start()
