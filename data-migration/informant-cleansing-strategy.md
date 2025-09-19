# Informant Data Cleansing Strategy

## 📊 **Pattern Analysis Results**

Based on 168,566 legacy records, the informant data shows clear patterns:

### **Primary Categories (i_desc field):**
- **Hospital Certificates**: 67,924 records (40.3%) - "CERTIFICATE FROM HOSPITAL"
- **Undertakers**: 13,958 records (8.3%) - Death notifications
- **Family Members**: 15,342 records (9.1%) - Mother/Father direct reporting
- **Medical Staff**: 11,507 records (6.8%) - Midwife/Nurse reporting
- **Certificates**: 10,918 records (6.5%) - Various certificate types
- **Other Relationships**: 30,940 records (18.4%) - Extended family, friends, etc.

### **Key Informant Names (i_name field):**
- **BASIL SAUNDERS**: 4,216 records (Undertaker)
- **NOEL BARNES**: 3,931 records (Undertaker)
- **CERTIFICATE FROM HOSPITAL**: 2,067 records (Institution)
- **BARNES FUNERAL HOME LTD**: 1,456 records (Funeral home)

## 🧹 **Cleansing Strategy**

### **Step 1: Pattern Recognition & Classification**

```javascript
// scripts/informant-cleaner.js
class InformantCleaner {
  constructor() {
    // Define mapping patterns
    this.patterns = {
      // Hospital/Medical certificates
      hospital: {
        regex: /certificate from hospital|hospital|medical centre|clinic|adelin/i,
        informantType: 'HEALTH_FACILITY',
        relationship: 'HEALTH_FACILITY'
      },

      // Undertakers and funeral homes
      undertaker: {
        regex: /undertaker|funeral home|barnes funeral|basil saunders|noel barnes/i,
        informantType: 'UNDERTAKER',
        relationship: 'UNDERTAKER'
      },

      // Medical staff
      medicalStaff: {
        regex: /midwife|mid wife|nurse|district nurse|doctor|dr\.|dispenser/i,
        informantType: 'HEALTHCARE_PROVIDER',
        relationship: 'HEALTHCARE_PROVIDER'
      },

      // Direct family
      mother: {
        regex: /^mother$|note from mother|letter from mother|madre/i,
        informantType: 'MOTHER',
        relationship: 'MOTHER'
      },

      father: {
        regex: /^father$|note from father|letter from father|father of child|padre/i,
        informantType: 'FATHER',
        relationship: 'FATHER'
      },

      // Extended family
      grandmother: {
        regex: /grandmother|grandma/i,
        informantType: 'GRANDMOTHER',
        relationship: 'GRANDMOTHER'
      },

      grandfather: {
        regex: /grandfather|grandpa/i,
        informantType: 'GRANDFATHER',
        relationship: 'GRANDFATHER'
      },

      // Siblings
      sibling: {
        regex: /^sister$|^brother$/i,
        informantType: 'SIBLING',
        relationship: 'EXTENDED_FAMILY'
      },

      // Other family
      extendedFamily: {
        regex: /aunt|uncle|cousin|nephew|niece|grandson|daughter|son/i,
        informantType: 'EXTENDED_FAMILY',
        relationship: 'EXTENDED_FAMILY'
      },

      // Official/Legal
      coroner: {
        regex: /coroner|magistrate court|asst registrar/i,
        informantType: 'LEGAL_GUARDIAN',
        relationship: 'GOVERNMENT_OFFICIAL'
      },

      // Affidavits (complex patterns)
      affidavit: {
        regex: /affidav|sworn/i,
        informantType: 'OTHER', // Will need manual parsing
        relationship: 'OTHER'
      }
    }

    // Known undertaker names
    this.undertakerNames = new Set([
      'BASIL SAUNDERS', 'B. SAUNDERS', 'E. SAUNDERS',
      'NOEL BARNES', 'N. BARNES',
      'BARNES FUNERAL HOME LTD'
    ])

    // Known medical staff names
    this.medicalStaffNames = new Set([
      'C. THOMAS', 'CAROLINE THOMAS',
      'M. HOWELL', 'MARY HOWELL',
      'G. EDWARDS', 'ANN ETINOFF', 'A. ETINOFF',
      'PETER PHILIP', 'S. EUDELLE',
      'MABEL HARRIS', 'STELLA LOOBY'
    ])
  }

  cleanseInformantData(record) {
    const desc = record.i_desc || ''
    const name = record.i_name || ''
    const eventType = record.event // BI, DE, MA

    // Initialize result
    const result = {
      informantType: 'OTHER',
      relationship: 'OTHER',
      name: null,
      address: record.i_address || null,
      cleanedDescription: desc.trim(),
      confidence: 0,
      issues: []
    }

    // Step 1: Handle empty/null data
    if (!desc.trim() && !name.trim()) {
      result.issues.push('No informant data provided')
      result.confidence = 0
      return result
    }

    // Step 2: Check for known name patterns first
    if (name.trim()) {
      const cleanName = name.trim().toUpperCase()

      if (this.undertakerNames.has(cleanName)) {
        result.informantType = 'UNDERTAKER'
        result.relationship = 'UNDERTAKER'
        result.name = this.formatName(name)
        result.confidence = 95
        return result
      }

      if (this.medicalStaffNames.has(cleanName)) {
        result.informantType = 'HEALTHCARE_PROVIDER'
        result.relationship = 'HEALTHCARE_PROVIDER'
        result.name = this.formatName(name)
        result.confidence = 90
        return result
      }

      // Check if name itself indicates relationship
      if (cleanName === 'CERTIFICATE FROM HOSPITAL') {
        result.informantType = 'HEALTH_FACILITY'
        result.relationship = 'HEALTH_FACILITY'
        result.name = 'Hospital Certificate'
        result.confidence = 100
        return result
      }
    }

    // Step 3: Pattern matching on description
    for (const [patternName, pattern] of Object.entries(this.patterns)) {
      if (pattern.regex.test(desc)) {
        result.informantType = pattern.informantType
        result.relationship = pattern.relationship
        result.confidence = this.calculateConfidence(patternName, desc)

        // Extract name if available
        if (name.trim() && name !== '-') {
          result.name = this.formatName(name)
        } else {
          result.name = this.extractNameFromDescription(desc, patternName)
        }

        // Handle special cases
        if (patternName === 'affidavit') {
          const parsed = this.parseAffidavitText(desc)
          result.informantType = parsed.informantType
          result.relationship = parsed.relationship
          result.name = parsed.name
          result.confidence = parsed.confidence
          result.issues.push('Parsed from affidavit text')
        }

        return result
      }
    }

    // Step 4: Default handling for unmatched patterns
    if (name.trim() && name !== '-') {
      result.name = this.formatName(name)
      result.confidence = 30
      result.issues.push('Unmatched pattern - using name only')
    } else {
      result.issues.push('No recognizable pattern found')
      result.confidence = 10
    }

    return result
  }

  parseAffidavitText(text) {
    // Handle complex affidavit descriptions like:
    // "AFFIDAVIS SWORN BY PAGETT AND JENETA HENNES"
    // "AFFIDAVID SWORN BY VIRGINIA WATKINS"

    const result = {
      informantType: 'OTHER',
      relationship: 'OTHER',
      name: null,
      confidence: 60
    }

    // Extract names after "SWORN BY"
    const swornByMatch = text.match(/sworn by (.+)/i)
    if (swornByMatch) {
      const names = swornByMatch[1].trim()

      // Check if it mentions mother/father
      if (/mother|mom/i.test(text)) {
        result.informantType = 'MOTHER'
        result.relationship = 'MOTHER'
        result.confidence = 80
      } else if (/father|dad/i.test(text)) {
        result.informantType = 'FATHER'
        result.relationship = 'FATHER'
        result.confidence = 80
      } else {
        // Try to extract the relationship from context
        result.informantType = 'LEGAL_GUARDIAN'
        result.relationship = 'OTHER'
        result.confidence = 60
      }

      result.name = this.formatName(names)
    }

    return result
  }

  extractNameFromDescription(desc, patternName) {
    // Extract names from specific patterns
    switch (patternName) {
      case 'hospital':
        if (desc.includes('ADELIN')) return 'Adelin Medical Centre'
        if (desc.includes('HOLBERTON')) return 'Holberton Hospital'
        return 'Hospital Certificate'

      case 'coroner':
        if (desc.includes('MAGISTRATE')) return 'Magistrate Court'
        if (desc.includes('CORONER')) return 'Coroner'
        return 'Official Certificate'

      default:
        return null
    }
  }

  formatName(name) {
    if (!name || name === '-') return null

    // Basic name formatting
    return name.trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  calculateConfidence(patternName, text) {
    const confidenceMap = {
      hospital: 95,
      undertaker: 95,
      mother: 90,
      father: 90,
      medicalStaff: 85,
      grandmother: 85,
      grandfather: 85,
      sibling: 80,
      extendedFamily: 75,
      coroner: 90,
      affidavit: 60 // Requires manual review
    }

    return confidenceMap[patternName] || 50
  }

  // Validate informant type for event type
  validateInformantForEvent(informantType, eventType) {
    const validCombinations = {
      'BI': ['MOTHER', 'FATHER', 'GRANDMOTHER', 'GRANDFATHER', 'EXTENDED_FAMILY', 'HEALTHCARE_PROVIDER', 'HEALTH_FACILITY', 'LEGAL_GUARDIAN', 'OTHER'],
      'DE': ['SPOUSE', 'SON', 'DAUGHTER', 'EXTENDED_FAMILY', 'UNDERTAKER', 'HEALTHCARE_PROVIDER', 'HEALTH_FACILITY', 'LEGAL_GUARDIAN', 'OTHER'],
      'MA': ['BRIDE', 'GROOM', 'EXTENDED_FAMILY', 'LEGAL_GUARDIAN', 'OTHER']
    }

    return validCombinations[eventType]?.includes(informantType) || false
  }
}

// Usage example
const cleaner = new InformantCleaner()

// Test cases
const testRecords = [
  {
    i_desc: 'CERTIFICATE FROM HOSPITAL',
    i_name: '',
    event: 'BI'
  },
  {
    i_desc: 'UNDERTAKER',
    i_name: 'BASIL SAUNDERS',
    event: 'DE'
  },
  {
    i_desc: 'AFFIDAVIS SWORN BY PAGETT AND JENETA HENNES',
    i_name: '',
    event: 'BI'
  },
  {
    i_desc: 'MOTHER',
    i_name: 'MARY WILLIAMS',
    event: 'BI'
  }
]

testRecords.forEach((record, index) => {
  console.log(`Test ${index + 1}:`)
  console.log('Input:', record)
  console.log('Output:', cleaner.cleanseInformantData(record))
  console.log('---')
})

module.exports = InformantCleaner
```

## 📋 **OpenCRVS Informant Type Mapping**

| Legacy Pattern | OpenCRVS `informantType` | Confidence | Notes |
|---------------|-------------------------|------------|-------|
| **CERTIFICATE FROM HOSPITAL** | `HEALTH_FACILITY` | 95% | Clear institutional source |
| **UNDERTAKER** + known names | `UNDERTAKER` | 95% | Death registrations |
| **MOTHER** | `MOTHER` | 90% | Direct family relationship |
| **FATHER** | `FATHER` | 90% | Direct family relationship |
| **MIDWIFE/NURSE** | `HEALTHCARE_PROVIDER` | 85% | Medical professional |
| **GRANDMOTHER** | `GRANDMOTHER` | 85% | Extended family |
| **SISTER/BROTHER** | `EXTENDED_FAMILY` | 80% | Sibling relationship |
| **CORONER** | `LEGAL_GUARDIAN` | 90% | Official/legal source |
| **Affidavit patterns** | `OTHER` → Manual review | 60% | Requires parsing |

## 🔧 **Integration with Cleansing Script**

```javascript
// Add to scripts/1-cleansing.js
const InformantCleaner = require('./informant-cleaner')

class DataCleanser {
  constructor() {
    this.informantCleaner = new InformantCleaner()
    // ... existing code
  }

  async cleanseRecord(record) {
    // ... existing cleansing logic

    // Add informant cleansing
    const informantData = this.informantCleaner.cleanseInformantData(record)

    // Set OpenCRVS fields
    record.informantType = informantData.informantType
    record.informantRelationship = informantData.relationship
    record.informantName = informantData.name
    record.informantAddress = informantData.address

    // Quality scoring
    if (informantData.confidence < 70) {
      issues.push(`Low confidence informant data (${informantData.confidence}%)`)
    }

    if (informantData.issues.length > 0) {
      issues.push(`Informant issues: ${informantData.issues.join(', ')}`)
    }

    // Validate for event type
    if (!this.informantCleaner.validateInformantForEvent(informantData.informantType, record.event)) {
      issues.push(`Invalid informant type '${informantData.informantType}' for ${record.event} event`)
    }

    // ... rest of cleansing logic
  }
}
```

## 📊 **Quality Assessment Rules**

| Confidence Level | Action | Description |
|-----------------|--------|-------------|
| **90-100%** | Auto-import | Clear patterns, known names |
| **70-89%** | Auto-import with flag | Good patterns, review recommended |
| **50-69%** | Review queue | Unclear patterns, manual review needed |
| **< 50%** | Review queue | Poor data quality, manual correction required |

## 🔍 **Manual Review Cases**

These patterns require human review:

1. **Complex Affidavits**: "AFFIDAVIS SWORN BY PAGETT AND JENETA HENNES"
2. **Ambiguous Names**: Names that could be either informant or relationship
3. **Mixed Patterns**: Records with conflicting informant information
4. **Unknown Names**: Names not in known lists requiring classification

This strategy will cleanse ~80% of informant data automatically while flagging complex cases for manual review.