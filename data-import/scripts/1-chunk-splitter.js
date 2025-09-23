#!/usr/bin/env node
// data-import/scripts/1-chunk-splitter.js
// Split cleansed CSV files into smaller chunks for batch import

const fs = require('fs')
const path = require('path')

const CHUNK_CONFIG = {
  inputDir: '../../data-migration/data/processed/high-quality',
  outputDir: './chunks',
  chunkSize: 50,
  maxChunks: null, // null = no limit
  preserveHeaders: true
}

class ChunkSplitter {
  constructor() {
    this.stats = {
      totalFiles: 0,
      totalRecords: 0,
      chunksCreated: 0,
      avgRecordsPerChunk: 0
    }
    this.setupDirectories()
  }

  setupDirectories() {
    if (!fs.existsSync(CHUNK_CONFIG.outputDir)) {
      fs.mkdirSync(CHUNK_CONFIG.outputDir, { recursive: true })
    }
  }

  async processAllCSVFiles() {
    console.log('📂 Starting Chunk Splitting Process')
    console.log('==================================')

    const csvFiles = this.findCSVFiles()
    console.log(`Found ${csvFiles.length} CSV files to process`)

    for (const file of csvFiles) {
      console.log(`\n📝 Processing: ${file.name}`)
      await this.splitCSVFile(file)
    }

    this.generateSplitReport()
    console.log('\n✅ Chunk splitting completed')
  }

  findCSVFiles() {
    const files = []

    // Check for files in input directory
    if (fs.existsSync(CHUNK_CONFIG.inputDir)) {
      const inputFiles = fs.readdirSync(CHUNK_CONFIG.inputDir)
        .filter(file => file.endsWith('.csv'))
        .map(file => ({
          name: file,
          path: path.join(CHUNK_CONFIG.inputDir, file),
          size: fs.statSync(path.join(CHUNK_CONFIG.inputDir, file)).size
        }))

      files.push(...inputFiles)
    }

    // Also check current directory for any CSV files
    const currentDirFiles = fs.readdirSync('.')
      .filter(file => file.endsWith('.csv'))
      .map(file => ({
        name: file,
        path: file,
        size: fs.statSync(file).size
      }))

    files.push(...currentDirFiles)

    return files.sort((a, b) => b.size - a.size) // Process largest first
  }

  async splitCSVFile(file) {
    try {
      const records = this.parseCSV(file.path)
      const baseName = path.basename(file.name, '.csv')

      console.log(`   Records found: ${records.length}`)

      if (records.length === 0) {
        console.log('   ⚠️  No records to split')
        return
      }

      this.stats.totalFiles++
      this.stats.totalRecords += records.length

      // Calculate number of chunks needed
      const chunksNeeded = Math.ceil(records.length / CHUNK_CONFIG.chunkSize)
      const actualChunks = CHUNK_CONFIG.maxChunks ?
        Math.min(chunksNeeded, CHUNK_CONFIG.maxChunks) :
        chunksNeeded

      console.log(`   Creating ${actualChunks} chunks of ~${CHUNK_CONFIG.chunkSize} records each`)

      // Create output directory for this file
      const fileOutputDir = path.join(CHUNK_CONFIG.outputDir, baseName)
      if (!fs.existsSync(fileOutputDir)) {
        fs.mkdirSync(fileOutputDir, { recursive: true })
      }

      // Split into chunks
      const headers = Object.keys(records[0])
      let recordsProcessed = 0

      for (let i = 0; i < actualChunks; i++) {
        const startIndex = i * CHUNK_CONFIG.chunkSize
        const endIndex = Math.min(startIndex + CHUNK_CONFIG.chunkSize, records.length)
        const chunkRecords = records.slice(startIndex, endIndex)

        if (chunkRecords.length === 0) break

        const chunkFileName = `chunk_${String(i + 1).padStart(3, '0')}.csv`
        const chunkPath = path.join(fileOutputDir, chunkFileName)

        await this.writeChunkCSV(chunkPath, headers, chunkRecords)

        recordsProcessed += chunkRecords.length
        this.stats.chunksCreated++

        console.log(`   ✅ Created ${chunkFileName}: ${chunkRecords.length} records`)
      }

      // Create batch processing script for this file
      this.createBatchScript(fileOutputDir, baseName, actualChunks)

      // Create chunk metadata
      this.createChunkMetadata(fileOutputDir, {
        originalFile: file.name,
        originalRecords: records.length,
        chunksCreated: actualChunks,
        chunkSize: CHUNK_CONFIG.chunkSize,
        recordsProcessed,
        createdAt: new Date().toISOString()
      })

      console.log(`   📊 Split complete: ${recordsProcessed} records in ${actualChunks} chunks`)

    } catch (error) {
      console.error(`   ❌ Failed to split ${file.name}:`, error.message)
    }
  }

  parseCSV(csvFilePath) {
    const data = fs.readFileSync(csvFilePath, 'utf8')
    const lines = data.split('\n').filter(line => line.trim())

    if (lines.length === 0) return []

    const headers = this.parseCSVLine(lines[0])
    const records = []

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i])
      if (values.length >= headers.length) {
        const record = {}
        headers.forEach((header, index) => {
          record[header.replace(/"/g, '')] = values[index]?.replace(/"/g, '') || ''
        })
        records.push(record)
      }
    }

    return records
  }

  parseCSVLine(line) {
    const result = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  async writeChunkCSV(chunkPath, headers, records) {
    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...records.map(record => headers.map(header => {
        const value = (record[header] || '').toString()
        return `"${value.replace(/"/g, '""')}"`
      }).join(','))
    ].join('\n')

    fs.writeFileSync(chunkPath, csvContent, 'utf8')
  }

  createBatchScript(outputDir, baseName, chunkCount) {
    const scriptContent = `#!/bin/bash

# Auto-generated batch processing script for ${baseName}
# Processes all chunks sequentially with import monitoring

set -e

CHUNK_DIR="$(dirname "$0")"
BATCH_SIZE=5
DELAY_SECONDS=10
RESULTS_DIR="$CHUNK_DIR/results"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Initialize counters
SUCCESSFUL=0
DUPLICATES=0
FAILURES=0

echo "🚀 Starting batch import for ${baseName}"
echo "📁 Processing ${chunkCount} chunks in: $CHUNK_DIR"
echo "📊 Results will be saved to: $RESULTS_DIR"
echo ""

# Process each chunk
for i in {1..${chunkCount}}; do
    CHUNK_NUM=$(printf "%03d" $i)
    CHUNK_FILE="$CHUNK_DIR/chunk_$CHUNK_NUM.csv"
    RESULT_FILE="$RESULTS_DIR/chunk_$CHUNK_NUM.log"

    if [[ -f "$CHUNK_FILE" ]]; then
        echo "════════════════════════════════════════"
        echo "📝 Processing chunk $CHUNK_NUM..."

        # Run migration with output capture
        if node ../../migrate-births.js -f "$CHUNK_FILE" -b $BATCH_SIZE > "$RESULT_FILE" 2>&1; then
            echo "✅ Chunk $CHUNK_NUM completed successfully"
            ((SUCCESSFUL++))

            # Extract statistics from log
            CHUNK_DUPLICATES=$(grep "Potential duplicates skipped:" "$RESULT_FILE" | grep -o '[0-9]*' || echo "0")
            CHUNK_FAILURES=$(grep "Failures:" "$RESULT_FILE" | grep -o '[0-9]*' || echo "0")

            DUPLICATES=$((DUPLICATES + CHUNK_DUPLICATES))
            FAILURES=$((FAILURES + CHUNK_FAILURES))

        else
            echo "❌ Chunk $CHUNK_NUM failed"
            ((FAILURES++))
        fi

        # Delay between chunks (except last one)
        if [[ $i -lt ${chunkCount} ]]; then
            echo "⏳ Waiting ${DELAY_SECONDS}s before next chunk..."
            sleep $DELAY_SECONDS
        fi

        echo ""
    else
        echo "⚠️  Chunk file not found: $CHUNK_FILE"
    fi
done

# Generate summary report
echo "════════════════════════════════════════"
echo "📊 Batch Import Summary for ${baseName}:"
echo "   • Successful chunks: $SUCCESSFUL"
echo "   • Failed chunks: $FAILURES"
echo "   • Total duplicates: $DUPLICATES"
echo "   • Results location: $RESULTS_DIR"

# Save summary to file
cat > "$RESULTS_DIR/batch_summary.json" << EOF
{
  "sourceFile": "${baseName}",
  "completedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "chunks": {
    "total": ${chunkCount},
    "successful": $SUCCESSFUL,
    "failed": $FAILURES
  },
  "records": {
    "duplicates": $DUPLICATES,
    "failures": $FAILURES
  }
}
EOF

if [[ $FAILURES -eq 0 ]]; then
    echo "🎉 All chunks processed successfully!"
    exit 0
else
    echo "⚠️  Some chunks failed. Check individual chunk logs in $RESULTS_DIR"
    exit 1
fi`

    const scriptPath = path.join(outputDir, 'process_chunks.sh')
    fs.writeFileSync(scriptPath, scriptContent)

    // Make executable
    try {
      fs.chmodSync(scriptPath, '755')
    } catch (error) {
      console.warn('   ⚠️  Could not make script executable:', error.message)
    }
  }

  createChunkMetadata(outputDir, metadata) {
    const metadataPath = path.join(outputDir, 'chunk_metadata.json')
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
  }

  generateSplitReport() {
    this.stats.avgRecordsPerChunk = this.stats.chunksCreated > 0 ?
      Math.round(this.stats.totalRecords / this.stats.chunksCreated) : 0

    const report = {
      timestamp: new Date().toISOString(),
      summary: this.stats,
      configuration: CHUNK_CONFIG,
      chunkDirectories: this.getChunkDirectories()
    }

    const reportPath = path.join(CHUNK_CONFIG.outputDir, 'split_report.json')
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

    console.log('\n📊 Chunk Split Summary:')
    console.log(`   Files processed: ${this.stats.totalFiles}`)
    console.log(`   Total records: ${this.stats.totalRecords}`)
    console.log(`   Chunks created: ${this.stats.chunksCreated}`)
    console.log(`   Avg records per chunk: ${this.stats.avgRecordsPerChunk}`)
    console.log(`   Output directory: ${CHUNK_CONFIG.outputDir}`)
  }

  getChunkDirectories() {
    if (!fs.existsSync(CHUNK_CONFIG.outputDir)) return []

    return fs.readdirSync(CHUNK_CONFIG.outputDir)
      .filter(item => {
        const itemPath = path.join(CHUNK_CONFIG.outputDir, item)
        return fs.statSync(itemPath).isDirectory()
      })
      .map(dir => {
        const dirPath = path.join(CHUNK_CONFIG.outputDir, dir)
        const chunks = fs.readdirSync(dirPath).filter(f => f.startsWith('chunk_')).length
        return { directory: dir, chunks }
      })
  }
}

// Usage
async function main() {
  const args = process.argv.slice(2)

  // Allow command line overrides
  if (args.length > 0) {
    if (args[0] === '--help') {
      console.log('Usage: node 1-chunk-splitter.js [chunk-size] [max-chunks]')
      console.log('')
      console.log('Options:')
      console.log('  chunk-size    Number of records per chunk (default: 50)')
      console.log('  max-chunks    Maximum chunks to create (default: unlimited)')
      console.log('')
      console.log('Example: node 1-chunk-splitter.js 25 100')
      process.exit(0)
    }

    if (args[0]) CHUNK_CONFIG.chunkSize = parseInt(args[0])
    if (args[1]) CHUNK_CONFIG.maxChunks = parseInt(args[1])
  }

  try {
    const splitter = new ChunkSplitter()
    await splitter.processAllCSVFiles()
  } catch (error) {
    console.error('❌ Chunk splitting failed:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { ChunkSplitter }