#!/bin/bash

# Start toppan-ui
echo "Starting Toppan UI..."

# Set environment variables if not set
export PORT=${PORT:-3889}
export VITE_API_BASE=${VITE_API_BASE:-http://localhost:3888}

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    yarn install
fi

# Build if dist doesn't exist
if [ ! -d "dist" ]; then
    echo "Building application..."
    yarn build
fi

# Start the service
yarn dev