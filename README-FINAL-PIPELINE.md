# OpenCRVS Data Migration - Final Consolidated Pipeline

## 🎯 Overview

This is the final, production-ready data migration pipeline with complete separation of business logic and import operations.

## 📂 Directory Structure

```
opencrvs-core/
├── data-migration/                    # PHASE 1: Data Preparation
│   ├── scripts/
│   │   ├── 1-data-preparation.js     # Main preparation pipeline
│   │   └── 2-review-tool.js          # Review queue management
│   ├── data/
│   │   ├── source/                   # Raw Excel/CSV files
│   │   └── processed/                # Quality-graded outputs
│   └── config/
│       └── location-uuid-mapping.json
│
├── data-import/                      # PHASE 2: Data Import
│   ├── scripts/
│   │   ├── 1-chunk-splitter.js      # Split CSV into chunks
│   │   └── 2-import-monitor.js      # Monitor & handle exceptions
│   ├── chunks/                      # Chunked data for import
│   ├── exceptions/                  # Exception handling
│   ├── reports/                     # Import reports
│   └── migrate-births.js            # Core migration script
│
├── archive/                         # OLD FILES
│   └── old-scripts/                 # Archived test files
│
├── setup-pipeline.sh               # Setup script
└── CONSOLIDATED-PIPELINE.md         # Documentation
```

## 🔄 Two-Phase Architecture

### Phase 1: Data Preparation
**Business Logic & Data Quality**
- Excel/CSV conversion and cleaning
- Date standardization (YYYY-MM-DD format)
- Address normalization and structuring
- Location UUID resolution
- Informant type mapping
- Quality scoring and routing
- Review queue management

### Phase 2: Data Import
**OpenCRVS API Operations Only**
- Uses pre-processed data from Phase 1
- Chunked batch processing
- Exception handling
- Progress monitoring
- No business logic inference

## ✅ Key Improvements

### Address Processing Migration
- **Before**: Complex address logic during import
- **After**: All address fields pre-built in preparation phase

**New address fields created:**
```
{field}_type          # PRIMARY_ADDRESS
{field}_use           # home
{field}_city          # Extracted city/town
{field}_state         # State UUID
{field}_country       # ATG
{field}_district      # Parish UUID
{field}_text          # Full formatted address
shared_address        # Consolidated parent address
```

### Business Logic Separation
- **Before**: Inference during import (dates, informants, addresses)
- **After**: All inference in preparation, import just imports

### Quality Assurance
- **High Quality (90%+)**: Auto-ready for import
- **Medium Quality (70-89%)**: Requires review
- **Low Quality (50-69%)**: Requires review
- **Failed (<50%)**: Manual correction needed

## 🚀 Quick Start

```bash
# Step 0: Convert Excel files to CSV (one-time)
cd data-migration/scripts
node 0-xlsx-to-csv.js

# Phase 1: Prepare data
node 1-data-preparation.js

# Review (if needed)
node 2-review-tool.js  # http://localhost:3001

# Phase 2: Import data
cd ../../data-import/scripts
node 1-chunk-splitter.js 50
# Process chunks using generated scripts
node 2-import-monitor.js  # http://localhost:3002
```

## 📊 Features

### ✅ Fixed Issues
- **1905 Date Bug**: Proper datetime string handling
- **Address Processing**: Pre-built structured addresses
- **Informant Types**: Pre-mapped and validated
- **Quality Control**: Systematic routing by data completeness

### ✅ Monitoring
- **Review Tool**: http://localhost:3001 (Phase 1)
- **Import Monitor**: http://localhost:3002 (Phase 2)
- **Exception Tracking**: Automatic duplicate/failure detection
- **Progress Reports**: Real-time dashboard

---

**🎯 Result: Clean separation of concerns - preparation handles business logic, import handles API operations.**