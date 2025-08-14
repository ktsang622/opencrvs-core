#!/bin/bash

VERSION=${1:-1.8.1-demo}
echo "🚀 Building OpenCRVS images with version: $VERSION"
echo "Node version: $(node --version)"
echo ""

# Function to prompt user
prompt_yes_no() {
  read -p "$1 (y/n): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    return 0
  else
    return 1
  fi
}

# Ask to clean and install dependencies (default: no, since yarn dev works)
if prompt_yes_no "Clean yarn cache and install dependencies? (not recommended if yarn dev works)"; then
  echo "🧹 Cleaning yarn cache..."
  yarn cache clean
  
  echo "📦 Installing root dependencies..."
  yarn install
  if [ $? -ne 0 ]; then
    echo "❌ Failed to install root dependencies"
    exit 1
  else
    echo "✅ Root dependencies installed successfully"
  fi
else
  echo "⏭️  Skipping yarn install (using existing dependencies)"
fi
echo ""

# Check if base image exists and prompt to rebuild
export VERSION
if docker image inspect ghcr.io/opencrvs/ocrvs-base:$VERSION >/dev/null 2>&1; then
  echo "✅ Base image ghcr.io/opencrvs/ocrvs-base:$VERSION already exists"
  if prompt_yes_no "Rebuild base image? (recommended if commons changed)"; then
    echo "🏗️  Rebuilding base image with commons (no cache)..."
    # Remove old local tag to avoid conflicts
    docker rmi opencrvs-base:$VERSION 2>/dev/null || true
    docker compose build base --no-cache
    if [ $? -ne 0 ]; then
      echo "❌ Failed to build base image"
      exit 1
    else
      echo "✅ Successfully rebuilt ghcr.io/opencrvs/ocrvs-base:$VERSION"
    fi
  else
    echo "⏭️  Using existing base image"
  fi
else
  echo "🏗️  Building base image with commons (required, no cache)..."
  docker compose build base --no-cache
  if [ $? -ne 0 ]; then
    echo "❌ Failed to build base image"
    exit 1
  else
    echo "✅ Successfully built ghcr.io/opencrvs/ocrvs-base:$VERSION"
  fi
fi

# Tag for local Dockerfile compatibility (Dockerfiles use FROM opencrvs-base:${VERSION})
docker tag ghcr.io/opencrvs/ocrvs-base:$VERSION opencrvs-base:$VERSION
echo ""

# Build shared packages (commons already in base image)
echo "📦 Building shared packages..."
shared_packages=("components" "events" "toppan-common" "toppan-db")
# Dependency chain:
# - events: copied by gateway and client
# - components: copied by client and login
# - toppan-common, toppan-db: copied by toppan services

for pkg in "${shared_packages[@]}"; do
  echo ""
  echo "🔨 Building $pkg..."
  cd packages/$pkg
  echo "📍 Current directory: $(pwd)"
  
  if [ -f "package.json" ]; then
    echo "📋 Installing dependencies..."
    yarn install
    if [ $? -ne 0 ]; then
      echo "❌ Failed to install dependencies for $pkg"
      exit 1
    fi
    
    echo "🏗️  Building $pkg..."
    yarn build
    if [ $? -ne 0 ]; then
      echo "❌ Failed to build $pkg"
      exit 1
    else
      echo "✅ Successfully built $pkg"
    fi
  else
    echo "⚠️  No package.json found in $pkg"
  fi
  
  cd ../..
done

# Build all services using docker compose (parallel, efficient)
echo ""
echo "🚀 Building all services in parallel..."

# Build services in correct dependency order
echo "Building services that need shared packages..."

# STEP 1: Build gateway (uses packages/events)
echo "Building gateway..."
docker compose build gateway
if [ $? -ne 0 ]; then
  echo "❌ Failed to build gateway"
  exit 1
fi

# STEP 2: Build login (uses packages/components)
echo "Building login..."
docker compose build login
if [ $? -ne 0 ]; then
  echo "❌ Failed to build login"
  exit 1
fi

# STEP 3: Build client (copies pre-built gateway artifacts + uses packages/events, packages/components)
echo "Building client (copies from built gateway)..."
docker compose build client
if [ $? -ne 0 ]; then
  echo "❌ Failed to build client"
  exit 1
fi

# STEP 4: Build independent services (no cross-package dependencies)
echo "Building independent OpenCRVS services..."
independent_services="auth workflow user-mgnt notification webhooks search metrics config documents data-seeder migration"
docker compose build $independent_services
if [ $? -ne 0 ]; then
  echo "❌ Failed to build OpenCRVS services"
  exit 1
fi

# STEP 5: Toppan services (use toppan/ tags, copy toppan-common and toppan-db)
echo ""
echo "Building Toppan services..."
toppan_services="toppan-service toppan-ui"
echo "Building Toppan services: $toppan_services"
# Note: These services copy packages/toppan-common and packages/toppan-db
docker compose -f docker-compose.toppan.yml build $toppan_services
if [ $? -ne 0 ]; then
  echo "❌ Failed to build Toppan services"
  exit 1
fi

echo "✅ Successfully built all OpenCRVS and Toppan services"

# STEP 6: Build dependency services (dashboards includes Metabase)
echo ""
echo "Building OpenCRVS dependency services..."
dependency_services="dashboards scheduler"
echo "Building dependency services: $dependency_services"
docker compose build $dependency_services
if [ $? -ne 0 ]; then
  echo "❌ Failed to build dependency services"
  exit 1
fi

echo "✅ Successfully built all dependency services"

echo ""
echo "🎉 All images built with version: $VERSION"
echo "📊 Includes: OpenCRVS core services, Toppan services, and dependencies (Metabase dashboards, scheduler)"