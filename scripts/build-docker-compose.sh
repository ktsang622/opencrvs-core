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

COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-docker.env}

docker_compose() {
  docker compose --env-file "$COMPOSE_ENV_FILE" "$@"
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get version from git or use default
VERSION=${VERSION:-"demo-1.8.0"}
REGISTRY=${REGISTRY:-"toppancrvs"}
BRANCH=${BRANCH:-"develop"}

# Build compose files
BUILD_COMPOSE="-f toppan-build.yml"
EXTERNAL_COMPOSE="-f toppan-build-ext.yml"

# Parse command line arguments
SERVICES=()
PARALLEL=true
NO_CACHE=false
BUILD_ARGS=""
MAX_PARALLEL=${MAX_PARALLEL:-0}  # 0 means unlimited
FROM_TIER=${FROM_TIER:-1}  # Start from tier N (1-7)
SKIP_BASE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --status|-s)
      echo -e "${BLUE}🔍 Checking Docker Compose build status...${NC}"
      echo ""
      docker_compose $BUILD_COMPOSE config --services
      echo ""
      echo -e "${BLUE}Current images:${NC}"
      docker images | grep -E "(${REGISTRY}|opencrvs)" | head -20
      exit 0
      ;;
    --no-cache)
      NO_CACHE=true
      shift
      ;;
    --build-arg)
      BUILD_ARGS="$BUILD_ARGS --build-arg $2"
      shift 2
      ;;
    --sequential)
      PARALLEL=false
      shift
      ;;
    --max-parallel)
      MAX_PARALLEL="$2"
      shift 2
      ;;
    --from-tier)
      FROM_TIER="$2"
      SKIP_BASE=true
      shift 2
      ;;
    --skip-base)
      SKIP_BASE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS] [SERVICES...]"
      echo ""
      echo "Build OpenCRVS Docker images using Docker Compose"
      echo ""
      echo "Options:"
      echo "  --status, -s      Show current build status and available services"
      echo "  --no-cache        Build without using cache"
      echo "  --build-arg       Pass build argument (can be used multiple times)"
      echo "  --sequential      Build services sequentially instead of parallel"
      echo "  --max-parallel N  Limit parallel builds to N services (helps with network issues)"
      echo "  --from-tier N     Start building from tier N (1-7), skips base image"
      echo "  --skip-base       Skip building base image (assumes it exists)"
      echo "  --help, -h        Show this help message"
      echo ""
      echo "Arguments:"
      echo "  SERVICES...       Specific services to build (default: all services)"
      echo ""
      echo "Environment variables:"
      echo "  VERSION          Image version tag (default: demo-1.8.0)"
      echo "  REGISTRY         Docker registry prefix (default: toppan-crvs)"
      echo "  BRANCH           Base image branch (default: develop)"
      echo ""
      echo "Features:"
      echo "  • Leverages Docker Compose depends_on for proper build order"
      echo "  • Parallel building by default (compose handles dependencies)"
      echo "  • Smart base image building (only when needed or explicitly requested)"
      echo "  • Uses existing toppan-build.yml configuration"
      echo "  • Integrates with existing compose infrastructure"
      echo ""
      echo "Tiers:"
      echo "  1: config, auth, notification"
      echo "  2: user-mgnt, documents, webhooks"
      echo "  3: search, metrics, workflow"
      echo "  4: gateway, events"
      echo "  5: migration, data-seeder, scheduler, dashboards"
      echo "  6: client, login"
      echo "  7: toppan-service, toppan, toppan-ui, toppan-certificate"
      echo ""
      echo "Examples:"
      echo "  $0                                    # Build all services"
      echo "  $0 gateway user-mgnt                  # Build only gateway and user-mgnt"
      echo "  $0 --from-tier 5                      # Resume from Tier 5"
      echo "  $0 --skip-base                        # Build all but skip base image"
      echo "  $0 --status                           # Show build status"
      echo "  $0 --no-cache gateway                 # Build gateway without cache"
      echo "  $0 base                               # Force rebuild base image"
      echo "  VERSION=1.8.0 REGISTRY=myorg $0      # Custom version and registry"
      exit 0
      ;;
    -*)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
    *)
      SERVICES+=("$1")
      shift
      ;;
  esac
done

echo -e "${BLUE}🐳 OpenCRVS Docker Compose Build Script${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"
echo -e "${BLUE}Registry: ${REGISTRY}${NC}"
echo -e "${BLUE}Branch: ${BRANCH}${NC}"
echo -e "${BLUE}Build Mode: $([ "$PARALLEL" = true ] && echo "Parallel" || echo "Sequential")${NC}"
echo -e "${BLUE}Cache: $([ "$NO_CACHE" = true ] && echo "Disabled" || echo "Enabled")${NC}"
echo ""

# Export environment variables for docker-compose
export VERSION=$VERSION
export DOCKER_REGISTRY=$REGISTRY
export BRANCH=$BRANCH

# Build cache and additional arguments
CACHE_ARGS=""
if [ "$NO_CACHE" = true ]; then
    CACHE_ARGS="--no-cache"
fi

# Combine all build arguments
ALL_BUILD_ARGS="$CACHE_ARGS $BUILD_ARGS"

# Parallel arguments
PARALLEL_ARGS=""
if [ "$PARALLEL" = false ]; then
    PARALLEL_ARGS="--no-deps"
fi

# Function to create temporary Dockerfiles for services
create_temp_dockerfiles() {
    local services_to_process=("$@")

    echo -e "${BLUE}🔧 Creating temporary Dockerfiles for dynamic base image replacement...${NC}"

    for service in "${services_to_process[@]}"; do
        if [ "$service" = "base" ]; then
            continue # Skip base service
        fi

        local dockerfile_path="packages/${service}/Dockerfile"
        local temp_dockerfile="packages/${service}/Dockerfile.${service}.temp"

        if [ ! -f "$dockerfile_path" ]; then
            echo -e "${YELLOW}⚠️  No Dockerfile found for ${service}, skipping...${NC}"
            continue
        fi

        # Check if this Dockerfile uses the OpenCRVS base image
        if grep -q "ghcr.io/opencrvs/ocrvs-base" "$dockerfile_path"; then
            echo -e "${BLUE}${service}: replacing base image with ${REGISTRY}/ocrvs-base:${VERSION}${NC}"

            # Replace the FROM line to use our local base image
            sed "s|FROM ghcr.io/opencrvs/ocrvs-base:\${BRANCH}|FROM ${REGISTRY}/ocrvs-base:${VERSION}|g; \
                 s|FROM ghcr.io/opencrvs/ocrvs-base:.*|FROM ${REGISTRY}/ocrvs-base:${VERSION}|g" \
                "$dockerfile_path" > "$temp_dockerfile"
        else
            echo -e "${BLUE}${service}: standalone service, using original Dockerfile${NC}"
            # No modification needed - uses its own base image (node:18-slim, .NET, etc.)
        fi
    done
}

# Function to cleanup temporary Dockerfiles
cleanup_temp_dockerfiles() {
    local services_to_cleanup=("$@")

    echo -e "${BLUE}🧹 Cleaning up temporary Dockerfiles...${NC}"

    for service in "${services_to_cleanup[@]}"; do
        local temp_dockerfile="packages/${service}/Dockerfile.${service}.temp"
        if [ -f "$temp_dockerfile" ]; then
            rm -f "$temp_dockerfile"
            echo -e "${BLUE}Cleaned up: ${temp_dockerfile}${NC}"
        fi
    done
}

# Function to create dynamic compose file with temp Dockerfiles
create_dynamic_build_compose() {
    local services_to_build=("$@")

    # Create a temporary build compose file
    local temp_build_compose="toppan-build-dynamic.yml"

    # Copy the original compose file
    cp toppan-build.yml "$temp_build_compose"

    # Update dockerfile paths to use temp files where they exist
    for service in "${services_to_build[@]}"; do
        if [ "$service" = "base" ]; then
            continue
        fi

        local temp_dockerfile="packages/${service}/Dockerfile.${service}.temp"
        if [ -f "$temp_dockerfile" ]; then
            # Replace dockerfile path in compose file
            sed -i "s|dockerfile: packages/${service}/Dockerfile|dockerfile: packages/${service}/Dockerfile.${service}.temp|g" "$temp_build_compose"
        fi
    done

    echo "$temp_build_compose"
}

# Function to build external services (countryconfig, opensearch)
build_external_services() {
    local services_to_build=("$@")

    echo -e "${YELLOW}🌍 Building external services (countryconfig, opensearch)...${NC}"
    echo ""

    # External services that don't depend on base
    local external_services=("countryconfig" "opensearch" "toppan-data-seeder")
    local services_to_include=()

    if [ ${#services_to_build[@]} -gt 0 ]; then
        # Build only requested external services
        for service in "${services_to_build[@]}"; do
            if [[ " ${external_services[@]} " =~ " ${service} " ]]; then
                services_to_include+=("$service")
            fi
        done
    else
        # Build all external services
        services_to_include=("${external_services[@]}")
    fi

    if [ ${#services_to_include[@]} -gt 0 ]; then
        echo -e "${BLUE}External services to build: ${services_to_include[*]}${NC}"
        echo -e "${BLUE}🔨 Docker Compose build command:${NC}"
        echo "docker compose --env-file $COMPOSE_ENV_FILE $EXTERNAL_COMPOSE build $ALL_BUILD_ARGS ${services_to_include[*]}"
        echo ""

        docker_compose $EXTERNAL_COMPOSE build $ALL_BUILD_ARGS "${services_to_include[@]}"

        if [ $? -eq 0 ]; then
            # Tag external services with latest
            echo -e "${BLUE}🏷️  Tagging external services with 'latest'...${NC}"
            tag_external_services_with_latest "${services_to_include[@]}"
            echo -e "${GREEN}✅ External services built and tagged successfully${NC}"
        else
            echo -e "${RED}❌ External services build failed${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}⚠️  No external services to build${NC}"
    fi
}

# Function to tag core services with latest
tag_services_with_latest() {
    local services_to_tag=("$@")

    # If no specific services provided, get all services except base
    if [ ${#services_to_tag[@]} -eq 0 ]; then
        services_to_tag=($(docker_compose $BUILD_COMPOSE config --services | grep -v "^base$"))
    fi

    for service in "${services_to_tag[@]}"; do
        if [ "$service" != "base" ]; then
            docker tag "${REGISTRY}/${service}:${VERSION}" "${REGISTRY}/${service}:latest" 2>/dev/null || true
        fi
    done
}

# Function to tag external services with latest
tag_external_services_with_latest() {
    local services_to_tag=("$@")

    for service in "${services_to_tag[@]}"; do
        docker tag "${REGISTRY}/${service}:${VERSION}" "${REGISTRY}/${service}:latest" 2>/dev/null || true
    done
}

# Function to check if base image exists
base_image_exists() {
    local base_image_name="${REGISTRY}/ocrvs-base:${VERSION}"
    docker images -q "$base_image_name" 2>/dev/null | grep -q .
}

# Function to build base image first
build_base_image() {
    local force_build=${1:-false}

    # Check if base image already exists
    # Only rebuild base if: explicitly requested (force_build=true) OR base is in SERVICES list
    local rebuild_base=false
    if [ "$force_build" = "true" ]; then
        rebuild_base=true
    elif [[ " ${SERVICES[@]} " =~ " base " ]]; then
        rebuild_base=true
    fi

    if base_image_exists && [ "$rebuild_base" != "true" ]; then
        echo -e "${GREEN}✓ Base image already exists: ${REGISTRY}/ocrvs-base:${VERSION}${NC}"
        echo -e "${BLUE}Skipping base image build (explicitly build 'base' to rebuild)${NC}"
        echo ""
        return 0
    fi

    echo -e "${YELLOW}🏗️  Building base image (commons/components)...${NC}"
    echo -e "${BLUE}Base image contains shared libraries required by all services${NC}"
    echo ""

    echo -e "${BLUE}🔨 Docker Compose build command:${NC}"
    echo "docker compose --env-file $COMPOSE_ENV_FILE $BUILD_COMPOSE build $ALL_BUILD_ARGS base"
    echo ""

    docker_compose $BUILD_COMPOSE build $ALL_BUILD_ARGS base

    if [ $? -eq 0 ]; then
        # Tag with latest
        echo -e "${BLUE}🏷️  Tagging base image with 'latest'...${NC}"
        docker tag "${REGISTRY}/ocrvs-base:${VERSION}" "${REGISTRY}/ocrvs-base:latest"
        echo -e "${GREEN}✅ Base image built and tagged successfully${NC}"
        echo ""
    else
        echo -e "${RED}❌ Failed to build base image${NC}"
        exit 1
    fi
}

# Define service tiers based on README.md architecture
# This ensures proper build order and dependency resolution
declare -A SERVICE_TIERS
SERVICE_TIERS=(
    ["tier1"]="config auth notification"
    ["tier2"]="user-mgnt documents webhooks"
    ["tier3"]="search metrics workflow"
    ["tier4"]="gateway events"
    ["tier5"]="migration data-seeder scheduler dashboards"
    ["tier6"]="client login"
    ["tier7"]="toppan-service toppan toppan-ui toppan-certificate"
)

TIER_NAMES=(
    "tier1:Tier 1 - Core Infrastructure"
    "tier2:Tier 2 - User & Documents"
    "tier3:Tier 3 - Data Services"
    "tier4:Tier 4 - Gateway & Events"
    "tier5:Tier 5 - Support Services"
    "tier6:Tier 6 - Frontend"
    "tier7:Tier 7 - Toppan Services"
)

# Function to build a single tier of services
build_tier() {
    local tier_key=$1
    local tier_name=$2
    local tier_services=$3
    local dynamic_compose_file=$4

    # Convert space-separated string to array
    local services_array=($tier_services)

    if [ ${#services_array[@]} -eq 0 ]; then
        return 0
    fi

    echo ""
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo -e "${YELLOW}🔨 Building ${tier_name}${NC}"
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo -e "${BLUE}Services: ${services_array[*]}${NC}"
    echo ""

    # Build tier services (parallel within tier)
    docker_compose -f "$dynamic_compose_file" build $ALL_BUILD_ARGS "${services_array[@]}"

    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ ${tier_name} build failed${NC}"
        return 1
    fi

    echo -e "${GREEN}✅ ${tier_name} completed${NC}"
    return 0
}

# Function to build core services (depends on base) with dynamic Dockerfiles
build_core_services() {
    local services_to_build=("$@")

    echo -e "${YELLOW}🚀 Building core services in tiered sequence...${NC}"
    echo ""

    # Determine which services to build
    local all_services=()
    local filter_mode=false

    if [ ${#services_to_build[@]} -gt 0 ]; then
        filter_mode=true
        all_services=("${services_to_build[@]}")
        echo -e "${BLUE}Selected services: ${all_services[*]}${NC}"
    else
        # Get all services from all tiers
        for tier_key in tier1 tier2 tier3 tier4 tier5 tier6 tier7; do
            for svc in ${SERVICE_TIERS[$tier_key]}; do
                all_services+=("$svc")
            done
        done
        echo -e "${BLUE}Building all core services in tiered order${NC}"
    fi

    # Create temporary Dockerfiles for dynamic base image replacement
    create_temp_dockerfiles "${all_services[@]}"

    # Create dynamic compose file that uses temp Dockerfiles
    local dynamic_compose_file=$(create_dynamic_build_compose "${all_services[@]}")

    local build_result=0

    # Build tier by tier
    for tier_entry in "${TIER_NAMES[@]}"; do
        local tier_key="${tier_entry%%:*}"
        local tier_num="${tier_key#tier}"
        local tier_name="${tier_entry#*:}"
        local tier_services="${SERVICE_TIERS[$tier_key]}"

        # Skip tiers before FROM_TIER
        if [ "$tier_num" -lt "$FROM_TIER" ]; then
            echo -e "${BLUE}⏭️  Skipping ${tier_name} (--from-tier ${FROM_TIER})${NC}"
            continue
        fi

        # Filter services if specific ones were requested
        if [ "$filter_mode" = true ]; then
            local filtered_services=""
            for svc in $tier_services; do
                if [[ " ${services_to_build[*]} " =~ " ${svc} " ]]; then
                    filtered_services="$filtered_services $svc"
                fi
            done
            tier_services="${filtered_services# }"
        fi

        # Skip empty tiers
        if [ -z "$tier_services" ]; then
            continue
        fi

        # Build this tier
        if [ "$PARALLEL" = false ]; then
            # Sequential mode: build each service one by one
            for svc in $tier_services; do
                echo -e "${YELLOW}Building $svc (${tier_name})...${NC}"
                docker_compose -f "$dynamic_compose_file" build $ALL_BUILD_ARGS "$svc"
                if [ $? -ne 0 ]; then
                    build_result=1
                    break 2
                fi
            done
        else
            # Parallel mode: build entire tier in parallel
            build_tier "$tier_key" "$tier_name" "$tier_services" "$dynamic_compose_file"
            if [ $? -ne 0 ]; then
                build_result=1
                break
            fi
        fi
    done

    # Cleanup temporary files
    cleanup_temp_dockerfiles "${all_services[@]}"
    rm -f "$dynamic_compose_file"

    if [ $build_result -eq 0 ]; then
        # Tag all built services with latest
        echo -e "${BLUE}🏷️  Tagging core services with 'latest'...${NC}"
        tag_services_with_latest "${all_services[@]}"
        echo -e "${GREEN}✅ All core services built and tagged successfully${NC}"
    else
        echo -e "${RED}❌ Core services build failed${NC}"
        exit 1
    fi
}

# Check if specific services were requested
if [ ${#SERVICES[@]} -gt 0 ]; then
    echo -e "${YELLOW}🎯 Building selected services: ${SERVICES[*]}${NC}"
    echo ""

    # Validate services exist in compose file
    AVAILABLE_SERVICES=$(docker_compose $BUILD_COMPOSE config --services)
    CORE_SERVICES=()
    EXTERNAL_SERVICES=()
    EXTERNAL_SERVICE_LIST=("countryconfig" "opensearch" "toppan-data-seeder")

    for service in "${SERVICES[@]}"; do
        if [[ " ${EXTERNAL_SERVICE_LIST[@]} " =~ " ${service} " ]]; then
            EXTERNAL_SERVICES+=("$service")
        elif echo "$AVAILABLE_SERVICES" | grep -q "^${service}$"; then
            CORE_SERVICES+=("$service")
        else
            echo -e "${RED}❌ Service '${service}' not found in build configuration${NC}"
            echo -e "${BLUE}Available core services:${NC}"
            echo "$AVAILABLE_SERVICES" | sed 's/^/  /'
            echo -e "${BLUE}Available external services:${NC}"
            printf "  %s\n" "${EXTERNAL_SERVICE_LIST[@]}"
            exit 1
        fi
    done

    # Build in sequence: base -> core services -> external services
    if [ ${#CORE_SERVICES[@]} -gt 0 ]; then
        # Check if any selected service needs base (all except base itself)
        NEEDS_BASE=false
        for service in "${CORE_SERVICES[@]}"; do
            if [[ "$service" != "base" ]]; then
                NEEDS_BASE=true
                break
            fi
        done

        # Check if base is explicitly requested
        if [[ " ${CORE_SERVICES[@]} " =~ " base " ]]; then
            # Base explicitly requested - force build
            build_base_image true
            # Remove base from core services list since we built it
            CORE_SERVICES=($(printf '%s\n' "${CORE_SERVICES[@]}" | grep -v '^base$'))
        elif [ "$NEEDS_BASE" = true ]; then
            # Base needed but not explicitly requested - build only if needed
            build_base_image false
        fi

        # Build remaining core services if any
        if [ ${#CORE_SERVICES[@]} -gt 0 ]; then
            build_core_services "${CORE_SERVICES[@]}"
        fi
    fi

    if [ ${#EXTERNAL_SERVICES[@]} -gt 0 ]; then
        build_external_services "${EXTERNAL_SERVICES[@]}"
    fi

else
    # Build all services in proper sequence
    echo -e "${YELLOW}🚀 Building all services in optimized sequence...${NC}"
    echo -e "${BLUE}Starting from Tier: ${FROM_TIER}${NC}"
    echo ""

    # 1. Build base image first (contains commons/components) - only if needed
    if [ "$SKIP_BASE" = true ]; then
        echo -e "${BLUE}⏭️  Skipping base image (--skip-base or --from-tier)${NC}"
    else
        build_base_image false
    fi

    # 2. Build all core services in parallel (they depend on base)
    build_core_services

    # 3. Build external services separately
    build_external_services
fi

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 Build completed successfully!${NC}"
    echo ""

    # Show built images
    echo -e "${BLUE}📦 Built images:${NC}"
    if [ ${#SERVICES[@]} -gt 0 ]; then
        for service in "${SERVICES[@]}"; do
            docker images | grep -E "(${REGISTRY}.*${service}|opencrvs.*${service})" | head -1
        done
    else
        docker images | grep -E "(${REGISTRY}|opencrvs)" | head -10
    fi

    echo ""
    echo -e "${YELLOW}💡 Useful commands:${NC}"
    echo "List all built services:  docker compose --env-file $COMPOSE_ENV_FILE $BUILD_COMPOSE config --services"
    echo "Start services:           ./scripts/start-docker.sh"
    echo "View service logs:        docker compose --env-file $COMPOSE_ENV_FILE -p opencrvs -f toppan-deps.yml -f toppan-base.yml logs -f [service]"
    echo "Clean up:                 docker image prune"

else
    echo ""
    echo -e "${RED}❌ Build failed${NC}"
    echo ""
    echo -e "${YELLOW}🔍 Troubleshooting:${NC}"
    echo "Check service config:     docker compose --env-file $COMPOSE_ENV_FILE $BUILD_COMPOSE config"
    echo "View available services:  docker compose --env-file $COMPOSE_ENV_FILE $BUILD_COMPOSE config --services"
    echo "Check Dockerfiles exist:  ls packages/*/Dockerfile"
    exit 1
fi

# Cleanup environment variables
unset VERSION
unset DOCKER_REGISTRY
unset BRANCH
