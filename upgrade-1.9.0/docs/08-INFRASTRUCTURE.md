# Infrastructure & DevOps

## Overview

Custom scripts, Docker configurations, and deployment infrastructure added for Toppan/Antigua deployment. Includes AWS ECR integration, Jenkins pipelines, and comprehensive service management scripts.

---

## New Files Added

### scripts/

| Script | Description |
|--------|-------------|
| `build-docker-compose.sh` | Build docker-compose with version tagging |
| `build-docker-images.sh` | Build all Docker images |
| `push-to-ecr.sh` | Push images to AWS ECR |
| `build-and-push-ecr-ordered.sh` | Build and push in dependency order |
| `create-ecr-repos.sh` | Create ECR repositories |
| `admin-create-ecr-repos.sh` | Admin script for ECR setup |
| `deploy-cloud.sh` | Deploy to cloud environment |
| `start-docker.sh` | Start Docker services |
| `stop-docker.sh` | Stop Docker services |
| `start-complete-stack.sh` | Start full OpenCRVS + Toppan stack |
| `stop-complete-stack.sh` | Stop complete stack |
| `view-logs-tmux.sh` | View logs in tmux sessions |
| `parse-service-logs.sh` | Parse and filter service logs |
| `clear-db.sh` | Clear database for fresh start |
| `seed-atg.sh` | Seed Antigua data |
| `run-toppan-seeder.sh` | Run Toppan database seeder |
| `atg-env.sh` | ATG environment variables |
| `countryconfig-build-image.sh` | Build countryconfig image |
| `countryconfig-pack-toolkit.sh` | Pack toolkit for countryconfig |
| `build-countryconfig.sh` | Build countryconfig package |
| `build-countryconfig-atg.sh` | Build ATG-specific countryconfig |

---

## Docker Compose Files

### docker-compose.dev-deps.yml (Modified)

Added Toppan dependencies:

```yaml
services:
  # Existing OpenCRVS services...

  # Added Toppan services
  toppan-db:
    image: postgres:14
    container_name: toppan-db
    ports:
      - "5433:5432"
    environment:
      POSTGRES_DB: toppan
      POSTGRES_USER: toppan
      POSTGRES_PASSWORD: toppan
    volumes:
      - toppan-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U toppan"]
      interval: 10s
      timeout: 5s
      retries: 5

  opensearch:
    image: opensearchproject/opensearch:2.11.0
    container_name: opensearch
    ports:
      - "9200:9200"
      - "9600:9600"
    environment:
      - discovery.type=single-node
      - DISABLE_SECURITY_PLUGIN=true
      - "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - opensearch-data:/usr/share/opensearch/data

volumes:
  toppan-db-data:
  opensearch-data:
```

### docker-compose.infra.yml (New)

Infrastructure services for production:

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    container_name: nginx-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./infrastructure/nginx-default.conf:/etc/nginx/conf.d/default.conf
      - ./infrastructure/certs:/etc/nginx/certs
    depends_on:
      - gateway
      - client

  # Other infrastructure services...
```

### docker-compose.yml (Modified)

Added Toppan services:

```yaml
services:
  # Existing services...

  toppan:
    build:
      context: ./packages/toppan
      dockerfile: Dockerfile
    container_name: toppan
    ports:
      - "7070:7070"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://toppan:toppan@toppan-db:5432/toppan
      - OPENSEARCH_URL=http://opensearch:9200
    depends_on:
      toppan-db:
        condition: service_healthy
      opensearch:
        condition: service_started

  certificate-service:
    build:
      context: ./packages/toppan-certificate
      dockerfile: Dockerfile
    container_name: certificate-service
    ports:
      - "3890:3890"
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
```

---

## AWS ECR Integration

### scripts/push-to-ecr.sh

```bash
#!/bin/bash

# Configuration
REGION="${AWS_REGION:-ap-east-1}"
REGISTRY="${ECR_REGISTRY:-695491315778.dkr.ecr.ap-east-1.amazonaws.com/toppancrvs}"
VERSION="${VERSION:-latest}"

# Login to ECR
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $REGISTRY

# Push images
IMAGES=(
  "gateway"
  "client"
  "auth"
  "config"
  "documents"
  "metrics"
  "notification"
  "scheduler"
  "search"
  "user-mgnt"
  "webhooks"
  "workflow"
  "toppan"
  "certificate-service"
)

for IMAGE in "${IMAGES[@]}"; do
  echo "Pushing $IMAGE:$VERSION..."
  docker tag opencrvs/$IMAGE:$VERSION $REGISTRY/$IMAGE:$VERSION
  docker push $REGISTRY/$IMAGE:$VERSION
done
```

### scripts/create-ecr-repos.sh

```bash
#!/bin/bash

REGION="${AWS_REGION:-ap-east-1}"

REPOS=(
  "gateway"
  "client"
  "auth"
  "config"
  "documents"
  "metrics"
  "notification"
  "scheduler"
  "search"
  "user-mgnt"
  "webhooks"
  "workflow"
  "toppan"
  "certificate-service"
  "countryconfig"
)

for REPO in "${REPOS[@]}"; do
  echo "Creating repository: $REPO"
  aws ecr create-repository \
    --repository-name "toppancrvs/$REPO" \
    --region $REGION \
    --image-scanning-configuration scanOnPush=true \
    --tags Key=Project,Value=ToppanCRVS
done
```

---

## Jenkins Pipeline

### Jenkinsfile (Modified)

```groovy
pipeline {
  agent any

  environment {
    ECR_REGISTRY = '695491315778.dkr.ecr.ap-east-1.amazonaws.com/toppancrvs'
    AWS_REGION = 'ap-east-1'
    VERSION = "${env.BUILD_NUMBER}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build Docker Images') {
      steps {
        sh './scripts/build-docker-images.sh'
      }
    }

    stage('Push to ECR') {
      steps {
        withAWS(credentials: 'aws-ecr-credentials', region: 'ap-east-1') {
          sh './scripts/push-to-ecr.sh'
        }
      }
    }

    stage('Deploy to Staging') {
      when {
        branch 'develop'
      }
      steps {
        sh './scripts/deploy-cloud.sh staging'
      }
    }

    stage('Deploy to Production') {
      when {
        branch 'main'
      }
      steps {
        input message: 'Deploy to production?'
        sh './scripts/deploy-cloud.sh production'
      }
    }
  }
}
```

---

## Nginx Configuration

### infrastructure/nginx-default.conf

```nginx
upstream gateway {
    server gateway:7070;
}

upstream client {
    server client:3000;
}

upstream toppan {
    server toppan:7070;
}

upstream certificate-service {
    server certificate-service:3890;
}

server {
    listen 80;
    server_name _;

    # Client app
    location / {
        proxy_pass http://client;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Gateway API
    location /api/ {
        proxy_pass http://gateway/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Toppan service
    location /toppan/ {
        proxy_pass http://toppan/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # Certificate service
    location /certificate/ {
        proxy_pass http://certificate-service/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

---

## CSP Configuration Changes

### packages/gateway/src/server.ts

Modified Content Security Policy for PDF preview and iframe embedding:

```typescript
const cspDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:', '*.minio.local'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", '*.minio.local', 'ws:', 'wss:'],
  // Modified for PDF preview
  'object-src': ["'self'", 'data:', 'blob:'],
  'frame-src': ["'self'", 'data:', 'blob:'],
  'media-src': ["'self'", 'data:', 'blob:'],
}
```

**Commits:**
- `3132190b97` - fix: Update CSP to allow PDF document preview
- `dca7c94229` - fix: Update CSP frame-src and sync docker-compose.cloud.yml

---

## Service Management Scripts

### scripts/start-complete-stack.sh

```bash
#!/bin/bash

# Start dependencies first
docker-compose -f docker-compose.dev-deps.yml up -d

# Wait for dependencies
echo "Waiting for PostgreSQL..."
until docker exec toppan-db pg_isready -U toppan; do sleep 1; done

echo "Waiting for OpenSearch..."
until curl -s http://localhost:9200 > /dev/null; do sleep 1; done

# Run database migrations
cd packages/toppan-db && npm run migrate

# Start OpenCRVS services
docker-compose up -d gateway client auth config documents workflow

# Start Toppan services
docker-compose up -d toppan certificate-service

echo "All services started!"
```

### scripts/view-logs-tmux.sh

```bash
#!/bin/bash

# Create tmux session for log viewing
tmux new-session -d -s logs

# Gateway logs
tmux new-window -t logs -n 'gateway'
tmux send-keys -t logs:gateway 'docker logs -f gateway' C-m

# Toppan logs
tmux new-window -t logs -n 'toppan'
tmux send-keys -t logs:toppan 'docker logs -f toppan' C-m

# Certificate service logs
tmux new-window -t logs -n 'certificate'
tmux send-keys -t logs:certificate 'docker logs -f certificate-service' C-m

# Attach to session
tmux attach-session -t logs
```

---

## Migration Steps

### 1. Copy scripts

```bash
cp -r scripts/* <target>/scripts/
chmod +x <target>/scripts/*.sh
```

### 2. Copy docker-compose files

```bash
cp docker-compose.infra.yml <target>/
# Apply patches to existing docker-compose files
git diff -- docker-compose*.yml
```

### 3. Copy infrastructure config

```bash
cp -r infrastructure/ <target>/
```

### 4. Update Jenkinsfile

```bash
git diff -- Jenkinsfile
```

### 5. Apply gateway CSP changes

```bash
git diff 3132190b97~1..3132190b97 -- packages/gateway/src/server.ts
```

---

## Environment Files

### .env.example (additions)

```env
# AWS ECR
AWS_REGION=ap-east-1
ECR_REGISTRY=695491315778.dkr.ecr.ap-east-1.amazonaws.com/toppancrvs

# Toppan Services
TOPPAN_SERVICE_URL=http://localhost:7070
CERTIFICATE_SERVICE_URL=http://localhost:3890

# Toppan Database
TOPPAN_DB_HOST=localhost
TOPPAN_DB_PORT=5433
TOPPAN_DB_NAME=toppan
TOPPAN_DB_USER=toppan
TOPPAN_DB_PASSWORD=toppan

# OpenSearch
OPENSEARCH_URL=http://localhost:9200
```
