#!/bin/bash

# OpenCRVS Range Chunk Preparation Script
# Extracts specific record ranges and creates chunks for batch processing
# Usage: ./prepare-range-chunks.sh <csv_file> <start_record> <end_record> [chunk_size]

set -e

# Configuration
CSV_FILE="${1:-atg_births_cleansed_enhanced_v2.csv}"
START_RECORD="${2:-5001}"
END_RECORD="${3:-100000}"
CHUNK_SIZE="${4:-50}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Validate inputs
if [[ ! -f "$CSV_FILE" ]]; then
    error "CSV file '$CSV_FILE' not found!"
    exit 1
fi

# Get total lines in file (including header)
TOTAL_LINES=$(wc -l < "$CSV_FILE")
ACTUAL_RECORDS=$((TOTAL_LINES - 1))

log "📊 Range Extraction Setup:"
echo "   • File: $CSV_FILE"
echo "   • Total records available: $ACTUAL_RECORDS"
echo "   • Requested range: $START_RECORD - $END_RECORD"
echo "   • Chunk size: $CHUNK_SIZE"
echo ""

# Validate range
if [[ $START_RECORD -lt 1 ]]; then
    error "Start record must be >= 1"
    exit 1
fi

if [[ $END_RECORD -gt $ACTUAL_RECORDS ]]; then
    warning "End record $END_RECORD exceeds available records ($ACTUAL_RECORDS). Using $ACTUAL_RECORDS."
    END_RECORD=$ACTUAL_RECORDS
fi

if [[ $START_RECORD -gt $END_RECORD ]]; then
    error "Start record ($START_RECORD) cannot be greater than end record ($END_RECORD)"
    exit 1
fi

# Calculate extraction details
RECORDS_TO_EXTRACT=$((END_RECORD - START_RECORD + 1))
CHUNKS_NEEDED=$(((RECORDS_TO_EXTRACT + CHUNK_SIZE - 1) / CHUNK_SIZE))

log "📝 Extraction Plan:"
echo "   • Records to extract: $RECORDS_TO_EXTRACT"
echo "   • Chunks needed: $CHUNKS_NEEDED"
echo "   • Range: Records $START_RECORD to $END_RECORD"
echo ""

# Create chunks directory
CHUNKS_DIR="./chunks_range_${START_RECORD}_${END_RECORD}_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$CHUNKS_DIR"

log "📁 Creating chunks in $CHUNKS_DIR..."

# Extract header
head -1 "$CSV_FILE" > "$CHUNKS_DIR/header.csv"

log "🔄 Extracting and chunking records..."

# Calculate line numbers in original file (add 1 because line 1 is header)
START_LINE=$((START_RECORD + 1))
END_LINE=$((END_RECORD + 1))

# Extract the range first
RANGE_FILE="$CHUNKS_DIR/extracted_range.csv"
log "   • Extracting lines $START_LINE-$END_LINE to temporary file..."
head -1 "$CSV_FILE" > "$RANGE_FILE"
sed -n "${START_LINE},${END_LINE}p" "$CSV_FILE" >> "$RANGE_FILE"

EXTRACTED_RECORDS=$(($(wc -l < "$RANGE_FILE") - 1))
success "Extracted $EXTRACTED_RECORDS records to temporary file"

# Create chunks from extracted range
log "   • Creating chunks..."
for ((i=1; i<=CHUNKS_NEEDED; i++)); do
    CHUNK_FILE="$CHUNKS_DIR/chunk_$(printf "%03d" $i).csv"
    CHUNK_START_LINE=$(((i-1) * CHUNK_SIZE + 2))  # +2 to skip header in range file
    CHUNK_END_LINE=$((CHUNK_START_LINE + CHUNK_SIZE - 1))

    # Don't exceed the total records in range file
    RANGE_TOTAL_LINES=$(wc -l < "$RANGE_FILE")
    if [[ $CHUNK_END_LINE -gt $RANGE_TOTAL_LINES ]]; then
        CHUNK_END_LINE=$RANGE_TOTAL_LINES
    fi

    if [[ $CHUNK_START_LINE -gt $RANGE_TOTAL_LINES ]]; then
        break
    fi

    # Create chunk with header + data
    head -1 "$RANGE_FILE" > "$CHUNK_FILE"
    sed -n "${CHUNK_START_LINE},${CHUNK_END_LINE}p" "$RANGE_FILE" >> "$CHUNK_FILE"

    ACTUAL_RECORDS_IN_CHUNK=$(($(wc -l < "$CHUNK_FILE") - 1))

    # Calculate original record numbers for this chunk
    ORIGINAL_START=$((START_RECORD + (i-1) * CHUNK_SIZE))
    ORIGINAL_END=$((ORIGINAL_START + ACTUAL_RECORDS_IN_CHUNK - 1))

    log "   Created chunk $i: $ACTUAL_RECORDS_IN_CHUNK records (original records $ORIGINAL_START-$ORIGINAL_END)"
done

# Clean up temporary file
rm "$RANGE_FILE"

echo ""
success "✅ Created $CHUNKS_NEEDED chunks successfully"

# Create a batch processing script for this range
BATCH_SCRIPT="$CHUNKS_DIR/process_range.sh"
cat > "$BATCH_SCRIPT" << 'EOF'
#!/bin/bash

# Auto-generated batch processing script
# Processes all chunks in this directory

set -e

CHUNK_DIR="$(dirname "$0")"
BATCH_SIZE=5
SUCCESSFUL=0
FAILED=0

echo "🚀 Starting batch processing of range chunks..."
echo "📁 Processing chunks in: $CHUNK_DIR"
echo ""

for chunk_file in "$CHUNK_DIR"/chunk_*.csv; do
    if [[ -f "$chunk_file" ]]; then
        chunk_name=$(basename "$chunk_file")
        echo "════════════════════════════════════════"
        echo "📝 Processing $chunk_name..."

        if node ../migrate-births.js -f "$chunk_file" -b $BATCH_SIZE; then
            echo "✅ $chunk_name completed successfully"
            ((SUCCESSFUL++))
        else
            echo "❌ $chunk_name failed"
            ((FAILED++))
        fi

        echo "⏳ Waiting 10s before next chunk..."
        sleep 10
        echo ""
    fi
done

echo "════════════════════════════════════════"
echo "📊 Range Processing Summary:"
echo "   • Successful chunks: $SUCCESSFUL"
echo "   • Failed chunks: $FAILED"
echo "   • Total processed: $((SUCCESSFUL + FAILED))"

if [[ $FAILED -eq 0 ]]; then
    echo "🎉 All chunks processed successfully!"
else
    echo "⚠️  Some chunks failed. Check logs above."
fi
EOF

chmod +x "$BATCH_SCRIPT"

# Create summary info file
INFO_FILE="$CHUNKS_DIR/range_info.txt"
cat > "$INFO_FILE" << EOF
Range Extraction Summary
========================
Source file: $CSV_FILE
Record range: $START_RECORD - $END_RECORD
Records extracted: $RECORDS_TO_EXTRACT
Chunk size: $CHUNK_SIZE
Chunks created: $CHUNKS_NEEDED
Created: $(date)

To process this range:
    cd $(basename "$CHUNKS_DIR")
    ./process_range.sh

Or process individual chunks:
    node ../migrate-births.js -f chunk_001.csv -b 5
EOF

echo ""
log "📋 Summary:"
echo "   • Chunks directory: $CHUNKS_DIR"
echo "   • Records extracted: $RECORDS_TO_EXTRACT (from record $START_RECORD to $END_RECORD)"
echo "   • Chunks created: $CHUNKS_NEEDED"
echo "   • Batch script: $BATCH_SCRIPT"
echo "   • Info file: $INFO_FILE"
echo ""

success "🎯 Range preparation completed!"
echo ""
echo "To process this range:"
echo "   cd $(basename "$CHUNKS_DIR")"
echo "   ./process_range.sh"
echo ""
echo "Or process individual chunks:"
echo "   node migrate-births.js -f $(basename "$CHUNKS_DIR")/chunk_001.csv -b 5"