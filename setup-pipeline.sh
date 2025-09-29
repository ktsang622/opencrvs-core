#!/bin/bash

# OpenCRVS Data Pipeline Setup Script

echo "🚀 Setting up OpenCRVS Data Pipeline"
echo "===================================="

# Create all necessary directories
echo "📁 Creating directory structure..."

# Data Migration directories
mkdir -p data-migration/data/source
mkdir -p data-migration/data/processed/{high-quality,medium-quality,low-quality,failed,review-queue,approved,rejected,reviewed,reports}
mkdir -p data-migration/config
mkdir -p data-migration/web

# Data Import directories
mkdir -p data-import/chunks
mkdir -p data-import/exceptions/{duplicates,failures,retry}
mkdir -p data-import/reports
mkdir -p data-import/web

# Make scripts executable
echo "⚙️  Making scripts executable..."
chmod +x data-migration/scripts/*.js
chmod +x data-import/scripts/*.js

# Check for required dependencies
echo "🔍 Checking dependencies..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check for required npm packages
REQUIRED_PACKAGES=("express" "xlsx" "node-fetch")
MISSING_PACKAGES=()

for package in "${REQUIRED_PACKAGES[@]}"; do
    if ! npm list "$package" &> /dev/null && ! npm list -g "$package" &> /dev/null; then
        MISSING_PACKAGES+=("$package")
    fi
done

if [ ${#MISSING_PACKAGES[@]} -ne 0 ]; then
    echo "⚠️  Missing packages: ${MISSING_PACKAGES[*]}"
    read -p "Install missing packages? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm install "${MISSING_PACKAGES[@]}"
    else
        echo "❌ Please install missing packages: npm install ${MISSING_PACKAGES[*]}"
    fi
fi

# Create default location mapping if it doesn't exist
LOCATION_MAPPING="data-migration/config/location-uuid-mapping.json"
if [ ! -f "$LOCATION_MAPPING" ]; then
    echo "📍 Creating default location mapping..."
    cat > "$LOCATION_MAPPING" << 'EOF'
{
  "parishes": {
    "ST. JOHN'S": {
      "uuid": "266fab9d-9d10-4c56-9271-6d81a920ccb5",
      "name": "St. John's"
    },
    "ST JOHN'S": {
      "uuid": "266fab9d-9d10-4c56-9271-6d81a920ccb5",
      "name": "St. John's"
    },
    "ST. PAUL": {
      "uuid": "764089c2-e6b1-4ea0-8649-e3595a36bc0b",
      "name": "St. Paul"
    },
    "ST PAUL": {
      "uuid": "764089c2-e6b1-4ea0-8649-e3595a36bc0b",
      "name": "St. Paul"
    }
  },
  "country": "ATG"
}
EOF
    echo "✅ Created location mapping with default parishes"
    echo "   Edit $LOCATION_MAPPING to add more locations"
fi

# Create environment template
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    echo "🔧 Creating environment template..."
    cat > "$ENV_FILE" << 'EOF'
# OpenCRVS Configuration
OPENCRVS_URL=http://localhost:5001
OPENCRVS_USERNAME=e.mayuka
OPENCRVS_PASSWORD=test

# Import Configuration
BATCH_SIZE=5
DELAY_MS=10000
CHUNK_SIZE=50

# Monitoring
AUTO_CONFIRM=false
MAX_RETRIES=3
EOF
    echo "✅ Created .env file"
    echo "   Edit .env to configure your OpenCRVS connection"
fi

echo ""
echo "✅ Pipeline setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Place your source data files in: data-migration/data/source/"
echo "2. Update location mappings in: data-migration/config/location-uuid-mapping.json"
echo "3. Configure OpenCRVS connection in: .env"
echo ""
echo "🚀 Quick start:"
echo "# Phase 1: Data Preparation"
echo "cd data-migration/scripts && node 1-data-preparation.js"
echo ""
echo "# Phase 2: Data Import"
echo "cd data-import/scripts && node 1-chunk-splitter.js"
echo ""
echo "📊 Web interfaces:"
echo "• Review Tool: http://localhost:3001 (after starting 2-review-tool.js)"
echo "• Import Monitor: http://localhost:3002 (after starting 2-import-monitor.js)"
echo ""
echo "📖 Full documentation: CONSOLIDATED-PIPELINE.md"