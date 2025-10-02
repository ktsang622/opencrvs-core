# Data Migration Guide

## Overview

This guide covers the complete two-phase data migration pipeline for OpenCRVS birth registration data import.

## Pipeline Architecture

### Phase 1: Data Preparation (`/data-migration/scripts`)
- Convert XLSX to CSV
- Data cleansing and validation
- Quality scoring and grading
- Business logic processing (addresses, informant types, dates)
- Generate review-ready datasets

### Phase 2: Data Import (`/data-import/scripts`)
- Chunk splitting for manageable batches
- OpenCRVS FHIR composition creation
- Deduplication handling
- Batch import processing

## Quick Start

### Prerequisites
```bash
cd /home/ktsang/opencrvs-core
# Ensure OpenCRVS is running and accessible
```

### Step 1: Data Preparation
```bash
cd data-migration/scripts

# Convert XLSX to CSV (if needed)
node 0-xlsx-to-csv.js

# Run data preparation pipeline
node 1-data-preparation.js
```

**Output**: Quality-graded datasets in `/data-migration/data/processed/`
- `high-quality/` - 90%+ quality score (ready for import)
- `medium-quality/` - 70-89% quality score (review recommended)
- `low-quality/` - 50-69% quality score (needs review)
- `failed/` - <50% quality score (requires manual intervention)

### Step 2: Data Import
```bash
cd ../../data-import

# Create manageable chunks
cd scripts
node 1-chunk-splitter.js 50  # 50 records per chunk

# Import data (choose one method below)
```

## Import Methods

### Method A: Single Chunk Import (Recommended for Testing)
```bash
cd /home/ktsang/opencrvs-core/data-import

# Test import single chunk
node migrate-births.js -f "scripts/chunks/AB_MERGE (0221)_BI_high_quality/chunk_001.csv" -b 10

# Import specific chunks
node migrate-births.js -f "scripts/chunks/AB_MERGE (0221)_BI_high_quality/chunk_002.csv" -b 25
```

### Method B: Auto-Generated Batch Script
```bash
cd scripts/chunks/AB_MERGE\ \(0221\)_BI_high_quality/

# Use auto-generated batch script
chmod +x process_chunks.sh
./process_chunks.sh
```

### Method C: Custom Batch Loop
```bash
cd /home/ktsang/opencrvs-core/data-import

# Custom loop for controlled import
for i in {1..100}; do
    CHUNK_NUM=$(printf "%03d" $i)
    echo "Processing chunk $CHUNK_NUM..."
    node migrate-births.js -f "scripts/chunks/AB_MERGE (0221)_BI_high_quality/chunk_$CHUNK_NUM.csv" -b 25
    echo "Waiting 15 seconds..."
    sleep 15
done
```

## Key Parameters

### Batch Size (`-b` parameter)
- **Small (5-10)**: Safer, easier troubleshooting
- **Medium (20-25)**: Balanced performance
- **Large (50)**: Faster but harder to track issues

### Chunk Size
- **Default: 50 records** per chunk
- **Large datasets**: Consider 25-50 records
- **Testing**: Use 10 records per chunk

### Delays
- **Recommended**: 10-30 seconds between chunks
- **Heavy load**: Increase to 60+ seconds
- **Light load**: Can reduce to 5 seconds

## Monitoring and Troubleshooting

### Check Import Progress
```bash
# Monitor real-time logs
tail -f production_import.log

# Check successful imports
grep "Successfully processed" production_import.log | wc -l

# Check duplicates
grep "DUPLICATE DETECTED" production_import.log | wc -l

# Check failures
grep "❌" production_import.log
```

### Resume Failed Imports
```bash
# Check which chunks completed
ls scripts/chunks/AB_MERGE*/results/

# Resume from specific chunk
node migrate-births.js -f "scripts/chunks/AB_MERGE (0221)_BI_high_quality/chunk_XXX.csv" -b 10
```

### Common Issues

**All Records Showing as Duplicates**
- Normal if data was previously imported
- OpenCRVS deduplication system working correctly
- Each attempt creates new composition IDs

**Authentication Failures**
- Check OpenCRVS service status
- Verify credentials in migrate-births.js
- Ensure network connectivity

**Memory Issues**
- Reduce batch size to 5-10 records
- Add longer delays between chunks
- Monitor system resources

**Network Timeouts**
- Increase delays between chunks
- Reduce batch sizes
- Check OpenCRVS server load

## Data Quality Information

### High Quality Data (Ready for Import)
- **Records**: 137,654 (81.6% of total)
- **Location**: `/data-migration/data/processed/high-quality/`
- **Estimated Chunks**: ~2,751 chunks (50 records each)
- **Import Time**: ~14-23 hours (with 30s delays)

### Features Implemented
- ✅ Date standardization (YYYY-MM-DD format)
- ✅ Informant type detection with name matching
- ✅ Address normalization and structured fields
- ✅ Location UUID resolution
- ✅ Registration metadata enhancement
- ✅ Deduplication handling
- ✅ Error handling and logging

## File Structure

```
/data-migration/
├── scripts/
│   ├── 0-xlsx-to-csv.js          # XLSX to CSV converter
│   └── 1-data-preparation.js     # Main preparation pipeline
└── data/processed/               # Output datasets
    ├── high-quality/            # Ready for import
    ├── medium-quality/          # Review recommended
    ├── low-quality/             # Needs review
    └── failed/                  # Manual intervention required

/data-import/
├── migrate-births.js            # Main import script
└── scripts/
    ├── 1-chunk-splitter.js      # Chunk creation
    ├── 2-import-monitor.js      # Import monitoring
    └── chunks/                  # Generated chunks
        └── AB_MERGE*/           # Chunk directories
            ├── chunk_001.csv    # Individual chunks
            ├── process_chunks.sh # Auto-generated batch script
            └── results/         # Import results
```

## Production Recommendations

1. **Start Small**: Test with 5-10 chunks first
2. **Monitor Closely**: Watch for patterns in failures/duplicates
3. **Keep Logs**: Save all output for analysis
4. **Backup Strategy**: Track completed chunks
5. **Parallel Processing**: Can run multiple processes on different ranges
6. **Quality First**: Import high-quality data first, review others manually

## Success Metrics

Expected results for 137,654 high-quality records:
- **New Registrations**: Majority of records (if not previously imported)
- **Duplicates**: Some records may already exist in system
- **Failures**: <1% expected for high-quality data
- **Processing Time**: 30-60 seconds per chunk (depending on batch size)

---

*Last Updated: 2025-09-23*
*Pipeline Status: Production Ready*