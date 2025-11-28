#!/bin/bash
# Cloud Deployment Script for OpenCRVS
# Deploys OpenCRVS stack using ECR images
#
# Usage:
#   ./scripts/deploy-cloud.sh [OPTIONS]
#
# Options:
#   --infra-only    Only start infrastructure services
#   --app-only      Only start application services (assumes infra running)
#   --pull          Pull latest images before starting
#   --down          Stop all services
#   --logs          Show logs
#   --status        Show service status

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# AWS Configuration
AWS_REGION="${AWS_REGION:-ap-east-1}"
AWS_ACCOUNT="${AWS_ACCOUNT:-695491315778}"
ECR_REGISTRY="${ECR_REGISTRY:-${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com}"

# Compose files
INFRA_COMPOSE="docker-compose.infra.yml"
CLOUD_COMPOSE="docker-compose.cloud.yml"

# AWS CLI path
AWS_CLI="${HOME}/.local/bin/aws"
if [ ! -f "$AWS_CLI" ]; then
    AWS_CLI="aws"
fi

# Parse arguments
ACTION="up"
INFRA_ONLY=false
APP_ONLY=false
PULL_IMAGES=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --infra-only)
            INFRA_ONLY=true
            shift
            ;;
        --app-only)
            APP_ONLY=true
            shift
            ;;
        --pull)
            PULL_IMAGES=true
            shift
            ;;
        --down)
            ACTION="down"
            shift
            ;;
        --logs)
            ACTION="logs"
            shift
            ;;
        --status)
            ACTION="status"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Deploy OpenCRVS to cloud using ECR images"
            echo ""
            echo "Options:"
            echo "  --infra-only    Only start infrastructure services"
            echo "  --app-only      Only start application services"
            echo "  --pull          Pull latest images before starting"
            echo "  --down          Stop all services"
            echo "  --logs          Show service logs"
            echo "  --status        Show service status"
            echo "  --help          Show this help"
            echo ""
            echo "Environment variables:"
            echo "  AWS_REGION      AWS region (default: ap-east-1)"
            echo "  AWS_ACCOUNT     AWS account ID (default: 695491315778)"
            echo "  VERSION         Image version tag (default: demo-1.8.0)"
            echo ""
            echo "Examples:"
            echo "  $0                      # Start all services"
            echo "  $0 --infra-only         # Start only infrastructure"
            echo "  $0 --app-only --pull    # Pull and start only apps"
            echo "  $0 --down               # Stop all services"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Function to login to ECR
ecr_login() {
    echo -e "${YELLOW}🔐 Logging into AWS ECR...${NC}"
    $AWS_CLI ecr get-login-password --region "${AWS_REGION}" | \
        docker login --username AWS --password-stdin "${ECR_REGISTRY}"
    echo -e "${GREEN}✅ ECR login successful${NC}"
    echo ""
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker not found${NC}"
        exit 1
    fi

    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        echo -e "${RED}❌ Docker Compose not found${NC}"
        exit 1
    fi

    # Check compose files
    if [ ! -f "$INFRA_COMPOSE" ]; then
        echo -e "${RED}❌ Missing $INFRA_COMPOSE${NC}"
        exit 1
    fi

    if [ ! -f "$CLOUD_COMPOSE" ]; then
        echo -e "${RED}❌ Missing $CLOUD_COMPOSE${NC}"
        exit 1
    fi

    # Check secrets directory
    if [ ! -d "secrets" ]; then
        echo -e "${YELLOW}⚠️  Creating secrets directory...${NC}"
        mkdir -p secrets

        # Generate keys if they don't exist
        if [ ! -f "secrets/private-key.pem" ]; then
            echo -e "${YELLOW}⚠️  Generating JWT keys...${NC}"
            openssl genrsa -out secrets/private-key.pem 2048
            openssl rsa -in secrets/private-key.pem -pubout -out secrets/public-key.pem
            echo -e "${GREEN}✅ JWT keys generated${NC}"
        fi
    fi

    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
    echo ""
}

# Function to start infrastructure
start_infrastructure() {
    echo -e "${YELLOW}🚀 Starting infrastructure services...${NC}"
    docker compose -f "$INFRA_COMPOSE" up -d

    echo ""
    echo -e "${BLUE}⏳ Waiting for infrastructure to be healthy...${NC}"

    # Wait for MongoDB
    echo -n "  MongoDB: "
    for i in {1..30}; do
        if docker compose -f "$INFRA_COMPOSE" exec -T mongo1 mongo --eval "db.runCommand('ping')" &>/dev/null; then
            echo -e "${GREEN}ready${NC}"
            break
        fi
        sleep 2
        echo -n "."
    done

    # Wait for Redis
    echo -n "  Redis: "
    for i in {1..30}; do
        if docker compose -f "$INFRA_COMPOSE" exec -T redis redis-cli ping &>/dev/null; then
            echo -e "${GREEN}ready${NC}"
            break
        fi
        sleep 2
        echo -n "."
    done

    # Wait for OpenSearch
    echo -n "  OpenSearch: "
    for i in {1..60}; do
        if curl -s http://localhost:9200/_cluster/health &>/dev/null; then
            echo -e "${GREEN}ready${NC}"
            break
        fi
        sleep 2
        echo -n "."
    done

    # Wait for PostgreSQL
    echo -n "  PostgreSQL: "
    for i in {1..30}; do
        if docker compose -f "$INFRA_COMPOSE" exec -T postgres pg_isready &>/dev/null; then
            echo -e "${GREEN}ready${NC}"
            break
        fi
        sleep 2
        echo -n "."
    done

    echo ""
    echo -e "${GREEN}✅ Infrastructure services started${NC}"
}

# Function to start application services
start_applications() {
    echo -e "${YELLOW}🚀 Starting application services...${NC}"

    if [ "$PULL_IMAGES" = true ]; then
        echo -e "${BLUE}📥 Pulling latest images...${NC}"
        docker compose -f "$INFRA_COMPOSE" -f "$CLOUD_COMPOSE" pull
        echo ""
    fi

    docker compose -f "$INFRA_COMPOSE" -f "$CLOUD_COMPOSE" up -d

    echo ""
    echo -e "${GREEN}✅ Application services started${NC}"
}

# Function to stop all services
stop_services() {
    echo -e "${YELLOW}🛑 Stopping all services...${NC}"
    docker compose -f "$INFRA_COMPOSE" -f "$CLOUD_COMPOSE" down
    echo -e "${GREEN}✅ All services stopped${NC}"
}

# Function to show logs
show_logs() {
    docker compose -f "$INFRA_COMPOSE" -f "$CLOUD_COMPOSE" logs -f --tail=100
}

# Function to show status
show_status() {
    echo -e "${BLUE}📊 Service Status${NC}"
    echo ""
    docker compose -f "$INFRA_COMPOSE" -f "$CLOUD_COMPOSE" ps
    echo ""

    echo -e "${BLUE}🔗 Service URLs${NC}"
    echo "  Client:       http://localhost:3000"
    echo "  Login:        http://localhost:3020"
    echo "  Gateway:      http://localhost:7070"
    echo "  Toppan UI:    http://localhost:3889"
    echo "  MinIO Console: http://localhost:9001"
    echo ""
}

# Main execution
echo ""
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}   OpenCRVS Cloud Deployment${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""

case $ACTION in
    up)
        check_prerequisites
        ecr_login

        if [ "$INFRA_ONLY" = true ]; then
            start_infrastructure
        elif [ "$APP_ONLY" = true ]; then
            start_applications
        else
            start_infrastructure
            echo ""
            start_applications
        fi

        echo ""
        show_status
        ;;
    down)
        stop_services
        ;;
    logs)
        show_logs
        ;;
    status)
        show_status
        ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"
