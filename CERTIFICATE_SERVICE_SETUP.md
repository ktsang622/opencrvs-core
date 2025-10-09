# Certificate Service Setup Guide

## Overview

The certificate-service is a .NET application that runs separately from the Node.js services. Here's how to integrate it into your development workflow.

## Option 1: Add to Docker Compose (Recommended)

### 1. Update `docker-compose.dev-deps.yml`

Add certificate-service to the dependencies file:

```yaml
# Add to docker-compose.dev-deps.yml
services:
  certificate-service:
    build:
      context: ./packages/toppan-certificate
      dockerfile: Dockerfile
    image: ${DOCKER_REGISTRY:-opencrvs}/certificate-service:${VERSION:-latest}
    container_name: certificate-service
    restart: unless-stopped
    ports:
      - '5001:5000'
    environment:
      - ASPNETCORE_URLS=http://+:5000
      - CertificateService__TemplatesUrl=http://countryconfig:3040/certificates/toppan
      - CertificateService__TemplatesPath=/app/templates
      - CertificateService__PdfSigningKeyPath=/app/keys/certificate-private-key.pem
      - CertificateService__PdfVerificationKeyPath=/app/keys/certificate-public-key.pem
    volumes:
      # Mount templates for hot-reload during development
      - ./packages/toppan-certificate/templates:/app/templates:ro
      - ./packages/toppan-certificate/keys:/app/keys:ro
```

### 2. Update Gateway Environment

Ensure gateway knows about certificate-service:

```yaml
# In docker-compose.dev-deps.yml, update gateway service
gateway:
  environment:
    - CERTIFICATE_SERVICE_URL=http://certificate-service:5000
```

### 3. Start Everything Together

```bash
# Start all dependencies including certificate-service
yarn compose:deps:detached

# Then start OpenCRVS services
yarn start
```

## Option 2: Run Certificate Service Standalone

For quicker development of just the certificate service:

```bash
# Terminal 1: Run certificate-service
cd packages/toppan-certificate
export ASPNETCORE_URLS="http://localhost:5001"
export CertificateService__TemplatesPath="$(pwd)/templates"
export CertificateService__PdfSigningKeyPath="$(pwd)/keys/certificate-private-key.pem"
dotnet run --project src/CertificateService.Api

# Terminal 2: Run OpenCRVS normally
yarn dev
```

Update gateway environment to point to localhost:
```bash
export CERTIFICATE_SERVICE_URL=http://localhost:5001
```

## Option 3: Using the Test Script

Use the provided test script for various scenarios:

```bash
# Run standalone (development mode)
./test-certificate-service.sh standalone

# Run with Docker (production-like)
./test-certificate-service.sh docker

# Full stack including OpenCRVS
./test-certificate-service.sh full-stack

# Check health
./test-certificate-service.sh health

# View logs
./test-certificate-service.sh logs
```

## Verifying Setup

### 1. Check Certificate Service is Running

```bash
curl http://localhost:5001/ping
# Should return: "Healthy"
```

### 2. Check Swagger Documentation

Open http://localhost:5001/swagger in your browser

### 3. Test Certificate Generation

```bash
# Get auth token from OpenCRVS
export AUTH_TOKEN="your-token-here"

# Generate a test certificate
curl -X POST http://localhost:7070/certificate/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"compositionId": "some-id", "eventType": "birth"}' \
  --output test.pdf
```

### 4. Check Template Loading

Certificate service logs should show:
```
=== Preloading Certificate Templates ===
✅ All templates loaded successfully (3/3)
   Cache: 3 items, 45,123 bytes
   Duration: 234ms
========================================
```

## Architecture Flow

```
Client (Browser)
  ↓ POST /certificate/generate
Gateway (Node.js) - http://localhost:7070
  ↓ Fetch config
Countryconfig (Node.js) - http://localhost:3040
  ↓ GET /certificate-config
Gateway
  ↓ POST /api/certificates/generate
Certificate Service (.NET) - http://localhost:5001
  ├─ Load templates via HTTP from countryconfig
  └─ Generate PDF with digital signature
```

## Troubleshooting

### Certificate Service Not Starting

**Problem**: Service fails to start
**Solution**: Check if port 5001 is available
```bash
sudo lsof -i :5001
# Kill any process using the port
```

### Templates Not Loading

**Problem**: "Failed to load template layout file"
**Solution**:
1. Check TemplatesUrl is correct: `http://countryconfig:3040/certificates/toppan`
2. Ensure countryconfig is running
3. Check countryconfig has the template endpoint registered

**Fallback**: Set TemplatesUrl to null to use filesystem only
```bash
export CertificateService__TemplatesUrl=""
```

### Keys Missing

**Problem**: "Signing key not found"
**Solution**: Generate ECDSA keys
```bash
cd packages/toppan-certificate/keys
openssl ecparam -name prime256v1 -genkey -noout -out certificate-private-key.pem
openssl ec -in certificate-private-key.pem -pubout -out certificate-public-key.pem
```

### Docker Build Fails

**Problem**: SkiaSharp dependencies missing
**Solution**: Rebuild with --no-cache
```bash
docker build --no-cache -t opencrvs/certificate-service:latest packages/toppan-certificate/
```

### Gateway Cannot Connect

**Problem**: Gateway says "Certificate service unavailable"
**Solution**:
1. If using Docker: Use service name `http://certificate-service:5000`
2. If standalone: Use `http://localhost:5001` or `http://host.docker.internal:5001`

## Development Workflow

### Quick Development Cycle

```bash
# 1. Start dependencies (databases, Redis, etc.)
yarn compose:deps:detached

# 2. Start certificate-service in watch mode
cd packages/toppan-certificate
dotnet watch run --project src/CertificateService.Api

# 3. Start OpenCRVS services
yarn start

# 4. Test changes
curl http://localhost:5001/swagger
```

### Making Template Changes

Templates are hot-reloaded if mounted as volumes:

1. Edit template in `packages/toppan-certificate/templates/antigua-birth-v1/`
2. Certificate service will reload automatically
3. Test with: `./test-certificate-service.sh test`

### Making Code Changes

For .NET code changes:

```bash
# If running standalone
dotnet watch run --project src/CertificateService.Api
# Changes auto-reload

# If running in Docker
docker-compose -f docker-compose.certificate-service.yml up --build
# Rebuilds on restart
```

## Recommendation

For **active development**: Use **Option 2** (standalone)
- Faster iteration
- Direct access to logs
- Easier debugging
- Hot reload with `dotnet watch`

For **integration testing**: Use **Option 1** (docker-compose)
- Production-like environment
- All services networked together
- Consistent with other OpenCRVS services

For **quick testing**: Use **Option 3** (test script)
- Convenient commands
- Health checks built-in
- Easy switching between modes
