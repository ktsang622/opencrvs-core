#!/usr/bin/env node
// data-migration/scripts/2-review-tool.js
// Review and approve records from the review queue

const express = require('express')
const fs = require('fs')
const path = require('path')

const REVIEW_CONFIG = {
  port: 3001,
  reviewQueueDir: './data/processed/review-queue',
  approvedDir: './data/processed/approved',
  rejectedDir: './data/processed/rejected',
  outputDir: './data/processed/reviewed'
}

class ReviewTool {
  constructor() {
    this.app = express()
    this.setupDirectories()
    this.setupMiddleware()
    this.setupRoutes()
  }

  setupDirectories() {
    [
      REVIEW_CONFIG.approvedDir,
      REVIEW_CONFIG.rejectedDir,
      REVIEW_CONFIG.outputDir,
      './web'
    ].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    })
  }

  setupMiddleware() {
    this.app.use(express.json())
    this.app.use(express.static(path.join(__dirname, '../../web')))
  }

  setupRoutes() {
    // Get review queue summary
    this.app.get('/api/review-queue', (req, res) => {
      try {
        const queueFiles = this.getReviewQueueFiles()
        const summary = this.getReviewSummary(queueFiles)

        res.json({
          files: queueFiles.length,
          totalRecords: summary.totalRecords,
          pendingRecords: summary.pendingRecords,
          items: this.getReviewItems(req.query.offset, req.query.limit)
        })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Get specific review file
    this.app.get('/api/review-file/:filename', (req, res) => {
      try {
        const filePath = path.join(REVIEW_CONFIG.reviewQueueDir, req.params.filename)
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        res.json(data)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Update record in review queue
    this.app.put('/api/review-record/:fileId/:recordId', (req, res) => {
      try {
        const result = this.updateReviewRecord(req.params.fileId, req.params.recordId, req.body)
        res.json(result)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Approve record(s)
    this.app.post('/api/approve', (req, res) => {
      try {
        const result = this.approveRecords(req.body.records)
        res.json(result)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Reject record(s)
    this.app.post('/api/reject', (req, res) => {
      try {
        const result = this.rejectRecords(req.body.records, req.body.reason)
        res.json(result)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Bulk approve all high-quality records
    this.app.post('/api/bulk-approve-high-quality', (req, res) => {
      try {
        const result = this.bulkApproveHighQuality()
        res.json(result)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Generate reviewed CSV for import
    this.app.post('/api/generate-import-csv', (req, res) => {
      try {
        const result = this.generateImportCSV(req.body.filename)
        res.json(result)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Get statistics
    this.app.get('/api/stats', (req, res) => {
      try {
        const stats = this.getReviewStatistics()
        res.json(stats)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })
  }

  getReviewQueueFiles() {
    if (!fs.existsSync(REVIEW_CONFIG.reviewQueueDir)) return []

    return fs.readdirSync(REVIEW_CONFIG.reviewQueueDir)
      .filter(file => file.endsWith('.json'))
      .map(file => ({
        filename: file,
        path: path.join(REVIEW_CONFIG.reviewQueueDir, file),
        modified: fs.statSync(path.join(REVIEW_CONFIG.reviewQueueDir, file)).mtime,
        size: fs.statSync(path.join(REVIEW_CONFIG.reviewQueueDir, file)).size
      }))
      .sort((a, b) => b.modified - a.modified)
  }

  getReviewSummary(queueFiles) {
    let totalRecords = 0
    let pendingRecords = 0

    queueFiles.forEach(file => {
      try {
        const data = JSON.parse(fs.readFileSync(file.path, 'utf8'))
        totalRecords += data.totalRecords
        pendingRecords += data.records.filter(r => r.reviewStatus === 'pending').length
      } catch (error) {
        console.warn(`Failed to read ${file.filename}:`, error.message)
      }
    })

    return { totalRecords, pendingRecords }
  }

  getReviewItems(offset = 0, limit = 50) {
    const items = []
    const queueFiles = this.getReviewQueueFiles()

    for (const file of queueFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(file.path, 'utf8'))
        const pendingRecords = data.records
          .filter(r => r.reviewStatus === 'pending')
          .map(record => ({
            ...record,
            fileId: file.filename,
            recordId: record.printlog_id || record.id || items.length
          }))

        items.push(...pendingRecords)

        if (items.length >= offset + limit) break
      } catch (error) {
        console.warn(`Failed to process ${file.filename}:`, error.message)
      }
    }

    return items.slice(offset, offset + limit)
  }

  updateReviewRecord(fileId, recordId, updates) {
    const filePath = path.join(REVIEW_CONFIG.reviewQueueDir, fileId)
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))

    const recordIndex = data.records.findIndex(r =>
      (r.printlog_id || r.id) === recordId
    )

    if (recordIndex === -1) {
      throw new Error('Record not found')
    }

    // Update record
    data.records[recordIndex] = {
      ...data.records[recordIndex],
      ...updates,
      lastModified: new Date().toISOString()
    }

    // Save back to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))

    return data.records[recordIndex]
  }

  approveRecords(recordIds) {
    const approved = []

    recordIds.forEach(({ fileId, recordId }) => {
      try {
        const filePath = path.join(REVIEW_CONFIG.reviewQueueDir, fileId)
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))

        const recordIndex = data.records.findIndex(r =>
          (r.printlog_id || r.id) === recordId
        )

        if (recordIndex >= 0) {
          const record = data.records[recordIndex]

          // Update review status
          record.reviewStatus = 'approved'
          record.reviewedAt = new Date().toISOString()
          record.reviewedBy = 'review-tool'

          approved.push({
            fileId,
            recordId,
            record
          })

          // Save back to queue file
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2))

          // Log approval
          this.logApproval(record)
        }
      } catch (error) {
        console.error(`Failed to approve ${fileId}:${recordId}:`, error.message)
      }
    })

    return {
      approved: approved.length,
      message: `Approved ${approved.length} records`
    }
  }

  rejectRecords(recordIds, reason) {
    const rejected = []

    recordIds.forEach(({ fileId, recordId }) => {
      try {
        const filePath = path.join(REVIEW_CONFIG.reviewQueueDir, fileId)
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))

        const recordIndex = data.records.findIndex(r =>
          (r.printlog_id || r.id) === recordId
        )

        if (recordIndex >= 0) {
          const record = data.records[recordIndex]

          // Create rejection record
          const rejectionRecord = {
            originalFileId: fileId,
            originalRecordId: recordId,
            rejectedAt: new Date().toISOString(),
            rejectedBy: 'review-tool',
            reason: reason,
            record: record
          }

          // Save to rejected folder
          const rejectedPath = path.join(
            REVIEW_CONFIG.rejectedDir,
            `rejected_${fileId}_${recordId}_${Date.now()}.json`
          )
          fs.writeFileSync(rejectedPath, JSON.stringify(rejectionRecord, null, 2))

          // Remove from review queue
          data.records.splice(recordIndex, 1)
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2))

          rejected.push({ fileId, recordId, reason })
        }
      } catch (error) {
        console.error(`Failed to reject ${fileId}:${recordId}:`, error.message)
      }
    })

    return {
      rejected: rejected.length,
      message: `Rejected ${rejected.length} records`
    }
  }

  bulkApproveHighQuality() {
    let approved = 0
    const queueFiles = this.getReviewQueueFiles()

    queueFiles.forEach(file => {
      try {
        const data = JSON.parse(fs.readFileSync(file.path, 'utf8'))

        data.records.forEach(record => {
          if (record.quality_score >= 0.8 && record.reviewStatus === 'pending') {
            record.reviewStatus = 'approved'
            record.reviewedAt = new Date().toISOString()
            record.reviewedBy = 'bulk-approve'
            approved++
          }
        })

        fs.writeFileSync(file.path, JSON.stringify(data, null, 2))
      } catch (error) {
        console.warn(`Failed to bulk approve ${file.filename}:`, error.message)
      }
    })

    return {
      approved,
      message: `Bulk approved ${approved} high-quality records`
    }
  }

  generateImportCSV(filename = null) {
    const approvedRecords = []
    const queueFiles = filename ?
      [{ filename, path: path.join(REVIEW_CONFIG.reviewQueueDir, filename) }] :
      this.getReviewQueueFiles()

    // Collect all approved records
    queueFiles.forEach(file => {
      try {
        const data = JSON.parse(fs.readFileSync(file.path, 'utf8'))
        const approved = data.records.filter(r => r.reviewStatus === 'approved')
        approvedRecords.push(...approved)
      } catch (error) {
        console.warn(`Failed to process ${file.filename}:`, error.message)
      }
    })

    if (approvedRecords.length === 0) {
      throw new Error('No approved records found')
    }

    // Generate CSV
    const csvFilename = `reviewed_import_${new Date().toISOString().split('T')[0]}.csv`
    const csvPath = path.join(REVIEW_CONFIG.outputDir, csvFilename)

    this.writeCSV(csvPath, approvedRecords)

    // Log generation
    const logEntry = {
      timestamp: new Date().toISOString(),
      filename: csvFilename,
      recordCount: approvedRecords.length,
      sourceFiles: queueFiles.map(f => f.filename)
    }

    const logPath = path.join(REVIEW_CONFIG.outputDir, 'generation-log.json')
    const existingLog = fs.existsSync(logPath) ?
      JSON.parse(fs.readFileSync(logPath, 'utf8')) : []

    existingLog.push(logEntry)
    fs.writeFileSync(logPath, JSON.stringify(existingLog, null, 2))

    return {
      filename: csvFilename,
      path: csvPath,
      recordCount: approvedRecords.length,
      message: `Generated import CSV with ${approvedRecords.length} records`
    }
  }

  logApproval(record) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      recordId: record.printlog_id || record.id,
      qualityScore: record.quality_score,
      childName: `${record.c_frst_nm || ''} ${record.c_last_nm || ''}`.trim()
    }

    const logPath = path.join(REVIEW_CONFIG.approvedDir, 'approval-log.json')
    const existingLog = fs.existsSync(logPath) ?
      JSON.parse(fs.readFileSync(logPath, 'utf8')) : []

    existingLog.push(logEntry)
    fs.writeFileSync(logPath, JSON.stringify(existingLog, null, 2))
  }

  getReviewStatistics() {
    const queueFiles = this.getReviewQueueFiles()
    const stats = {
      totalFiles: queueFiles.length,
      totalRecords: 0,
      pendingRecords: 0,
      approvedRecords: 0,
      qualityDistribution: { high: 0, medium: 0, low: 0 },
      topIssues: {}
    }

    queueFiles.forEach(file => {
      try {
        const data = JSON.parse(fs.readFileSync(file.path, 'utf8'))
        stats.totalRecords += data.totalRecords

        data.records.forEach(record => {
          if (record.reviewStatus === 'pending') stats.pendingRecords++
          if (record.reviewStatus === 'approved') stats.approvedRecords++

          // Quality distribution
          if (record.quality_score >= 0.8) stats.qualityDistribution.high++
          else if (record.quality_score >= 0.6) stats.qualityDistribution.medium++
          else stats.qualityDistribution.low++

          // Issue tracking
          if (record.issues) {
            record.issues.forEach(issue => {
              stats.topIssues[issue] = (stats.topIssues[issue] || 0) + 1
            })
          }
        })
      } catch (error) {
        console.warn(`Failed to analyze ${file.filename}:`, error.message)
      }
    })

    // Convert topIssues to sorted array
    stats.topIssues = Object.entries(stats.topIssues)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([issue, count]) => ({ issue, count }))

    return stats
  }

  writeCSV(outputPath, data) {
    if (data.length === 0) return

    const headers = Object.keys(data[0])
    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...data.map(row => headers.map(header => {
        const value = (row[header] || '').toString()
        return `"${value.replace(/"/g, '""')}"`
      }).join(','))
    ].join('\n')

    fs.writeFileSync(outputPath, csvContent, 'utf8')
  }

  start() {
    // Create simple web interface
    this.createWebInterface()

    this.app.listen(REVIEW_CONFIG.port, () => {
      console.log(`🔍 Review Tool running at http://localhost:${REVIEW_CONFIG.port}`)
      console.log('📋 Review queue management interface available')
    })
  }

  createWebInterface() {
    const webDir = path.join(__dirname, '../../web')
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>OpenCRVS Data Review Tool</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: #2196F3; color: white; padding: 20px; margin: -20px -20px 20px -20px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
        .actions { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
        .btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }
        .btn-primary { background: #2196F3; color: white; }
        .btn-success { background: #4CAF50; color: white; }
        .btn-warning { background: #FF9800; color: white; }
        .btn-danger { background: #f44336; color: white; }
        .record-list { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .record-item { padding: 15px; border-bottom: 1px solid #eee; }
        .record-item:last-child { border-bottom: none; }
        .quality-high { color: #4CAF50; font-weight: bold; }
        .quality-medium { color: #FF9800; font-weight: bold; }
        .quality-low { color: #f44336; font-weight: bold; }
        .record-actions { margin-top: 10px; }
        .loading { text-align: center; padding: 40px; }
        input[type="checkbox"] { margin-right: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 OpenCRVS Data Review Tool</h1>
        <p>Review and approve records for migration</p>
    </div>

    <div id="stats" class="stats"></div>

    <div class="actions">
        <button class="btn btn-success" onclick="bulkApproveHighQuality()">Bulk Approve High Quality</button>
        <button class="btn btn-primary" onclick="generateImportCSV()">Generate Import CSV</button>
        <button class="btn btn-warning" onclick="approveSelected()">Approve Selected</button>
        <button class="btn btn-danger" onclick="rejectSelected()">Reject Selected</button>
    </div>

    <div id="records" class="record-list"></div>

    <script>
        let selectedRecords = new Set();

        async function loadStats() {
            try {
                const response = await fetch('/api/stats');
                const stats = await response.json();
                displayStats(stats);
            } catch (error) {
                console.error('Failed to load stats:', error);
            }
        }

        async function loadRecords() {
            try {
                document.getElementById('records').innerHTML = '<div class="loading">Loading records...</div>';
                const response = await fetch('/api/review-queue?limit=50');
                const data = await response.json();
                displayRecords(data.items);
            } catch (error) {
                console.error('Failed to load records:', error);
                document.getElementById('records').innerHTML = '<div class="loading">Error loading records</div>';
            }
        }

        function displayStats(stats) {
            const statsHtml = \`
                <div class="stat-card">
                    <h3>\${stats.totalRecords}</h3>
                    <p>Total Records</p>
                </div>
                <div class="stat-card">
                    <h3>\${stats.pendingRecords}</h3>
                    <p>Pending Review</p>
                </div>
                <div class="stat-card">
                    <h3>\${stats.approvedRecords}</h3>
                    <p>Approved</p>
                </div>
                <div class="stat-card">
                    <h3>\${stats.qualityDistribution.high}</h3>
                    <p>High Quality</p>
                </div>
            \`;
            document.getElementById('stats').innerHTML = statsHtml;
        }

        function displayRecords(records) {
            const recordsHtml = records.map(record => \`
                <div class="record-item">
                    <input type="checkbox" onchange="toggleRecord('\${record.fileId}', '\${record.recordId}')" />
                    <strong>Record: \${record.printlog_id || record.recordId}</strong>
                    <p><strong>Name:</strong> \${record.c_frst_nm || ''} \${record.c_last_nm || 'Unknown'}</p>
                    <p><strong>Birth Date:</strong> \${record.birth_date || record.c_dob || 'Unknown'}</p>
                    <p><strong>Parish:</strong> \${record.parish_nm || 'Unknown'}</p>
                    <p><strong>Quality Score:</strong>
                        <span class="quality-\${getQualityClass(record.quality_score)}">
                            \${(record.quality_score * 100).toFixed(1)}%
                        </span>
                    </p>
                    \${record.issues ? \`<p><strong>Issues:</strong> \${record.issues.join(', ')}</p>\` : ''}
                </div>
            \`).join('');

            document.getElementById('records').innerHTML = recordsHtml || '<div class="loading">No records to review</div>';
        }

        function getQualityClass(score) {
            if (score >= 0.8) return 'high';
            if (score >= 0.6) return 'medium';
            return 'low';
        }

        function toggleRecord(fileId, recordId) {
            const key = \`\${fileId}:\${recordId}\`;
            if (selectedRecords.has(key)) {
                selectedRecords.delete(key);
            } else {
                selectedRecords.add(key);
            }
        }

        async function bulkApproveHighQuality() {
            if (!confirm('Approve all high quality records (80%+)?')) return;

            try {
                const response = await fetch('/api/bulk-approve-high-quality', { method: 'POST' });
                const result = await response.json();
                alert(result.message);
                loadStats();
                loadRecords();
            } catch (error) {
                alert('Failed to bulk approve: ' + error.message);
            }
        }

        async function generateImportCSV() {
            try {
                const response = await fetch('/api/generate-import-csv', { method: 'POST' });
                const result = await response.json();
                alert(\`Generated: \${result.filename} with \${result.recordCount} records\`);
            } catch (error) {
                alert('Failed to generate CSV: ' + error.message);
            }
        }

        async function approveSelected() {
            if (selectedRecords.size === 0) {
                alert('No records selected');
                return;
            }

            const records = Array.from(selectedRecords).map(key => {
                const [fileId, recordId] = key.split(':');
                return { fileId, recordId };
            });

            try {
                const response = await fetch('/api/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ records })
                });
                const result = await response.json();
                alert(result.message);
                selectedRecords.clear();
                loadStats();
                loadRecords();
            } catch (error) {
                alert('Failed to approve records: ' + error.message);
            }
        }

        async function rejectSelected() {
            if (selectedRecords.size === 0) {
                alert('No records selected');
                return;
            }

            const reason = prompt('Reason for rejection:');
            if (!reason) return;

            const records = Array.from(selectedRecords).map(key => {
                const [fileId, recordId] = key.split(':');
                return { fileId, recordId };
            });

            try {
                const response = await fetch('/api/reject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ records, reason })
                });
                const result = await response.json();
                alert(result.message);
                selectedRecords.clear();
                loadStats();
                loadRecords();
            } catch (error) {
                alert('Failed to reject records: ' + error.message);
            }
        }

        // Initialize
        loadStats();
        loadRecords();
    </script>
</body>
</html>`

    fs.writeFileSync(path.join(webDir, 'index.html'), htmlContent)
  }
}

// Usage
async function main() {
  try {
    const reviewTool = new ReviewTool()
    reviewTool.start()
  } catch (error) {
    console.error('❌ Review Tool failed to start:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { ReviewTool }