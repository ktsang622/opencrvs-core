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
MODE="development"
VERSION=${VERSION:-"latest"}
DOCKER_REGISTRY=${REGISTRY:-"toppan-crvs"}
OPENSEARCH_DIR="../opensearch"
COUNTRYCONFIG_DIR="../opencrvs-countryconfig"

echo -e "${BLUE}🚀 OpenCRVS Complete Stack Orchestrator${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"
echo -e "${BLUE}Registry: ${DOCKER_REGISTRY}${NC}"
echo -e "${BLUE}Mode: ${MODE}${NC}"
echo ""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --mode|-m)
      MODE="$2"
      shift 2
      ;;
    --version|-v)
      VERSION="$2"
      shift 2
      ;;
    --registry|-r)
      DOCKER_REGISTRY="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Start complete OpenCRVS stack across multiple repositories"
      echo ""
      echo "Options:"
      echo "  --mode, -m            Mode: development, production (default: development)"
      echo "  --version, -v         Version tag for services (default: latest)"
      echo "  --registry, -r        Docker registry prefix (default: toppan-crvs)"
      echo "  --help, -h            Show this help message"
      echo ""
      echo "Prerequisites:"
      echo "  • ../opensearch directory with PostgreSQL & OpenSearch"
      echo "  • ../opencrvs-countryconfig directory with country configuration"
      echo "  • All images built with VERSION and REGISTRY"
      echo ""
      echo "Examples:"
      echo "  $0                                           # Start complete stack in development"
      echo "  $0 --mode production --version demo-1.8.0   # Production with specific version"
      echo "  VERSION=demo-1.8.0 REGISTRY=toppan-crvs $0  # Use environment variables"
      echo ""
      echo "Services started in order:"
      echo "  1. PostgreSQL & OpenSearch (../opensearch)"
      echo "  2. Data seeder initialization (run once)"
      echo "  3. OpenCRVS core services (current directory)"
      exit 0
      ;;
    *)
      echo -e "${RED}❌ Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Export environment variables
export VERSION=$VERSION
export REGISTRY=$DOCKER_REGISTRY
export MODE=$MODE

# Function to wait for service health
wait_for_service() {
    local service_name=$1
    local health_url=$2
    local max_attempts=${3:-30}
    local attempt=1

    echo -e "${BLUE}⏳ Waiting for ${service_name} to be healthy...${NC}"

    while [ $attempt -le $max_attempts ]; do
        if curl -s "$health_url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ ${service_name} is healthy${NC}"
            return 0
        fi

        echo -e "${YELLOW}   Attempt ${attempt}/${max_attempts}: ${service_name} not ready yet...${NC}"
        sleep 10
        attempt=$((attempt + 1))
    done

    echo -e "${RED}❌ ${service_name} failed to become healthy after ${max_attempts} attempts${NC}"
    return 1
}

# Function to wait for container to be running
wait_for_container() {
    local container_name=$1
    local max_attempts=${2:-30}
    local attempt=1

    echo -e "${BLUE}⏳ Waiting for container ${container_name} to be running...${NC}"

    while [ $attempt -le $max_attempts ]; do
        if docker ps --format "table {{.Names}}" | grep -q "^${container_name}$"; then
            echo -e "${GREEN}✅ Container ${container_name} is running${NC}"
            return 0
        fi

        echo -e "${YELLOW}   Attempt ${attempt}/${max_attempts}: ${container_name} not running yet...${NC}"
        sleep 5
        attempt=$((attempt + 1))
    done

    echo -e "${RED}❌ Container ${container_name} failed to start after ${max_attempts} attempts${NC}"
    return 1
}

echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"

# Check if directories exist
if [ ! -d "$OPENSEARCH_DIR" ]; then
    echo -e "${RED}❌ OpenSearch directory not found: $OPENSEARCH_DIR${NC}"
    echo -e "${BLUE}💡 Please ensure the opensearch repository is cloned as a sibling directory${NC}"
    exit 1
fi

if [ ! -d "$COUNTRYCONFIG_DIR" ]; then
    echo -e "${YELLOW}⚠️  CountryConfig directory not found: $COUNTRYCONFIG_DIR${NC}"
    echo -e "${BLUE}💡 Country configuration will use default image${NC}"
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Step 1: Start PostgreSQL & OpenSearch services
echo -e "${YELLOW}📦 Step 1: Starting external Toppan services (PostgreSQL & OpenSearch)...${NC}"
echo -e "${BLUE}Directory: $OPENSEARCH_DIR${NC}"

pushd "$OPENSEARCH_DIR" > /dev/null

echo -e "${BLUE}🔨 Starting PostgreSQL, OpenSearch, and dashboards...${NC}"
VERSION=$VERSION docker compose -p opencrvs up -d postgres opensearch opensearch-dashboards pg_adminer

echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"

# Wait for PostgreSQL with proper database connection check
wait_for_container "opencrvs-toppan-postgres" 20

echo -e "${BLUE}⏳ Waiting for PostgreSQL database to be ready...${NC}"
attempt=1
max_attempts=30
while [ $attempt -le $max_attempts ]; do
    if docker exec opencrvs-toppan-postgres pg_isready -U registry_user -d person_registry > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL database is ready${NC}"
        break
    fi
    echo -e "${YELLOW}   Attempt ${attempt}/${max_attempts}: PostgreSQL not ready yet...${NC}"
    sleep 5
    attempt=$((attempt + 1))
done

if [ $attempt -gt $max_attempts ]; then
    echo -e "${RED}❌ PostgreSQL failed to become ready after ${max_attempts} attempts${NC}"
    exit 1
fi

# Wait for OpenSearch with cluster health check
wait_for_container "opencrvs-toppan-opensearch" 30

echo -e "${BLUE}⏳ Waiting for OpenSearch cluster to be ready...${NC}"
attempt=1
max_attempts=60  # OpenSearch takes longer to initialize
while [ $attempt -le $max_attempts ]; do
    response=$(curl -s "http://localhost:19200/_cluster/health" 2>/dev/null || echo "")
    if echo "$response" | grep -q '"status":"green"\|"status":"yellow"'; then
        echo -e "${GREEN}✅ OpenSearch cluster is ready${NC}"
        echo -e "${BLUE}   Cluster status: $(echo "$response" | grep -o '"status":"[^"]*"')${NC}"
        break
    fi
    echo -e "${YELLOW}   Attempt ${attempt}/${max_attempts}: OpenSearch cluster not ready yet...${NC}"
    sleep 10
    attempt=$((attempt + 1))
done

if [ $attempt -gt $max_attempts ]; then
    echo -e "${RED}❌ OpenSearch failed to become ready after ${max_attempts} attempts${NC}"
    exit 1
fi

# Wait for OpenSearch Dashboards
wait_for_container "opencrvs-toppan-dashboards" 20
wait_for_service "OpenSearch Dashboards" "http://localhost:5601/api/status" 30 || \
    echo -e "${YELLOW}⚠️  OpenSearch Dashboards health check failed, but container is running${NC}"

echo -e "${GREEN}✅ External services are ready${NC}"

# Step 2: Run data seeder
echo ""
echo -e "${YELLOW}🌱 Step 2: Running data seeder to initialize OpenSearch...${NC}"

echo -e "${BLUE}🔨 Running data seeder (one-time initialization)...${NC}"
docker compose -p opencrvs run --rm toppan-data-seeder

echo -e "${GREEN}✅ Data seeding completed${NC}"

popd > /dev/null

# Step 2.5: Start dependency services first
echo ""
echo -e "${YELLOW}📦 Step 2.5: Starting OpenCRVS dependencies...${NC}"
echo -e "${BLUE}Directory: $(pwd)${NC}"

echo -e "${BLUE}🔨 Starting dependency services (mongo, redis, elasticsearch, etc.)...${NC}"
./scripts/start-docker.sh --deps-only --mode "$MODE" --version "$VERSION" --registry "$DOCKER_REGISTRY"

echo -e "${BLUE}⏳ Waiting for dependencies to be ready...${NC}"
sleep 10

echo -e "${GREEN}✅ Dependencies started successfully${NC}"

# Step 3: Start OpenCRVS core services
echo ""
echo -e "${YELLOW}🚀 Step 3: Starting OpenCRVS core services...${NC}"
echo -e "${BLUE}Directory: $(pwd)${NC}"

# Pass all environment variables to the start script
echo -e "${BLUE}🔨 Starting OpenCRVS services only (dependencies already running)...${NC}"
./scripts/start-docker.sh --services-only --mode "$MODE" --version "$VERSION" --registry "$DOCKER_REGISTRY"

echo ""
echo -e "${GREEN}🎉 Complete OpenCRVS stack started successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Access Points:${NC}"
echo -e "${BLUE}Core Services:${NC}"
echo "  • Client:              http://localhost:3000"
echo "  • Login:               http://localhost:3020"
echo "  • Gateway GraphQL:     http://localhost:7070/graphql"
echo "  • Auth API:            http://localhost:4040"
echo ""
echo -e "${BLUE}Toppan Services:${NC}"
echo "  • Toppan UI:           http://localhost:3889"
echo "  • Toppan API:          http://localhost:9998"
echo ""
echo -e "${BLUE}External Services:${NC}"
echo "  • PostgreSQL:          localhost:5432 (user: registry_user, db: person_registry)"
echo "  • PG Admin:            http://localhost:15432"
echo "  • OpenSearch:          http://localhost:19200"
echo "  • OpenSearch Dash:     http://localhost:5601"
echo ""
echo -e "${BLUE}💡 Management Commands:${NC}"
echo "  • View logs:           docker compose -p opencrvs -f toppan-deps.yml -f toppan-base.yml logs -f [service]"
echo "  • Stop everything:     docker compose -p opencrvs -f toppan-deps.yml -f toppan-base.yml down"
echo "  • Stop external:       cd $OPENSEARCH_DIR && docker compose down"
echo "  • Scale service:       docker compose -p opencrvs -f toppan-base.yml up -d --scale [service]=N"
echo "  • Clear database:      ./scripts/clear-db.sh --all"
echo "  • Migration logs:      docker compose -p opencrvs -f toppan-deps.yml -f toppan-base.yml logs -f migration"
echo ""
echo -e "${GREEN}🚀 Ready for development!${NC}"

# Cleanup environment variables
unset VERSION
unset REGISTRY
unset DOCKER_REGISTRY
unset MODE