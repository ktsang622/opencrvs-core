#!/bin/bash

# OpenCRVS Batch Import Script
# Safely imports large datasets by splitting into small chunks
# Usage: ./batch-import.sh <csv_file> [total_records] [chunk_size] [batch_size] [log_file]

set -e

# Configuration
CSV_FILE="${1:-atg_births_cleansed_enhanced.csv}"
TOTAL_RECORDS="${2:-1000}"
CHUNK_SIZE="${3:-50}"
BATCH_SIZE="${4:-5}"
LOG_FILE="${5:-batch-import-$(date +%Y%m%d_%H%M%S).log}"
CLEANUP_DELAY=10
MEMORY_CHECK_INTERVAL=5
MAX_RETRIES=3
AUTO_CONTINUE=true

# Enable logging if log file specified
if [[ "$LOG_FILE" != "no-log" ]]; then
    exec > >(tee -a "$LOG_FILE") 2>&1
    echo "📝 Logging enabled: $LOG_FILE"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if CSV file exists
if [[ ! -f "$CSV_FILE" ]]; then
    error "CSV file '$CSV_FILE' not found!"
    exit 1
fi

# Get total lines in file (including header)
TOTAL_LINES=$(wc -l < "$CSV_FILE")
ACTUAL_RECORDS=$((TOTAL_LINES - 1))

log "📊 Dataset Analysis:"
echo "   • File: $CSV_FILE"
echo "   • Total lines: $TOTAL_LINES"
echo "   • Data records: $ACTUAL_RECORDS"
echo "   • Requested records: $TOTAL_RECORDS"
echo "   • Chunk size: $CHUNK_SIZE"
echo "   • Batch size: $BATCH_SIZE"
echo ""

# Adjust if requesting more records than available
if [[ $TOTAL_RECORDS -gt $ACTUAL_RECORDS ]]; then
    warning "Requested $TOTAL_RECORDS records but file only has $ACTUAL_RECORDS. Using $ACTUAL_RECORDS."
    TOTAL_RECORDS=$ACTUAL_RECORDS
fi

# Calculate number of chunks needed
CHUNKS_NEEDED=$(((TOTAL_RECORDS + CHUNK_SIZE - 1) / CHUNK_SIZE))

log "🔄 Will create $CHUNKS_NEEDED chunks of ~$CHUNK_SIZE records each"
echo ""

# Create chunks directory
CHUNKS_DIR="./chunks_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$CHUNKS_DIR"

log "📁 Creating chunks in $CHUNKS_DIR..."

# Extract header
head -1 "$CSV_FILE" > "$CHUNKS_DIR/header.csv"

# Create chunks
for ((i=1; i<=CHUNKS_NEEDED; i++)); do
    CHUNK_FILE="$CHUNKS_DIR/chunk_$(printf "%03d" $i).csv"
    START_LINE=$(((i-1) * CHUNK_SIZE + 2))  # +2 to skip header
    END_LINE=$((START_LINE + CHUNK_SIZE - 1))

    # Don't exceed the total records requested
    RECORDS_IN_THIS_CHUNK=$CHUNK_SIZE
    if [[ $((START_LINE + CHUNK_SIZE - 2)) -gt $TOTAL_RECORDS ]]; then
        RECORDS_IN_THIS_CHUNK=$((TOTAL_RECORDS - START_LINE + 2))
        END_LINE=$((START_LINE + RECORDS_IN_THIS_CHUNK - 1))
    fi

    if [[ $RECORDS_IN_THIS_CHUNK -le 0 ]]; then
        break
    fi

    # Create chunk with header + data
    cat "$CHUNKS_DIR/header.csv" > "$CHUNK_FILE"
    sed -n "${START_LINE},${END_LINE}p" "$CSV_FILE" >> "$CHUNK_FILE"

    ACTUAL_RECORDS_IN_CHUNK=$(($(wc -l < "$CHUNK_FILE") - 1))
    log "   Created chunk $i: $ACTUAL_RECORDS_IN_CHUNK records (lines $START_LINE-$END_LINE)"
done

echo ""
success "✅ Created $CHUNKS_NEEDED chunks successfully"
echo ""

# Memory check function
check_memory() {
    MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    SWAP_USAGE=$(free | grep Swap | awk '{if($2>0) printf "%.1f", $3/$2 * 100.0; else printf "0.0"}')

    if (( $(echo "$MEMORY_USAGE > 80.0" | bc -l) )); then
        warning "High memory usage: ${MEMORY_USAGE}% (Swap: ${SWAP_USAGE}%)"
        return 1
    fi
    return 0
}

# Import function with auto-retry
import_chunk() {
    local chunk_file=$1
    local chunk_num=$2
    local retry_count=0

    log "🚀 Importing chunk $chunk_num: $(basename $chunk_file)"

    while [[ $retry_count -le $MAX_RETRIES ]]; do
        # Check memory before import
        if ! check_memory; then
            warning "Waiting ${CLEANUP_DELAY}s for memory cleanup..."
            sleep $CLEANUP_DELAY
        fi

        # Run the import
        if node migrate-births.js -f "$chunk_file" -b $BATCH_SIZE; then
            success "Completed chunk $chunk_num successfully"
            return 0
        else
            ((retry_count++))
            if [[ $retry_count -le $MAX_RETRIES ]]; then
                warning "Attempt $retry_count failed. Retrying chunk $chunk_num in ${CLEANUP_DELAY}s... (${retry_count}/${MAX_RETRIES})"
                sleep $CLEANUP_DELAY
            else
                error "Failed to import chunk $chunk_num after $MAX_RETRIES attempts"
                return 1
            fi
        fi
    done
}

# Main import loop
log "🎯 Starting batch import process..."
echo ""

SUCCESSFUL_CHUNKS=0
FAILED_CHUNKS=0
TOTAL_IMPORTED=0

for ((i=1; i<=CHUNKS_NEEDED; i++)); do
    CHUNK_FILE="$CHUNKS_DIR/chunk_$(printf "%03d" $i).csv"

    if [[ ! -f "$CHUNK_FILE" ]]; then
        continue
    fi

    RECORDS_IN_CHUNK=$(($(wc -l < "$CHUNK_FILE") - 1))

    echo "════════════════════════════════════════════════════════════════"
    log "Processing chunk $i/$CHUNKS_NEEDED ($RECORDS_IN_CHUNK records)"

    if import_chunk "$CHUNK_FILE" "$i"; then
        ((SUCCESSFUL_CHUNKS++))
        ((TOTAL_IMPORTED += RECORDS_IN_CHUNK))
        success "✓ Chunk $i completed ($RECORDS_IN_CHUNK records)"
    else
        ((FAILED_CHUNKS++))
        error "✗ Chunk $i failed after all retries"

        if [[ "$AUTO_CONTINUE" == "true" ]]; then
            warning "Auto-continuing with remaining chunks..."
        else
            # Ask user if they want to continue
            echo ""
            read -p "Continue with remaining chunks? [y/N]: " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                warning "Import stopped by user"
                break
            fi
        fi
    fi

    # Memory cleanup delay between chunks
    if [[ $i -lt $CHUNKS_NEEDED ]]; then
        log "Waiting ${CLEANUP_DELAY}s before next chunk..."
        sleep $CLEANUP_DELAY
    fi

    echo ""
done

# Final summary
echo "════════════════════════════════════════════════════════════════"
log "📊 Import Summary:"
echo "   • Successful chunks: $SUCCESSFUL_CHUNKS"
echo "   • Failed chunks: $FAILED_CHUNKS"
echo "   • Total records processed: $TOTAL_IMPORTED"
echo "   • Chunks directory: $CHUNKS_DIR"
echo ""

if [[ $FAILED_CHUNKS -eq 0 ]]; then
    success "🎉 All chunks imported successfully!"
else
    warning "⚠️  Some chunks failed. Check logs above for details."
fi

# Cleanup option
echo ""
read -p "Delete chunks directory? [y/N]: " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$CHUNKS_DIR"
    success "Cleaned up chunks directory"
else
    log "Chunks preserved in: $CHUNKS_DIR"
fi

log "Import process completed!"