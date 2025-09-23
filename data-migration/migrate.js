#!/usr/bin/env node

// Main migration runner script
const { program } = require('commander')
const { DataCleanser } = require('./scripts/1-cleansing')
const { FHIRImporter } = require('./scripts/2-fhir-import')
const { ReviewTool } = require('./scripts/3-review-tool')

program
  .name('migrate')
  .description('OpenCRVS Legacy Data Migration Tool')
  .version('1.0.0')

program
  .command('cleanse')
  .description('Phase 1: Cleanse Excel data to CSV')
  .option('-s, --source <dir>', 'Source directory containing Excel files', './data/source')
  .option('-o, --output <dir>', 'Output directory for cleansed CSV files', './data/cleansed')
  .action(async (options) => {
    console.log('🧹 Starting Phase 1: Data Cleansing...')
    try {
      const cleanser = new DataCleanser()
      await cleanser.cleanseExcelFiles(options.source, options.output)
      console.log('✅ Phase 1 completed successfully')
    } catch (error) {
      console.error('❌ Phase 1 failed:', error.message)
      process.exit(1)
    }
  })

program
  .command('import')
  .description('Phase 2: Import cleansed data to FHIR')
  .argument('<csv-file>', 'Path to cleansed CSV file')
  .option('-u, --fhir-url <url>', 'FHIR server URL', 'http://localhost:3447/fhir')
  .option('-b, --batch-size <size>', 'Batch size for import', '1000')
  .action(async (csvFile, options) => {
    console.log('🚀 Starting Phase 2: FHIR Import...')
    try {
      const importer = new FHIRImporter()
      importer.config = {
        ...importer.config,
        fhirUrl: options.fhirUrl,
        batchSize: parseInt(options.batchSize)
      }
      await importer.importFromCSV(csvFile)
      console.log('✅ Phase 2 completed successfully')
    } catch (error) {
      console.error('❌ Phase 2 failed:', error.message)
      process.exit(1)
    }
  })

program
  .command('review')
  .description('Phase 3: Start review tool for manual record review')
  .option('-p, --port <port>', 'Port for review tool web interface', '3001')
  .action((options) => {
    console.log('🔍 Starting Phase 3: Review Tool...')
    try {
      const reviewTool = new ReviewTool(parseInt(options.port))
      reviewTool.start()
      // Keep process running
    } catch (error) {
      console.error('❌ Phase 3 failed:', error.message)
      process.exit(1)
    }
  })

program
  .command('full')
  .description('Run complete migration pipeline (cleanse + import)')
  .option('-s, --source <dir>', 'Source directory', './data/source')
  .option('-o, --output <dir>', 'Output directory', './data/cleansed')
  .option('-u, --fhir-url <url>', 'FHIR server URL', 'http://localhost:3447/fhir')
  .action(async (options) => {
    console.log('🎯 Starting Full Migration Pipeline...')

    try {
      // Phase 1: Cleansing
      console.log('\n📍 Phase 1: Data Cleansing')
      const cleanser = new DataCleanser()
      await cleanser.cleanseExcelFiles(options.source, options.output)

      // Phase 2: Import all cleansed files
      console.log('\n📍 Phase 2: FHIR Import')
      const fs = require('fs')
      const path = require('path')

      const cleanedFiles = fs.readdirSync(options.output)
        .filter(file => file.endsWith('-cleansed.csv'))

      const importer = new FHIRImporter()
      for (const file of cleanedFiles) {
        console.log(`\nImporting: ${file}`)
        await importer.importFromCSV(path.join(options.output, file))
      }

      console.log('\n✅ Full migration pipeline completed successfully!')
      console.log('\n📋 Next Steps:')
      console.log('1. Review failed records using: node migrate.js review')
      console.log('2. Check import logs in ./data/logs/')
      console.log('3. Verify data in OpenCRVS database')

    } catch (error) {
      console.error('❌ Full migration failed:', error.message)
      process.exit(1)
    }
  })

program
  .command('status')
  .description('Show migration status and statistics')
  .action(() => {
    console.log('📊 Migration Status Report')

    const fs = require('fs')
    const path = require('path')

    // Check cleansing report
    try {
      const cleansingReport = JSON.parse(
        fs.readFileSync('./data/cleansed/cleansing-report.json', 'utf8')
      )
      console.log('\n🧹 Cleansing Status:')
      console.log(`  • Total Records: ${cleansingReport.summary.totalRecords}`)
      console.log(`  • Cleaned: ${cleansingReport.summary.cleanedRecords}`)
      console.log(`  • Failed: ${cleansingReport.summary.failedRecords}`)
      console.log(`  • Success Rate: ${((cleansingReport.summary.cleanedRecords / cleansingReport.summary.totalRecords) * 100).toFixed(1)}%`)
    } catch (error) {
      console.log('\n🧹 Cleansing Status: Not yet run')
    }

    // Check import report
    try {
      const importReport = JSON.parse(
        fs.readFileSync('./data/logs/import-report.json', 'utf8')
      )
      console.log('\n🚀 Import Status:')
      console.log(`  • Total Records: ${importReport.summary.totalRecords}`)
      console.log(`  • Successful: ${importReport.summary.successfulImports}`)
      console.log(`  • Failed: ${importReport.summary.failedImports}`)
      console.log(`  • Review Queue: ${importReport.summary.reviewQueue}`)
      console.log(`  • Success Rate: ${importReport.successRate}`)
    } catch (error) {
      console.log('\n🚀 Import Status: Not yet run')
    }

    // Check review queue
    try {
      const reviewFiles = fs.readdirSync('./data/failed')
        .filter(file => file.endsWith('.json'))

      let totalReviewRecords = 0
      reviewFiles.forEach(file => {
        const data = JSON.parse(fs.readFileSync(`./data/failed/${file}`, 'utf8'))
        totalReviewRecords += data.records ? data.records.length : 0
      })

      console.log('\n🔍 Review Queue:')
      console.log(`  • Files: ${reviewFiles.length}`)
      console.log(`  • Records: ${totalReviewRecords}`)
    } catch (error) {
      console.log('\n🔍 Review Queue: Empty')
    }
  })

program.parse()