// Script to fetch location UUIDs from OpenCRVS Country Config API
// This will create the mapping table for migration cleansing

const fetch = require('node-fetch');

const COUNTRY_CONFIG_URL = process.env.COUNTRY_CONFIG_URL || 'http://localhost:3040';
const APPLICATION_CONFIG_URL = process.env.APPLICATION_CONFIG_URL || 'http://localhost:2021';

class LocationUUIDFetcher {
  constructor() {
    this.locationMapping = new Map();
    this.legacyParishMapping = {
      // Primary mappings (most common)
      'ST JOHN': 'Saint John',
      'ST MARY': 'Saint Mary',
      'ST PAUL': 'Saint Paul',
      'ST PHILIP': 'Saint Philip',
      'ST GEORGE': 'Saint George',
      'ST PETER': 'Saint Peter',
      'SAINT JOHN': 'Saint John',
      'HOLY TRINITY': 'Holy Trinity',

      // Variant spellings
      'ST. JOHN': 'Saint John',
      'ST.JOHN': 'Saint John',
      'ST. JOHN\'S': 'Saint John',
      'ST.JOHN\'S': 'Saint John',
      'SAINT JOHNS': 'Saint John',
      'ST.JOHNS': 'Saint John',
      'SAINT JOHN\'S': 'Saint John',
      'ST JOHNST JOHN': 'Saint John', // Typo in data

      // Mary variants
      'SAINT MARY': 'Saint Mary',
      'ST.MARY': 'Saint Mary',
      'ST. MARY': 'Saint Mary',
      'SAIN MARY': 'Saint Mary', // Typo

      // Paul variants
      'SAINT PAUL': 'Saint Paul',
      'ST.PAUL': 'Saint Paul',
      'ST. PAUL': 'Saint Paul',

      // Philip variants
      'SAINT PHILIP': 'Saint Philip',
      'ST.PHILIP': 'Saint Philip',
      'ST.PHILLIP': 'Saint Philip',
      'SAINT PHILLIP': 'Saint Philip',
      'SAINT. PHILLIP': 'Saint Philip',
      'ST. PHILLIPS': 'Saint Philip',
      'ST.PHILLIPS': 'Saint Philip',
      'SAINT PHILLIPS': 'Saint Philip',

      // George variants
      'SAINT GEORGE': 'Saint George',
      'SAINT GEORGES': 'Saint George',
      'SAINT GEORGE\'S': 'Saint George',

      // Peter variants
      'SAINT PETER': 'Saint Peter',
      'ST. PETER': 'Saint Peter'
    };
  }

  async fetchAllLocations() {
    try {
      console.log('🔍 Fetching all locations from OpenCRVS...');

      const response = await fetch(`${APPLICATION_CONFIG_URL}/locations?type=ADMIN_STRUCTURE&_count=0`);

      if (!response.ok) {
        throw new Error(`Failed to fetch locations: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.entry || !Array.isArray(data.entry)) {
        throw new Error('Invalid response format from locations API');
      }

      console.log(`📦 Found ${data.entry.length} locations`);

      return data.entry.map(entry => entry.resource);

    } catch (error) {
      console.error('❌ Error fetching locations:', error.message);
      throw error;
    }
  }

  processLocations(locations) {
    console.log('🏗️ Processing location hierarchy...');

    const byType = {
      country: [],
      state: [],
      district: []
    };

    // Categorize locations
    locations.forEach(location => {
      const jurisdictionType = location.identifier?.find(
        id => id.system === 'http://opencrvs.org/specs/id/jurisdiction-type'
      )?.value;

      if (!jurisdictionType) {
        // Root country level (no jurisdiction type)
        byType.country.push(location);
      } else if (jurisdictionType === 'STATE') {
        byType.state.push(location);
      } else if (jurisdictionType === 'DISTRICT') {
        byType.district.push(location);
      }
    });

    console.log(`📊 Location breakdown:`);
    console.log(`   • Countries: ${byType.country.length}`);
    console.log(`   • States: ${byType.state.length}`);
    console.log(`   • Districts (Parishes): ${byType.district.length}`);

    return byType;
  }

  createLocationMapping(locationsByType) {
    console.log('🗺️ Creating location UUID mapping...');

    const mapping = {
      parishes: {},
      states: {},
      country: null
    };

    // Map parishes (districts) - this is what we need for migration
    locationsByType.district.forEach(district => {
      const name = district.name;
      const id = district.id;

      mapping.parishes[name] = {
        uuid: id,
        name: name,
        pcode: district.identifier?.find(
          id => id.system === 'http://opencrvs.org/specs/id/statistical-code'
        )?.value,
        parentRef: district.partOf?.reference
      };

      // Also map by standardized legacy names
      Object.entries(this.legacyParishMapping).forEach(([legacy, standard]) => {
        if (standard === name) {
          mapping.parishes[legacy] = mapping.parishes[name];
        }
      });
    });

    // Map states for reference
    locationsByType.state.forEach(state => {
      mapping.states[state.name] = {
        uuid: state.id,
        name: state.name,
        pcode: state.identifier?.find(
          id => id.system === 'http://opencrvs.org/specs/id/statistical-code'
        )?.value
      };
    });

    // Map country
    if (locationsByType.country.length > 0) {
      const country = locationsByType.country[0];
      mapping.country = {
        uuid: country.id,
        name: country.name
      };
    }

    return mapping;
  }

  generateMappingFiles(mapping) {
    const fs = require('fs');
    const path = require('path');

    // 1. Generate JSON mapping file for code
    const jsonMapping = {
      parishes: mapping.parishes,
      states: mapping.states,
      country: mapping.country,
      generatedAt: new Date().toISOString()
    };

    fs.writeFileSync(
      'config/location-uuid-mapping.json',
      JSON.stringify(jsonMapping, null, 2)
    );

    // 2. Generate CSV for human review
    const csvLines = ['Legacy Parish Name,OpenCRVS Name,UUID,P-Code'];

    Object.entries(mapping.parishes).forEach(([legacy, info]) => {
      if (info && info.uuid) {
        csvLines.push(`"${legacy}","${info.name}","${info.uuid}","${info.pcode || ''}"`);
      }
    });

    fs.writeFileSync('config/parish-mapping.csv', csvLines.join('\\n'));

    // 3. Generate migration cleansing rules
    const cleansingRules = {
      // For use in cleansing script
      PARISH_UUID_MAPPING: {}
    };

    Object.entries(this.legacyParishMapping).forEach(([legacy, standard]) => {
      const parishInfo = mapping.parishes[standard];
      if (parishInfo) {
        cleansingRules.PARISH_UUID_MAPPING[legacy] = parishInfo.uuid;
      }
    });

    fs.writeFileSync(
      'config/cleansing-rules.json',
      JSON.stringify(cleansingRules, null, 2)
    );

    console.log('✅ Generated mapping files:');
    console.log('   • config/location-uuid-mapping.json');
    console.log('   • config/parish-mapping.csv');
    console.log('   • config/cleansing-rules.json');
  }

  async run() {
    try {
      console.log('🚀 Starting location UUID fetch...');

      // Create config directory if it doesn't exist
      const fs = require('fs');
      if (!fs.existsSync('config')) {
        fs.mkdirSync('config');
      }

      // Step 1: Fetch all locations
      const locations = await this.fetchAllLocations();

      // Step 2: Process and categorize
      const locationsByType = this.processLocations(locations);

      // Step 3: Create mapping
      const mapping = this.createLocationMapping(locationsByType);

      // Step 4: Generate files
      this.generateMappingFiles(mapping);

      // Step 5: Display summary
      console.log('\\n📋 Summary:');
      console.log(`   • Total parishes mapped: ${Object.keys(mapping.parishes).length}`);
      console.log(`   • Legacy variants supported: ${Object.keys(this.legacyParishMapping).length}`);
      console.log('\\n🎯 Parish Mappings:');

      // Show unique parishes only
      const uniqueParishes = new Set();
      Object.values(mapping.parishes).forEach(parish => {
        if (parish && parish.name) {
          uniqueParishes.add(`${parish.name} → ${parish.uuid}`);
        }
      });

      Array.from(uniqueParishes).forEach(mapping => {
        console.log(`   • ${mapping}`);
      });

      console.log('\\n✨ Location UUID mapping complete!');

    } catch (error) {
      console.error('💥 Failed to fetch location UUIDs:', error.message);
      process.exit(1);
    }
  }
}

// Usage
async function main() {
  const fetcher = new LocationUUIDFetcher();
  await fetcher.run();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = LocationUUIDFetcher;