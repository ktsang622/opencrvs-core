# Missing Required Fields Analysis for OpenCRVS Migration

## Overview

This analysis identifies **required fields for OpenCRVS record creation** that are **missing or insufficient** in the legacy Excel data, requiring data enrichment strategies during migration.

## OpenCRVS Required Field Summary

### **Core Registration Requirements**

#### **Registration Metadata (All Events)**
- `registration.informantType` (required) - Relationship to event participants
- `registration.contactPhoneNumber` - For notifications
- `registration.status` - Workflow state tracking
- `registration.trackingId` - Unique registration identifier

#### **Person Entity Requirements (All Persons)**
```typescript
interface PersonInput {
  name: HumanNameInput[] // REQUIRED - structured name format
  gender: 'male' | 'female' | 'other' | 'unknown' // REQUIRED
  birthDate: Date // REQUIRED for most persons
  identifier: IdentityInput[] // National ID, etc.
  address: AddressInput[] // Structured address
  detailsExist: boolean // Whether person details are provided
}

interface HumanNameInput {
  firstNamesEng: string // REQUIRED
  familyNameEng: string // REQUIRED
  middleNameEng?: string // Optional
}
```

### **Birth Registration Specific Requirements**

#### **Mandatory Fields**
- `child.name[0].firstNamesEng` (required)
- `child.name[0].familyNameEng` (required)
- `child.gender` (required)
- `child.birthDate` (required)
- `informantType` (required) - Relationship to child
- `eventLocation` (required) - Birth location details
- `placeOfBirth` (required) - HEALTH_FACILITY, HOME, etc.

#### **Conditional Requirements**
- `mother.detailsExist` - If true, mother details required
- `father.detailsExist` - If true, father details required
- `birthLocation` - Required if placeOfBirth = "HEALTH_FACILITY"

### **Death Registration Specific Requirements**

#### **Mandatory Fields**
- `deceased.name[0].firstNamesEng` (required)
- `deceased.name[0].familyNameEng` (required)
- `deceased.gender` (required)
- `deceased.birthDate` (required)
- `deathDate` (required)
- `informantType` (required)
- `eventLocation` (required)
- `mannerOfDeath` (required)
- `causeOfDeathEstablished` (required)
- `causeOfDeath` (required)

### **Marriage Registration Specific Requirements**

#### **Mandatory Fields**
- `bride.name[0].firstNamesEng` (required)
- `bride.name[0].familyNameEng` (required)
- `bride.gender` (required)
- `bride.birthDate` (required)
- `groom.name[0].firstNamesEng` (required)
- `groom.name[0].familyNameEng` (required)
- `groom.gender` (required)
- `groom.birthDate` (required)
- `informantType` (required)
- `eventLocation` (required)
- `typeOfMarriage` (required)

## Legacy Data Coverage Analysis

### **Available in Legacy Data (73 columns)**

#### **Names** ✅ **AVAILABLE**
- `c_frst_nm`, `c_mid_nm`, `c_last_nm` → Child names
- `m_frst_nm`, `m_mid_nm`, `m_last_nm` → Mother names
- `f_frst_nm`, `f_mid_nm`, `f_last_nm` → Father names
- `g_frst_nm`, `g_mid_nm`, `g_last_nm` → Groom names
- `b_frst_nm`, `b_mid_nm`, `b_last_nm` → Bride names

#### **Basic Demographics** ✅ **PARTIALLY AVAILABLE**
- `c_sex` → Gender (needs standardization)
- `c_dob` → Birth date
- `death_dt` → Death date
- `marriage_dt` → Marriage date
- `c_age`, `g_age`, `b_age` → Ages

#### **Locations** ✅ **AVAILABLE**
- `parish_nm` → Event location (needs mapping)

#### **Registration Metadata** ✅ **AVAILABLE**
- `reg_dt` → Registration date
- `cert_nbr` → Certificate number
- `page_nbr`, `entry_nbr` → Paper form references

### **MISSING CRITICAL REQUIRED FIELDS** ❌

#### **1. Informant Relationship (`informantType`)**
- **Legacy**: `i_name`, `i_address`, `i_desc` (free text description)
- **OpenCRVS**: Requires standardized values:
  - Birth: `'MOTHER'`, `'FATHER'`, `'GRANDMOTHER'`, `'GRANDFATHER'`, `'LEGAL_GUARDIAN'`, `'OTHER'`
  - Death: `'SPOUSE'`, `'SON'`, `'DAUGHTER'`, `'EXTENDED_FAMILY'`, `'OTHER'`
  - Marriage: `'BRIDE'`, `'GROOM'`, `'OTHER'`

**ENRICHMENT REQUIRED**: Map `i_desc` to standardized relationship types

#### **2. Structured Address Data**
- **Legacy**: `c_address`, `m_address`, `f_address`, `g_address`, `b_address` (free text)
- **OpenCRVS**: Requires structured format:
```typescript
{
  country: string,
  state: string,
  district: string,
  city: string,
  line: string[],
  postalCode: string
}
```

**ENRICHMENT REQUIRED**: Parse free-text addresses into structured components

#### **3. Location Hierarchy Mapping**
- **Legacy**: `parish_nm` (simple text)
- **OpenCRVS**: Requires location UUID from admin hierarchy
- **Example**: "St. Mary Parish" → `location.id = "12345-uuid-location-id"`

**ENRICHMENT REQUIRED**: Create parish name → location UUID mapping table

#### **4. Gender Standardization**
- **Legacy**: `c_sex` likely "M"/"F"
- **OpenCRVS**: Requires `'male'`, `'female'`, `'other'`, `'unknown'`

**ENRICHMENT REQUIRED**: Map gender codes to OpenCRVS format

#### **5. Birth/Death Location Classification**
- **Legacy**: No classification (only `parish_nm`)
- **OpenCRVS**: Requires:
  - `placeOfBirth`: `'HEALTH_FACILITY'`, `'HOME'`, `'OTHER'`
  - `placeOfDeath`: `'HEALTH_FACILITY'`, `'HOME'`, `'OTHER'`

**ENRICHMENT REQUIRED**: Infer location type or default to appropriate value

#### **6. Death-Specific Required Fields**
- **Missing**: `mannerOfDeath` - Required field
  - Options: `'NATURAL'`, `'ACCIDENT'`, `'SUICIDE'`, `'HOMICIDE'`, `'PENDING'`
- **Available**: `c_cause` → `causeOfDeath`
- **Missing**: `causeOfDeathEstablished` - Who determined cause
  - Options: `'PHYSICIAN'`, `'HOSPITAL'`, `'CORONER'`, `'OTHER'`

**ENRICHMENT REQUIRED**: Default values or infer from available data

#### **7. Marriage-Specific Required Fields**
- **Missing**: `typeOfMarriage`
  - Options: `'CIVIL'`, `'RELIGIOUS'`, `'CUSTOMARY'`, `'OTHER'`

**ENRICHMENT REQUIRED**: Default value or infer from ceremony details

#### **8. Contact Information**
- **Missing**: `registration.contactPhoneNumber`
- **Missing**: `registration.contactEmail`

**ENRICHMENT REQUIRED**: Default or dummy values for migration

#### **9. Identity Documents**
- **Legacy**: No systematic ID tracking
- **OpenCRVS**: Expected identity documents for each person
```typescript
identifier: [{
  system: 'NATIONAL_ID',
  value: string
}]
```

**ENRICHMENT REQUIRED**: Create dummy identifiers or leave empty

#### **10. Workflow State Information**
- **Legacy**: `certificate_status` (unclear mapping)
- **OpenCRVS**: Requires structured workflow status:
```typescript
status: [{
  type: 'DECLARED' | 'VALIDATED' | 'REGISTERED' | 'CERTIFIED',
  timestamp: Date,
  user: string,
  location: string
}]
```

**ENRICHMENT REQUIRED**: Map legacy status to OpenCRVS workflow states

## Data Enrichment Strategy

### **High Priority (Blocking Migration)**

1. **Informant Type Mapping**
   ```typescript
   const informantTypeMapping = {
     'mother': 'MOTHER',
     'father': 'FATHER',
     'husband': 'SPOUSE',
     'wife': 'SPOUSE',
     'son': 'SON',
     'daughter': 'DAUGHTER',
     // Default fallback
     '*': 'OTHER'
   }
   ```

2. **Location Hierarchy Integration**
   - Create `parish_name → location_uuid` lookup table
   - Query OpenCRVS location service for existing locations
   - Create missing locations if needed

3. **Gender Standardization**
   ```typescript
   const genderMapping = {
     'M': 'male',
     'F': 'female',
     '1': 'male',
     '2': 'female',
     '': 'unknown'
   }
   ```

### **Medium Priority (Data Quality)**

4. **Address Parsing**
   - Use address parsing libraries
   - Extract city, district from free-text addresses
   - Default country to jurisdiction country

5. **Default Required Values**
   ```typescript
   const defaults = {
     placeOfBirth: 'OTHER',
     placeOfDeath: 'OTHER',
     mannerOfDeath: 'NATURAL',
     causeOfDeathEstablished: 'OTHER',
     typeOfMarriage: 'CIVIL'
   }
   ```

### **Low Priority (Enhancement)**

6. **Contact Information Generation**
   - Generate dummy phone numbers
   - Create administrative email addresses

7. **Document Creation**
   - Generate placeholder identity documents
   - Create supporting document references

## Migration Implementation Requirements

### **Pre-Migration Setup**
1. Location hierarchy mapping table creation
2. Informant relationship classification rules
3. Default value configuration
4. Address parsing service setup

### **Migration Validation**
1. **Required Field Validation**: Ensure all mandatory fields populated
2. **Data Type Validation**: Verify dates, enums, etc. conform to schema
3. **Reference Integrity**: Validate location UUIDs exist
4. **Business Logic**: Verify informant relationships make sense

### **Post-Migration Cleanup**
1. **Data Quality Review**: Identify records needing manual review
2. **Missing Data Reports**: Flag records with placeholder data
3. **Enhancement Opportunities**: Identify where real data could replace defaults

This analysis shows that while the legacy data contains most core demographic information, significant enrichment is required to meet OpenCRVS's structured data requirements and business logic constraints.