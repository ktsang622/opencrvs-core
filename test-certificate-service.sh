#!/bin/bash
set -e

echo "=== Certificate Service Testing Helper ==="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

function print_section() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

function print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

function print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if .NET is installed
if ! command -v dotnet &> /dev/null; then
    print_error ".NET SDK not found. Install from https://dotnet.microsoft.com/download"
    exit 1
fi

print_success ".NET SDK found: $(dotnet --version)"

# Parse command
case "${1:-help}" in
    "standalone")
        print_section "Running Certificate Service Standalone"
        cd packages/toppan-certificate

        # Generate keys if they don't exist
        if [ ! -f keys/certificate-private-key.pem ]; then
            echo "Generating ECDSA keys..."
            mkdir -p keys
            openssl ecparam -name prime256v1 -genkey -noout -out keys/certificate-private-key.pem
            openssl ec -in keys/certificate-private-key.pem -pubout -out keys/certificate-public-key.pem
            print_success "Keys generated"
        fi

        export ASPNETCORE_URLS="http://localhost:5001"
        export CertificateService__TemplatesPath="$(pwd)/templates"
        export CertificateService__PdfSigningKeyPath="$(pwd)/keys/certificate-private-key.pem"
        export CertificateService__PdfVerificationKeyPath="$(pwd)/keys/certificate-public-key.pem"

        print_success "Starting on http://localhost:5001"
        dotnet run --project src/CertificateService.Api
        ;;

    "docker")
        print_section "Building and Starting Certificate Service via Docker"

        # Build the image
        echo "Building certificate-service image..."
        docker build -t toppan-crvs/certificate-service:latest packages/toppan-certificate/
        print_success "Image built"

        # Start with docker-compose
        echo "Starting services..."
        docker-compose -f docker-compose.certificate-service.yml up -d certificate-service
        print_success "Certificate service started on http://localhost:5001"

        echo ""
        echo "View logs with: docker logs -f certificate-service"
        echo "Stop with: docker-compose -f docker-compose.certificate-service.yml down"
        ;;

    "full-stack")
        print_section "Starting Full OpenCRVS Stack with Certificate Service"

        # Build certificate-service
        echo "Building certificate-service..."
        docker build -t toppan-crvs/certificate-service:demo-1.8.0 packages/toppan-certificate/

        # Start full stack
        echo "Starting OpenCRVS stack..."
        DOCKER_REGISTRY=toppan-crvs VERSION=demo-1.8.0 \
            docker-compose \
                -f docker-compose.deps.yml \
                -f docker-compose.certificate-service.yml \
                up -d

        print_success "Full stack started"
        echo ""
        echo "Services:"
        echo "  - Gateway: http://localhost:7070"
        echo "  - Client: http://localhost:3000"
        echo "  - Certificate Service: http://localhost:5001"
        echo "  - Countryconfig: http://localhost:3040"
        ;;

    "test")
        print_section "Testing Certificate Generation"

        # Check if service is running
        if ! curl -s http://localhost:5001/ping > /dev/null; then
            print_error "Certificate service not running on http://localhost:5001"
            echo "Start it with: $0 standalone"
            exit 1
        fi

        print_success "Certificate service is running"

        # Get auth token (you need to provide this)
        if [ -z "$AUTH_TOKEN" ]; then
            print_error "AUTH_TOKEN not set"
            echo "Get a token from OpenCRVS and run:"
            echo "  export AUTH_TOKEN='your-token'"
            echo "  $0 test"
            exit 1
        fi

        # Test certificate generation via gateway
        echo "Testing certificate generation..."
        COMPOSITION_ID="${2:-some-composition-id}"

        curl -X POST http://localhost:7070/certificate/generate \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $AUTH_TOKEN" \
            -d "{\"compositionId\": \"$COMPOSITION_ID\", \"eventType\": \"birth\"}" \
            --output test-certificate.pdf

        if [ -f test-certificate.pdf ]; then
            print_success "Certificate generated: test-certificate.pdf"
            echo "Open with: xdg-open test-certificate.pdf"
        else
            print_error "Certificate generation failed"
        fi
        ;;

    "health")
        print_section "Checking Service Health"

        echo "Checking certificate-service..."
        curl -s http://localhost:5001/ping || print_error "Certificate service not responding"

        echo ""
        echo "Checking gateway..."
        curl -s http://localhost:7070/ping || print_error "Gateway not responding"

        echo ""
        echo "Checking countryconfig..."
        curl -s http://localhost:3040/ping || print_error "Countryconfig not responding"

        echo ""
        echo "Checking certificate config endpoint..."
        curl -s http://localhost:3040/certificate-config | jq . || print_error "Certificate config not available"
        ;;

    "logs")
        print_section "Viewing Certificate Service Logs"

        if docker ps | grep -q certificate-service; then
            docker logs -f certificate-service
        else
            print_error "Certificate service container not running"
            echo "Start it with: $0 docker"
        fi
        ;;

    *)
        echo "Certificate Service Testing Helper"
        echo ""
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  standalone    - Run certificate-service locally with dotnet"
        echo "  docker        - Build and run via Docker"
        echo "  full-stack    - Start full OpenCRVS stack with certificate-service"
        echo "  test          - Test certificate generation (requires AUTH_TOKEN)"
        echo "  health        - Check health of all services"
        echo "  logs          - View certificate-service logs"
        echo ""
        echo "Examples:"
        echo "  $0 standalone              # Run locally"
        echo "  $0 docker                  # Run in Docker"
        echo "  $0 full-stack              # Full OpenCRVS stack"
        echo "  export AUTH_TOKEN='...'    # Set auth token"
        echo "  $0 test composition-id     # Test certificate generation"
        ;;
esac
