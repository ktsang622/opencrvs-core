const xlsx = require('xlsx');

console.log('=== ANALYZING INFORMANT PATTERNS ===\n');

const files = ['AB_MERGE (0221)_BI.xlsx', 'AB_MERGE (0221)_OTHER.xlsx'];

const allDescriptions = new Map();
const allNames = new Map();

files.forEach(filename => {
  console.log(`Processing: ${filename}`);

  const workbook = xlsx.readFile(filename);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonData = xlsx.utils.sheet_to_json(sheet);

  console.log(`Records: ${jsonData.length}`);

  jsonData.forEach(row => {
    const desc = row.i_desc;
    if (desc && desc.trim() && desc !== '-' && desc !== 'NULL') {
      const cleaned = desc.trim();
      allDescriptions.set(cleaned, (allDescriptions.get(cleaned) || 0) + 1);
    }

    const name = row.i_name;
    if (name && name.trim() && name !== '-' && name !== 'NULL') {
      const cleaned = name.trim();
      allNames.set(cleaned, (allNames.get(cleaned) || 0) + 1);
    }
  });

  console.log('');
});

// Sort by frequency
const sortedDescriptions = Array.from(allDescriptions.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 50); // Top 50

const sortedNames = Array.from(allNames.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30); // Top 30

console.log('=== TOP INFORMANT DESCRIPTIONS (i_desc) ===\n');
console.log('Count | Description');
console.log('------|------------');
sortedDescriptions.forEach(([desc, count]) => {
  console.log(`${String(count).padStart(5)} | ${desc}`);
});

console.log('\n=== TOP INFORMANT NAMES (i_name) ===\n');
console.log('Count | Name');
console.log('------|-----');
sortedNames.forEach(([name, count]) => {
  console.log(`${String(count).padStart(5)} | ${name}`);
});

console.log('\n=== PATTERN ANALYSIS ===\n');

// Analyze patterns in descriptions
const patterns = {
  affidavit: 0,
  mother: 0,
  father: 0,
  undertaker: 0,
  doctor: 0,
  hospital: 0,
  certificate: 0,
  sworn: 0,
  other: 0
};

allDescriptions.forEach((count, desc) => {
  const lower = desc.toLowerCase();
  if (lower.includes('affidav')) patterns.affidavit += count;
  else if (lower.includes('mother') || lower.includes('mom')) patterns.mother += count;
  else if (lower.includes('father') || lower.includes('dad')) patterns.father += count;
  else if (lower.includes('undertaker')) patterns.undertaker += count;
  else if (lower.includes('doctor') || lower.includes('dr.') || lower.includes('dr ')) patterns.doctor += count;
  else if (lower.includes('hospital')) patterns.hospital += count;
  else if (lower.includes('certificate') || lower.includes('cert')) patterns.certificate += count;
  else if (lower.includes('sworn')) patterns.sworn += count;
  else patterns.other += count;
});

console.log('Pattern Distribution:');
Object.entries(patterns).forEach(([pattern, count]) => {
  console.log(`${pattern.padEnd(12)}: ${count} records`);
});