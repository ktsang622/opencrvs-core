require('dotenv').config();

export const TOPPAN_DB_HOST = process.env.TOPPAN_DB_HOST || process.env.DB_HOST || 'localhost'
export const TOPPAN_DB_PORT = parseInt(process.env.TOPPAN_DB_PORT || process.env.DB_PORT || '35432')
export const TOPPAN_DB_NAME = process.env.TOPPAN_DB_NAME || process.env.DB_NAME || 'person_registry'
export const TOPPAN_DB_USER = process.env.TOPPAN_DB_USER || process.env.DB_USER || 'registry_user'
export const TOPPAN_DB_PASSWORD = process.env.TOPPAN_DB_PASSWORD || process.env.DB_PASSWORD || 'registry_pass'

export const OPENSEARCH_HOST = process.env.OSHOST || process.env.OPENSEARCH_HOST || 'http://localhost:19200'
export const OPENSEARCH_ADMIN_PASSWORD = process.env.OPENSEARCH_ADMIN_PASSWORD || 'WelcomeDemo1.23@'

export const PORT = parseInt(process.env.PORT || '3888')
export const HOST = process.env.HOST || '0.0.0.0'
