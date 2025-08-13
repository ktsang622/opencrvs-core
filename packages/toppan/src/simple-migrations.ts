import { readFileSync } from 'fs'
import { join } from 'path'
import { pool } from './database'

async function runSimpleMigrations() {
  console.log('🔄 Running simple Toppan database setup...')
  
  try {
    // First ensure we can connect
    await pool.query('SELECT 1')
    console.log('✅ Database connection successful')

    // Create a simple migrations table
    await pool.query(`
      DROP TABLE IF EXISTS toppan_migrations CASCADE;
      CREATE TABLE toppan_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)
    console.log('✅ Migrations table created')

    // Run the main migration
    const migrationPath = join(__dirname, 'migrations', '001-unique-active-father-per-event.sql')
    const sql = readFileSync(migrationPath, 'utf8')
    
    console.log('🔧 Executing migration...')
    await pool.query(sql)
    
    // Record migration as executed
    await pool.query(
      'INSERT INTO toppan_migrations (filename) VALUES ($1)',
      ['001-unique-active-father-per-event.sql']
    )
    
    console.log('✅ Migration completed successfully')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

export { runSimpleMigrations }