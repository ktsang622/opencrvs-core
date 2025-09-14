# OpenCRVS Docker Deployment Guide

This directory contains Docker configuration files and scripts for building and running OpenCRVS as containerized services.

## 🏗️ Architecture Overview

OpenCRVS uses a hybrid microservices architecture with optimized containerization:

### Container Architecture

**OpenCRVS Core Services (17 services):**
- Use shared base image with pre-built commons/components for efficiency
- Base image: `ocrvs-base` (~3.5GB) containing OpenCRVS foundations

**Toppan Custom Services (3 services):**
- Use standalone Node.js images for independence and efficiency
- Smaller images (1-2GB each) with only required dependencies

### Docker Compose Files Structure

1. **`docker-compose.deps.yml`** - External dependencies (databases, cache, etc.)
2. **`docker-compose.base.yml`** - Core OpenCRVS services with production configuration
3. **`docker-compose.override.yml`** - Development overrides (ports, volumes, environment)

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
- `client` - Main React application
- `login` - Authentication UI

**Tier 5: Custom Extensions (Standalone)**
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

**External Services (Separate Repositories)**
- `countryconfig` - Country-specific configuration (`../opencrvs-countryconfig`)
- `postgres` - PostgreSQL database for Toppan services (`../opensearch`)
- `opensearch` - OpenSearch for Toppan family tree search (`../opensearch`)
- `toppan-data-seeder` - Initial data seeding with automatic init scripts

## 🚀 Quick Start

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 8GB+ RAM available
- 20GB+ disk space

### Development Mode (Complete Stack)

**Option 1: Single Command (Recommended)**
```bash
# 1. Build all images (OpenCRVS + countryconfig)
./scripts/build-docker-images.sh

# 2. Start complete stack with health checks
./scripts/start-complete-stack.sh
```

**Option 2: Manual Step-by-Step**
```bash
# 1. Build all OpenCRVS core images (including countryconfig automatically)
./scripts/build-docker-images.sh

# 2. Start PostgreSQL + OpenSearch for Toppan services
cd ../opensearch
docker compose up -d postgres opensearch opensearch-dashboards pg_adminer
# Run data seeder once to initialize OpenSearch
docker compose run --rm toppan-data-seeder
cd ../opencrvs-core

# 3. Start OpenCRVS core services
./scripts/start-docker.sh
```

# 5. Access applications
# Client: http://localhost:3000
# Login: http://localhost:3020
# Gateway: http://localhost:7070/graphql
# Toppan UI: http://localhost:3889
# OpenSearch: http://localhost:19200
# OpenSearch Dashboards: http://localhost:5601
```

### Production Mode

```bash
# 1. Build with production settings (includes countryconfig automatically)
VERSION=1.8.0 REGISTRY=myregistry ./scripts/build-docker-images.sh

# 2. Start external services (PostgreSQL + OpenSearch)
cd ../opensearch
VERSION=1.8.0 docker compose up -d postgres opensearch opensearch-dashboards pg_adminer
# Run data seeder once to initialize OpenSearch
docker compose run --rm toppan-data-seeder
cd ../opencrvs-core

# 4. Start in production mode
./scripts/start-docker.sh --mode production --version 1.8.0 --registry myregistry
```

## 🏗️ Complete Multi-Repository Deployment

OpenCRVS requires coordination between multiple repositories:

### Repository Structure
```
/home/ktsang/
├── opencrvs-core/          # Main OpenCRVS services
├── opencrvs-countryconfig/  # Country-specific configuration
└── opensearch/             # PostgreSQL + OpenSearch for Toppan
```

### Deployment Order
1. **External Infrastructure** (`../opensearch`)
2. **Country Configuration** (`../opencrvs-countryconfig`)
3. **OpenCRVS Core** (`./opencrvs-core`)

## 🔧 Scripts Reference

### Build Script: `scripts/build-docker-images.sh`

Builds all Docker images in proper dependency order.

```bash
# Basic usage
./scripts/build-docker-images.sh

# Custom registry and version
VERSION=1.8.0 REGISTRY=myorg ./scripts/build-docker-images.sh

# Different base branch
BRANCH=main ./scripts/build-docker-images.sh
```

**Environment Variables:**
- `VERSION` - Image version tag (default: git commit hash)
- `REGISTRY` - Docker registry prefix (default: opencrvs)
- `BRANCH` - Base image branch (default: develop)

**Build Architecture:**
1. **Optimized base image** - Contains OpenCRVS commons/components only
2. **OpenCRVS core services** - Use shared base for consistency (~3.5GB base + service code)
3. **Toppan services** - Standalone Node.js images (~1-2GB each, fully independent)

**Build Order:**
1. `ocrvs-base` - Optimized foundation (OpenCRVS commons/components)
2. OpenCRVS core services in parallel (17 services using base)
3. Toppan services in parallel (3 standalone services)

## 🔄 Rebuilding After Architecture Changes

### When Base Image Changes
If the base image architecture changes (commons/components updates), you need to rebuild all OpenCRVS core services:

```bash
# Force rebuild everything (base + all services)
./scripts/build-docker-images.sh

# Check what was rebuilt
./scripts/build-docker-images.sh --status
```

### Selective Rebuilds
For targeted rebuilds after the initial full build:

```bash
# Rebuild specific services only
./scripts/build-docker-images.sh gateway auth events

# Rebuild all Toppan services (standalone)
./scripts/build-docker-images.sh toppan toppan-service toppan-ui

# Rebuild base image only (will require rebuilding core services after)
docker build -t toppan-crvs/ocrvs-base:demo-1.8.0 -f Dockerfile.base .
```

### Optimization Benefits

**Before Optimization:**
- Base image: 4.02GB (OpenCRVS + Toppan packages)
- All services: 4GB+ each
- Total OpenCRVS overhead: ~68GB (17 × 4GB)

**After Optimization:**
- Base image: ~3.5GB (OpenCRVS core only)
- OpenCRVS services: ~3.5GB+ each (500MB savings per service)
- Toppan services: 1-2GB each (70% smaller than before)
- Total savings: ~8.5GB OpenCRVS + ~9GB Toppan = **17.5GB saved**

**Architecture Benefits:**
- ✅ Clean separation between core and custom services
- ✅ Independent development/deployment cycles
- ✅ Optimal resource utilization
- ✅ Faster builds and deployments

### Start Script: `scripts/start-docker.sh`

Starts OpenCRVS services using Docker Compose.

```bash
# Development mode (default)
./scripts/start-docker.sh

# Production mode
./scripts/start-docker.sh --mode production

# Only external dependencies
./scripts/start-docker.sh --deps-only

# Only OpenCRVS services (requires deps running)
./scripts/start-docker.sh --services-only

# Custom configuration
./scripts/start-docker.sh \
  --mode production \
  --version 1.8.0 \
  --registry myorg \
  --country-config myorg/mycountry-config:latest
```

**Options:**
- `--mode` - development|production (default: development)
- `--version` - Service version tag (default: latest)
- `--registry` - Docker registry prefix (default: opencrvs)
- `--country-config` - Country configuration image
- `--deps-only` - Start only external dependencies
- `--services-only` - Start only OpenCRVS services

## 🐳 Docker Compose Usage

### Manual Docker Compose Commands

```bash
# Start complete development stack
docker compose \
  -f docker-compose.deps.yml \
  -f docker-compose.base.yml \
  -f docker-compose.override.yml \
  up -d

# Start only dependencies
docker compose -f docker-compose.deps.yml up -d

# Start only services in production mode
NODE_ENV=production docker compose \
  -f docker-compose.base.yml \
  up -d

# Scale specific service
docker compose -f docker-compose.base.yml up -d --scale gateway=3

# View logs
docker compose -f docker-compose.base.yml logs -f gateway

# Stop everything
docker compose \
  -f docker-compose.deps.yml \
  -f docker-compose.base.yml \
  -f docker-compose.override.yml \
  down
```

### Service Management

```bash
# Restart specific service
docker compose restart gateway

# Update service image and restart
docker compose pull gateway
docker compose up -d gateway

# Execute commands in running container
docker compose exec gateway bash
docker compose exec mongo1 mongo

# View container resource usage
docker stats
```

## 🔌 Port Mappings (Development)

| Service | Port | Description |
|---------|------|-------------|
| client | 3000 | Main React application |
| login | 3020 | Authentication UI |
| auth | 4040 | Authentication API |
| user-mgnt | 3030 | User management API |
| gateway | 7070 | GraphQL API gateway |
| workflow | 5050 | Workflow management |
| events | 5555 | Event processing |
| documents | 9050 | Document upload |
| notification | 2020 | Notification service |
| search | 9090 | Search API |
| metrics | 1050 | Analytics API |
| webhooks | 2525 | Webhook management |
| config | 2021 | Configuration API |
| countryconfig | 3040 | Country configuration |
| **Toppan Services** | | |
| toppan | 9998 | Family tree backend |
| toppan-service | 3040 | Family tree integration |
| toppan-ui | 3889 | Family tree frontend |
| **External Dependencies** | | |
| mongo1 | 27017 | MongoDB |
| redis | 6379 | Redis cache |
| elasticsearch | 9200 | ElasticSearch |
| influxdb | 8086 | InfluxDB |
| minio | 9000 | MinIO object storage |
| **External Services** | | |
| countryconfig | 3040 | Country configuration |
| postgres | 5432 | PostgreSQL (Toppan) |
| pg_adminer | 15432 | PostgreSQL Admin UI |
| opensearch | 19200 | OpenSearch (Toppan) |
| opensearch-dashboards | 5601 | OpenSearch UI |
| toppan-data-seeder | - | Data seeding service |

## 🔧 Configuration

### Environment Variables

**Global:**
- `NODE_ENV` - Environment (development/production)
- `VERSION` - Service version
- `DOCKER_REGISTRY` - Registry prefix
- `COUNTRY_CONFIG_IMAGE` - Country config image

**Service-specific:**
- `CERT_PUBLIC_KEY_PATH` - JWT public key path
- `CERT_PRIVATE_KEY_PATH` - JWT private key path
- `MONGO_URL` - MongoDB connection string
- `REDIS_HOST` - Redis hostname
- `FHIR_URL` - FHIR server URL

### Development Secrets

Development mode requires JWT key pair:

```bash
# Auto-generated by start script, or manually:
mkdir -p .secrets
openssl genrsa -out .secrets/private-key.pem 2048
openssl rsa -pubout -in .secrets/private-key.pem -out .secrets/public-key.pem
```

### Country Configuration

Override country configuration by setting image:

```bash
# Using environment variable
export COUNTRY_CONFIG_IMAGE=myorg/mycountry:latest
./scripts/start-docker.sh

# Using command line
./scripts/start-docker.sh --country-config myorg/mycountry:latest

# Using docker-compose override
# Create docker-compose.local.yml:
services:
  countryconfig:
    image: myorg/mycountry:latest
    build:
      context: ../mycountry-config
```

## 🏥 Health Checks & Monitoring

### Service Health

All services expose health endpoints:

```bash
# Check service health
curl http://localhost:7070/ping  # Gateway
curl http://localhost:4040/ping  # Auth
curl http://localhost:3030/ping  # User-mgnt
```

### Container Monitoring

```bash
# View all container status
docker compose ps

# View resource usage
docker stats

# View logs with timestamps
docker compose logs -f --timestamps gateway

# View recent logs
docker compose logs --tail=50 gateway

# Follow logs from multiple services
docker compose logs -f gateway auth user-mgnt
```

### Database Access

```bash
# MongoDB shell
docker compose exec mongo1 mongo

# Redis CLI
docker compose exec redis redis-cli

# ElasticSearch
curl http://localhost:9200/_cluster/health
```

## 🚨 Troubleshooting

### Common Issues

**Port Conflicts:**
```bash
# Check what's using a port
lsof -i :3000
sudo netstat -tulpn | grep 3000

# Change ports in docker-compose.override.yml
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
docker compose logs gateway

# Check dependencies
docker compose ps

# Restart services in order
docker compose restart mongo1 redis elasticsearch
docker compose restart auth user-mgnt config
docker compose restart gateway
```

**Database Connection Issues:**
```bash
# Verify MongoDB is accessible
docker compose exec gateway ping mongo1
docker compose exec gateway telnet mongo1 27017

# Check MongoDB logs
docker compose logs mongo1
```

### Log Analysis

```bash
# Search logs for errors
docker compose logs | grep -i error

# Export logs for analysis
docker compose logs > opencrvs.log

# Follow specific service logs
docker compose logs -f --tail=100 gateway

# Filter logs by timestamp
docker compose logs --since="2023-01-01T00:00:00" gateway
```

### Performance Optimization

**Resource Limits:**
```yaml
# Add to docker-compose.override.yml
services:
  gateway:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
```

**Service Scaling:**
```bash
# Scale services horizontally
docker compose up -d --scale gateway=3 --scale auth=2

# Load balancer needed for multiple instances
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