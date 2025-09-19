const xlsx = require('xlsx');

console.log('=== LEGACY PARISH NAMES ANALYSIS ===\n');

const files = ['AB_MERGE (0221)_BI.xlsx', 'AB_MERGE (0221)_OTHER.xlsx'];
const parishNames = new Map();

files.forEach(filename => {
  const workbook = xlsx.readFile(filename);
  const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

  jsonData.forEach(row => {
    const parish = row.parish_nm;
    if (parish && parish.trim() && parish !== 'NULL') {
      const cleaned = parish.trim().toUpperCase();
      parishNames.set(cleaned, (parishNames.get(cleaned) || 0) + 1);
    }
  });
});

console.log('Unique Legacy Parish Names:');
console.log('Count | Parish Name');
console.log('------|------------');

const sortedParishes = Array.from(parishNames.entries())
  .sort((a, b) => b[1] - a[1]);

sortedParishes.forEach(([parish, count]) => {
  console.log(`${String(count).padStart(5)} | ${parish}`);
});

console.log(`\nTotal unique parishes: ${parishNames.size}`);
console.log(`Total records with parish data: ${Array.from(parishNames.values()).reduce((a, b) => a + b, 0)}`);

// Export for mapping
console.log('\n=== FOR MAPPING REFERENCE ===');
console.log('Legacy Parish Names (sorted by frequency):');
sortedParishes.forEach(([parish, count]) => {
  console.log(`"${parish}"`);
});