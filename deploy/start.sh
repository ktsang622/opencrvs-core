#!/bin/bash
# OpenCRVS/ToppanCRVS Cloud Deployment Script
#
# Usage:
#   ./start.sh              # Start default (toppan) country
#   ./start.sh atg          # Start ATG country
#   ./start.sh mdv          # Start MDV country
#   ./start.sh --stop       # Stop all services
#   ./start.sh --proxy      # Start proxy only (run once)
#
# Environment variables:
#   VERSION     - Docker image version (default: demo-1.8.0)
#   DOMAIN      - Base domain (default: opencrvs.ktsang.com)
#   ECR_REGISTRY - ECR registry URL

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Default values
VERSION="${VERSION:-demo-1.8.0}"
DOMAIN="${DOMAIN:-opencrvs.ktsang.com}"
ECR_REGISTRY="${ECR_REGISTRY:-695491315778.dkr.ecr.ap-east-1.amazonaws.com/toppancrvs}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create data directories for a country
create_data_dirs() {
    local suffix="$1"
    local data_dir="data${suffix}"

    log_info "Creating data directories: $data_dir"
    mkdir -p "$data_dir/mongo"
    mkdir -p "$data_dir/redis"
    mkdir -p "$data_dir/opensearch"
    mkdir -p "$data_dir/postgres"
    mkdir -p "$data_dir/influxdb"
    mkdir -p "$data_dir/minio"
    mkdir -p "$data_dir/dashboards"
}

# Start proxy (run once)
start_proxy() {
    log_info "Starting Traefik proxy..."
    mkdir -p traefik/letsencrypt
    docker compose -f docker-compose.proxy.yml up -d
    log_info "Proxy started. Dashboard: http://localhost:8080"
}

# Stop proxy
stop_proxy() {
    log_info "Stopping Traefik proxy..."
    docker compose -f docker-compose.proxy.yml down
}

# Start infrastructure services
start_infra() {
    local country="$1"
    local suffix=""
    [[ -n "$country" ]] && suffix="-$country"

    export COUNTRY="$country"
    export VERSION
    export DOMAIN
    export ECR_REGISTRY

    create_data_dirs "$suffix"

    log_info "Starting infrastructure services (country: ${country:-default})..."
    docker compose -f docker-compose.infra.yml up -d

    log_info "Waiting for infrastructure to be healthy..."
    sleep 10
}

# Start application services
start_cloud() {
    local country="$1"

    export COUNTRY="$country"
    export VERSION
    export DOMAIN
    export ECR_REGISTRY

    log_info "Starting application services (country: ${country:-default})..."
    docker compose -f docker-compose.cloud.yml up -d
}

# Stop all services
stop_all() {
    log_info "Stopping all services..."
    docker compose -f docker-compose.cloud.yml down 2>/dev/null || true
    docker compose -f docker-compose.infra.yml down 2>/dev/null || true
    log_info "All services stopped. Proxy still running (use --stop-proxy to stop)."
}

# Show status
show_status() {
    log_info "Service status:"
    docker compose -f docker-compose.proxy.yml ps 2>/dev/null || true
    docker compose -f docker-compose.infra.yml ps 2>/dev/null || true
    docker compose -f docker-compose.cloud.yml ps 2>/dev/null || true
}

# Main
case "$1" in
    --stop)
        stop_all
        ;;
    --stop-proxy)
        stop_proxy
        ;;
    --proxy)
        start_proxy
        ;;
    --status)
        show_status
        ;;
    --help|-h)
        echo "Usage: $0 [country|option]"
        echo ""
        echo "Countries:"
        echo "  (empty)     Start default (toppan) country"
        echo "  atg         Start ATG country"
        echo "  mdv         Start MDV country"
        echo ""
        echo "Options:"
        echo "  --proxy     Start proxy only (run once)"
        echo "  --stop      Stop infra and cloud services"
        echo "  --stop-proxy Stop proxy"
        echo "  --status    Show service status"
        echo "  --help      Show this help"
        ;;
    *)
        COUNTRY="$1"
        start_infra "$COUNTRY"
        start_cloud "$COUNTRY"
        log_info "Deployment complete!"
        log_info "URLs:"
        log_info "  - Register: https://register.${DOMAIN}"
        log_info "  - Login: https://login.${DOMAIN}"
        log_info "  - Gateway: https://gateway.${DOMAIN}"
        log_info "  - Dashboard: https://dashboard.${DOMAIN}"
        ;;
esac
