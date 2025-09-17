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
COUNTRY_CONFIG_IMAGE="${DOCKER_REGISTRY}/countryconfig:${VERSION}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --mode|-m)
      MODE="$2"
      shift 2
      ;;
    --country-config)
      COUNTRY_CONFIG_IMAGE="$2"
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
      echo "Start OpenCRVS using Docker containers"
      echo ""
      echo "Options:"
      echo "  --mode, -m            Mode: development, production (default: development)"
      echo "  --country-config      Country config image (default: \${REGISTRY}/countryconfig:\${VERSION})"
      echo "  --version, -v         Version tag for services (default: latest)"
      echo "  --registry, -r        Docker registry prefix (default: toppan-crvs)"
      echo "  --deps-only           Start only external dependencies (mongo, redis, etc.)"
      echo "  --services-only       Start only OpenCRVS services (requires deps running)"
      echo "  --help, -h            Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                                           # Start everything in development mode"
      echo "  $0 --mode production --version demo-1.8.0   # Start in production mode with specific version"
      echo "  VERSION=demo-1.8.0 REGISTRY=toppan-crvs $0  # Use environment variables (same as build script)"
      echo "  $0 --deps-only                              # Start only external dependencies"
      echo "  $0 --services-only                   # Start only OpenCRVS services"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}🐳 OpenCRVS Docker Startup Script${NC}"
echo -e "${BLUE}Mode: ${MODE}${NC}"
echo -e "${BLUE}Registry: ${DOCKER_REGISTRY}${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"
echo -e "${BLUE}Country Config: ${COUNTRY_CONFIG_IMAGE}${NC}"
echo ""

# Export environment variables for docker-compose
export NODE_ENV=$MODE
export DOCKER_REGISTRY=$DOCKER_REGISTRY
export VERSION=$VERSION
export COUNTRY_CONFIG_IMAGE=$COUNTRY_CONFIG_IMAGE

# Determine compose files based on mode and options
COMPOSE_FILES="-f toppan-deps.yml"

if [ "$DEPS_ONLY" = true ]; then
    echo -e "${YELLOW}🔧 Starting external dependencies only...${NC}"
    COMPOSE_FILES="-f toppan-deps.yml"
elif [ "$SERVICES_ONLY" = true ]; then
    echo -e "${YELLOW}🚀 Starting OpenCRVS services only...${NC}"
    COMPOSE_FILES="-f toppan-deps.yml -f toppan-base.yml"
    if [ "$MODE" = "development" ]; then
        COMPOSE_FILES="$COMPOSE_FILES -f toppan-override.yml"
    fi
else
    echo -e "${YELLOW}🚀 Starting complete OpenCRVS stack...${NC}"
    COMPOSE_FILES="-f toppan-deps.yml -f toppan-base.yml"
    if [ "$MODE" = "development" ]; then
        COMPOSE_FILES="$COMPOSE_FILES -f toppan-override.yml"
    fi
fi

# Check if secrets exist for development mode
if [ "$MODE" = "development" ] && [ "$DEPS_ONLY" != true ]; then
    if [ ! -f ".secrets/public-key.pem" ] || [ ! -f ".secrets/private-key.pem" ]; then
        echo -e "${YELLOW}⚠️  Development secrets not found. Generating...${NC}"
        mkdir -p .secrets
        openssl genrsa -out .secrets/private-key.pem 2048
        openssl rsa -pubout -in .secrets/private-key.pem -out .secrets/public-key.pem
        echo -e "${GREEN}✅ Development secrets generated${NC}"
    fi
fi

# Start services
if [ "$SERVICES_ONLY" = true ]; then
    # Only start OpenCRVS core services, not dependencies
    CORE_SERVICES="config auth user-mgnt notification search metrics documents workflow gateway webhooks events client login countryconfig migration toppan toppan-service toppan-ui"
    echo -e "${BLUE}🔨 Docker Compose command:${NC}"
    echo "docker compose -p opencrvs $COMPOSE_FILES up -d $CORE_SERVICES"
    echo ""
    docker compose -p opencrvs $COMPOSE_FILES up -d $CORE_SERVICES
else
    echo -e "${BLUE}🔨 Docker Compose command:${NC}"
    echo "docker compose -p opencrvs $COMPOSE_FILES up -d"
    echo ""
    docker compose -p opencrvs $COMPOSE_FILES up -d
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}🎉 OpenCRVS started successfully!${NC}"
    echo ""

    if [ "$DEPS_ONLY" != true ]; then
        echo -e "${BLUE}📋 Service URLs:${NC}"
        if [ "$MODE" = "development" ]; then
            echo "🌐 Client:          http://localhost:3000"
            echo "🔐 Login:           http://localhost:3020"
            echo "🏛️  Country Config:  http://localhost:3040"
            echo "🔗 Gateway:         http://localhost:7070/graphql"
            echo "👥 User Management: http://localhost:3030"
            echo "🔑 Auth:            http://localhost:4040"
            echo "⚙️  Config:          http://localhost:2021"
            echo "🔄 Workflow:        http://localhost:5050"
            echo "📄 Documents:       http://localhost:9050"
            echo "📧 Notification:    http://localhost:2020"
            echo "🔍 Search:          http://localhost:9090"
            echo "📊 Metrics:         http://localhost:1050"
            echo "🪝 Webhooks:        http://localhost:2525"
            echo "🎯 Events:          http://localhost:5555"
        else
            echo "🌐 Client:          http://localhost:3000"
            echo "🔐 Login:           http://localhost:3020"
        fi
    fi

    echo ""
    echo -e "${BLUE}📊 Container Status:${NC}"
    docker compose -p opencrvs $COMPOSE_FILES ps

    echo ""
    echo -e "${YELLOW}💡 Useful commands:${NC}"
    echo "View logs:        docker compose -p opencrvs $COMPOSE_FILES logs -f [service-name]"
    echo "Stop services:    docker compose -p opencrvs $COMPOSE_FILES down"
    echo "Restart service:  docker compose -p opencrvs $COMPOSE_FILES restart [service-name]"
    echo "Scale service:    docker compose -p opencrvs $COMPOSE_FILES up -d --scale [service-name]=N"

else
    echo -e "${RED}❌ Failed to start OpenCRVS${NC}"
    echo ""
    echo -e "${YELLOW}Checking logs...${NC}"
    docker compose -p opencrvs $COMPOSE_FILES logs --tail=20
    exit 1
fi

# Cleanup environment variables
unset NODE_ENV
unset DOCKER_REGISTRY
unset VERSION
unset COUNTRY_CONFIG_IMAGE