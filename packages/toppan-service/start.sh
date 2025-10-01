#!/bin/bash

# Start toppan-service
echo "Starting Toppan Service..."

# Set environment variables if not set
export TOPPAN_DB_HOST=${TOPPAN_DB_HOST:-localhost}
export TOPPAN_DB_PORT=${TOPPAN_DB_PORT:-35432}
export TOPPAN_DB_NAME=${TOPPAN_DB_NAME:-person_registry}
export TOPPAN_DB_USER=${TOPPAN_DB_USER:-registry_user}
export TOPPAN_DB_PASSWORD=${TOPPAN_DB_PASSWORD:-registry_pass}
export OSHOST=${OSHOST:-http://localhost:19200}
export OPENSEARCH_ADMIN_PASSWORD=${OPENSEARCH_ADMIN_PASSWORD:-WelcomeDemo1.23@}
export PORT=${PORT:-3888}

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    yarn install
fi

# Start the service
yarn dev