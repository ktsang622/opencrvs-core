# Legacy Data to OpenCRVS Field Mapping Table

## Birth Registration Mapping

| Legacy Source Field | OpenCRVS Destination | Transformation Required | Status |
|-------------------|---------------------|------------------------|--------|
| **CHILD DATA** | | | |
| `c_frst_nm` | `child.name[0].firstNamesEng` | Trim, validate English chars | ✅ Direct |
| `c_mid_nm` | `child.name[0].middleNameEng` | Trim, handle NULL | ✅ Direct |
| `c_last_nm` | `child.name[0].familyNameEng` | Trim, validate English chars | ✅ Direct |
| `c_sex` | `child.gender` | M→male, F→female, ''→unknown | 🔄 Transform |
| `c_dob` | `child.birthDate` | Parse date format | 🔄 Transform |
| `c_address` | `child.address[0].text` | Parse to structured address | 🔄 Transform |
| **MOTHER DATA** | | | |
| `m_frst_nm` | `mother.name[0].firstNamesEng` | Trim, validate English chars | ✅ Direct |
| `m_mid_nm` | `mother.name[0].middleNameEng` | Trim, handle NULL | ✅ Direct |
| `m_last_nm` | `mother.name[0].familyNameEng` | Trim, validate English chars | ✅ Direct |
| `m_mdn_nm` | `mother.name[1].familyNameEng` | Create maiden name entry | 🔄 Transform |
| `m_address` | `mother.address[0].text` | Parse to structured address | 🔄 Transform |
| `m_occn` | `mother.occupation` | Direct mapping | ✅ Direct |
| **FATHER DATA** | | | |
| `f_frst_nm` | `father.name[0].firstNamesEng` | Trim, validate English chars | ✅ Direct |
| `f_mid_nm` | `father.name[0].middleNameEng` | Trim, handle NULL | ✅ Direct |
| `f_last_nm` | `father.name[0].familyNameEng` | Trim, validate English chars | ✅ Direct |
| `f_address` | `father.address[0].text` | Parse to structured address | 🔄 Transform |
| `f_occn` | `father.occupation` | Direct mapping | ✅ Direct |
| **INFORMANT DATA** | | | |
| `i_name` | `informant.name[0].firstNamesEng` | Parse name into components | 🔄 Transform |
| `i_address` | `informant.address[0].text` | Parse to structured address | 🔄 Transform |
| `i_desc` | `informant.relationship` | Map to standard enum values | 🔄 Transform |
| **REGISTRATION DATA** | | | |
| `reg_dt` | `registration.status[0].timestamp` | Parse date, create status entry | 🔄 Transform |
| `cert_nbr` | `registration.registrationNumber` | Direct mapping | ✅ Direct |
| `page_nbr` | `registration.page` | Direct mapping | ✅ Direct |
| `entry_nbr` | `registration.paperFormID` | Direct mapping | ✅ Direct |
| `entry_yr` | `registration.trackingId` | Combine with other fields for ID | 🔄 Transform |
| **LOCATION DATA** | | | |
| `parish_nm` | `eventLocation.name` | Map to location hierarchy UUID | 🔄 Transform |
| **MISSING REQUIRED** | | | |
| ❌ Missing | `registration.informantType` | Infer from `i_desc` mapping | 🆕 Generate |
| ❌ Missing | `eventLocation.id` | Map `parish_nm` to UUID | 🆕 Generate |
| ❌ Missing | `placeOfBirth` | Default to 'OTHER' | 🆕 Generate |
| ❌ Missing | `mother.detailsExist` | Check if mother data present | 🆕 Generate |
| ❌ Missing | `father.detailsExist` | Check if father data present | 🆕 Generate |

## Death Registration Mapping

| Legacy Source Field | OpenCRVS Destination | Transformation Required | Status |
|-------------------|---------------------|------------------------|--------|
| **DECEASED DATA** | | | |
| `c_frst_nm` | `deceased.name[0].firstNamesEng` | Trim, validate English chars | ✅ Direct |
| `c_mid_nm` | `deceased.name[0].middleNameEng` | Trim, handle NULL | ✅ Direct |
| `c_last_nm` | `deceased.name[0].familyNameEng` | Trim, validate English chars | ✅ Direct |
| `c_sex` | `deceased.gender` | M→male, F→female, ''→unknown | 🔄 Transform |
| `c_dob` | `deceased.birthDate` | Parse date format | 🔄 Transform |
| `death_dt` | `deceased.deathDate` | Parse date format | 🔄 Transform |
| `c_age` | `deceased.age` | Direct mapping | ✅ Direct |
| `c_address` | `deceased.address[0].text` | Parse to structured address | 🔄 Transform |
| `c_occn` | `deceased.occupation` | Direct mapping | ✅ Direct |
| **DEATH DETAILS** | | | |
| `c_cause` | `causeOfDeath` | Direct mapping | ✅ Direct |
| `c_complex` | `deathDescription` | Direct mapping | ✅ Direct |
| `dr_name` | `medicalPractitioner.name` | Parse name into components | 🔄 Transform |
| **MISSING REQUIRED** | | | |
| ❌ Missing | `mannerOfDeath` | Default to 'NATURAL' | 🆕 Generate |
| ❌ Missing | `causeOfDeathEstablished` | Infer from `dr_name` presence | 🆕 Generate |
| ❌ Missing | `causeOfDeathMethod` | Default based on `dr_name` | 🆕 Generate |

## Marriage Registration Mapping

| Legacy Source Field | OpenCRVS Destination | Transformation Required | Status |
|-------------------|---------------------|------------------------|--------|
| **GROOM DATA** | | | |
| `g_frst_nm` | `groom.name[0].firstNamesEng` | Trim, validate English chars | ✅ Direct |
| `g_mid_nm` | `groom.name[0].middleNameEng` | Trim, handle NULL | ✅ Direct |
| `g_last_nm` | `groom.name[0].familyNameEng` | Trim, validate English chars | ✅ Direct |
| `g_age` | `groom.age` | Direct mapping | ✅ Direct |
| `g_occn` | `groom.occupation` | Direct mapping | ✅ Direct |
| `g_address` | `groom.address[0].text` | Parse to structured address | 🔄 Transform |
| `g_status` | `groom.maritalStatus` | Map to standard values | 🔄 Transform |
| `g_consent` | `groom.consentGiven` | Boolean conversion | 🔄 Transform |
| **BRIDE DATA** | | | |
| `b_frst_nm` | `bride.name[0].firstNamesEng` | Trim, validate English chars | ✅ Direct |
| `b_mid_nm` | `bride.name[0].middleNameEng` | Trim, handle NULL | ✅ Direct |
| `b_last_nm` | `bride.name[0].familyNameEng` | Trim, validate English chars | ✅ Direct |
| `b_age` | `bride.age` | Direct mapping | ✅ Direct |
| `b_occn` | `bride.occupation` | Direct mapping | ✅ Direct |
| `b_address` | `bride.address[0].text` | Parse to structured address | 🔄 Transform |
| `b_status` | `bride.maritalStatus` | Map to standard values | 🔄 Transform |
| `b_consent` | `bride.consentGiven` | Boolean conversion | 🔄 Transform |
| **MARRIAGE DETAILS** | | | |
| `marriage_dt` | `eventLocation.eventDate` | Parse date format | 🔄 Transform |
| `marriedat` | `eventLocation.name` | Direct mapping | ✅ Direct |
| `marriedby` | `informant.name[0]` | Parse officiant name | 🔄 Transform |
| `witness_1` | `witnessOne.name[0]` | Parse name into components | 🔄 Transform |
| `witness_2` | `witnessTwo.name[0]` | Parse name into components | 🔄 Transform |
| `m_cert_top` | `registration.registrationNumber` | Combine cert numbers | 🔄 Transform |
| `m_cert_btm` | `registration.additionalInfo` | Secondary cert reference | 🔄 Transform |
| **MISSING REQUIRED** | | | |
| ❌ Missing | `typeOfMarriage` | Default to 'CIVIL' | 🆕 Generate |
| ❌ Missing | `groom.birthDate` | Calculate from age and marriage date | 🆕 Generate |
| ❌ Missing | `bride.birthDate` | Calculate from age and marriage date | 🆕 Generate |
| ❌ Missing | `groom.gender` | Default to 'male' | 🆕 Generate |
| ❌ Missing | `bride.gender` | Default to 'female' | 🆕 Generate |

## System/Audit Fields Mapping

| Legacy Source Field | OpenCRVS Destination | Transformation Required | Status |
|-------------------|---------------------|------------------------|--------|
| **AUDIT TRACKING** | | | |
| `printlog_id` | `_migrationMetadata.sourceId` | Store for reference | 📝 Metadata |
| `printlog_time` | `_migrationMetadata.sourceTimestamp` | Parse Excel date serial | 📝 Metadata |
| `user_id` | `_migrationMetadata.sourceUser` | Store for reference | 📝 Metadata |
| `event` | `_migrationMetadata.sourceEventType` | BI/DE/MA classification | 📝 Metadata |
| `extraction_id` | `_migrationMetadata.extractionId` | Store for reference | 📝 Metadata |
| `version` | `_migrationMetadata.sourceVersion` | Store for reference | 📝 Metadata |
| `verified_by` | `_migrationMetadata.verifiedBy` | Store for reference | 📝 Metadata |
| `image_id` | `_migrationMetadata.imageReference` | Store for reference | 📝 Metadata |
| `certificate_status` | `registration.status[0].type` | Map to OpenCRVS status | 🔄 Transform |
| `job_id` | `_migrationMetadata.jobId` | Store for reference | 📝 Metadata |

## Universal Required Fields (Generated)

| OpenCRVS Required Field | Generation Strategy | Default Value | Priority |
|------------------------|-------------------|---------------|----------|
| `registration.trackingId` | Generate UUID | `uuid.v4()` | 🚨 Critical |
| `registration.informantType` | Map from `i_desc` | See informant mapping rules | 🚨 Critical |
| `eventLocation.id` | Parish name lookup | Map `parish_nm` to UUID | 🚨 Critical |
| `registration.contactPhoneNumber` | Default value | `'+1-000-000-0000'` | ⚠️ Medium |
| `registration.contactEmail` | Default value | `'migration@opencrvs.org'` | ⚠️ Medium |
| `registration.status[0].user` | Migration user | `'migration-system'` | ⚠️ Medium |
| `registration.status[0].location` | Default location | Parish location UUID | ⚠️ Medium |
| `createdAt` | Migration timestamp | Current timestamp | ⚠️ Medium |
| `updatedAt` | Migration timestamp | Current timestamp | ⚠️ Medium |

## Informant Type Mapping Rules

| Legacy `i_desc` Values | OpenCRVS `informantType` | Event Type |
|----------------------|------------------------|------------|
| `'mother'`, `'mom'`, `'madre'` | `'MOTHER'` | Birth |
| `'father'`, `'dad'`, `'padre'` | `'FATHER'` | Birth |
| `'grandmother'`, `'grandma'` | `'GRANDMOTHER'` | Birth |
| `'grandfather'`, `'grandpa'` | `'GRANDFATHER'` | Birth |
| `'guardian'`, `'legal guardian'` | `'LEGAL_GUARDIAN'` | Birth |
| `'husband'`, `'spouse'`, `'wife'` | `'SPOUSE'` | Death |
| `'son'`, `'hijo'` | `'SON'` | Death |
| `'daughter'`, `'hija'` | `'DAUGHTER'` | Death |
| `'brother'`, `'sister'`, `'sibling'` | `'EXTENDED_FAMILY'` | Death |
| `'bride'`, `'novia'` | `'BRIDE'` | Marriage |
| `'groom'`, `'novio'` | `'GROOM'` | Marriage |
| **Default fallback** | `'OTHER'` | All |

## Gender Mapping Rules

| Legacy `c_sex` Values | OpenCRVS `gender` |
|---------------------|------------------|
| `'M'`, `'1'`, `'Male'` | `'male'` |
| `'F'`, `'2'`, `'Female'` | `'female'` |
| `''`, `NULL`, `'U'` | `'unknown'` |
| **Default fallback** | `'unknown'` |

## Status Icons Legend

- ✅ **Direct**: Field maps directly with minimal transformation
- 🔄 **Transform**: Requires data transformation or parsing
- 🆕 **Generate**: Missing field requires generation/default value
- 📝 **Metadata**: Stored for reference, not core registration data
- 🚨 **Critical**: Migration blocker if not handled
- ⚠️ **Medium**: Important for data quality
- 📝 **Low**: Nice to have, not essential