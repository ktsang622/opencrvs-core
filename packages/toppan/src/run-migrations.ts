import { readFileSync } from 'fs'
import { join } from 'path'
import { pool } from './database'

async function runMigrations() {
  console.log('🔄 Running Toppan database migrations...')
  
  try {
    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS toppan_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // List of migration files in order
    const migrations = [
      '001-unique-active-father-per-event.sql'
    ]

    for (const migration of migrations) {
      // Check if migration already executed
      const { rows } = await pool.query(
        'SELECT 1 FROM toppan_migrations WHERE filename = $1',
        [migration]
      )

      if (rows.length > 0) {
        console.log(`⏭️  Skipping ${migration} (already executed)`)
        continue
      }

      // Read and execute migration
      const migrationPath = join(__dirname, 'migrations', migration)
      const sql = readFileSync(migrationPath, 'utf8')
      
      console.log(`🔧 Executing ${migration}...`)
      await pool.query(sql)
      
      // Record migration as executed
      await pool.query(
        'INSERT INTO toppan_migrations (filename) VALUES ($1)',
        [migration]
      )
      
      console.log(`✅ Completed ${migration}`)
    }

    console.log('🎉 All migrations completed successfully')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations().finally(() => pool.end())
}

export { runMigrations }