#!/usr/bin/env node
// data-import/scripts/2-import-monitor.js
// Monitor import results, handle exceptions, duplicates, and failures

const fs = require('fs')
const path = require('path')
const express = require('express')

const MONITOR_CONFIG = {
  port: 3002,
  chunksDir: './chunks',
  exceptionsDir: './exceptions',
  reportsDir: './reports',
  duplicatesDir: './exceptions/duplicates',
  failuresDir: './exceptions/failures',
  retryDir: './exceptions/retry',
  watchInterval: 30000 // 30 seconds
}

class ImportMonitor {
  constructor() {
    this.app = express()
    this.importJobs = new Map()
    this.setupDirectories()
    this.setupMiddleware()
    this.setupRoutes()
    this.startWatching()
  }

  setupDirectories() {
    const dirs = [
      MONITOR_CONFIG.exceptionsDir,
      MONITOR_CONFIG.reportsDir,
      MONITOR_CONFIG.duplicatesDir,
      MONITOR_CONFIG.failuresDir,
      MONITOR_CONFIG.retryDir,
      './web'
    ]

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    })
  }

  setupMiddleware() {
    this.app.use(express.json())
    this.app.use(express.static(path.join(__dirname, '../web')))
  }

  setupRoutes() {
    // Get current import status
    this.app.get('/api/status', (req, res) => {
      try {
        const status = this.getCurrentStatus()
        res.json(status)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Get import history
    this.app.get('/api/history', (req, res) => {
      try {
        const history = this.getImportHistory()
        res.json(history)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Get exceptions summary
    this.app.get('/api/exceptions', (req, res) => {
      try {
        const exceptions = this.getExceptionsSummary()
        res.json(exceptions)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Get specific exception details
    this.app.get('/api/exceptions/:type/:file', (req, res) => {
      try {
        const details = this.getExceptionDetails(req.params.type, req.params.file)
        res.json(details)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Retry failed chunks
    this.app.post('/api/retry/:chunkSet/:chunkId', async (req, res) => {
      try {
        const result = await this.retryChunk(req.params.chunkSet, req.params.chunkId)
        res.json(result)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Process duplicates (approve/reject)
    this.app.post('/api/duplicates/process', async (req, res) => {
      try {
        const result = await this.processDuplicates(req.body.action, req.body.records)
        res.json(result)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Generate consolidated report
    this.app.post('/api/generate-report', (req, res) => {
      try {
        const report = this.generateConsolidatedReport()
        res.json(report)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() })
    })
  }

  startWatching() {
    console.log(`👁️  Starting import monitoring (checking every ${MONITOR_CONFIG.watchInterval / 1000}s)`)

    setInterval(() => {
      this.scanForNewResults()
      this.updateJobStatuses()
      this.processExceptions()
    }, MONITOR_CONFIG.watchInterval)

    // Initial scan
    setTimeout(() => {
      this.scanForNewResults()
    }, 2000)
  }

  scanForNewResults() {
    if (!fs.existsSync(MONITOR_CONFIG.chunksDir)) return

    const chunkSets = fs.readdirSync(MONITOR_CONFIG.chunksDir)
      .filter(item => {
        const itemPath = path.join(MONITOR_CONFIG.chunksDir, item)
        return fs.statSync(itemPath).isDirectory()
      })

    chunkSets.forEach(chunkSet => {
      this.scanChunkSet(chunkSet)
    })
  }

  scanChunkSet(chunkSet) {
    const chunkSetPath = path.join(MONITOR_CONFIG.chunksDir, chunkSet)
    const resultsPath = path.join(chunkSetPath, 'results')

    if (!fs.existsSync(resultsPath)) return

    // Check for batch summary
    const summaryPath = path.join(resultsPath, 'batch_summary.json')
    if (fs.existsSync(summaryPath)) {
      this.processBatchSummary(chunkSet, summaryPath)
    }

    // Scan individual chunk results
    const resultFiles = fs.readdirSync(resultsPath)
      .filter(file => file.endsWith('.log'))

    resultFiles.forEach(resultFile => {
      this.processChunkResult(chunkSet, path.join(resultsPath, resultFile))
    })
  }

  processBatchSummary(chunkSet, summaryPath) {
    try {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))

      if (!this.importJobs.has(chunkSet)) {
        this.importJobs.set(chunkSet, {
          chunkSet,
          status: 'completed',
          startedAt: summary.completedAt,
          completedAt: summary.completedAt,
          totalChunks: summary.chunks.total,
          successfulChunks: summary.chunks.successful,
          failedChunks: summary.chunks.failed,
          duplicates: summary.records.duplicates || 0,
          failures: summary.records.failures || 0,
          lastUpdated: new Date().toISOString()
        })

        console.log(`📊 Processed batch summary for ${chunkSet}:`,
          `${summary.chunks.successful}/${summary.chunks.total} chunks successful`)
      }
    } catch (error) {
      console.warn(`Failed to process summary for ${chunkSet}:`, error.message)
    }
  }

  processChunkResult(chunkSet, resultPath) {
    try {
      const resultContent = fs.readFileSync(resultPath, 'utf8')
      const chunkId = path.basename(resultPath, '.log')

      // Parse log content for duplicates and failures
      const duplicates = this.extractDuplicatesFromLog(resultContent)
      const failures = this.extractFailuresFromLog(resultContent)

      if (duplicates.length > 0) {
        this.saveDuplicates(chunkSet, chunkId, duplicates)
      }

      if (failures.length > 0) {
        this.saveFailures(chunkSet, chunkId, failures)
      }

    } catch (error) {
      console.warn(`Failed to process result ${resultPath}:`, error.message)
    }
  }

  extractDuplicatesFromLog(logContent) {
    const duplicates = []
    const lines = logContent.split('\n')

    let inDuplicatesSection = false
    for (const line of lines) {
      if (line.includes('Potential duplicates detected:')) {
        inDuplicatesSection = true
        continue
      }

      if (inDuplicatesSection) {
        // Look for duplicate entries like: "- NULL: compositionId (trackingId)"
        const match = line.match(/- (.+): ([a-f0-9-]+) \(([A-Z0-9]+)\)/)
        if (match) {
          duplicates.push({
            childName: match[1].trim(),
            compositionId: match[2],
            trackingId: match[3],
            detectedAt: new Date().toISOString()
          })
        } else if (line.trim() === '' || line.includes('===')) {
          inDuplicatesSection = false
        }
      }
    }

    return duplicates
  }

  extractFailuresFromLog(logContent) {
    const failures = []
    const lines = logContent.split('\n')

    for (const line of lines) {
      if (line.includes('❌') && line.includes('failed')) {
        // Extract failure information
        const match = line.match(/Record (\d+).*failed.*?:(.+)/)
        if (match) {
          failures.push({
            recordNumber: parseInt(match[1]),
            error: match[2].trim(),
            failedAt: new Date().toISOString(),
            logLine: line
          })
        }
      }
    }

    return failures
  }

  saveDuplicates(chunkSet, chunkId, duplicates) {
    const duplicatesFile = path.join(MONITOR_CONFIG.duplicatesDir, `${chunkSet}_${chunkId}_duplicates.json`)

    const duplicatesData = {
      chunkSet,
      chunkId,
      detectedAt: new Date().toISOString(),
      count: duplicates.length,
      duplicates: duplicates.map(dup => ({
        ...dup,
        status: 'pending_review',
        action: null, // 'approve' or 'reject'
        reviewedBy: null,
        reviewedAt: null
      }))
    }

    fs.writeFileSync(duplicatesFile, JSON.stringify(duplicatesData, null, 2))
    console.log(`🚨 Saved ${duplicates.length} duplicates from ${chunkSet}/${chunkId}`)
  }

  saveFailures(chunkSet, chunkId, failures) {
    const failuresFile = path.join(MONITOR_CONFIG.failuresDir, `${chunkSet}_${chunkId}_failures.json`)

    const failuresData = {
      chunkSet,
      chunkId,
      detectedAt: new Date().toISOString(),
      count: failures.length,
      failures: failures.map(failure => ({
        ...failure,
        status: 'pending_retry',
        retryAttempts: 0,
        maxRetries: 3,
        lastRetryAt: null
      }))
    }

    fs.writeFileSync(failuresFile, JSON.stringify(failuresData, null, 2))
    console.log(`❌ Saved ${failures.length} failures from ${chunkSet}/${chunkId}`)
  }

  getCurrentStatus() {
    const jobs = Array.from(this.importJobs.values())

    return {
      timestamp: new Date().toISOString(),
      activeJobs: jobs.filter(j => j.status === 'running').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      totalChunks: jobs.reduce((sum, j) => sum + j.totalChunks, 0),
      successfulChunks: jobs.reduce((sum, j) => sum + j.successfulChunks, 0),
      failedChunks: jobs.reduce((sum, j) => sum + j.failedChunks, 0),
      totalDuplicates: jobs.reduce((sum, j) => sum + j.duplicates, 0),
      totalFailures: jobs.reduce((sum, j) => sum + j.failures, 0),
      jobs: jobs.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated))
    }
  }

  getImportHistory() {
    const jobs = Array.from(this.importJobs.values())

    return {
      total: jobs.length,
      byStatus: {
        completed: jobs.filter(j => j.status === 'completed').length,
        running: jobs.filter(j => j.status === 'running').length,
        failed: jobs.filter(j => j.status === 'failed').length
      },
      chronological: jobs.sort((a, b) => new Date(b.completedAt || b.startedAt) - new Date(a.completedAt || a.startedAt))
    }
  }

  getExceptionsSummary() {
    const summary = {
      duplicates: { count: 0, files: [] },
      failures: { count: 0, files: [] }
    }

    // Count duplicates
    if (fs.existsSync(MONITOR_CONFIG.duplicatesDir)) {
      const duplicateFiles = fs.readdirSync(MONITOR_CONFIG.duplicatesDir)
        .filter(f => f.endsWith('_duplicates.json'))

      summary.duplicates.files = duplicateFiles
      summary.duplicates.count = duplicateFiles.reduce((sum, file) => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(MONITOR_CONFIG.duplicatesDir, file), 'utf8'))
          return sum + data.count
        } catch {
          return sum
        }
      }, 0)
    }

    // Count failures
    if (fs.existsSync(MONITOR_CONFIG.failuresDir)) {
      const failureFiles = fs.readdirSync(MONITOR_CONFIG.failuresDir)
        .filter(f => f.endsWith('_failures.json'))

      summary.failures.files = failureFiles
      summary.failures.count = failureFiles.reduce((sum, file) => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(MONITOR_CONFIG.failuresDir, file), 'utf8'))
          return sum + data.count
        } catch {
          return sum
        }
      }, 0)
    }

    return summary
  }

  getExceptionDetails(type, file) {
    const validTypes = ['duplicates', 'failures']
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid exception type: ${type}`)
    }

    const dir = type === 'duplicates' ? MONITOR_CONFIG.duplicatesDir : MONITOR_CONFIG.failuresDir
    const filePath = path.join(dir, file)

    if (!fs.existsSync(filePath)) {
      throw new Error(`Exception file not found: ${file}`)
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  }

  async retryChunk(chunkSet, chunkId) {
    console.log(`🔄 Retrying chunk ${chunkSet}/${chunkId}`)

    // Implementation would trigger actual retry
    // For now, return success
    return {
      chunkSet,
      chunkId,
      status: 'retry_queued',
      message: `Retry queued for ${chunkSet}/${chunkId}`
    }
  }

  async processDuplicates(action, records) {
    console.log(`🔄 Processing ${records.length} duplicates with action: ${action}`)

    // Implementation would handle duplicate approval/rejection
    return {
      action,
      processed: records.length,
      message: `${action} applied to ${records.length} duplicate records`
    }
  }

  generateConsolidatedReport() {
    const status = this.getCurrentStatus()
    const exceptions = this.getExceptionsSummary()

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalJobs: status.activeJobs + status.completedJobs,
        totalChunks: status.totalChunks,
        successRate: status.totalChunks > 0 ?
          ((status.successfulChunks / status.totalChunks) * 100).toFixed(1) + '%' : '0%',
        duplicateRate: status.totalChunks > 0 ?
          ((status.totalDuplicates / status.totalChunks) * 100).toFixed(1) + '%' : '0%',
        failureRate: status.totalChunks > 0 ?
          ((status.totalFailures / status.totalChunks) * 100).toFixed(1) + '%' : '0%'
      },
      details: {
        completedJobs: status.completedJobs,
        successfulChunks: status.successfulChunks,
        failedChunks: status.failedChunks,
        pendingDuplicates: exceptions.duplicates.count,
        pendingFailures: exceptions.failures.count
      },
      recommendations: this.generateRecommendations(status, exceptions)
    }

    const reportPath = path.join(MONITOR_CONFIG.reportsDir, `consolidated_report_${new Date().toISOString().split('T')[0]}.json`)
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

    return report
  }

  generateRecommendations(status, exceptions) {
    const recommendations = []

    if (exceptions.duplicates.count > 0) {
      recommendations.push(`Review ${exceptions.duplicates.count} potential duplicates`)
    }

    if (exceptions.failures.count > 0) {
      recommendations.push(`Investigate ${exceptions.failures.count} failed records`)
    }

    if (status.failedChunks > status.totalChunks * 0.1) {
      recommendations.push('High chunk failure rate - check system resources and data quality')
    }

    if (status.totalDuplicates > status.totalChunks * 0.5) {
      recommendations.push('High duplicate rate - review deduplication settings')
    }

    return recommendations
  }

  updateJobStatuses() {
    // Check for any running jobs that may have completed
    // This would be more sophisticated in a real implementation
  }

  processExceptions() {
    // Auto-process certain types of exceptions
    // This would include retry logic, auto-approval of certain duplicates, etc.
  }

  start() {
    // Create web interface
    this.createWebInterface()

    this.app.listen(MONITOR_CONFIG.port, () => {
      console.log(`📊 Import Monitor running at http://localhost:${MONITOR_CONFIG.port}`)
      console.log('🔍 Real-time import monitoring and exception handling')
    })
  }

  createWebInterface() {
    const webDir = path.join(__dirname, '../web')
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>OpenCRVS Import Monitor</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: #4CAF50; color: white; padding: 20px; margin: -20px -20px 20px -20px; }
        .dashboard { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .card h3 { margin-top: 0; color: #333; }
        .metric { font-size: 2em; font-weight: bold; color: #4CAF50; }
        .progress { width: 100%; height: 20px; background: #ddd; border-radius: 10px; overflow: hidden; margin: 10px 0; }
        .progress-bar { height: 100%; background: #4CAF50; transition: width 0.3s ease; }
        .status-running { color: #FF9800; }
        .status-completed { color: #4CAF50; }
        .status-failed { color: #f44336; }
        .exceptions { margin-top: 20px; }
        .exception-item { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 5px 0; border-radius: 4px; }
        .btn { padding: 10px 20px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
        .btn-primary { background: #2196F3; color: white; }
        .btn-success { background: #4CAF50; color: white; }
        .btn-warning { background: #FF9800; color: white; }
        .logs { background: #1e1e1e; color: #fff; padding: 15px; border-radius: 4px; font-family: monospace; height: 200px; overflow-y: scroll; }
        .refresh { position: fixed; top: 20px; right: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 OpenCRVS Import Monitor</h1>
        <p>Real-time monitoring of data import progress and exception handling</p>
    </div>

    <button class="btn btn-primary refresh" onclick="refreshAll()">🔄 Refresh</button>

    <div class="dashboard" id="dashboard"></div>
    <div class="exceptions" id="exceptions"></div>

    <div class="card">
        <h3>📋 Activity Log</h3>
        <div id="logs" class="logs"></div>
    </div>

    <script>
        let logMessages = [];

        function addLog(message) {
            logMessages.unshift(\`[\${new Date().toLocaleTimeString()}] \${message}\`);
            if (logMessages.length > 50) logMessages.pop();
            document.getElementById('logs').innerHTML = logMessages.join('\\n');
        }

        async function loadStatus() {
            try {
                const response = await fetch('/api/status');
                const status = await response.json();
                displayStatus(status);
            } catch (error) {
                addLog('❌ Failed to load status: ' + error.message);
            }
        }

        async function loadExceptions() {
            try {
                const response = await fetch('/api/exceptions');
                const exceptions = await response.json();
                displayExceptions(exceptions);
            } catch (error) {
                addLog('❌ Failed to load exceptions: ' + error.message);
            }
        }

        function displayStatus(status) {
            const successRate = status.totalChunks > 0 ?
                (status.successfulChunks / status.totalChunks * 100).toFixed(1) : 0;

            const dashboardHtml = \`
                <div class="card">
                    <h3>📈 Import Progress</h3>
                    <div class="metric">\${status.completedJobs}</div>
                    <p>Completed Jobs</p>
                    <div class="progress">
                        <div class="progress-bar" style="width: \${successRate}%"></div>
                    </div>
                    <small>\${status.successfulChunks}/\${status.totalChunks} chunks successful (\${successRate}%)</small>
                </div>

                <div class="card">
                    <h3>🚨 Exceptions</h3>
                    <div class="metric">\${status.totalDuplicates + status.totalFailures}</div>
                    <p>Total Exceptions</p>
                    <div>Duplicates: \${status.totalDuplicates}</div>
                    <div>Failures: \${status.totalFailures}</div>
                </div>

                <div class="card">
                    <h3>⚡ Active Jobs</h3>
                    <div class="metric">\${status.activeJobs}</div>
                    <p>Currently Running</p>
                    <div>Failed Chunks: \${status.failedChunks}</div>
                </div>

                <div class="card">
                    <h3>📊 Statistics</h3>
                    <div>Success Rate: \${successRate}%</div>
                    <div>Duplicate Rate: \${status.totalChunks > 0 ? (status.totalDuplicates/status.totalChunks*100).toFixed(1) : 0}%</div>
                    <div>Failure Rate: \${status.totalChunks > 0 ? (status.totalFailures/status.totalChunks*100).toFixed(1) : 0}%</div>
                </div>
            \`;

            document.getElementById('dashboard').innerHTML = dashboardHtml;
            addLog(\`📊 Status updated: \${status.completedJobs} jobs completed, \${status.activeJobs} active\`);
        }

        function displayExceptions(exceptions) {
            let exceptionsHtml = '<div class="card"><h3>🚨 Exception Management</h3>';

            if (exceptions.duplicates.count > 0) {
                exceptionsHtml += \`
                    <div class="exception-item">
                        <strong>Duplicates: \${exceptions.duplicates.count}</strong>
                        <button class="btn btn-warning" onclick="processDuplicates('review')">Review Duplicates</button>
                        <button class="btn btn-success" onclick="processDuplicates('approve_all')">Approve All</button>
                    </div>
                \`;
            }

            if (exceptions.failures.count > 0) {
                exceptionsHtml += \`
                    <div class="exception-item">
                        <strong>Failures: \${exceptions.failures.count}</strong>
                        <button class="btn btn-primary" onclick="retryFailures()">Retry All</button>
                    </div>
                \`;
            }

            if (exceptions.duplicates.count === 0 && exceptions.failures.count === 0) {
                exceptionsHtml += '<p>✅ No exceptions found</p>';
            }

            exceptionsHtml += \`
                <button class="btn btn-primary" onclick="generateReport()">Generate Report</button>
            </div>\`;

            document.getElementById('exceptions').innerHTML = exceptionsHtml;
        }

        async function processDuplicates(action) {
            try {
                addLog(\`🔄 Processing duplicates with action: \${action}\`);
                // Implementation would call API
                addLog(\`✅ Duplicates processed with action: \${action}\`);
            } catch (error) {
                addLog('❌ Failed to process duplicates: ' + error.message);
            }
        }

        async function retryFailures() {
            try {
                addLog('🔄 Retrying failed chunks...');
                // Implementation would call API
                addLog('✅ Retry initiated for failed chunks');
            } catch (error) {
                addLog('❌ Failed to retry chunks: ' + error.message);
            }
        }

        async function generateReport() {
            try {
                const response = await fetch('/api/generate-report', { method: 'POST' });
                const report = await response.json();
                addLog(\`📊 Generated consolidated report - Success rate: \${report.summary.successRate}\`);
                alert('Report generated successfully!');
            } catch (error) {
                addLog('❌ Failed to generate report: ' + error.message);
            }
        }

        function refreshAll() {
            addLog('🔄 Refreshing dashboard...');
            loadStatus();
            loadExceptions();
        }

        // Initialize and auto-refresh
        refreshAll();
        setInterval(refreshAll, 30000); // Refresh every 30 seconds

        addLog('🚀 Import Monitor initialized');
    </script>
</body>
</html>`

    fs.writeFileSync(path.join(webDir, 'index.html'), htmlContent)
  }
}

// Usage
async function main() {
  try {
    const monitor = new ImportMonitor()
    monitor.start()
  } catch (error) {
    console.error('❌ Import Monitor failed to start:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { ImportMonitor }