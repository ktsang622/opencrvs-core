#!/bin/bash
# Create additional databases for OpenCRVS services
# This runs first (00- prefix) before other init scripts

set -e

echo "Creating additional databases..."

# Create events database (for events service)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE events' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'events')\gexec
EOSQL

# Create goid database
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE goid' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'goid')\gexec
EOSQL

# Create registry_user role
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'registry_user') THEN
            CREATE ROLE registry_user WITH LOGIN PASSWORD 'registry_pass';
        END IF;
    END
    \$\$;

    GRANT ALL PRIVILEGES ON DATABASE events TO registry_user;
    GRANT ALL PRIVILEGES ON DATABASE goid TO registry_user;
    GRANT ALL PRIVILEGES ON DATABASE "$POSTGRES_DB" TO registry_user;
EOSQL

echo "Additional databases created successfully"
