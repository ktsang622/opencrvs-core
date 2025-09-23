// scripts/3-review-tool.js
const express = require('express')
const fs = require('fs')
const path = require('path')

class ReviewTool {
  constructor(port = 3001) {
    this.app = express()
    this.port = port
    this.setupMiddleware()
    this.setupRoutes()
  }

  setupMiddleware() {
    this.app.use(express.json())
    this.app.use(express.static(path.join(__dirname, '../web')))
  }

  setupRoutes() {
    // Get review queue items
    this.app.get('/api/review-queue', (req, res) => {
      try {
        const reviewFiles = this.getReviewFiles()
        const allItems = reviewFiles.flatMap(file => {
          const data = JSON.parse(fs.readFileSync(file.path, 'utf8'))
          return data.records.map(record => ({
            ...record,
            sourceFile: file.name,
            id: `${file.name}-${record.printlog_id}`
          }))
        })

        res.json({
          total: allItems.length,
          items: allItems.slice(
            parseInt(req.query.offset) || 0,
            (parseInt(req.query.offset) || 0) + (parseInt(req.query.limit) || 50)
          )
        })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Get specific record for editing
    this.app.get('/api/record/:id', (req, res) => {
      try {
        const record = this.findRecordById(req.params.id)
        if (!record) {
          return res.status(404).json({ error: 'Record not found' })
        }
        res.json(record)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Update record
    this.app.put('/api/record/:id', (req, res) => {
      try {
        const updated = this.updateRecord(req.params.id, req.body)
        res.json(updated)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Approve record for import
    this.app.post('/api/record/:id/approve', async (req, res) => {
      try {
        const result = await this.approveRecord(req.params.id, req.body)
        res.json(result)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Reject record
    this.app.post('/api/record/:id/reject', (req, res) => {
      try {
        const result = this.rejectRecord(req.params.id, req.body.reason)
        res.json(result)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Bulk approve
    this.app.post('/api/bulk-approve', async (req, res) => {
      try {
        const results = await this.bulkApprove(req.body.recordIds)
        res.json(results)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Location mapping management
    this.app.get('/api/locations', (req, res) => {
      try {
        const mapping = this.loadLocationMapping()
        res.json(mapping)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    this.app.post('/api/locations', (req, res) => {
      try {
        const result = this.updateLocationMapping(req.body)
        res.json(result)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // Statistics
    this.app.get('/api/stats', (req, res) => {
      try {
        const stats = this.getReviewStats()
        res.json(stats)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })
  }

  getReviewFiles() {
    const reviewDir = './data/failed'
    if (!fs.existsSync(reviewDir)) return []

    return fs.readdirSync(reviewDir)
      .filter(file => file.endsWith('.json'))
      .map(file => ({
        name: file,
        path: path.join(reviewDir, file),
        modified: fs.statSync(path.join(reviewDir, file)).mtime
      }))
      .sort((a, b) => b.modified - a.modified)
  }

  findRecordById(id) {
    const [sourceFile, printlogId] = id.split('-', 2)
    const reviewFiles = this.getReviewFiles()

    for (const file of reviewFiles) {
      if (file.name === sourceFile) {
        const data = JSON.parse(fs.readFileSync(file.path, 'utf8'))
        const record = data.records.find(r => r.printlog_id === printlogId)
        if (record) {
          return {
            ...record,
            sourceFile: file.name,
            id
          }
        }
      }
    }
    return null
  }

  updateRecord(id, updates) {
    const [sourceFile, printlogId] = id.split('-', 2)
    const filePath = path.join('./data/failed', sourceFile)

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const recordIndex = data.records.findIndex(r => r.printlog_id === printlogId)

    if (recordIndex === -1) {
      throw new Error('Record not found')
    }

    // Update the record
    data.records[recordIndex] = {
      ...data.records[recordIndex],
      ...updates,
      lastModified: new Date().toISOString(),
      modifiedBy: 'review-tool'
    }

    // Save back to file
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))

    return data.records[recordIndex]
  }

  async approveRecord(id, updates = {}) {
    // Update record with any final changes
    const record = this.updateRecord(id, updates)

    // Create approved record file
    if (!fs.existsSync('./data/approved')) {
      fs.mkdirSync('./data/approved', { recursive: true })
    }

    const approvedPath = `./data/approved/approved-${Date.now()}-${id}.json`
    fs.writeFileSync(approvedPath, JSON.stringify({
      originalId: id,
      approvedAt: new Date().toISOString(),
      record
    }, null, 2))

    // Optionally trigger immediate import
    if (updates.importImmediately) {
      const { FHIRImporter } = require('./2-fhir-import.js')
      const importer = new FHIRImporter()

      try {
        await importer.processBatch([record], `approved-${id}`)
        return { status: 'approved_and_imported', record }
      } catch (error) {
        return { status: 'approved_import_failed', record, error: error.message }
      }
    }

    return { status: 'approved', record }
  }

  rejectRecord(id, reason) {
    const record = this.findRecordById(id)
    if (!record) {
      throw new Error('Record not found')
    }

    // Move to rejected folder
    if (!fs.existsSync('./data/rejected')) {
      fs.mkdirSync('./data/rejected', { recursive: true })
    }

    const rejectedPath = `./data/rejected/rejected-${Date.now()}-${id}.json`
    fs.writeFileSync(rejectedPath, JSON.stringify({
      originalId: id,
      rejectedAt: new Date().toISOString(),
      reason,
      record
    }, null, 2))

    // Remove from review queue
    this.removeFromReviewQueue(id)

    return { status: 'rejected', reason }
  }

  removeFromReviewQueue(id) {
    const [sourceFile, printlogId] = id.split('-', 2)
    const filePath = path.join('./data/failed', sourceFile)

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      data.records = data.records.filter(r => r.printlog_id !== printlogId)

      if (data.records.length === 0) {
        fs.unlinkSync(filePath)
      } else {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
      }
    } catch (error) {
      console.warn(`Failed to remove record ${id} from review queue:`, error.message)
    }
  }

  async bulkApprove(recordIds) {
    const results = []

    for (const id of recordIds) {
      try {
        const result = await this.approveRecord(id)
        results.push({ id, ...result })
      } catch (error) {
        results.push({ id, status: 'error', error: error.message })
      }
    }

    return { results, summary: this.summarizeBulkResults(results) }
  }

  summarizeBulkResults(results) {
    const summary = {
      total: results.length,
      approved: results.filter(r => r.status === 'approved').length,
      imported: results.filter(r => r.status === 'approved_and_imported').length,
      errors: results.filter(r => r.status === 'error').length
    }
    return summary
  }

  loadLocationMapping() {
    try {
      const mappingPath = './config/location-uuid-mapping.json'
      return JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
    } catch (error) {
      return { parishes: {}, states: {}, country: null }
    }
  }

  updateLocationMapping(newMappings) {
    const current = this.loadLocationMapping()
    const updated = { ...current, ...newMappings }

    fs.writeFileSync('./config/location-uuid-mapping.json', JSON.stringify(updated, null, 2))

    return { updated: Object.keys(newMappings).length }
  }

  getReviewStats() {
    const reviewFiles = this.getReviewFiles()
    let totalRecords = 0
    let totalIssues = {}

    reviewFiles.forEach(file => {
      const data = JSON.parse(fs.readFileSync(file.path, 'utf8'))
      totalRecords += data.records.length

      data.records.forEach(record => {
        if (record.issues) {
          record.issues.forEach(issue => {
            totalIssues[issue] = (totalIssues[issue] || 0) + 1
          })
        }
      })
    })

    return {
      totalRecords,
      totalFiles: reviewFiles.length,
      topIssues: Object.entries(totalIssues)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([issue, count]) => ({ issue, count }))
    }
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`🔍 Review Tool running at http://localhost:${this.port}`)
      console.log('📝 Review queue management interface available')
    })
  }
}

// Create simple HTML interface
const createWebInterface = () => {
  const webDir = './web'
  if (!fs.existsSync(webDir)) {
    fs.mkdirSync(webDir, { recursive: true })
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>OpenCRVS Migration Review Tool</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #2196F3; color: white; padding: 20px; margin: -20px -20px 20px -20px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .stat-card { background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; }
        .record-list { background: white; border: 1px solid #ddd; border-radius: 8px; }
        .record-item { padding: 15px; border-bottom: 1px solid #eee; }
        .record-item:last-child { border-bottom: none; }
        .quality-score { font-weight: bold; }
        .quality-high { color: green; }
        .quality-medium { color: orange; }
        .quality-low { color: red; }
        .actions { margin-top: 10px; }
        .btn { padding: 8px 16px; margin-right: 10px; border: none; border-radius: 4px; cursor: pointer; }
        .btn-approve { background: #4CAF50; color: white; }
        .btn-reject { background: #f44336; color: white; }
        .btn-edit { background: #2196F3; color: white; }
        .loading { text-align: center; padding: 40px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 OpenCRVS Migration Review Tool</h1>
        <p>Review and approve records for migration</p>
    </div>

    <div id="stats" class="stats"></div>
    <div id="records" class="record-list"></div>

    <script>
        let currentRecords = [];

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
                currentRecords = data.items;
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
                    <h3>\${stats.totalFiles}</h3>
                    <p>Review Files</p>
                </div>
                <div class="stat-card">
                    <h3>\${stats.topIssues.length}</h3>
                    <p>Issue Types</p>
                </div>
            \`;
            document.getElementById('stats').innerHTML = statsHtml;
        }

        function displayRecords(records) {
            const recordsHtml = records.map(record => \`
                <div class="record-item">
                    <h4>Record: \${record.printlog_id} - \${record.cert_nbr || 'No Cert #'}</h4>
                    <p><strong>Name:</strong> \${record.c_frst_nm || ''} \${record.c_last_nm || 'Unknown'}</p>
                    <p><strong>Birth Date:</strong> \${record.birth_date || record.c_dob || 'Unknown'}</p>
                    <p><strong>Parish:</strong> \${record.parish_nm || 'Unknown'}</p>
                    <p><strong>Quality Score:</strong>
                        <span class="quality-score quality-\${getQualityClass(record.quality_score)}">
                            \${(record.quality_score * 100).toFixed(1)}%
                        </span>
                    </p>
                    \${record.issues ? \`<p><strong>Issues:</strong> \${record.issues.join(', ')}</p>\` : ''}
                    <div class="actions">
                        <button class="btn btn-edit" onclick="editRecord('\${record.id}')">Edit</button>
                        <button class="btn btn-approve" onclick="approveRecord('\${record.id}')">Approve</button>
                        <button class="btn btn-reject" onclick="rejectRecord('\${record.id}')">Reject</button>
                    </div>
                </div>
            \`).join('');

            document.getElementById('records').innerHTML = recordsHtml || '<div class="loading">No records to review</div>';
        }

        function getQualityClass(score) {
            if (score >= 0.8) return 'high';
            if (score >= 0.6) return 'medium';
            return 'low';
        }

        async function approveRecord(id) {
            if (!confirm('Approve this record for migration?')) return;

            try {
                const response = await fetch(\`/api/record/\${id}/approve\`, { method: 'POST' });
                const result = await response.json();
                alert('Record approved successfully');
                loadRecords(); // Refresh list
            } catch (error) {
                alert('Failed to approve record: ' + error.message);
            }
        }

        async function rejectRecord(id) {
            const reason = prompt('Reason for rejection:');
            if (!reason) return;

            try {
                const response = await fetch(\`/api/record/\${id}/reject\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason })
                });
                const result = await response.json();
                alert('Record rejected');
                loadRecords(); // Refresh list
            } catch (error) {
                alert('Failed to reject record: ' + error.message);
            }
        }

        function editRecord(id) {
            // Simple edit - in a real implementation, this would open a detailed form
            const record = currentRecords.find(r => r.id === id);
            const newName = prompt('Edit first name:', record.c_frst_nm || '');
            if (newName !== null) {
                updateRecord(id, { c_frst_nm: newName });
            }
        }

        async function updateRecord(id, updates) {
            try {
                const response = await fetch(\`/api/record/\${id}\`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });
                const result = await response.json();
                alert('Record updated');
                loadRecords(); // Refresh list
            } catch (error) {
                alert('Failed to update record: ' + error.message);
            }
        }

        // Initialize
        loadStats();
        loadRecords();
    </script>
</body>
</html>
  `

  fs.writeFileSync(path.join(webDir, 'index.html'), htmlContent)
}

// Usage
async function main() {
  createWebInterface()
  const reviewTool = new ReviewTool()
  reviewTool.start()
}

if (require.main === module) {
  main()
}

module.exports = { ReviewTool }