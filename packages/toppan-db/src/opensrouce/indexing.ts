/*
 * Copyright (C) Toppan Security. All rights reserved.
 */

import { Client } from '@opensearch-project/opensearch'
import { Pool } from 'pg'

const opensearchClient = new Client({
  node: process.env.OSHOST || 'http://localhost:19200',
  auth: {
    username: 'admin',
    password: process.env.OPENSEARCH_ADMIN_PASSWORD || 'WelcomeDemo1.23@'
  },
  requestTimeout: 60000, // 60 seconds timeout for bulk operations
  maxRetries: 3
})

// Support DATABASE_URL (Docker/production) or individual env vars (development)
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.TOPPAN_DB_HOST || 'localhost',
      port: parseInt(process.env.TOPPAN_DB_PORT || '5432'),
      database: process.env.TOPPAN_DB_NAME || 'person_registry',
      user: process.env.TOPPAN_DB_USER || 'registry_user',
      password: process.env.TOPPAN_DB_PASSWORD || 'registry_pass'
    })

function calculateAge(dob: string): number {
  const birth = new Date(dob)
  const ageDifMs = Date.now() - birth.getTime()
  return Math.floor(ageDifMs / (1000 * 60 * 60 * 24 * 365.25))
}

export async function indexPersonDb(): Promise<{ success: boolean; indexed: number; error?: string }> {
  try {
    console.log(`🔍 [${new Date().toISOString()}] Starting OpenSearch person index update...`)

    const client = await pool.connect()
    try {
      const result = await client.query(`
        SELECT 
          p.id,
          p.given_name,
          p.family_name,
          p.gender,
          p.dob,
          p.place_of_birth,
          p.identifiers,
          p.status,
          p.created_at,
          p.updated_at,
          CONCAT(p.given_name, ' ', p.family_name) as full_name
        FROM person p
        ORDER BY p.created_at DESC
      `)

      const persons = result.rows
      console.log(`📊 [${new Date().toISOString()}] Found ${persons.length} persons to index`)

      const indexName = 'person_write'
      
      // Skip index creation - use existing alias

      if (persons.length > 0) {
        const bulkOps = persons.flatMap((person) => {
          // Parse identifiers JSON
          // NOTE: Identifiers may contain a "_source" field with value "external" to indicate
          // entries managed by the person_external_id table (GoID, NID, Passport integrations).
          // This field is safe to ignore in search queries and UI display.
          let identifiers = []
          try {
            if (person.identifiers && typeof person.identifiers === 'string') {
              identifiers = JSON.parse(person.identifiers)
            } else if (Array.isArray(person.identifiers)) {
              identifiers = person.identifiers
            }
          } catch (e) {
            console.warn(`Failed to parse identifiers for person ${person.id}, using empty array`)
            identifiers = []
          }

          return [
            { index: { _index: indexName, _id: person.id } },
            {
              ...person,
              identifiers,
              dateOfBirth: person.dob,
              age: person.dob ? calculateAge(person.dob) : null
            }
          ]
        })

        const bulkResponse = await opensearchClient.bulk({ refresh: true, body: bulkOps })
        
        if (bulkResponse.body.errors) {
          const errors = bulkResponse.body.items.filter((item: any) => item.index?.error)
          console.error('❌ Bulk indexing errors:', JSON.stringify(errors, null, 2))
          return { success: false, indexed: 0, error: `Bulk indexing failed: ${errors[0]?.index?.error?.reason || 'Unknown error'}` }
        } else {
          console.log(`✅ [${new Date().toISOString()}] Successfully indexed ${persons.length} persons`)
        }
      }

      await opensearchClient.indices.refresh({ index: indexName })
      
      console.log(`✅ [${new Date().toISOString()}] OpenSearch person index update completed`)

      return { success: true, indexed: persons.length }

    } finally {
      client.release()
    }

  } catch (error) {
    console.error('❌ OpenSearch indexing error:', error)
    return { 
      success: false, 
      indexed: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}