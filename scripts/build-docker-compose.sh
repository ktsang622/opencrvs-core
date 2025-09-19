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
REGISTRY=${REGISTRY:-"toppan-crvs"}
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
      echo "Examples:"
      echo "  $0                                    # Build all services"
      echo "  $0 gateway user-mgnt                  # Build only gateway and user-mgnt"
      echo "  $0 --status                           # Show build status"
      echo "  $0 --no-cache gateway                 # Build gateway without cache"
      echo "  $0 base                               # Force rebuild base image"
      echo "  $0 --build-arg NODE_ENV=production    # Build with build argument"
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

        # Check if this is a standalone service (uses node:18-slim) or OpenCRVS service
        if grep -q "FROM node:18-slim" "$dockerfile_path"; then
            echo -e "${BLUE}${service}: standalone service, using original Dockerfile${NC}"
            # No modification needed for standalone services
        else
            echo -e "${BLUE}${service}: replacing base image with ${REGISTRY}/ocrvs-base:${VERSION}${NC}"

            # Replace the FROM line to use our local base image
            sed "s|FROM ghcr.io/opencrvs/ocrvs-base:\${BRANCH}|FROM ${REGISTRY}/ocrvs-base:${VERSION}|g; \
                 s|FROM ghcr.io/opencrvs/ocrvs-base:.*|FROM ${REGISTRY}/ocrvs-base:${VERSION}|g" \
                "$dockerfile_path" > "$temp_dockerfile"
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

# Function to build core services (depends on base) with dynamic Dockerfiles
build_core_services() {
    local services_to_build=("$@")

    echo -e "${YELLOW}🚀 Building core services (depends on base)...${NC}"
    echo ""

    local services_list=()
    if [ ${#services_to_build[@]} -gt 0 ]; then
        services_list=("${services_to_build[@]}")
        echo -e "${BLUE}Selected services: ${services_list[*]}${NC}"
    else
        # Get all services except base
        services_list=($(docker_compose $BUILD_COMPOSE config --services | grep -v "^base$"))
        echo -e "${BLUE}Building all core services: ${services_list[*]}${NC}"
    fi

    # Create temporary Dockerfiles for dynamic base image replacement
    create_temp_dockerfiles "${services_list[@]}"

    # Create dynamic compose file that uses temp Dockerfiles
    local dynamic_compose_file=$(create_dynamic_build_compose "${services_list[@]}")

    # Build using the dynamic compose file
    if [ "$PARALLEL" = false ]; then
        echo -e "${BLUE}🔨 Building services sequentially...${NC}"
        local build_result=0
        for service in "${services_list[@]}"; do
            echo -e "${YELLOW}Building $service...${NC}"
            docker_compose -f "$dynamic_compose_file" build $ALL_BUILD_ARGS "$service"
            if [ $? -ne 0 ]; then
                build_result=1
                break
            fi
        done
    elif [ "$MAX_PARALLEL" -gt 0 ] && [ ${#services_list[@]} -gt "$MAX_PARALLEL" ]; then
        echo -e "${BLUE}🔨 Building services in batches of $MAX_PARALLEL...${NC}"
        local build_result=0
        local batch=()
        local count=0

        for service in "${services_list[@]}"; do
            batch+=("$service")
            count=$((count + 1))

            if [ $count -eq "$MAX_PARALLEL" ] || [ $service = "${services_list[-1]}" ]; then
                echo -e "${YELLOW}Building batch: ${batch[*]}${NC}"
                docker_compose -f "$dynamic_compose_file" build $ALL_BUILD_ARGS "${batch[@]}"
                if [ $? -ne 0 ]; then
                    build_result=1
                    break
                fi
                batch=()
                count=0
                echo -e "${GREEN}Batch completed successfully${NC}"
                sleep 2  # Brief pause between batches
            fi
        done
    else
        echo -e "${BLUE}🔨 Building all services in parallel...${NC}"
        echo "docker compose --env-file $COMPOSE_ENV_FILE -f $dynamic_compose_file build $ALL_BUILD_ARGS ${services_list[*]}"
        echo ""
        docker_compose -f "$dynamic_compose_file" build $ALL_BUILD_ARGS "${services_list[@]}"
        local build_result=$?
    fi

    # Cleanup temporary files
    cleanup_temp_dockerfiles "${services_list[@]}"
    rm -f "$dynamic_compose_file"

    if [ $build_result -eq 0 ]; then
        # Tag all built services with latest
        echo -e "${BLUE}🏷️  Tagging core services with 'latest'...${NC}"
        tag_services_with_latest "${services_list[@]}"
        echo -e "${GREEN}✅ Core services built and tagged successfully${NC}"
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
    echo ""

    # 1. Build base image first (contains commons/components) - only if needed
    build_base_image false

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
