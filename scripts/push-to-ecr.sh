#!/bin/bash
# Push already-built OpenCRVS images to AWS ECR
# Usage: ./push-to-ecr.sh [OPTIONS] [SERVICES...]
#
# This script assumes images are already built locally with build-docker-compose.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment from docker.env (same as build script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-${PROJECT_ROOT}/docker.env}"

# Save exported VERSION before loading env file (exported values take precedence)
_SAVED_VERSION="${VERSION:-}"

if [ -f "$COMPOSE_ENV_FILE" ]; then
    echo -e "${BLUE}📄 Loading environment from: ${COMPOSE_ENV_FILE}${NC}"
    # Export variables from env file (skip comments and empty lines)
    set -a
    source "$COMPOSE_ENV_FILE"
    set +a
fi

# Restore exported VERSION if it was set (takes precedence over docker.env)
if [ -n "$_SAVED_VERSION" ]; then
    VERSION="$_SAVED_VERSION"
fi

# AWS CLI path
AWS_CLI="${HOME}/.local/bin/aws"
if [ ! -f "$AWS_CLI" ]; then
    AWS_CLI="aws"
fi

# AWS Configuration (can be overridden by environment variables)
AWS_REGION="${AWS_REGION:-ap-east-1}"
AWS_ACCOUNT="${AWS_ACCOUNT:-695491315778}"
ECR_REGISTRY="${ECR_REGISTRY:-${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com}"
ECR_REPO_PREFIX="${ECR_REPO_PREFIX:-toppancrvs}"

# Version and registry settings (from docker.env or defaults)
VERSION="${VERSION:-demo-1.8.0.1}"
LOCAL_REGISTRY="${DOCKER_REGISTRY:-${REGISTRY:-toppancrvs}}"

# All available services (in push order)
ALL_SERVICES=(
    "ocrvs-base"
    "config"
    "auth"
    "notification"
    "user-mgnt"
    "documents"
    "webhooks"
    "search"
    "metrics"
    "workflow"
    "gateway"
    "events"
    "migration"
    "data-seeder"
    "scheduler"
    "dashboards"
    "client"
    "login"
    "toppan-service"
    "toppan"
    "toppan-ui"
    "toppan-certificate"
    "countryconfig"
    "opensearch"
    "toppan-data-seeder"
)

# Parse arguments
SERVICES=()
DRY_RUN=false
SKIP_LOGIN=false
PUSH_LATEST=true
PARALLEL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run|-n)
            DRY_RUN=true
            shift
            ;;
        --skip-login)
            SKIP_LOGIN=true
            shift
            ;;
        --no-latest)
            PUSH_LATEST=false
            shift
            ;;
        --parallel|-p)
            PARALLEL=true
            shift
            ;;
        --list|-l)
            echo -e "${BLUE}Available services:${NC}"
            printf "  %s\n" "${ALL_SERVICES[@]}"
            echo ""
            echo -e "${BLUE}Currently built images (${LOCAL_REGISTRY}):${NC}"
            docker images | grep "^${LOCAL_REGISTRY}" | awk '{print "  " $1 ":" $2}'
            exit 0
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS] [SERVICES...]"
            echo ""
            echo "Push already-built OpenCRVS Docker images to AWS ECR"
            echo ""
            echo "Options:"
            echo "  --dry-run, -n     Show what would be pushed without actually pushing"
            echo "  --skip-login      Skip ECR login (assumes already logged in)"
            echo "  --no-latest       Don't push :latest tag, only version tag"
            echo "  --parallel, -p    Push images in parallel (faster but harder to debug)"
            echo "  --list, -l        List available services and built images"
            echo "  --help, -h        Show this help message"
            echo ""
            echo "Arguments:"
            echo "  SERVICES...       Specific services to push (default: all built images)"
            echo ""
            echo "Environment variables:"
            echo "  VERSION           Image version tag (default: demo-1.8.0)"
            echo "  REGISTRY          Local registry prefix (default: toppancrvs)"
            echo "  AWS_REGION        AWS region (default: ap-east-1)"
            echo "  AWS_ACCOUNT       AWS account ID (default: 695491315778)"
            echo "  ECR_REPO_PREFIX   ECR repository prefix (default: toppancrvs)"
            echo ""
            echo "Examples:"
            echo "  $0                            # Push all built images"
            echo "  $0 gateway auth client        # Push only specific services"
            echo "  $0 --dry-run                  # Preview what would be pushed"
            echo "  $0 --list                     # Show available services"
            echo "  VERSION=1.9.0 $0 gateway      # Push with specific version"
            exit 0
            ;;
        -*)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
        *)
            SERVICES+=("$1")
            shift
            ;;
    esac
done

echo -e "${BLUE}🚀 OpenCRVS ECR Push Script${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"
echo -e "${BLUE}Local Registry: ${LOCAL_REGISTRY}${NC}"
echo -e "${BLUE}ECR Registry: ${ECR_REGISTRY}/${ECR_REPO_PREFIX}${NC}"
echo -e "${BLUE}Dry Run: $([ "$DRY_RUN" = true ] && echo "Yes" || echo "No")${NC}"
echo ""

# Function to check if local image exists
image_exists() {
    local image=$1
    docker images -q "${image}" 2>/dev/null | grep -q .
}

# Function to push a single service
push_service() {
    local service=$1
    local local_image
    local ecr_image
    local ecr_image_latest

    # Handle base image naming
    if [ "$service" = "ocrvs-base" ]; then
        local_image="${LOCAL_REGISTRY}/ocrvs-base:${VERSION}"
        ecr_image="${ECR_REGISTRY}/${ECR_REPO_PREFIX}/ocrvs-base:${VERSION}"
        ecr_image_latest="${ECR_REGISTRY}/${ECR_REPO_PREFIX}/ocrvs-base:latest"
    else
        local_image="${LOCAL_REGISTRY}/${service}:${VERSION}"
        ecr_image="${ECR_REGISTRY}/${ECR_REPO_PREFIX}/${service}:${VERSION}"
        ecr_image_latest="${ECR_REGISTRY}/${ECR_REPO_PREFIX}/${service}:latest"
    fi

    # Check if local image exists
    if ! image_exists "${local_image}"; then
        # Try with :latest if version not found
        local latest_image="${LOCAL_REGISTRY}/${service}:latest"
        if [ "$service" = "ocrvs-base" ]; then
            latest_image="${LOCAL_REGISTRY}/ocrvs-base:latest"
        fi

        if image_exists "${latest_image}"; then
            echo -e "${YELLOW}⚠️  ${service}:${VERSION} not found, using :latest${NC}"
            local_image="${latest_image}"
        else
            echo -e "${YELLOW}⏭️  Skipping ${service} (image not found locally)${NC}"
            return 0
        fi
    fi

    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}[DRY-RUN] Would push:${NC}"
        echo "  Tag: ${local_image} → ${ecr_image}"
        if [ "$PUSH_LATEST" = true ]; then
            echo "  Tag: ${local_image} → ${ecr_image_latest}"
        fi
        echo "  Push: ${ecr_image}"
        if [ "$PUSH_LATEST" = true ]; then
            echo "  Push: ${ecr_image_latest}"
        fi
        return 0
    fi

    echo -e "${YELLOW}📤 Pushing ${service}...${NC}"

    # Tag for ECR
    docker tag "${local_image}" "${ecr_image}"
    if [ "$PUSH_LATEST" = true ]; then
        docker tag "${local_image}" "${ecr_image_latest}"
    fi

    # Push to ECR
    docker push "${ecr_image}"
    if [ "$PUSH_LATEST" = true ]; then
        docker push "${ecr_image_latest}"
    fi

    echo -e "${GREEN}✅ ${service} pushed successfully${NC}"
}

# Login to ECR
if [ "$SKIP_LOGIN" = false ] && [ "$DRY_RUN" = false ]; then
    echo -e "${YELLOW}🔐 Logging into AWS ECR...${NC}"
    $AWS_CLI ecr get-login-password --region "${AWS_REGION}" | \
        docker login --username AWS --password-stdin "${ECR_REGISTRY}"
    echo ""
fi

# Determine which services to push
if [ ${#SERVICES[@]} -eq 0 ]; then
    echo -e "${BLUE}📋 Detecting built images...${NC}"
    # Auto-detect built images
    for service in "${ALL_SERVICES[@]}"; do
        local_image="${LOCAL_REGISTRY}/${service}:${VERSION}"
        if [ "$service" = "ocrvs-base" ]; then
            local_image="${LOCAL_REGISTRY}/ocrvs-base:${VERSION}"
        fi

        if image_exists "${local_image}"; then
            SERVICES+=("$service")
        else
            # Check for :latest
            local_image="${LOCAL_REGISTRY}/${service}:latest"
            if [ "$service" = "ocrvs-base" ]; then
                local_image="${LOCAL_REGISTRY}/ocrvs-base:latest"
            fi
            if image_exists "${local_image}"; then
                SERVICES+=("$service")
            fi
        fi
    done

    if [ ${#SERVICES[@]} -eq 0 ]; then
        echo -e "${RED}❌ No built images found with registry '${LOCAL_REGISTRY}'${NC}"
        echo ""
        echo "Build images first with:"
        echo "  ./scripts/build-docker-compose.sh"
        exit 1
    fi
fi

echo -e "${BLUE}Services to push: ${SERVICES[*]}${NC}"
echo ""

# Push services
FAILED=()
SUCCESS=0

if [ "$PARALLEL" = true ] && [ "$DRY_RUN" = false ]; then
    echo -e "${YELLOW}🚀 Pushing images in parallel...${NC}"
    echo ""

    # Create temporary directory for status files
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf $TEMP_DIR" EXIT

    # Launch parallel pushes
    for service in "${SERVICES[@]}"; do
        (
            if push_service "$service"; then
                touch "$TEMP_DIR/${service}.success"
            else
                touch "$TEMP_DIR/${service}.failed"
            fi
        ) &
    done

    # Wait for all to complete
    wait

    # Check results
    for service in "${SERVICES[@]}"; do
        if [ -f "$TEMP_DIR/${service}.success" ]; then
            SUCCESS=$((SUCCESS + 1))
        else
            FAILED+=("$service")
        fi
    done
else
    # Sequential push
    for service in "${SERVICES[@]}"; do
        if push_service "$service"; then
            SUCCESS=$((SUCCESS + 1))
        else
            FAILED+=("$service")
        fi
        echo ""
    done
fi

# Summary
echo ""
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}📊 Push Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN - No images were actually pushed${NC}"
    echo "Would have pushed ${#SERVICES[@]} service(s)"
else
    echo -e "${GREEN}✅ Successfully pushed: ${SUCCESS}${NC}"

    if [ ${#FAILED[@]} -gt 0 ]; then
        echo -e "${RED}❌ Failed: ${#FAILED[@]}${NC}"
        echo -e "${RED}   Failed services: ${FAILED[*]}${NC}"
    fi
fi

echo ""
echo -e "${BLUE}💡 Verify with:${NC}"
echo "  $AWS_CLI ecr list-images --repository-name ${ECR_REPO_PREFIX}/gateway --region ${AWS_REGION}"
echo ""
echo -e "${BLUE}📦 ECR images:${NC}"
echo "  ${ECR_REGISTRY}/${ECR_REPO_PREFIX}/<service>:${VERSION}"

if [ ${#FAILED[@]} -gt 0 ]; then
    exit 1
fi
