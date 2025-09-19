const xlsx = require('xlsx');

console.log('=== ANALYZING LEGACY DATA SOURCE STRUCTURE ===\n');

// Analyze both files
const files = ['AB_MERGE (0221)_BI.xlsx', 'AB_MERGE (0221)_OTHER.xlsx'];
let allColumns = new Map();

files.forEach(filename => {
  console.log(`Processing: ${filename}`);

  const workbook = xlsx.readFile(filename);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to JSON for analysis
  const jsonData = xlsx.utils.sheet_to_json(sheet);
  console.log(`Records: ${jsonData.length}`);

  if (jsonData.length > 0) {
    // Get all column names from first row
    Object.keys(jsonData[0]).forEach(header => {
      if (!allColumns.has(header)) {
        allColumns.set(header, {
          header: header,
          files: [],
          samples: [],
          nullCounts: {},
          totalCounts: {}
        });
      }

      const col = allColumns.get(header);
      col.files.push(filename);
      col.totalCounts[filename] = jsonData.length;

      // Count nulls/empties
      const nullCount = jsonData.filter(row => {
        const val = row[header];
        return val === null || val === undefined || val === '' || val === 'NULL';
      }).length;

      col.nullCounts[filename] = nullCount;

      // Get sample non-null values
      const nonNullValues = jsonData.filter(row => {
        const val = row[header];
        return val !== null && val !== undefined && val !== '' && val !== 'NULL';
      }).map(row => row[header]).slice(0, 3);

      col.samples = col.samples.concat(nonNullValues).slice(0, 5);
    });
  }
  console.log('');
});

console.log(`Total unique columns found: ${allColumns.size}\n`);
console.log('=== DETAILED COLUMN ANALYSIS ===\n');

// Sort columns alphabetically for better organization
const sortedColumns = Array.from(allColumns.entries()).sort((a, b) => a[0].localeCompare(b[0]));

sortedColumns.forEach(([header, data], index) => {
  const totalRecords = Math.max(...Object.values(data.totalCounts));
  const totalNulls = Math.max(...Object.values(data.nullCounts));
  const nullPercentage = ((totalNulls / totalRecords) * 100).toFixed(1);

  console.log(`${String(index + 1).padStart(2, '0')}. ${header}`);
  console.log(`    Files: ${data.files.join(', ')}`);
  console.log(`    Null/Empty: ${totalNulls}/${totalRecords} (${nullPercentage}%)`);
  console.log(`    Sample values: [${data.samples.map(v => typeof v === 'string' ? `'${String(v).substring(0, 30)}'` : v).join(', ')}]`);
  console.log('');
});