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
    --deps-only)
      DEPS_ONLY=true
      shift
      ;;
    --services-only)
      SERVICES_ONLY=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Stop OpenCRVS Docker containers"
      echo ""
      echo "Options:"
      echo "  --mode, -m            Mode: development, production (default: development)"
      echo "  --version, -v         Version tag for services (default: latest)"
      echo "  --registry, -r        Docker registry prefix (default: toppan-crvs)"
      echo "  --deps-only           Stop only external dependencies (mongo, redis, etc.)"
      echo "  --services-only       Stop only OpenCRVS services (keep deps running)"
      echo "  --help, -h            Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                                           # Stop everything"
      echo "  $0 --services-only                          # Stop only OpenCRVS services"
      echo "  $0 --deps-only                              # Stop only external dependencies"
      echo "  VERSION=demo-1.8.0 REGISTRY=toppan-crvs $0  # Use environment variables"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}🛑 OpenCRVS Docker Stop Script${NC}"
echo -e "${BLUE}Mode: ${MODE}${NC}"
echo -e "${BLUE}Registry: ${DOCKER_REGISTRY}${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"
echo ""

# Export environment variables for docker-compose
export NODE_ENV=$MODE
export DOCKER_REGISTRY=$DOCKER_REGISTRY
export VERSION=$VERSION

# Determine compose files based on mode and options
COMPOSE_FILES="-f docker-compose.deps.yml"

if [ "$DEPS_ONLY" = true ]; then
    echo -e "${YELLOW}🔽 Stopping external dependencies only...${NC}"
    COMPOSE_FILES="-f docker-compose.deps.yml"
    STOP_SERVICES="mongo1 redis elasticsearch influxdb hearth minio"
elif [ "$SERVICES_ONLY" = true ]; then
    echo -e "${YELLOW}🔽 Stopping OpenCRVS services only (keeping dependencies)...${NC}"
    COMPOSE_FILES="-f docker-compose.deps.yml -f toppan-base.yml"
    if [ "$MODE" = "development" ]; then
        COMPOSE_FILES="$COMPOSE_FILES -f toppan-override.yml"
    fi
    # Only stop OpenCRVS core services, not dependencies
    STOP_SERVICES="config auth user-mgnt notification search metrics documents workflow gateway webhooks events client login countryconfig"
else
    echo -e "${YELLOW}🔽 Stopping complete OpenCRVS stack...${NC}"
    COMPOSE_FILES="-f docker-compose.deps.yml -f toppan-base.yml"
    if [ "$MODE" = "development" ]; then
        COMPOSE_FILES="$COMPOSE_FILES -f toppan-override.yml"
    fi
fi

# Stop services
echo -e "${BLUE}🔨 Docker Compose command:${NC}"
if [ -n "$STOP_SERVICES" ]; then
    echo "docker compose -p opencrvs $COMPOSE_FILES stop $STOP_SERVICES"
    echo ""
    docker compose -p opencrvs $COMPOSE_FILES stop $STOP_SERVICES

    if [ "$SERVICES_ONLY" = true ]; then
        echo ""
        echo -e "${BLUE}🗑️  Removing stopped service containers...${NC}"
        docker compose -p opencrvs $COMPOSE_FILES rm -f $STOP_SERVICES
    fi
else
    echo "docker compose -p opencrvs $COMPOSE_FILES down"
    echo ""
    docker compose -p opencrvs $COMPOSE_FILES down
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}🎉 OpenCRVS stopped successfully!${NC}"
    echo ""

    if [ "$DEPS_ONLY" = true ]; then
        echo -e "${BLUE}📋 Dependencies stopped:${NC}"
        echo "  • MongoDB (mongo1)"
        echo "  • Redis"
        echo "  • Elasticsearch"
        echo "  • InfluxDB"
        echo "  • Hearth (FHIR server)"
        echo "  • MinIO (object storage)"
    elif [ "$SERVICES_ONLY" = true ]; then
        echo -e "${BLUE}📋 Core services stopped (dependencies still running):${NC}"
        echo "  • All OpenCRVS microservices"
        echo "  • Client & Login frontends"
        echo "  • CountryConfig service"
        echo ""
        echo -e "${YELLOW}💡 Dependencies still running:${NC}"
        echo "  • MongoDB, Redis, Elasticsearch, InfluxDB, Hearth, MinIO"
    fi

    echo ""
    echo -e "${BLUE}💡 Useful commands:${NC}"
    echo "View remaining containers: docker compose -p opencrvs $COMPOSE_FILES ps"
    if [ "$SERVICES_ONLY" = true ]; then
        echo "Restart services:          ./scripts/start-docker.sh --services-only"
    elif [ "$DEPS_ONLY" = true ]; then
        echo "Restart dependencies:      ./scripts/start-docker.sh --deps-only"
    else
        echo "Restart everything:        ./scripts/start-docker.sh"
    fi

else
    echo -e "${RED}❌ Failed to stop OpenCRVS${NC}"
    exit 1
fi

# Cleanup environment variables
unset NODE_ENV
unset DOCKER_REGISTRY
unset VERSION