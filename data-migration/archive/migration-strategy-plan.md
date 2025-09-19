# Migration Strategy Plan: Field Requirements & Registration Metadata

## Strategic Options Analysis

### **Option 1: Country Config Field Requirement Relaxation** 🔧

#### **What We CAN Modify in CountryConfig**
```typescript
// Example: Making fields optional for migration
export const informantTypeForMigration: SerializedFormField = {
  name: 'informantType',
  type: 'SELECT_WITH_OPTIONS',
  required: false, // ← Changed from true to false
  initialValue: 'OTHER', // ← Provide default
  validator: [],
  hideInPreview: true, // ← Hide from UI if incomplete
  conditionals: [
    {
      action: 'hide',
      expression: 'values._isMigrationRecord === true'
    }
  ]
}
```

#### **Fields We Can Safely Make Optional**
| Field | Current Status | Migration Strategy |
|-------|---------------|-------------------|
| `informantType` | Required | Make optional, default to 'OTHER' |
| `placeOfBirth` | Required | Make optional, default to 'OTHER' |
| `mannerOfDeath` | Required | Make optional, default to 'NATURAL' |
| `causeOfDeathEstablished` | Required | Make optional, default to 'OTHER' |
| `typeOfMarriage` | Required | Make optional, default to 'CIVIL' |
| `birthLocation` | Conditionally required | Make optional for migration |
| `contactPhoneNumber` | Required | Make optional, provide dummy value |
| `contactEmail` | Required | Make optional, provide dummy value |

#### **Fields We CANNOT Make Optional (FHIR/Schema Level)**
| Field | Reason | Must Handle |
|-------|--------|-------------|
| `child.name[0].firstNamesEng` | FHIR Patient.name required | ✅ Available in legacy |
| `child.name[0].familyNameEng` | FHIR Patient.name required | ✅ Available in legacy |
| `child.gender` | FHIR Patient.gender required | ⚠️ Transform M/F → male/female |
| `child.birthDate` | FHIR Patient.birthDate required | ✅ Available in legacy |
| `eventLocation.id` | FHIR Location reference required | 🚨 Must map parish → UUID |

### **Option 2: Registration Metadata Migration vs Generation** 📋

#### **Registration Fields We SHOULD Migrate** ✅
```typescript
// Use actual legacy data where available
const registrationData = {
  registrationNumber: legacy.cert_nbr, // ← Use actual cert number
  paperFormID: legacy.entry_nbr,       // ← Use actual entry number
  page: legacy.page_nbr,               // ← Use actual page number
  book: legacy.entry_yr,               // ← Use year as book reference

  // Registration dates from legacy
  status: [{
    type: inferStatusFromLegacy(legacy.certificate_status),
    timestamp: parseDate(legacy.reg_dt), // ← Use actual reg date
    user: 'migration-system',
    location: getLocationUUID(legacy.parish_nm)
  }]
}
```

#### **Registration Fields We MUST Generate** 🔄
```typescript
// OpenCRVS-specific identifiers
const generatedData = {
  trackingId: generateTrackingId(legacy), // ← Generate with pattern
  _fhirIDMap: generateFHIRMappings(),     // ← Generate FHIR references
  compositionId: uuidv4(),                // ← Generate new UUID

  // System metadata
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),

  // Workflow state (current state post-migration)
  currentStatus: 'REGISTERED' // ← Default final state for migrated records
}
```

### **Option 3: Null Data Handling Strategy** 🛡️

#### **Three-Tier Approach**

##### **Tier 1: Critical Required Fields (Migration Blockers)**
```typescript
const handleCriticalNulls = (legacy) => {
  // NEVER allow null for these
  const criticalFields = {
    // Names - required by FHIR
    child: {
      name: [{
        firstNamesEng: legacy.c_frst_nm || 'UNKNOWN',
        familyNameEng: legacy.c_last_nm || 'UNKNOWN'
      }]
    },

    // Gender - required by FHIR
    gender: standardizeGender(legacy.c_sex) || 'unknown',

    // Dates - required by FHIR
    birthDate: parseDate(legacy.c_dob) || estimateFromAge(legacy.c_age),

    // Location - required by OpenCRVS
    eventLocation: {
      id: mapParishToUUID(legacy.parish_nm) || getDefaultLocationUUID(),
      name: legacy.parish_nm || 'Unknown Parish'
    }
  }

  return criticalFields
}
```

##### **Tier 2: Important Fields (Quality Degradation)**
```typescript
const handleImportantNulls = (legacy) => {
  return {
    // Use legacy data if available, sensible defaults if null
    informantType: mapInformantType(legacy.i_desc) || 'OTHER',
    placeOfBirth: inferPlaceType(legacy.parish_nm) || 'OTHER',

    // Parent details - check if any data exists
    mother: {
      detailsExist: hasMotherData(legacy),
      ...buildMotherData(legacy)
    },
    father: {
      detailsExist: hasFatherData(legacy),
      ...buildFatherData(legacy)
    }
  }
}
```

##### **Tier 3: Optional Fields (Leave Null)**
```typescript
const handleOptionalNulls = (legacy) => {
  return {
    // Only include if legacy data exists
    ...(legacy.weightAtBirth && { weightAtBirth: parseFloat(legacy.weightAtBirth) }),
    ...(legacy.attendantAtBirth && { attendantAtBirth: legacy.attendantAtBirth }),
    ...(legacy.childrenBornAliveToMother && {
      childrenBornAliveToMother: parseInt(legacy.childrenBornAliveToMother)
    }),

    // Contact info - optional for migrated records
    ...(legacy.contactPhone && { contactPhoneNumber: legacy.contactPhone }),
    ...(legacy.contactEmail && { contactEmail: legacy.contactEmail })
  }
}
```

## **Recommended Migration Implementation Plan** 🚀

### **Phase 1: Country Config Preparation**
1. **Create Migration-Specific Field Definitions**
   ```bash
   # Create migration variants of required fields
   /src/form/birth/migration-required-fields.ts
   /src/form/death/migration-required-fields.ts
   /src/form/marriage/migration-required-fields.ts
   ```

2. **Add Migration Mode Detection**
   ```typescript
   // Add to form context
   const isMigrationRecord = draftData?._migrationMetadata?.isMigration === true

   // Conditional field requirements
   required: !isMigrationRecord, // Make optional for migration records
   ```

3. **Environment-Based Configuration**
   ```typescript
   // Different validation rules for migration vs production
   const fieldConfig = process.env.MIGRATION_MODE === 'true'
     ? migrationFieldConfig
     : productionFieldConfig
   ```

### **Phase 2: Data Enrichment Pipeline**
```typescript
// Migration data processing pipeline
const migrateRecord = async (legacyRecord) => {
  // Step 1: Extract and validate source data
  const sourceData = extractLegacyData(legacyRecord)

  // Step 2: Apply three-tier null handling
  const enrichedData = {
    ...handleCriticalNulls(sourceData),
    ...handleImportantNulls(sourceData),
    ...handleOptionalNulls(sourceData)
  }

  // Step 3: Generate OpenCRVS-specific fields
  const registrationData = {
    ...migrateRegistrationMetadata(sourceData),
    ...generateOpenCRVSFields(sourceData)
  }

  // Step 4: Validate against relaxed schema
  await validateMigrationRecord(enrichedData)

  // Step 5: Create OpenCRVS record
  return await createRegistration(enrichedData, registrationData)
}
```

### **Phase 3: Smart Defaults Strategy**

#### **Intelligent Default Generation**
```typescript
const generateSmartDefaults = (legacy, eventType) => {
  const defaults = {
    // Infer informant type from available data
    informantType: (() => {
      if (legacy.i_desc?.toLowerCase().includes('mother')) return 'MOTHER'
      if (legacy.i_desc?.toLowerCase().includes('father')) return 'FATHER'
      if (eventType === 'birth') return 'OTHER'
      if (eventType === 'death' && legacy.c_sex === 'M') return 'SPOUSE'
      return 'OTHER'
    })(),

    // Infer place type from location name
    placeOfBirth: (() => {
      const location = legacy.parish_nm?.toLowerCase() || ''
      if (location.includes('hospital') || location.includes('clinic')) return 'HEALTH_FACILITY'
      if (location.includes('home')) return 'HOME'
      return 'OTHER'
    })(),

    // Death-specific smart defaults
    ...(eventType === 'death' && {
      mannerOfDeath: legacy.c_cause?.toLowerCase().includes('accident') ? 'ACCIDENT' : 'NATURAL',
      causeOfDeathEstablished: legacy.dr_name ? 'PHYSICIAN' : 'OTHER'
    }),

    // Marriage-specific smart defaults
    ...(eventType === 'marriage' && {
      typeOfMarriage: legacy.marriedby?.toLowerCase().includes('priest') ? 'RELIGIOUS' : 'CIVIL'
    })
  }

  return defaults
}
```

### **Phase 4: Validation & Quality Assurance**

#### **Migration-Specific Validation Rules**
```typescript
const migrationValidationRules = {
  // Relaxed validation for migrated records
  allowUnknownGender: true,
  allowEstimatedDates: true,
  allowGenericInformantTypes: true,
  allowMissingContactInfo: true,

  // Still enforce critical business rules
  mustHavePersonName: true,
  mustHaveEventLocation: true,
  mustHaveRegistrationNumber: true,

  // Quality warnings (not errors)
  warnOnMissingParentInfo: true,
  warnOnGenericDefaults: true,
  warnOnEstimatedData: true
}
```

#### **Post-Migration Quality Reports**
```typescript
const generateQualityReport = (migrationResults) => {
  return {
    totalRecords: migrationResults.length,
    successfulMigrations: migrationResults.filter(r => r.status === 'success').length,
    recordsWithDefaults: migrationResults.filter(r => r.hasGeneratedDefaults).length,
    recordsNeedingReview: migrationResults.filter(r => r.qualityScore < 0.8).length,

    qualityBreakdown: {
      highQuality: migrationResults.filter(r => r.qualityScore >= 0.9).length,
      mediumQuality: migrationResults.filter(r => r.qualityScore >= 0.7).length,
      lowQuality: migrationResults.filter(r => r.qualityScore < 0.7).length
    },

    fieldCompleteness: {
      namesComplete: calculateFieldCompleteness('names'),
      addressesComplete: calculateFieldCompleteness('addresses'),
      datesComplete: calculateFieldCompleteness('dates'),
      informantTypesInferred: calculateInferredFields('informantType')
    }
  }
}
```

## **Final Recommendation** ✅

**Hybrid Approach:**
1. **Relax non-critical field requirements** in country config for migration mode
2. **Migrate actual registration metadata** where available (cert_nbr, reg_dt, page_nbr)
3. **Generate OpenCRVS-specific IDs** (trackingId, compositionId, fhirIDMap)
4. **Use three-tier null handling** with smart defaults
5. **Implement migration-specific validation** rules
6. **Generate quality reports** for post-migration review

This approach maximizes data preservation while ensuring OpenCRVS compatibility and maintaining audit trails of what was migrated vs. generated.