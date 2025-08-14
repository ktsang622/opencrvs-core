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
    echo "🏗️  Rebuilding base image with commons..."
    docker compose build base
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
  echo "🏗️  Building base image with commons (required)..."
  docker compose build base
  if [ $? -ne 0 ]; then
    echo "❌ Failed to build base image"
    exit 1
  else
    echo "✅ Successfully built ghcr.io/opencrvs/ocrvs-base:$VERSION"
  fi
fi

# Tag for local Dockerfile compatibility
docker tag ghcr.io/opencrvs/ocrvs-base:$VERSION opencrvs-base:$VERSION
echo ""

# Build shared packages (commons already in base image)
echo "📦 Building shared packages..."
shared_packages=("components" "events" "toppan-common" "toppan-db")
# Note: events is built locally first because gateway copies it

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

# Build all services using docker-compose (parallel, efficient)
echo ""
echo "🚀 Building all services in parallel..."

# Build services in dependency order
echo "Building gateway first (depends on events)..."
docker compose build gateway
if [ $? -ne 0 ]; then
  echo "❌ Failed to build gateway"
  exit 1
fi

# Build remaining OpenCRVS services
echo "Building remaining OpenCRVS services..."
other_services="auth workflow user-mgnt notification webhooks search metrics config client login documents data-seeder migration"
docker compose build $other_services
if [ $? -ne 0 ]; then
  echo "❌ Failed to build OpenCRVS services"
  exit 1
fi

# Toppan services (use toppan/ tags)
echo ""
echo "Building Toppan services..."
toppan_services="toppan-service toppan-ui"
echo "Building Toppan services: $toppan_services"
docker compose -f docker-compose.toppan.yml build $toppan_services
if [ $? -ne 0 ]; then
  echo "❌ Failed to build Toppan services"
  exit 1
fi

echo "✅ Successfully built all OpenCRVS and Toppan services"

echo ""
echo "🎉 All images built with version: $VERSION"