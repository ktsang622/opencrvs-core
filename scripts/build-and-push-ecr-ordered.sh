#!/bin/bash
# Build all OpenCRVS images in dependency order and push to AWS ECR
# Usage: ./build-and-push-ecr-ordered.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# AWS CLI path
AWS_CLI="${HOME}/.local/bin/aws"
if [ ! -f "$AWS_CLI" ]; then
    AWS_CLI="aws"
fi

# AWS Configuration
AWS_REGION="ap-east-1"
AWS_ACCOUNT="695491315778"
ECR_REGISTRY="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Version and registry settings
VERSION=${VERSION:-"demo-1.8.0"}
LOCAL_REGISTRY="toppan-crvs"

echo -e "${BLUE}🚀 ToppanCRVS Dependency-Ordered Build and Push to ECR${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"
echo -e "${BLUE}ECR Registry: ${ECR_REGISTRY}${NC}"
echo ""

# Function to build and push a service
build_and_push() {
    local service=$1
    local tier=$2

    echo -e "${YELLOW}[Tier ${tier}] Building ${service}...${NC}"

    # Build using docker-compose
    DOCKER_REGISTRY=${LOCAL_REGISTRY} VERSION=${VERSION} \
        ./scripts/build-docker-compose.sh ${service}

    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to build ${service}${NC}"
        return 1
    fi

    # Tag for ECR
    LOCAL_IMAGE="${LOCAL_REGISTRY}/${service}:${VERSION}"
    ECR_IMAGE="${ECR_REGISTRY}/toppancrvs/${service}:${VERSION}"
    ECR_IMAGE_LATEST="${ECR_REGISTRY}/toppancrvs/${service}:latest"

    docker tag ${LOCAL_IMAGE} ${ECR_IMAGE}
    docker tag ${LOCAL_IMAGE} ${ECR_IMAGE_LATEST}

    # Push to ECR
    echo "  Pushing ${service}:${VERSION}..."
    docker push ${ECR_IMAGE} > /dev/null
    docker push ${ECR_IMAGE_LATEST} > /dev/null

    echo -e "${GREEN}✅ ${service} built and pushed${NC}"
    echo ""
}

# Step 1: Login to ECR
echo -e "${YELLOW}Step 1: Logging into AWS ECR...${NC}"
$AWS_CLI ecr get-login-password --region ${AWS_REGION} | \
    docker login --username AWS --password-stdin ${ECR_REGISTRY}
echo ""

# Step 2: Build and push base image
echo -e "${YELLOW}Step 2: Building base image...${NC}"
build_and_push "base" "0"

# Step 3: Build services in dependency order
echo -e "${YELLOW}Step 3: Building services in dependency order...${NC}"
echo ""

# Tier 1: No dependencies (except base)
echo -e "${BLUE}=== Tier 1: Foundation Services ===${NC}"
build_and_push "config" "1"

# Tier 2: Depends on Tier 1
echo -e "${BLUE}=== Tier 2: Auth & Notification ===${NC}"
build_and_push "auth" "2"
build_and_push "notification" "2"

# Tier 3: Depends on Tier 2
echo -e "${BLUE}=== Tier 3: User Management & Documents ===${NC}"
build_and_push "user-mgnt" "3"
build_and_push "documents" "3"
build_and_push "webhooks" "3"

# Tier 4: Depends on Tier 3
echo -e "${BLUE}=== Tier 4: Data Services ===${NC}"
build_and_push "search" "4"
build_and_push "metrics" "4"
build_and_push "workflow" "4"

# Tier 5: Depends on Tier 4
echo -e "${BLUE}=== Tier 5: Gateway & Events ===${NC}"
build_and_push "gateway" "5"
build_and_push "events" "5"

# Tier 6: Support services
echo -e "${BLUE}=== Tier 6: Support Services ===${NC}"
build_and_push "migration" "6"
build_and_push "data-seeder" "6"
build_and_push "scheduler" "6"
build_and_push "dashboards" "6"

# Tier 7: Frontend services
echo -e "${BLUE}=== Tier 7: Frontend Applications ===${NC}"
build_and_push "client" "7"
build_and_push "login" "7"

# Tier 8: Toppan services (standalone - don't depend on base)
echo -e "${BLUE}=== Tier 8: Toppan Services ===${NC}"
build_and_push "toppan-service" "8"
build_and_push "toppan" "8"
build_and_push "toppan-ui" "8"

# Tier 9: External services (from sibling directories)
echo -e "${BLUE}=== Tier 9: External Services ===${NC}"
build_and_push "countryconfig" "9"
build_and_push "countryconfig-atg" "9"

echo ""
echo -e "${GREEN}🎉 All services built and pushed in dependency order!${NC}"
echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo "Base image: ${ECR_REGISTRY}/toppancrvs/ocrvs-base:${VERSION}"
echo "23 services pushed to ECR"
echo ""
echo -e "${BLUE}💡 Next steps:${NC}"
echo "1. Verify: aws ecr list-images --repository-name toppancrvs/gateway --region ${AWS_REGION}"
echo "2. Deploy using docker-compose with ECR images"
