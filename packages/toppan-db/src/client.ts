import { Pool } from 'pg';

// Support DATABASE_URL (Docker/production) or individual env vars (development)
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      user: process.env.TOPPAN_DB_USER || 'registry_user',
      host: process.env.TOPPAN_DB_HOST || 'localhost',
      database: process.env.TOPPAN_DB_NAME || 'person_registry',
      password: process.env.TOPPAN_DB_PASSWORD || 'registry_pass',
      port: parseInt(process.env.TOPPAN_DB_PORT || '5432'),
    });

export const query = async (text: string, params?: any[]): Promise<any[]> => {
  const result = await pool.query(text, params);
  return result.rows;
};

export { pool };