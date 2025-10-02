import { readFileSync } from 'fs'
import { join } from 'path'
import { pool } from './database'

async function runSimpleMigrations() {
  console.log('🔄 Running Toppan database initialization...')

  try {
    // First ensure we can connect
    await pool.query('SELECT 1')
    console.log('✅ Database connection successful')

    // Check if schema exists (check for person table)
    const { rows } = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'person'
      )
    `)

    if (!rows[0].exists) {
      console.log('⚠️  Schema not found, initializing database...')

      // Detect environment: development (src/) or production (build/dist/)
      const isProduction = __dirname.includes('build/dist')
      const initSchemaPath = isProduction
        ? join(__dirname, 'init-schema.sql')              // Production: use Docker-bundled copy
        : join(__dirname, '../../../init/database.sql')   // Dev: use source directly

      console.log(`📁 Loading schema from: ${isProduction ? 'init-schema.sql (bundled)' : 'init/database.sql (source)'}`)
      const initSql = readFileSync(initSchemaPath, 'utf8')
      await pool.query(initSql)
      console.log('✅ Database schema initialized')
    } else {
      console.log('✅ Database schema already exists')
    }

    // Ensure migrations table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS toppan_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Run Toppan-specific migrations (if any)
    const migrations: string[] = []  // Add future Toppan-specific migrations here

    if (migrations.length > 0) {
      for (const migration of migrations) {
        // Check if already executed
        const { rows: migRows } = await pool.query(
          'SELECT 1 FROM toppan_migrations WHERE filename = $1',
          [migration]
        )

        if (migRows.length > 0) {
          console.log(`⏭️  Skipping ${migration} (already executed)`)
          continue
        }

        const migrationPath = join(__dirname, 'migrations', migration)
        const sql = readFileSync(migrationPath, 'utf8')

        console.log(`🔧 Executing ${migration}...`)
        await pool.query(sql)

        await pool.query(
          'INSERT INTO toppan_migrations (filename) VALUES ($1)',
          [migration]
        )

        console.log(`✅ Completed ${migration}`)
      }
    } else {
      console.log('✅ No Toppan-specific migrations to run')
    }

    console.log('🎉 Database initialization completed')
  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    throw error
  }
}

export { runSimpleMigrations }