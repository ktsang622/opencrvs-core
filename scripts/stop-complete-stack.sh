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
VERSION=${VERSION:-"demo-1.8.0"}
DOCKER_REGISTRY=${REGISTRY:-"toppan-crvs"}
OPENSEARCH_DIR="../opensearch"

echo -e "${BLUE}🛑 OpenCRVS Complete Stack Shutdown${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"
echo -e "${BLUE}Registry: ${DOCKER_REGISTRY}${NC}"
echo ""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Stop complete OpenCRVS stack across multiple repositories"
      echo ""
      echo "Options:"
      echo "  --help, -h            Show this help message"
      echo ""
      echo "This script will stop:"
      echo "  1. OpenCRVS core services (current directory)"
      echo "  2. External Toppan services (../opensearch)"
      echo ""
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
export DOCKER_REGISTRY=$DOCKER_REGISTRY

# Step 1: Stop OpenCRVS core services
echo -e "${YELLOW}🔽 Step 1: Stopping OpenCRVS core services...${NC}"
echo -e "${BLUE}Directory: $(pwd)${NC}"

echo -e "${BLUE}🔨 Stopping OpenCRVS services...${NC}"
docker compose -p opencrvs -f docker-compose.deps.yml -f toppan-base.yml -f toppan-override.yml down

echo -e "${GREEN}✅ OpenCRVS core services stopped${NC}"

# Step 2: Stop external Toppan services
echo ""
echo -e "${YELLOW}🔽 Step 2: Stopping external Toppan services...${NC}"

if [ -d "$OPENSEARCH_DIR" ]; then
    echo -e "${BLUE}Directory: $OPENSEARCH_DIR${NC}"

    pushd "$OPENSEARCH_DIR" > /dev/null

    echo -e "${BLUE}🔨 Stopping PostgreSQL, OpenSearch, and dashboards...${NC}"
    docker compose -p opencrvs down

    echo -e "${GREEN}✅ External Toppan services stopped${NC}"

    popd > /dev/null
else
    echo -e "${YELLOW}⚠️  OpenSearch directory not found: $OPENSEARCH_DIR${NC}"
    echo -e "${BLUE}💡 Skipping external services shutdown${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Complete OpenCRVS stack stopped successfully!${NC}"
echo ""
echo -e "${BLUE}💡 To start again, run:${NC}"
echo "  ./scripts/start-complete-stack.sh"
echo ""
echo -e "${BLUE}💡 To check running containers:${NC}"
echo "  docker ps"
echo ""

# Cleanup environment variables
unset VERSION
unset REGISTRY
unset DOCKER_REGISTRY