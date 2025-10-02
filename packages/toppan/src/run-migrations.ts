import { readFileSync } from 'fs'
import { join } from 'path'
import { pool } from './database'

async function runMigrations() {
  console.log('🔄 Running Toppan database migrations...')
  
  try {
    // First, initialize the database schema
    console.log('🔧 Initializing database schema...')
    try {
      const initSchemaPath = join(__dirname, 'init-database.sql')
      const initSql = readFileSync(initSchemaPath, 'utf8')
      await pool.query(initSql)
      console.log('✅ Database schema initialized')
      
      // Load database functions and views
      try {
        console.log('🔧 Loading database functions...')
        const functionsPath = join(__dirname, 'database-functions.sql')
        const functionsSql = readFileSync(functionsPath, 'utf8')
        await pool.query(functionsSql)
        console.log('✅ Database functions loaded')
      } catch (funcError) {
        console.log('⚠️  Database functions loading failed:', funcError.message)
      }
    } catch (schemaError) {
      console.log('⚠️  Schema initialization failed, continuing with migrations:', schemaError.message)
    }

    // Ensure migrations tracking table exists
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS toppan_migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
    } catch (tableError) {
      console.log('⚠️  Migrations table creation failed:', tableError.message)
      // Try to check if table exists with different approach
      const { rows } = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'toppan_migrations'
        )
      `)
      if (!rows[0].exists) {
        throw new Error('Cannot create or access toppan_migrations table')
      }
    }

    // List of migration files in order
    const migrations = [
      '001-unique-active-father-per-event.sql'
      // Note: Trigger updates are in database-functions.sql (reloaded on each startup)
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