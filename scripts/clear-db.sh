#!/bin/bash

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.
#
# OpenCRVS is also distributed under the terms of the Civil Registration
# & Healthcare Disclaimer located at http://opencrvs.org/license.
#
# Copyright (C) The OpenCRVS Authors located at https://github.com/opencrvs/opencrvs-core/blob/master/AUTHORS.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
CLEAR_VOLUMES=false
CLEAR_MONGODB=false
CLEAR_ELASTICSEARCH=false
CLEAR_INFLUXDB=false
CLEAR_MINIO=false
CLEAR_OPENSEARCH=false
CLEAR_ALL=false
RUN_MIGRATIONS=false
OPENSEARCH_DIR="../opensearch"

print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Clear OpenCRVS data in Docker containers"
    echo ""
    echo "Options:"
    echo "  --all                 Clear all data (volumes + databases) and run migrations"
    echo "  --volumes             Stop services and remove all Docker volumes"
    echo "  --mongodb             Clear MongoDB databases only"
    echo "  --elasticsearch       Clear Elasticsearch indices only"
    echo "  --influxdb            Clear InfluxDB data only"
    echo "  --minio               Clear MinIO object storage only"
    echo "  --opensearch          Clear external OpenSearch indices only"
    echo "  --migrations          Run database migrations after clearing"
    echo "  --opensearch-dir      OpenSearch directory path (default: ../opensearch)"
    echo "  --help, -h            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --all                           # Clear everything (recommended for fresh start)"
    echo "  $0 --volumes                       # Quick reset using Docker volumes"
    echo "  $0 --mongodb --elasticsearch       # Clear only MongoDB and Elasticsearch"
    echo "  $0 --opensearch                    # Clear only external OpenSearch"
    echo ""
    echo "Safety Notes:"
    echo "  • --volumes is the fastest and safest option for complete reset"
    echo "  • Individual database clearing preserves other data"
    echo "  • Always backup important data before clearing"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            CLEAR_ALL=true
            shift
            ;;
        --volumes)
            CLEAR_VOLUMES=true
            shift
            ;;
        --mongodb)
            CLEAR_MONGODB=true
            shift
            ;;
        --elasticsearch)
            CLEAR_ELASTICSEARCH=true
            shift
            ;;
        --influxdb)
            CLEAR_INFLUXDB=true
            shift
            ;;
        --minio)
            CLEAR_MINIO=true
            shift
            ;;
        --opensearch)
            CLEAR_OPENSEARCH=true
            shift
            ;;
        --migrations)
            RUN_MIGRATIONS=true
            shift
            ;;
        --opensearch-dir)
            OPENSEARCH_DIR="$2"
            shift 2
            ;;
        --help|-h)
            print_usage
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done

# If --all is specified, enable all clearing options
if [ "$CLEAR_ALL" = true ]; then
    CLEAR_VOLUMES=true
    CLEAR_MONGODB=true
    CLEAR_ELASTICSEARCH=true
    CLEAR_INFLUXDB=true
    CLEAR_MINIO=true
    CLEAR_OPENSEARCH=true
    RUN_MIGRATIONS=true
fi

# If no options specified (except migrations), show usage
if [ "$CLEAR_VOLUMES" = false ] && [ "$CLEAR_MONGODB" = false ] && [ "$CLEAR_ELASTICSEARCH" = false ] && [ "$CLEAR_INFLUXDB" = false ] && [ "$CLEAR_MINIO" = false ] && [ "$CLEAR_OPENSEARCH" = false ] && [ "$RUN_MIGRATIONS" = false ]; then
    echo -e "${YELLOW}⚠️  No clearing options specified${NC}"
    print_usage
    exit 1
fi

echo -e "${BLUE}🧹 OpenCRVS Database Cleaner${NC}"
echo ""

# Function to check if container exists and is running
container_exists() {
    docker ps --format "table {{.Names}}" | grep -q "^$1$"
}

# Function to wait for user confirmation
confirm_action() {
    local message=$1
    echo -e "${YELLOW}⚠️  $message${NC}"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}💡 Operation cancelled${NC}"
        exit 0
    fi
}

# Clear Docker volumes (stop services and remove volumes)
if [ "$CLEAR_VOLUMES" = true ]; then
    confirm_action "This will stop all services and remove all Docker volumes (complete data loss)"

    echo -e "${YELLOW}🛑 Stopping OpenCRVS core services and removing volumes...${NC}"
    docker compose -p opencrvs -f toppan-deps.yml -f toppan-base.yml down -v 2>/dev/null || true

    if [ -d "$OPENSEARCH_DIR" ]; then
        echo -e "${YELLOW}🛑 Stopping external services and removing volumes...${NC}"
        pushd "$OPENSEARCH_DIR" > /dev/null
        docker compose down -v 2>/dev/null || true
        popd > /dev/null
    fi

    echo -e "${GREEN}✅ All volumes cleared${NC}"
fi

# Clear MongoDB databases
if [ "$CLEAR_MONGODB" = true ]; then
    echo -e "${YELLOW}🗃️  Clearing MongoDB databases...${NC}"

    if container_exists "opencrvs-mongo1-1"; then
        docker exec opencrvs-mongo1-1 mongo --eval "
        db.getSiblingDB('hearth-dev').dropDatabase();
        db.getSiblingDB('events').dropDatabase();
        db.getSiblingDB('user-mgnt').dropDatabase();
        db.getSiblingDB('application-config').dropDatabase();
        db.getSiblingDB('metrics').dropDatabase();
        db.getSiblingDB('config').dropDatabase();
        db.getSiblingDB('performance').dropDatabase();
        db.getSiblingDB('webhooks').dropDatabase();
        print('✅ MongoDB databases cleared');
        " 2>/dev/null || echo -e "${RED}❌ Failed to clear MongoDB${NC}"
        echo -e "${GREEN}✅ MongoDB databases cleared${NC}"
    else
        echo -e "${YELLOW}⚠️  MongoDB container not running, skipping${NC}"
    fi
fi

# Clear Elasticsearch indices
if [ "$CLEAR_ELASTICSEARCH" = true ]; then
    echo -e "${YELLOW}🔍 Clearing Elasticsearch indices...${NC}"

    if container_exists "opencrvs-elasticsearch-1"; then
        # Get all indices and delete them
        indices=$(docker exec opencrvs-elasticsearch-1 curl -s "http://localhost:9200/_cat/indices?h=index" 2>/dev/null | grep -v "^\." || true)
        if [ -n "$indices" ]; then
            echo "$indices" | while read -r index; do
                if [ -n "$index" ]; then
                    echo "  Deleting index: $index"
                    docker exec opencrvs-elasticsearch-1 curl -s -X DELETE "http://localhost:9200/$index" > /dev/null
                fi
            done
        fi
        echo -e "${GREEN}✅ Elasticsearch indices cleared${NC}"
    else
        echo -e "${YELLOW}⚠️  Elasticsearch container not running, skipping${NC}"
    fi
fi

# Clear InfluxDB data
if [ "$CLEAR_INFLUXDB" = true ]; then
    echo -e "${YELLOW}📊 Clearing InfluxDB data...${NC}"

    if container_exists "opencrvs-influxdb-1"; then
        docker exec opencrvs-influxdb-1 influx -execute "DROP SERIES FROM /.*/" -database="ocrvs" 2>/dev/null || true
        echo -e "${GREEN}✅ InfluxDB data cleared${NC}"
    else
        echo -e "${YELLOW}⚠️  InfluxDB container not running, skipping${NC}"
    fi
fi

# Clear MinIO object storage
if [ "$CLEAR_MINIO" = true ]; then
    echo -e "${YELLOW}🗂️  Clearing MinIO object storage...${NC}"

    if container_exists "opencrvs-minio-1"; then
        docker exec opencrvs-minio-1 sh -c 'rm -rf /data/ocrvs/* 2>/dev/null || true; mkdir -p /data/ocrvs' 2>/dev/null || true
        echo -e "${GREEN}✅ MinIO object storage cleared${NC}"
    else
        echo -e "${YELLOW}⚠️  MinIO container not running, skipping${NC}"
    fi
fi

# Clear external OpenSearch indices
if [ "$CLEAR_OPENSEARCH" = true ]; then
    echo -e "${YELLOW}🔎 Clearing external OpenSearch indices...${NC}"

    if container_exists "opencrvs-toppan-opensearch"; then
        # Get all indices and delete them (except system indices)
        indices=$(docker exec opencrvs-toppan-opensearch curl -s "http://localhost:9200/_cat/indices?h=index" 2>/dev/null | grep -v "^\." || true)
        if [ -n "$indices" ]; then
            echo "$indices" | while read -r index; do
                if [ -n "$index" ]; then
                    echo "  Deleting OpenSearch index: $index"
                    docker exec opencrvs-toppan-opensearch curl -s -X DELETE "http://localhost:9200/$index" > /dev/null
                fi
            done
        fi
        echo -e "${GREEN}✅ OpenSearch indices cleared${NC}"
    else
        echo -e "${YELLOW}⚠️  OpenSearch container not running, skipping${NC}"
    fi
fi

# Run database migrations if requested
if [ "$RUN_MIGRATIONS" = true ]; then
    echo -e "${YELLOW}🔄 Running database migrations...${NC}"

    # Check if services are running (needed for migrations)
    services_needed=("opencrvs-mongo1-1" "opencrvs-elasticsearch-1")
    services_running=true

    for service in "${services_needed[@]}"; do
        if ! container_exists "$service"; then
            echo -e "${YELLOW}⚠️  Service $service is not running${NC}"
            services_running=false
        fi
    done

    if [ "$services_running" = true ]; then
        # Restart migration service to trigger migrations
        echo -e "${BLUE}🔨 Restarting migration service to run migrations...${NC}"
        docker compose -p opencrvs -f toppan-deps.yml -f toppan-base.yml restart migration 2>/dev/null || \
        {
            echo -e "${YELLOW}⚠️  Docker migration restart failed, trying local yarn command...${NC}"
            # Fallback to local yarn command
            if [ -d "packages/migration" ]; then
                pushd packages/migration > /dev/null
                yarn start
                popd > /dev/null
            else
                echo -e "${RED}❌ Migration package not found${NC}"
            fi
        }
        echo -e "${GREEN}✅ Database migrations completed${NC}"
    else
        echo -e "${RED}❌ Cannot run migrations - required services are not running${NC}"
        echo -e "${BLUE}💡 Start services first, then restart migration:${NC}"
        echo "   docker compose -p opencrvs -f toppan-deps.yml -f toppan-base.yml restart migration"
    fi
fi

echo ""
echo -e "${GREEN}🎉 Database clearing completed!${NC}"
echo ""

if [ "$CLEAR_VOLUMES" = true ]; then
    echo -e "${BLUE}💡 Next steps:${NC}"
    echo "1. Start services: ./scripts/start-complete-stack.sh"
    echo "2. Run data seeder to initialize fresh data"
    echo ""
elif [ "$RUN_MIGRATIONS" = true ]; then
    echo -e "${BLUE}💡 Next steps:${NC}"
    echo "1. Run data seeder if needed: ./scripts/run-toppan-seeder.sh"
    echo "2. Start OpenCRVS services if not already running"
    echo ""
fi

echo -e "${YELLOW}⚠️  Remember to restart services if they were cleared manually${NC}"