# Legacy Data Source - Complete Field Dictionary

## Summary Statistics
- **Total Records**: 168,566 (138,484 births + 30,082 deaths/marriages)
- **Total Columns**: 73
- **File Format**: Excel (.xlsx)
- **Schema Type**: Unified schema for all event types (births, deaths, marriages)

## Field Categories and Mappings

### 🧒 **CHILD/DECEASED PERSON FIELDS**

| Column Name | Header | Description | Null/Empty % | Data Type | Sample Values | OpenCRVS Destination |
|------------|--------|-------------|--------------|-----------|---------------|---------------------|
| `c_frst_nm` | Child First Name | First name of child/deceased | 0.6% | String | 'DEVON', 'ALDIS', 'LORETTE' | `child.name[0].firstNamesEng` |
| `c_mid_nm` | Child Middle Name | Middle name of child/deceased | 8.2% | String | 'ROSEVELT', 'FITZGERALD ZYPHUTES' | `child.name[0].middleNameEng` |
| `c_last_nm` | Child Last Name | Last/family name of child/deceased | 2.7% | String | 'HOUSEN', 'HUNT', 'RICHARDS' | `child.name[0].familyNameEng` |
| `c_sex` | Child Gender | Gender of child/deceased | 0.5% | String | 'MALE', 'FEMALE' | `child.gender` |
| `c_dob` | Child Date of Birth | Birth date (Excel serial number) | 0.6% | Number | 26938, 26592, 20693 | `child.birthDate` |
| `c_address` | Child Address | Residence address | 100.0% | String | 'TINDALE ROAD', 'ST JOHN' | `child.address[0].text` |
| `c_age` | Child Age | Age at time of death | 100.0% | String | '14', '92', '80' | `deceased.age` |
| `c_occn` | Child Occupation | Occupation (deaths only) | 100.0% | String | 'STUDENT', 'RETIRED', 'CARPENTER' | `deceased.occupation` |

### 👩 **MOTHER FIELDS**

| Column Name | Header | Description | Null/Empty % | Data Type | Sample Values | OpenCRVS Destination |
|------------|--------|-------------|--------------|-----------|---------------|---------------------|
| `m_frst_nm` | Mother First Name | Mother's first name | 0.0% | String | 'JENETA', 'VIRGINIA' | `mother.name[0].firstNamesEng` |
| `m_mid_nm` | Mother Middle Name | Mother's middle name | 93.2% | String | 'SKERRITS PASURE', 'JOAN' | `mother.name[0].middleNameEng` |
| `m_last_nm` | Mother Last Name | Mother's married surname | 0.1% | String | 'HENNES', 'WATKINS' | `mother.name[0].familyNameEng` |
| `m_mdn_nm` | Mother Maiden Name | Mother's maiden name | 74.5% | String | 'FRANCIS', 'FREELAND' | `mother.name[1].familyNameEng` |
| `m_address` | Mother Address | Mother's residence address | 18.6% | String | 'ENGLISH HARBOUR', 'GOLDEN GROVE RD.' | `mother.address[0].text` |
| `m_occn` | Mother Occupation | Mother's occupation | 100.0% | String | - | `mother.occupation` |

### 👨 **FATHER FIELDS**

| Column Name | Header | Description | Null/Empty % | Data Type | Sample Values | OpenCRVS Destination |
|------------|--------|-------------|--------------|-----------|---------------|---------------------|
| `f_frst_nm` | Father First Name | Father's first name | 50.0% | String | 'PAGETT', 'WALTER' | `father.name[0].firstNamesEng` |
| `f_mid_nm` | Father Middle Name | Father's middle name | 87.1% | String | 'VISCOUNT ALDIS', 'MCARTHUR' | `father.name[0].middleNameEng` |
| `f_last_nm` | Father Last Name | Father's surname | 50.6% | String | 'HENNES', 'WATKINS' | `father.name[0].familyNameEng` |
| `f_address` | Father Address | Father's residence address | 75.9% | String | 'SKERRITS PASTURE', 'ENGLISH HARBOUR' | `father.address[0].text` |
| `f_occn` | Father Occupation | Father's occupation | 57.5% | String | 'TECHNICIAN', 'ELECTRICIAN', 'LABOURER' | `father.occupation` |

### 💒 **MARRIAGE FIELDS (Unused in Current Data)**

| Column Name | Header | Description | Null/Empty % | Data Type | Sample Values | OpenCRVS Destination |
|------------|--------|-------------|--------------|-----------|---------------|---------------------|
| `g_frst_nm` | Groom First Name | Groom's first name | 100.0% | String | - | `groom.name[0].firstNamesEng` |
| `g_mid_nm` | Groom Middle Name | Groom's middle name | 100.0% | String | - | `groom.name[0].middleNameEng` |
| `g_last_nm` | Groom Last Name | Groom's surname | 100.0% | String | - | `groom.name[0].familyNameEng` |
| `g_age` | Groom Age | Groom's age at marriage | 100.0% | String | - | `groom.age` |
| `g_address` | Groom Address | Groom's residence | 100.0% | String | - | `groom.address[0].text` |
| `g_occn` | Groom Occupation | Groom's occupation | 100.0% | String | - | `groom.occupation` |
| `g_status` | Groom Status | Groom's marital status | 100.0% | String | - | `groom.maritalStatus` |
| `g_consent` | Groom Consent | Consent given flag | 100.0% | String | - | `groom.consentGiven` |
| `b_frst_nm` | Bride First Name | Bride's first name | 100.0% | String | - | `bride.name[0].firstNamesEng` |
| `b_mid_nm` | Bride Middle Name | Bride's middle name | 100.0% | String | - | `bride.name[0].middleNameEng` |
| `b_last_nm` | Bride Last Name | Bride's surname | 100.0% | String | - | `bride.name[0].familyNameEng` |
| `b_age` | Bride Age | Bride's age at marriage | 100.0% | String | - | `bride.age` |
| `b_address` | Bride Address | Bride's residence | 100.0% | String | - | `bride.address[0].text` |
| `b_occn` | Bride Occupation | Bride's occupation | 100.0% | String | - | `bride.occupation` |
| `b_status` | Bride Status | Bride's marital status | 100.0% | String | - | `bride.maritalStatus` |
| `b_consent` | Bride Consent | Consent given flag | 100.0% | String | - | `bride.consentGiven` |
| `marriage_dt` | Marriage Date | Date of marriage | 100.0% | String | - | `eventLocation.eventDate` |
| `marriedat` | Married At | Marriage location | 100.0% | String | - | `eventLocation.name` |
| `marriedby` | Married By | Officiant name | 100.0% | String | - | `informant.name[0]` |
| `witness_1` | Witness 1 | First witness name | 100.0% | String | - | `witnessOne.name[0]` |
| `witness_2` | Witness 2 | Second witness name | 100.0% | String | - | `witnessTwo.name[0]` |
| `m_cert_top` | Marriage Cert Top | Certificate number (top) | 100.0% | String | - | `registration.registrationNumber` |
| `m_cert_btm` | Marriage Cert Bottom | Certificate number (bottom) | 100.0% | String | - | `registration.additionalInfo` |

### ℹ️ **INFORMANT FIELDS**

| Column Name | Header | Description | Null/Empty % | Data Type | Sample Values | OpenCRVS Destination |
|------------|--------|-------------|--------------|-----------|---------------|---------------------|
| `i_name` | Informant Name | Name of person reporting | 64.4% | String | 'NOTE SENT IN BY MOTHER ELMIRA', 'NOEL BARNES' | `informant.name[0]` |
| `i_address` | Informant Address | Informant's address | 72.1% | String | 'NEWGATE STREET' | `informant.address[0].text` |
| `i_desc` | Informant Description | Relationship/role description | 13.2% | String | 'AFFIDAVIS SWORN BY PAGETT', 'UNDERTAKER' | `informant.relationship` |

### ⚰️ **DEATH-SPECIFIC FIELDS**

| Column Name | Header | Description | Null/Empty % | Data Type | Sample Values | OpenCRVS Destination |
|------------|--------|-------------|--------------|-----------|---------------|---------------------|
| `death_dt` | Death Date | Date of death | 100.0% | String | '1991-04-30 00:00:00.0000000' | `deceased.deathDate` |
| `c_cause` | Cause of Death | Primary cause of death | 100.0% | String | 'DIABETES MELLITUS', 'PNEUMONIA', 'OLD AGE' | `causeOfDeath` |
| `c_complex` | Death Complications | Additional death details | 100.0% | String | - | `deathDescription` |
| `dr_name` | Doctor Name | Certifying physician | 100.0% | String | 'CERECRO VASCULARE ACCIDENT', 'N. FULLER', 'DR PHILIP' | `medicalPractitioner.name` |

### 📋 **REGISTRATION METADATA**

| Column Name | Header | Description | Null/Empty % | Data Type | Sample Values | OpenCRVS Destination |
|------------|--------|-------------|--------------|-----------|---------------|---------------------|
| `cert_nbr` | Certificate Number | Official certificate number | 100.0% | String | '7140', '6308', '9946' | `registration.registrationNumber` |
| `reg_dt` | Registration Date | Date registered | 0.8% | Number/String | 29133, '1991-05-13 00:00:00.0000000' | `registration.status[0].timestamp` |
| `page_nbr` | Page Number | Registry book page | 0.0% | Number/String | 312, 313, '95', '100' | `registration.page` |
| `entry_nbr` | Entry Number | Entry number in registry | 3.5% | Number/String | 692, 693, 694, '139', '167' | `registration.paperFormID` |
| `entry_yr` | Entry Year | Year of registry entry | 0.0% | Number/String | 1979, '1991' | Used in tracking ID generation |
| `entry_type` | Entry Type | Type of registry entry | 0.0% | String | 'BIRTHS', 'DEATHS' | Event classification |

### 📍 **LOCATION FIELDS**

| Column Name | Header | Description | Null/Empty % | Data Type | Sample Values | OpenCRVS Destination |
|------------|--------|-------------|--------------|-----------|---------------|---------------------|
| `parish_nm` | Parish Name | Administrative division | 0.0% | String | 'ST. JOHN'S', 'ST JOHN' | `eventLocation.id` (after UUID mapping) |

### 🔍 **SYSTEM TRACKING FIELDS**

| Column Name | Header | Description | Null/Empty % | Data Type | Sample Values | OpenCRVS Destination |
|------------|--------|-------------|--------------|-----------|---------------|---------------------|
| `event` | Event Type | Event classification | 0.0% | String | 'BI', 'DE', 'MA' | Migration routing logic |
| `id` | Record ID | Legacy system record ID | 0.3% | Number/String | 0, '8331', '8391' | Migration metadata |
| `printlog_id` | Print Log ID | Print history tracking | 0.0% | Number/String | 0, '138940', '138968' | Migration metadata |
| `printlog_time` | Print Log Time | Timestamp of print | 0.0% | Number/String | 44249.79883533565, '2020-03-19 23:51:56.540000000' | Migration metadata |
| `user_id` | User ID | System user identifier | 0.0% | Number/String | 1000, '1000' | Migration metadata |
| `version` | Version | Record version number | 0.0% | Number/String | 1, '1' | Migration metadata |
| `extraction_id` | Extraction ID | Data extraction batch | 0.0% | Number/String | 1, '1' | Migration metadata |
| `image_id` | Image ID | Document image reference | 1.8% | Number/String | 947, '93634', '93683' | Migration metadata |

### 🔧 **SYSTEM AUDIT FIELDS** (Sparse Data)

| Column Name | Header | Description | Null/Empty % | Data Type | Sample Values | Notes |
|------------|--------|-------------|--------------|-----------|---------------|--------|
| `certificate_status` | Certificate Status | Certificate issuance status | 98.6% | String | '1' | Mostly empty |
| `r_name` | Registrar Name | Registering official | 3.6% | String | 'S.A. RHUDD' | Limited data |
| `printlog_computername` | Print Computer | Computer used for printing | 98.6% | String | 'CREG4-PC', 'CREG2-PC' | Sparse tracking |
| `printlog_ipaddr` | Print IP Address | IP address of print source | 98.6% | String | '10.0.242.25' | Sparse tracking |
| `printlog_serial` | Print Serial | Printer serial identifier | 98.6% | String | 'FF7ABAB49C30EF111' | Sparse tracking |
| `verified_by` | Verified By | Record verification authority | 100.0% | String | - | No data |
| `job_id` | Job ID | Processing job reference | 100.0% | String | - | No data |
| `adoptionorderdate` | Adoption Order Date | Legal adoption date | 100.0% | String | - | No data |
| `bptsml_nm` | Baptismal Name | Religious naming | 98.0% | String | 'AMENDED AS PER **', 'VAUGN CASSIA' | Rare usage |

## Data Quality Summary

### ✅ **High Quality Fields (< 5% null)**
- Core person names (`c_frst_nm`, `m_frst_nm`, `m_last_nm`)
- Event metadata (`event`, `entry_yr`, `page_nbr`, `parish_nm`)
- System tracking (`printlog_id`, `user_id`, `version`)

### ⚠️ **Medium Quality Fields (5-50% null)**
- Child middle name (8.2% null)
- Informant description (13.2% null)
- Mother address (18.6% null)

### ❌ **Poor Quality Fields (> 50% null)**
- Father information (50-87% null)
- Address fields (72-100% null)
- All marriage fields (100% null - no marriage data)
- Death-specific fields (100% null in birth file)
- System audit fields (98-100% null)

## Event Type Distribution
- **BI (Birth)**: 138,484 records (82.1%)
- **DE (Death)**: 30,082 records (17.9%)
- **MA (Marriage)**: 0 records (0.0%)

## Key Migration Considerations

1. **Date Format Inconsistencies**: Mix of Excel serial numbers and datetime strings
2. **Name Field Completeness**: High quality for mothers, poor for fathers
3. **Address Data**: Mostly incomplete, needs default handling
4. **Certificate Numbers**: Present but need validation for uniqueness
5. **Marriage Data**: Schema exists but no actual marriage records
6. **Parish Standardization**: Need mapping to OpenCRVS location hierarchy
7. **Informant Parsing**: Complex descriptions need relationship extraction