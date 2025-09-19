# Final Location UUID Strategy for Migration

## 🚨 **Current Situation**

**Issue Identified:** The OpenCRVS system is running with demo data (Farajaland locations) while the country config CSV files have been correctly updated to Antigua parishes.

**Root Cause:** The country config service needs to be rebuilt and redeployed with the updated CSV files.

## 🎯 **Solution Strategy**

### **Option 1: Deploy Updated Country Config (Recommended)**

#### **Step 1: Rebuild Country Config**
```bash
# In the country config directory
cd /home/ktsang/opencrvs-countryconfig-atg

# Build with updated Antigua parishes
yarn build

# Deploy the updated config
yarn start:prod
```

#### **Step 2: Verify Deployment**
```bash
# Test the updated locations API
curl "http://localhost:3040/locations?type=ADMIN_STRUCTURE&_count=0" | jq '.entry[].resource.name'

# Should return Antigua parish names:
# "Holy Trinity"
# "Saint George"
# "Saint John"
# "Saint Mary"
# "Saint Paul"
# "Saint Peter"
# "Saint Philip"
```

#### **Step 3: Fetch Correct UUIDs**
```bash
# Run the UUID fetcher script after deployment
node fetch-location-uuids.js
```

### **Option 2: Static Mapping (Immediate Workaround)**

If you can't redeploy immediately, use this static mapping based on the CSV structure:

```javascript
// Static location mapping based on country config CSV
const ANTIGUA_PARISH_MAPPING = {
  // Legacy variations → Expected UUID pattern
  'ST JOHN': {
    name: 'Saint John',
    pcode: 'ATG-ANTIGUA-SAINT_JOHN',
    expectedPattern: /saint.john/i
  },
  'ST MARY': {
    name: 'Saint Mary',
    pcode: 'ATG-ANTIGUA-SAINT_MARY',
    expectedPattern: /saint.mary/i
  },
  'ST PAUL': {
    name: 'Saint Paul',
    pcode: 'ATG-ANTIGUA-SAINT_PAUL',
    expectedPattern: /saint.paul/i
  },
  'ST PHILIP': {
    name: 'Saint Philip',
    pcode: 'ATG-ANTIGUA-SAINT_PHILIP',
    expectedPattern: /saint.philip/i
  },
  'ST GEORGE': {
    name: 'Saint George',
    pcode: 'ATG-ANTIGUA-SAINT_GEORGE',
    expectedPattern: /saint.george/i
  },
  'ST PETER': {
    name: 'Saint Peter',
    pcode: 'ATG-ANTIGUA-SAINT_PETER',
    expectedPattern: /saint.peter/i
  },
  'HOLY TRINITY': {
    name: 'Holy Trinity',
    pcode: 'ATG-BARBUDA-HOLY_TRINITY',
    expectedPattern: /holy.trinity/i
  }
}
```

## 📋 **Deployment Steps for Country Config**

### **Prerequisites:**
1. Country config CSV files are correctly updated ✅
2. OpenCRVS core is running
3. Database is initialized

### **Deployment Process:**

```bash
# 1. Navigate to country config
cd /home/ktsang/opencrvs-countryconfig-atg

# 2. Install dependencies (if needed)
yarn install

# 3. Build the configuration
yarn build

# 4. Set environment variables
export COUNTRY_CONFIG_HOST=http://localhost:3040
export OPENCRVS_CORE_HOST=http://localhost:7070

# 5. Start the country config service
yarn start:prod

# 6. Verify the deployment
curl -s "http://localhost:3040/locations?type=ADMIN_STRUCTURE&_count=0" | \
  jq -r '.entry[].resource | "\\(.name) | \\(.id)"'
```

### **Expected Output After Deployment:**
```
Holy Trinity | [uuid]
Saint George | [uuid]
Saint John | [uuid]
Saint Mary | [uuid]
Saint Paul | [uuid]
Saint Peter | [uuid]
Saint Philip | [uuid]
```

## 🔧 **Updated Location UUID Fetcher**

After successful deployment, use this enhanced fetcher:

```javascript
// Enhanced version that validates Antigua parishes
class AntiguaLocationFetcher extends LocationUUIDFetcher {
  validateAntiguaParishes(mapping) {
    const expectedParishes = [
      'Holy Trinity', 'Saint George', 'Saint John',
      'Saint Mary', 'Saint Paul', 'Saint Peter', 'Saint Philip'
    ];

    const foundParishes = Object.values(mapping.parishes)
      .map(p => p.name)
      .filter(name => expectedParishes.includes(name));

    if (foundParishes.length !== expectedParishes.length) {
      console.warn('⚠️ Missing expected Antigua parishes:');
      expectedParishes.forEach(expected => {
        if (!foundParishes.includes(expected)) {
          console.warn(\`   • Missing: \${expected}\`);
        }
      });

      return false;
    }

    console.log('✅ All Antigua parishes found correctly');
    return true;
  }

  async run() {
    await super.run();

    // Additional validation for Antigua
    const mapping = JSON.parse(
      require('fs').readFileSync('config/location-uuid-mapping.json', 'utf8')
    );

    this.validateAntiguaParishes(mapping);
  }
}
```

## 📊 **Migration Quality Check**

Once locations are properly deployed, verify the mapping quality:

```bash
# Check location API response
curl -s "http://localhost:3040/locations?type=ADMIN_STRUCTURE&_count=0" | \
  jq '.entry[].resource | select(.identifier[] | select(.system == "http://opencrvs.org/specs/id/jurisdiction-type" and .value == "DISTRICT")) | .name'

# Should return all 7 Antigua parishes
```

## 🎯 **Recommendation**

**Deploy the country config first** to get the correct location structure, then run the migration. This ensures:

1. ✅ Correct Antigua parish names in the system
2. ✅ Proper UUID generation for actual parishes
3. ✅ Accurate location mapping for 168,566 legacy records
4. ✅ No need for workarounds or static mappings

The CSV files are ready - just need to deploy them to the running system!