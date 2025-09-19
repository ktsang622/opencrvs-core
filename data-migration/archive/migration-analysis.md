# Data Migration Analysis: Source to OpenCRVS Schema Mapping

## Executive Summary

The migration involves two Excel files containing historical vital records:
- **AB_MERGE (0221)_BI.xlsx**: Birth records
- **AB_MERGE (0221)_OTHER.xlsx**: Death and Marriage records

Both files share the same 73-column schema, indicating a unified legacy database structure where different event types are stored in the same table format.

## Source Data Schema Analysis

### Key Source Fields (73 columns total)

#### System/Audit Fields
- `printlog_id`, `printlog_serial`, `printlog_time`, `printlog_computername`, `printlog_ipaddr`
- `user_id`, `extraction_id`, `version`, `verified_by`, `job_id`
- `event` (indicates event type: "BI" for birth, "DE" for death, etc.)

#### Registration Metadata
- `id`, `image_id`, `entry_yr`, `entry_type`, `parish_nm`, `page_nbr`, `entry_nbr`
- `reg_dt` (registration date), `cert_nbr`, `certificate_status`

#### Person Information (Child/Deceased)
- `c_dob` (child/deceased date of birth)
- `c_frst_nm`, `c_mid_nm`, `c_last_nm` (child/deceased names)
- `c_sex` (child/deceased gender)
- `c_address`, `c_occn` (child/deceased address, occupation)
- `c_age`, `c_complex`, `c_cause` (for deaths)
- `death_dt` (death date)

#### Mother Information
- `m_frst_nm`, `m_mid_nm`, `m_last_nm`, `m_mdn_nm` (mother names including maiden)
- `m_address`, `m_occn` (mother address, occupation)

#### Father Information
- `f_frst_nm`, `f_mid_nm`, `f_last_nm` (father names)
- `f_occn`, `f_address` (father occupation, address)

#### Informant/Registrar
- `i_name`, `i_address`, `i_desc` (informant details)
- `r_name` (registrar name)

#### Birth-Specific Fields
- `bptsml_nm` (baptismal name)

#### Death-Specific Fields
- `dr_name` (doctor name)

#### Marriage-Specific Fields
- `marriage_dt` (marriage date)
- `g_frst_nm`, `g_mid_nm`, `g_last_nm` (groom names)
- `b_frst_nm`, `b_mid_nm`, `b_last_nm` (bride names)
- `g_age`, `b_age` (groom/bride ages)
- `g_status`, `b_status` (groom/bride marital status)
- `g_occn`, `b_occn` (groom/bride occupations)
- `g_address`, `b_address` (groom/bride addresses)
- `g_consent`, `b_consent` (consent flags)
- `witness_1`, `witness_2` (witnesses)
- `marriedby`, `marriedat` (officiant and location)
- `m_cert_top`, `m_cert_btm` (marriage certificate numbers)

#### Adoption Fields
- `adoptionorderdate`

## OpenCRVS Target Schema Analysis

### Birth Registration Structure
```typescript
interface BirthRegistration {
  id: string
  registration: {
    trackingId: string
    registrationNumber: string
    paperFormID: string
    page: string
    book: string
    informantType: string
  }
  child: Person
  mother: Person
  father: Person
  informant: RelatedPerson
  eventLocation: Location
  birthType: string
  weightAtBirth: number
  attendantAtBirth: string
  childrenBornAliveToMother: number
  foetalDeathsToMother: number
  lastPreviousLiveBirth: Date
}
```

### Death Registration Structure
```typescript
interface DeathRegistration {
  id: string
  registration: Registration
  deceased: Person
  informant: RelatedPerson
  mother: Person
  father: Person
  spouse: Person
  eventLocation: Location
  mannerOfDeath: string
  deathDescription: string
  causeOfDeathMethod: string
  causeOfDeathEstablished: string
  causeOfDeath: string
}
```

### Marriage Registration Structure
```typescript
interface MarriageRegistration {
  id: string
  registration: Registration
  informant: RelatedPerson
  bride: Person
  groom: Person
  witnessOne: RelatedPerson
  witnessTwo: RelatedPerson
  eventLocation: Location
  typeOfMarriage: string
}
```

### Person Structure
```typescript
interface Person {
  name: HumanName[]
  gender: string
  birthDate: Date
  age: number
  maritalStatus: string
  occupation: string
  address: Address[]
  identifier: IdentityType[]
}
```

## Field Mapping Matrix

### Birth Records Mapping

| Source Field | OpenCRVS Target | Transformation Required |
|--------------|----------------|------------------------|
| `c_frst_nm`, `c_mid_nm`, `c_last_nm` | `child.name[0].given`, `child.name[0].family` | Combine names into HumanName structure |
| `c_dob` | `child.birthDate` | Parse date format |
| `c_sex` | `child.gender` | Map M/F to standard codes |
| `m_frst_nm`, `m_mid_nm`, `m_last_nm` | `mother.name[0]` | Combine names |
| `m_mdn_nm` | `mother.name[1]` (maiden name) | Create separate name entry |
| `m_address` | `mother.address[0]` | Parse address structure |
| `m_occn` | `mother.occupation` | Direct mapping |
| `f_frst_nm`, `f_mid_nm`, `f_last_nm` | `father.name[0]` | Combine names |
| `f_address` | `father.address[0]` | Parse address structure |
| `f_occn` | `father.occupation` | Direct mapping |
| `i_name` | `informant.name[0]` | Parse name |
| `i_address` | `informant.address[0]` | Parse address |
| `i_desc` | `informant.relationship` | Map to relationship type |
| `parish_nm` | `eventLocation.name` | Direct mapping |
| `page_nbr` | `registration.page` | Direct mapping |
| `entry_nbr` | `registration.paperFormID` | Direct mapping |
| `reg_dt` | `registration.dateOfDeclaration` | Parse date |
| `cert_nbr` | `registration.registrationNumber` | Direct mapping |
| `entry_yr` | Extract from tracking ID | Format as part of ID |

### Death Records Mapping

| Source Field | OpenCRVS Target | Transformation Required |
|--------------|----------------|------------------------|
| `c_frst_nm`, `c_mid_nm`, `c_last_nm` | `deceased.name[0]` | Combine names |
| `c_dob` | `deceased.birthDate` | Parse date |
| `death_dt` | `deceased.deathDate` | Parse date |
| `c_sex` | `deceased.gender` | Map M/F codes |
| `c_age` | `deceased.age` | Direct mapping |
| `c_cause` | `causeOfDeath` | Direct mapping |
| `c_complex` | `deathDescription` | Direct mapping |
| `dr_name` | `causeOfDeathEstablished` | Map to "PHYSICIAN" |
| Similar mother/father mappings as birth | | |

### Marriage Records Mapping

| Source Field | OpenCRVS Target | Transformation Required |
|--------------|----------------|------------------------|
| `g_frst_nm`, `g_mid_nm`, `g_last_nm` | `groom.name[0]` | Combine names |
| `b_frst_nm`, `b_mid_nm`, `b_last_nm` | `bride.name[0]` | Combine names |
| `g_age` | `groom.age` | Direct mapping |
| `b_age` | `bride.age` | Direct mapping |
| `g_occn` | `groom.occupation` | Direct mapping |
| `b_occn` | `bride.occupation` | Direct mapping |
| `g_address` | `groom.address[0]` | Parse address |
| `b_address` | `bride.address[0]` | Parse address |
| `marriage_dt` | `eventLocation.date` | Parse date |
| `witness_1` | `witnessOne.name[0]` | Parse name |
| `witness_2` | `witnessTwo.name[0]` | Parse name |
| `marriedby` | `informant.name[0]` | Parse officiant name |
| `marriedat` | `eventLocation.name` | Direct mapping |

## Data Cleansing Requirements

### 1. Data Quality Issues
- **NULL values**: Many fields contain "NULL" strings instead of empty values
- **Date formats**: Need standardization (appears to be Excel date serials in some cases)
- **Name parsing**: Names need to be split and combined properly
- **Address parsing**: Free-text addresses need structure

### 2. Data Validation Rules
- **Required fields validation**: Ensure essential fields are present
- **Date validation**: Birth dates before death dates, reasonable age ranges
- **Gender validation**: Standardize M/F to OpenCRVS gender codes
- **Name validation**: Remove special characters, handle encoding issues

### 3. Data Transformation Rules
- **Event type filtering**: Use `event` field to route to correct registration type
- **ID generation**: Generate OpenCRVS-compatible UUIDs
- **Location mapping**: Map `parish_nm` to OpenCRVS location hierarchy
- **Status mapping**: Map `certificate_status` to OpenCRVS registration states

### 4. Duplicate Detection
- **Cross-reference duplicates**: Same person appearing in multiple events
- **Registration duplicates**: Same event registered multiple times
- **Name variations**: Handle spelling variations and nicknames

### 5. Data Enrichment
- **Location hierarchy**: Enhance parish names with full location data
- **Relationship inference**: Infer family relationships from shared addresses/names
- **Date completion**: Estimate missing dates where possible

## Migration Strategy Recommendations

### Phase 1: Data Preparation
1. Export Excel files to CSV for easier processing
2. Implement data cleansing pipeline
3. Create lookup tables for parishes, relationships, etc.
4. Validate data quality metrics

### Phase 2: Transformation Engine
1. Build event-type routing logic
2. Implement field mapping transformations
3. Create Person entity consolidation logic
4. Generate OpenCRVS-compatible identifiers

### Phase 3: Migration Execution
1. Migrate in order: Births → Deaths → Marriages
2. Maintain referential integrity between related records
3. Generate migration reports and validation summaries
4. Implement rollback procedures

### Phase 4: Validation
1. Compare record counts and key metrics
2. Validate family relationships and cross-references
3. Test search functionality with migrated data
4. Performance testing with production load

## Technical Considerations

### Performance
- **Batch processing**: Process records in batches of 1000-5000
- **Memory management**: Stream processing for large datasets
- **Database optimization**: Use bulk insert operations

### Error Handling
- **Validation errors**: Log and quarantine invalid records
- **Transformation errors**: Provide detailed error reporting
- **Recovery procedures**: Implement checkpoint/restart capability

### Monitoring
- **Progress tracking**: Real-time migration progress
- **Quality metrics**: Data quality score tracking
- **Performance metrics**: Records per second, error rates