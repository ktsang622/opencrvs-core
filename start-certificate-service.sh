#!/bin/bash
# Quick script to start certificate-service in the background
# Useful for testing without starting the full OpenCRVS stack

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

echo "=== Starting Certificate Service ==="
echo ""

# Stop and remove existing container if it exists
if docker ps -a --format '{{.Names}}' | grep -q '^certificate-service$'; then
  echo "Stopping and removing existing certificate-service container..."
  docker stop certificate-service > /dev/null 2>&1 || true
  docker rm certificate-service > /dev/null 2>&1 || true
  echo ""
fi

# Check if countryconfig is running
if ! curl -s http://localhost:3040/ping > /dev/null 2>&1; then
  echo "⚠️  Warning: Countryconfig not detected on port 3040"
  echo "Certificate-service will start but may not load templates via HTTP"
  echo ""
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted. Start countryconfig first with: yarn dev-atg --only-services"
    exit 1
  fi
fi

# Start certificate-service using docker-compose
echo "Starting certificate-service on http://localhost:3890..."
docker compose -p opencrvs-atg -f "$SCRIPT_DIR/docker-compose.certificate-service.yml" up -d certificate-service

echo ""
echo "✅ Certificate-service started!"
echo ""
echo "Check status:"
echo "  docker logs -f certificate-service"
echo ""
echo "Test health:"
echo "  curl http://localhost:3890/ping"
echo ""
echo "View Swagger:"
echo "  open http://localhost:3890/swagger"
echo ""
echo "Stop:"
echo "  docker stop certificate-service"
echo ""
