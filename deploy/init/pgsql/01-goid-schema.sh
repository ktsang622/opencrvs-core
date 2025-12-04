#!/bin/bash
# Initialize goid database schema
set -e

echo "Creating goid database schema..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "goid" <<-EOSQL
    -- Create goid tables
    CREATE TABLE IF NOT EXISTS eid_users (
        eid VARCHAR(50) PRIMARY KEY,
        name_en VARCHAR(255),
        name_native VARCHAR(255),
        sex VARCHAR(10),
        dob DATE,
        father_name VARCHAR(255),
        mother_name VARCHAR(255),
        spouse_name VARCHAR(255),
        address TEXT,
        photo_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Grant schema privileges for goid
    GRANT ALL ON SCHEMA public TO registry_user;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO registry_user;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO registry_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO registry_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO registry_user;
EOSQL

echo "goid database schema created successfully"
