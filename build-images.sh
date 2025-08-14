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

# Build base image first
echo "🏗️  Building base image with commons..."
docker build -f packages/Dockerfile.base -t opencrvs-base:$VERSION .
if [ $? -ne 0 ]; then
  echo "❌ Failed to build base image"
  exit 1
else
  echo "✅ Successfully built opencrvs-base:$VERSION"
fi
echo ""

# Build remaining shared packages (commons already in base image)
echo "📦 Building remaining shared packages..."
shared_packages=("components" "toppan-common" "toppan-db")

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

# Build Docker images
echo ""
echo "🐳 Building Docker images..."
# Build all services except events (TRPC issues)
services=("auth" "workflow" "user-mgnt" "notification" "webhooks" "search" "metrics" "config" "client" "login" "documents" "toppan" "toppan-service" "toppan-ui" "data-seeder" "migration")
# Skipped: "events" "gateway" (TRPC version conflicts)

for service in "${services[@]}"; do
  echo ""
  echo "🐳 Building Docker image for $service..."
  
  if [ -f "packages/$service/Dockerfile" ]; then
    docker build -f packages/$service/Dockerfile -t opencrvs/$service:$VERSION .
    if [ $? -ne 0 ]; then
      echo "❌ Failed to build Docker image for $service"
      exit 1
    else
      echo "✅ Successfully built opencrvs/$service:$VERSION"
    fi
  else
    echo "⚠️  No Dockerfile found for $service, skipping..."
  fi
done

echo ""
echo "🎉 All images built with version: $VERSION"