# OpenCRVS Docker Deployment Guide

This directory contains Docker configuration files and scripts for building and running OpenCRVS as containerized services with Toppan customizations.

## 🏗️ Architecture Overview

OpenCRVS uses a hybrid microservices architecture with optimized containerization and multi-repository coordination:

### Repository Structure
```
/home/ktsang/
├── opencrvs-core/          # Main OpenCRVS services (this repository)
├── opencrvs-countryconfig/  # Country-specific configuration
└── opensearch/             # PostgreSQL + OpenSearch for Toppan services
```

### Docker Compose Files Structure

The current setup uses **Toppan-customized compose files**:

1. **`toppan-deps.yml`** - External dependencies (MongoDB, Redis, ElasticSearch, etc.)
2. **`toppan-base.yml`** - Core OpenCRVS services with production configuration
3. **`toppan-override.yml`** - Development overrides (ports, volumes, environment)
4. **`toppan-build.yml`** - Build configuration for OpenCRVS core services
5. **`toppan-build-ext.yml`** - Build configuration for external services (countryconfig, opensearch)
6. **`toppan-seeder.yml`** - Data seeding configuration

### Container Architecture

**OpenCRVS Core Services (17 services):**
- Use shared base image (`ocrvs-base`) with pre-built commons/components
- Base image: ~3.5GB containing OpenCRVS foundations
- Each service: ~3.5GB (base + service-specific code)

**Toppan Services (Built in opencrvs-core):**
- `toppan` - Family tree backend service
- `toppan-service` - Family tree integration service
- `toppan-ui` - Family tree frontend interface

**External Services:**
- `countryconfig` - Country-specific configuration (separate repository)
- `opensearch` + `postgres` - Toppan family tree data (separate repository)
- `toppan-data-seeder` - Data initialization

### Service Tiers

**Tier 1: Core Infrastructure**
- `auth` - Authentication service (JWT, 2FA)
- `user-mgnt` - User and role management
- `config` - Application configuration

**Tier 2: Business Logic**
- `workflow` - Registration workflow management
- `events` - V2 event-driven architecture
- `documents` - File upload and storage
- `notification` - SMS/email notifications
- `search` - ElasticSearch integration
- `metrics` - Analytics and reporting

**Tier 3: API Gateway**
- `gateway` - GraphQL API gateway
- `webhooks` - External system integrations

**Tier 4: Frontend**
- `client` - Main React application (nginx)
- `login` - Authentication UI (nginx)

**Tier 5: Toppan Services**
- `toppan` - Family tree backend service
- `toppan-service` - Family tree integration service
- `toppan-ui` - Family tree frontend interface

**External Dependencies**
- `mongo1` - MongoDB database
- `redis` - Caching and sessions
- `elasticsearch` - Search and indexing
- `influxdb` - Time-series metrics
- `hearth` - FHIR server
- `minio` - Object storage

## 🚀 Quick Start

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 8GB+ RAM available
- 20GB+ disk space

### Complete Stack Deployment (Recommended)

```bash
# 1. Build all images (OpenCRVS + countryconfig + external services)
./scripts/build-docker-images.sh

# 2. Start complete stack with all dependencies
./scripts/start-complete-stack.sh
```

This script will:
- Build all required Docker images
- Start external services (PostgreSQL, OpenSearch) in `../opensearch`
- Start OpenCRVS core services
- Run data seeding automatically
- Perform health checks

### Manual Step-by-Step Deployment

```bash
# 1. Build OpenCRVS core images
./scripts/build-docker-images.sh

# 2. Start external dependencies in opensearch repository
cd ../opensearch
docker compose up -d postgres opensearch opensearch-dashboards pg_adminer
docker compose run --rm toppan-data-seeder  # Initialize data
cd ../opencrvs-core

# 3. Start OpenCRVS services
./scripts/start-docker.sh

# 4. Access applications
# Client: http://localhost:3000
# Login: http://localhost:3020
# Gateway: http://localhost:7070/graphql
# Config API: http://localhost:2021
# Country Config: http://localhost:3040
# Toppan UI: http://localhost:3889
```

### Production Mode

```bash
# Build with production settings
export VERSION=1.8.0
export REGISTRY=toppan-crvs
./scripts/build-docker-images.sh

# Start in production mode
./scripts/start-complete-stack.sh --mode production --version 1.8.0 --registry toppan-crvs
```

## 🔧 Scripts Reference

### Build Script: `scripts/build-docker-images.sh`

Builds all Docker images in proper dependency order.

```bash
# Basic usage - builds all images
./scripts/build-docker-images.sh

# Build specific services
./scripts/build-docker-images.sh gateway auth events

# Custom registry and version
VERSION=1.8.0 REGISTRY=myorg ./scripts/build-docker-images.sh

# Build with no cache
./scripts/build-docker-images.sh --no-cache

# Check build status
./scripts/build-docker-images.sh --status
```

**Build Architecture:**
1. **Base image** (`ocrvs-base`) - Contains OpenCRVS commons/components
2. **Core services** - Use shared base image (built in parallel)
3. **Toppan services** - toppan, toppan-service, toppan-ui (built in this repository)
4. **External services** - countryconfig, opensearch, toppan-data-seeder

### Start Complete Stack: `scripts/start-complete-stack.sh`

Orchestrates the entire multi-repository deployment.

```bash
# Development mode (default)
./scripts/start-complete-stack.sh

# Production mode
./scripts/start-complete-stack.sh --mode production

# Custom version and registry
./scripts/start-complete-stack.sh --version 1.8.0 --registry myorg

# Help
./scripts/start-complete-stack.sh --help
```

**What it does:**
1. Validates repository structure
2. Builds all required images
3. Starts external services (opensearch repository)
4. Starts OpenCRVS core services
5. Runs data seeding
6. Performs health checks

### Start Docker Services: `scripts/start-docker.sh`

Starts only OpenCRVS core services (assumes dependencies are running).

```bash
# Start all OpenCRVS services
./scripts/start-docker.sh

# Start only dependencies
./scripts/start-docker.sh --deps-only

# Start only services (requires deps running)
./scripts/start-docker.sh --services-only

# Custom configuration
./scripts/start-docker.sh --version 1.8.0 --registry myorg
```

### Other Scripts

```bash
# Stop complete stack
./scripts/stop-complete-stack.sh

# Stop only OpenCRVS services
./scripts/stop-docker.sh

# Clear all databases
./scripts/clear-db.sh

# Run data seeder
./scripts/run-toppan-seeder.sh
```

## 🐳 Docker Compose Usage

### Manual Docker Compose Commands

```bash
# Start complete development stack
docker compose -p opencrvs \
  -f toppan-deps.yml \
  -f toppan-base.yml \
  -f toppan-override.yml \
  up -d

# Start only dependencies
docker compose -p opencrvs -f toppan-deps.yml up -d

# Start only services (production mode)
export NODE_ENV=production
docker compose -p opencrvs -f toppan-base.yml up -d

# View logs
docker compose -p opencrvs logs -f gateway

# Stop everything
docker compose -p opencrvs \
  -f toppan-deps.yml \
  -f toppan-base.yml \
  -f toppan-override.yml \
  down
```

### Building Images

```bash
# Build all core services
docker compose -f toppan-build.yml build

# Build external services
docker compose -f toppan-build-ext.yml build

# Build specific service
docker compose -f toppan-build.yml build gateway

# Build with no cache
docker compose -f toppan-build.yml build --no-cache gateway
```

## 🔌 Port Mappings (Development)

| Service | Port | Description |
|---------|------|-------------|
| **Frontend** | | |
| client | 3000 | Main React application |
| login | 3020 | Authentication UI |
| **API Services** | | |
| gateway | 7070 | GraphQL API gateway |
| auth | 4040 | Authentication API |
| user-mgnt | 3030 | User management API |
| config | 2021 | Configuration API |
| countryconfig | 3040 | Country configuration |
| **Business Logic** | | |
| workflow | 5050 | Workflow management |
| events | 5555 | Event processing |
| documents | 9050 | Document upload |
| notification | 2020 | Notification service |
| search | 9090 | Search API |
| metrics | 1050 | Analytics API |
| webhooks | 2525 | Webhook management |
| **Dependencies** | | |
| mongo1 | 27017 | MongoDB |
| redis | 6379 | Redis cache |
| elasticsearch | 9200 | ElasticSearch |
| influxdb | 8086 | InfluxDB |
| minio | 3535 | MinIO object storage |
| **Toppan Services** | | |
| toppan | 9998 | Family tree backend |
| toppan-service | 7070 | Family tree integration (via gateway proxy) |
| toppan-ui | 3889 | Family tree frontend |
| **External Services** | | |
| postgres | 5432 | PostgreSQL (Toppan) |
| pg_adminer | 15432 | PostgreSQL Admin UI |
| opensearch | 19200 | OpenSearch (Toppan) |
| opensearch-dashboards | 5601 | OpenSearch UI |

## 🔧 Configuration

### Environment Variables

**Global:**
- `VERSION` - Service version (default: latest)
- `REGISTRY` - Docker registry prefix (default: toppan-crvs)
- `NODE_ENV` - Environment (development/production)
- `DOCKER_REGISTRY` - Same as REGISTRY

**Core Services:**
- `CERT_PUBLIC_KEY_PATH` - JWT public key path
- `CERT_PRIVATE_KEY_PATH` - JWT private key path
- `MONGO_URL` - MongoDB connection string
- `REDIS_HOST` - Redis hostname
- `FHIR_URL` - FHIR server URL

**Frontend Services (client, login):**
- `COUNTRY_CONFIG_URL_INTERNAL` - Internal URL for countryconfig service (http://countryconfig:3040)
- `GATEWAY_URL_INTERNAL` - Internal URL for gateway service (http://gateway:7070)
- `CONTENT_SECURITY_POLICY_WILDCARD` - CSP wildcard for localhost development

> **Note:** The `*_INTERNAL` variables are required for nginx proxy configuration in frontend containers. These enable proper service-to-service communication within the Docker network for API proxying (e.g., `/api/countryconfig/*` routes).

### Development Secrets

Development mode requires JWT key pair:

```bash
# Auto-generated by start scripts, or manually:
mkdir -p .secrets
openssl genrsa -out .secrets/private-key.pem 2048
openssl rsa -pubout -in .secrets/private-key.pem -out .secrets/public-key.pem
```

### External Services Configuration

**OpenSearch & PostgreSQL:**
- Configured in `../opensearch` repository
- Automatically started by `start-complete-stack.sh`
- Manual setup: `cd ../opensearch && docker compose up -d`

**Country Configuration:**
- Configured in `../opencrvs-countryconfig` repository
- Built automatically as part of the build process
- Accessible at http://localhost:3040

## 🏥 Health Checks & Monitoring

### Service Health

```bash
# Check service health endpoints
curl http://localhost:7070/ping  # Gateway
curl http://localhost:4040/ping  # Auth
curl http://localhost:3030/ping  # User-mgnt
curl http://localhost:2021/ping  # Config

# Check frontend services
curl http://localhost:3000/      # Client
curl http://localhost:3020/      # Login
```

### Container Monitoring

```bash
# View all container status
docker compose -p opencrvs ps

# View resource usage
docker stats

# View logs with timestamps
docker compose -p opencrvs logs -f --timestamps gateway

# Follow logs from multiple services
docker compose -p opencrvs logs -f gateway auth user-mgnt
```

### Database Access

```bash
# MongoDB shell
docker compose -p opencrvs exec mongo1 mongo

# Redis CLI
docker compose -p opencrvs exec redis redis-cli

# ElasticSearch health
curl http://localhost:9200/_cluster/health

# PostgreSQL (in opensearch repository)
cd ../opensearch
docker compose exec postgres psql -U postgres
```

## 🚨 Troubleshooting

### Common Issues

**Port Conflicts:**
```bash
# Check what's using a port
lsof -i :3000
sudo netstat -tulpn | grep 3000

# Change ports in toppan-override.yml
```

**Out of Memory:**
```bash
# Increase Docker memory limit to 8GB+
# Check container resource usage
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"
```

**Service Won't Start:**
```bash
# Check service logs
docker compose -p opencrvs logs gateway

# Check dependencies
docker compose -p opencrvs ps

# Restart services in dependency order
docker compose -p opencrvs restart mongo1 redis elasticsearch
docker compose -p opencrvs restart auth user-mgnt config
docker compose -p opencrvs restart gateway
```

**Build Failures:**
```bash
# Clean build with no cache
./scripts/build-docker-images.sh --no-cache

# Check build status
./scripts/build-docker-images.sh --status

# Check Docker space
docker system df
docker system prune  # Clean up unused resources
```

**CORS and 502 Proxy Errors:**
```bash
# Check if internal URLs are properly set in frontend containers
docker exec opencrvs-client env | grep -E "(COUNTRY_CONFIG_URL_INTERNAL|GATEWAY_URL_INTERNAL)"
docker exec opencrvs-login env | grep -E "(COUNTRY_CONFIG_URL_INTERNAL|GATEWAY_URL_INTERNAL)"

# Verify nginx proxy configuration
docker exec opencrvs-client grep -n 'proxy_pass' /etc/nginx/conf.d/default.conf

# Test internal service connectivity
docker exec opencrvs-client curl -sI http://countryconfig:3040/client-config.js
docker exec opencrvs-client curl -sI http://gateway:7070/ping

# Check if services are accessible from host
curl -sI http://localhost:3040/client-config.js  # Direct countryconfig
curl -sI http://localhost:3000/api/countryconfig/client-config.js  # Through nginx proxy
```

**CORS Troubleshooting:**
- If you see 502 errors on `/api/countryconfig/*` endpoints, ensure `COUNTRY_CONFIG_URL_INTERNAL` and `GATEWAY_URL_INTERNAL` are set in frontend services
- Clear browser cache after fixing CORS configuration
- Check browser console for specific CORS error messages
- Verify countryconfig service CORS whitelist includes `http://localhost:3000` and `http://localhost:3020`

**Multi-Repository Issues:**
```bash
# Verify all repositories are present
ls -la ../opensearch
ls -la ../opencrvs-countryconfig

# Check if external services are running
cd ../opensearch && docker compose ps

# Restart external services
cd ../opensearch && docker compose restart postgres opensearch
```

### Log Analysis

```bash
# Search logs for errors across all services
docker compose -p opencrvs logs | grep -i error

# Export logs for analysis
docker compose -p opencrvs logs > opencrvs.log

# Follow specific service logs
docker compose -p opencrvs logs -f --tail=100 gateway

# Filter logs by timestamp
docker compose -p opencrvs logs --since="2023-01-01T00:00:00" gateway
```

## 🔄 Development Workflow

### Making Changes

1. **Code Changes:** Edit source code in appropriate service
2. **Rebuild:** `./scripts/build-docker-images.sh [service-name]`
3. **Restart:** `docker compose -p opencrvs restart [service-name]`
4. **Test:** Verify changes work as expected

### Database Management

```bash
# Clear all databases and restart fresh
./scripts/clear-db.sh
./scripts/start-complete-stack.sh

# Run only data seeding
./scripts/run-toppan-seeder.sh

# Backup databases
docker exec opencrvs-mongo1 mongodump --out /backup
cd ../opensearch && docker exec postgres pg_dump -U postgres > backup.sql
```

### Container Management

```bash
# Recreate containers with new configuration
docker compose -p opencrvs \
  -f toppan-deps.yml \
  -f toppan-base.yml \
  -f toppan-override.yml \
  up -d --force-recreate

# Recreate only specific services
docker compose -p opencrvs up -d --force-recreate client login

# Execute commands in containers
docker compose -p opencrvs exec gateway bash
docker compose -p opencrvs exec mongo1 mongo
```

## 🔐 Security Considerations

### Production Deployment

1. **Use Docker secrets instead of volume mounts**
2. **Enable TLS termination at load balancer**
3. **Use private Docker registry**
4. **Implement network policies**
5. **Regular security updates**

```yaml
# Production secrets example
secrets:
  public_key:
    external: true
  private_key:
    external: true

services:
  auth:
    secrets:
      - public_key
      - private_key
    environment:
      - CERT_PUBLIC_KEY_PATH=/run/secrets/public_key
      - CERT_PRIVATE_KEY_PATH=/run/secrets/private_key
```

### Network Security

```yaml
# Custom network with isolation
networks:
  opencrvs_internal:
    driver: bridge
    internal: true
  opencrvs_external:
    driver: bridge

services:
  gateway:
    networks:
      - opencrvs_external
      - opencrvs_internal
  auth:
    networks:
      - opencrvs_internal
```

## 📚 Additional Resources

- [OpenCRVS Documentation](https://documentation.opencrvs.org)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Container Security Best Practices](https://docs.docker.com/develop/security-best-practices/)
- [OpenCRVS Architecture Guide](https://github.com/opencrvs/opencrvs-core/tree/develop/docs)

## 🔄 Migration from Standard OpenCRVS

If migrating from standard OpenCRVS Docker setup:

1. **File Mapping:** `docker-compose.*.yml` → `toppan-*.yml`
2. **Scripts:** Use new scripts in `scripts/` directory
3. **Multi-repo:** Set up `../opensearch` and `../opencrvs-countryconfig`
4. **Environment:** Update environment variables for nginx proxy
5. **Commands:** Use `-p opencrvs` project name in docker compose commands