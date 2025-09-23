#!/usr/bin/env node
// data-migration/scripts/0-xlsx-to-csv.js
// Simple XLSX to CSV converter - run this first to convert Excel files

const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

const CONFIG = {
  inputDir: '../data/source',
  outputDir: '../data/source'  // Convert in place
}

class XlsxToCsvConverter {
  constructor() {
    this.stats = {
      filesProcessed: 0,
      csvFilesCreated: 0,
      errors: 0
    }
  }

  async convertAllXlsxFiles() {
    console.log('📊 Converting XLSX files to CSV')
    console.log('==============================')

    const xlsxFiles = this.findXlsxFiles()
    console.log(`Found ${xlsxFiles.length} XLSX files to convert`)

    for (const file of xlsxFiles) {
      console.log(`\n📝 Converting: ${file.name}`)
      await this.convertXlsxFile(file)
    }

    this.generateReport()
    console.log('\n✅ XLSX to CSV conversion completed')
  }

  findXlsxFiles() {
    if (!fs.existsSync(CONFIG.inputDir)) {
      console.log(`⚠️  Source directory not found: ${CONFIG.inputDir}`)
      return []
    }

    return fs.readdirSync(CONFIG.inputDir)
      .filter(file => file.toLowerCase().endsWith('.xlsx'))
      .map(file => ({
        name: file,
        path: path.join(CONFIG.inputDir, file),
        size: fs.statSync(path.join(CONFIG.inputDir, file)).size
      }))
      .sort((a, b) => a.size - b.size) // Process smallest first
  }

  async convertXlsxFile(file) {
    try {
      const workbook = XLSX.readFile(file.path)
      this.stats.filesProcessed++

      // Process each worksheet
      for (const sheetName of workbook.SheetNames) {
        console.log(`   📋 Processing sheet: ${sheetName}`)

        const worksheet = workbook.Sheets[sheetName]
        const csvData = XLSX.utils.sheet_to_csv(worksheet)

        if (!csvData.trim()) {
          console.log(`   ⚠️  Sheet is empty, skipping`)
          continue
        }

        // Generate CSV filename
        const baseName = path.basename(file.name, '.xlsx')
        const csvFileName = workbook.SheetNames.length > 1
          ? `${baseName}_${sheetName}.csv`
          : `${baseName}.csv`

        const csvPath = path.join(CONFIG.outputDir, csvFileName)

        // Write CSV file
        fs.writeFileSync(csvPath, csvData, 'utf8')
        this.stats.csvFilesCreated++

        console.log(`   ✅ Created: ${csvFileName} (${this.countLines(csvData)} records)`)
      }

      // Optionally move or rename the original XLSX file
      console.log(`   📦 Moving original XLSX to .xlsx.backup`)
      fs.renameSync(file.path, `${file.path}.backup`)

    } catch (error) {
      console.error(`   ❌ Failed to convert ${file.name}:`, error.message)
      this.stats.errors++
    }
  }

  countLines(csvData) {
    return csvData.split('\n').filter(line => line.trim()).length - 1 // -1 for header
  }

  generateReport() {
    console.log('\n📊 Conversion Summary:')
    console.log(`   XLSX files processed: ${this.stats.filesProcessed}`)
    console.log(`   CSV files created: ${this.stats.csvFilesCreated}`)
    console.log(`   Errors: ${this.stats.errors}`)
    console.log(`   Output directory: ${CONFIG.outputDir}`)

    if (this.stats.errors > 0) {
      console.log('\n⚠️  Some files had errors. Check the logs above.')
    }

    if (this.stats.csvFilesCreated > 0) {
      console.log('\n🎯 Next step: Run data preparation on the CSV files')
      console.log('   cd data-migration/scripts && node 1-data-preparation.js')
    }
  }
}

// Usage
async function main() {
  try {
    const converter = new XlsxToCsvConverter()
    await converter.convertAllXlsxFiles()
  } catch (error) {
    console.error('❌ Conversion failed:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { XlsxToCsvConverter }