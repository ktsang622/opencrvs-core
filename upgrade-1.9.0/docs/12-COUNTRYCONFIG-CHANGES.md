# Countryconfig Customizations and 1.9.0 Migration

## Summary

This document details all customizations made to the countryconfig repository for Toppan/Antigua deployment and the changes required for 1.9.0 migration.

**Source Branch:** `opencrvs-countryconfig` (current Toppan customizations)
**Target Branch:** `opencrvs-countryconfig-1.9.0` (based on upstream v1.9.2)

---

## 1. Custom Field Types

### 1.1 Field Types Added

Located in [src/form/types/types.ts](../../opencrvs-countryconfig/src/form/types/types.ts):

| Field Type | Line | Purpose |
|------------|------|---------|
| `EXT_LOOKUP_BUTTON` | 155 | External person lookup/search button |
| `GOID_VERIFY_BUTTON` | 156 | goID identity verification button |

**Interfaces Added:**

```typescript
// IExtLookupButtonField (lines 464-472)
export interface IExtLookupButtonField extends IFormFieldBase {
  type: typeof EXT_LOOKUP_BUTTON
  modalTitle: MessageDescriptor
  successTitle?: MessageDescriptor
  errorTitle?: MessageDescriptor
  queryMap?: ISerializedQueryMap
  querySelectorInput?: IFieldInput
  onPersonSelect?: (person: any) => void
}

// IGoIDVerifyButtonField (lines 474-481)
export interface IGoIDVerifyButtonField extends IFormFieldBase {
  type: typeof GOID_VERIFY_BUTTON
  modalTitle: MessageDescriptor
  successTitle?: MessageDescriptor
  errorTitle?: MessageDescriptor
  queryMap?: ISerializedQueryMap
  querySelectorInput?: IFieldInput
}
```

### 1.2 1.9.0 Migration Impact

| Change | Impact | Action Required |
|--------|--------|-----------------|
| Field types in countryconfig | Medium | Keep custom types, they work with V1 events |
| Events V2 uses different field system | High | Phase 2: Consider using `HTTP` + `BUTTON` built-in types |

---

## 2. Custom Field Factory Functions

Located in [src/form/custom-fields.ts](../../opencrvs-countryconfig/src/form/custom-fields.ts):

### 2.1 Person Picker / Lookup Functions

| Function | Lines | Purpose |
|----------|-------|---------|
| `createPersonPicker()` | 245-320 | Creates person search picker with modal |
| `createSelectedPersonIdField()` | 322-373 | Shows linked person UUID (read-only) |
| `createUnlinkButton()` | 375-419 | Button to unlink person and allow manual input |
| `createExtLookupButton()` | 421-478 | External lookup button with registrar-only conditional |

### 2.2 goID Verification Function

| Function | Lines | Purpose |
|----------|-------|---------|
| `createGoIDVerifyButton()` | 483-583 | Creates goID verification button with modal |

### 2.3 Other Custom Fields

| Function | Lines | Purpose |
|----------|-------|---------|
| `getReasonForLateRegistration()` | 64-109 | Late registration reason field |
| `getIDType()` | 152-178 | ID type selector (National ID, Passport, BRN) |
| `getIDNumber()` | 187-233 | ID number input with validation |
| `getIDNumberFields()` | 235-243 | Returns array of ID fields for all types |

---

## 3. Form Definitions with Custom Fields

### 3.1 Birth Form

Located in [src/form/birth/index.ts](../../opencrvs-countryconfig/src/form/birth/index.ts):

**Mother Section (lines 314-416):**
```typescript
createExtLookupButton('motherSearch', 'mother'),
createGoIDVerifyButton('motherGoIDVerify', 'mother'),
createUnlinkButton('motherUnlink', 'mother'),
createSelectedPersonIdField('mother'),
```

**Father Section (lines 418-528):**
```typescript
createExtLookupButton('fatherSearch', 'father'),
createGoIDVerifyButton('fatherGoIDVerify', 'father'),
createUnlinkButton('fatherUnlink', 'father'),
createSelectedPersonIdField('father'),
```

### 3.2 Death Form

Located in [src/form/death/index.ts](../../opencrvs-countryconfig/src/form/death/index.ts):

**Deceased Section (lines 177-304):**
```typescript
createExtLookupButton('deceasedSearch', 'deceased', [], 'death', false),
createUnlinkButton('deceasedUnlink', 'deceased', [], false),
createSelectedPersonIdField('deceased', [], 'death', false),
```

**Spouse Section (lines 396-509):**
```typescript
createExtLookupButton('spouseSearch', 'spouse', [], 'death', true),
createUnlinkButton('spouseUnlink', 'spouse', [], true),
createSelectedPersonIdField('spouse', [], 'death', true),
```

### 3.3 Marriage Form

Marriage form includes similar patterns for bride/groom sections.

---

## 4. Client Configuration

### 4.1 Feature Flags

Located in [src/client-config.js](../../opencrvs-countryconfig/src/client-config.js):

```javascript
window.config = {
  // ... standard config ...
  FAMILY_TREE_URL: 'http://localhost:3889/familyTree',
  TOPPAN_SERVICE_URL: 'http://localhost:7070',
  DEBUG: true,
  FEATURES: {
    V2_EVENTS: {{ V2_EVENTS }},  // Templated for V2 toggle
    ENHANCED_DOCUMENT_VIEWER: true,
    GOID_ENABLED: true
  }
}
```

### 4.2 1.9.0 Migration Impact

| Config Key | Status | Notes |
|------------|--------|-------|
| `V2_EVENTS` | **Required** | New in 1.9.0, controls Events V2 |
| `FAMILY_TREE_URL` | Keep | Toppan custom feature |
| `TOPPAN_SERVICE_URL` | Keep | Toppan service endpoint |
| `ENHANCED_DOCUMENT_VIEWER` | Keep | Custom feature flag |
| `GOID_ENABLED` | Keep | Custom feature flag |

---

## 5. API Handlers

### 5.1 Person Lookup Handler

Located in [src/api/person-lookup/handler.ts](../../opencrvs-countryconfig/src/api/person-lookup/handler.ts):

```typescript
// Route: POST /api/person-lookup
export async function personLookupHandler(
  request: Hapi.Request,
  h: Hapi.ResponseToolkit
)
```

**Purpose:** Searches external system for person data to populate form fields.

### 5.2 Toppan Certificate Handler

Located in [src/api/certificates/toppan-handler.ts](../../opencrvs-countryconfig/src/api/certificates/toppan-handler.ts):

```typescript
// Route: GET /api/countryconfig/certificates/toppan/{templateType}/{filename}
export async function toppanTemplateHandler(
  request: Request,
  h: ResponseToolkit
)
```

**Purpose:** Serves ElmLayout templates and background images for certificate-service.

---

## 6. Environment Configuration

### 6.1 Custom Environment Variables

Located in [src/environment.ts](../../opencrvs-countryconfig/src/environment.ts):

| Variable | Default (Dev) | Default (Prod) | Purpose |
|----------|---------------|----------------|---------|
| `CERTIFICATE_SERVICE_URL` | `http://localhost:5000` | `http://certificate-service:5000` | Toppan certificate API |

---

## 7. Infrastructure Changes (1.9.0)

### 7.1 PostgreSQL with mongo_fdw

**Critical Change:** 1.9.0 introduces PostgreSQL alongside MongoDB. The postgres image must include mongo_fdw extension.

**Commit:** `f7c3cc68f6b6eb06ca651959c28fd28066029071`

**File:** `infrastructure/docker-compose.deploy.yml`

```yaml
# Before (1.8.x default)
postgres:
  image: postgres:17.6

# After (1.9.0 required)
postgres:
  image: docker.io/chumaky/postgres_mongo_fdw:17.6_fdw5.5.2
```

**Also update `postgres-on-update` service:**
```yaml
postgres-on-update:
  image: docker.io/chumaky/postgres_mongo_fdw:17.6_fdw5.5.2
```

### 7.2 New Environment Variables Required

From 1.9.0 CHANGELOG:

| Variable | Service | Description |
|----------|---------|-------------|
| `EVENTS_SUPERUSER_POSTGRES_URL` | migration | PostgreSQL superuser URL for events |
| `MONGO_HOST` | migration | MongoDB host for FDW |

### 7.3 Port Considerations

| Database | Port | Notes |
|----------|------|-------|
| OpenCRVS PostgreSQL | 5432 | New in 1.9.0 for Events V2 |
| Toppan PostgreSQL | 5433 | Existing Toppan service (no conflict) |
| MongoDB | 27017 | Unchanged |

---

## 8. Metabase / Dashboard

### 8.1 Current Setup

The current countryconfig includes Metabase configuration in `docker-compose.deploy.yml`:

```yaml
dashboards:
  volumes:
    - /opt/opencrvs/infrastructure/metabase/metabase.init.db.sql:/metabase.init.db.sql
  environment:
    - OPENCRVS_METABASE_ADMIN_EMAIL=${OPENCRVS_METABASE_ADMIN_EMAIL}
    - OPENCRVS_METABASE_ADMIN_PASSWORD=${OPENCRVS_METABASE_ADMIN_PASSWORD}
```

### 8.2 1.9.0 Changes

**BREAKING:** Metabase is removed from core in 1.9.0.

**Options:**
1. **Keep Metabase separately** (Recommended for existing deployments)
   - Run Metabase as standalone Docker container
   - Point to MongoDB performance database

2. **Use new built-in dashboard**
   - 1.9.0 includes new dashboard features
   - May not have all Metabase capabilities

**Action:** Keep existing Metabase config in countryconfig, ensure it's not overwritten during upgrade.

---

## 9. Migration Checklist

### Phase 1: Direct Migration (Keep Custom Types)

- [ ] **Types:** Keep `EXT_LOOKUP_BUTTON` and `GOID_VERIFY_BUTTON` in types.ts
- [ ] **Forms:** Update form definitions if V1 form structure changed
- [ ] **Client Config:** Add `V2_EVENTS` feature flag
- [ ] **Infrastructure:** Update postgres image to mongo_fdw version
- [ ] **Environment:** Add new 1.9.0 environment variables
- [ ] **Metabase:** Keep existing Metabase configuration

### Phase 2: Refactor to Built-in Types (Future)

- [ ] Replace `GOID_VERIFY_BUTTON` with `HTTP` field type
- [ ] Evaluate `SEARCH` field for person picker functionality
- [ ] Update form definitions to use new field types
- [ ] Test all custom features after refactoring

---

## 10. Files to Copy/Migrate

### New Files (Copy to 1.9.0)

| Source File | Destination | Notes |
|-------------|-------------|-------|
| `src/form/custom-fields.ts` | Same path | All custom field functions |
| `src/form/types/types.ts` | Merge | Add custom types to existing |
| `src/api/person-lookup/handler.ts` | Same path | New handler |
| `src/api/certificates/toppan-handler.ts` | Same path | Certificate templates handler |
| `src/api/certificates/toppan-templates/` | Same path | Template files (if any) |
| `src/client-config.js` | Merge | Add custom config keys |

### Modified Files (Merge Changes)

| File | Changes to Merge |
|------|------------------|
| `src/form/birth/index.ts` | Add person picker/goID fields to mother/father sections |
| `src/form/death/index.ts` | Add person picker fields to deceased/spouse sections |
| `src/environment.ts` | Add `CERTIFICATE_SERVICE_URL` |
| `infrastructure/docker-compose.deploy.yml` | Update postgres image, add Metabase config |

---

## 11. Testing Requirements

### Functionality Tests

- [ ] Person picker modal opens and searches correctly
- [ ] goID verification modal works with credentials
- [ ] Selected person data populates form fields correctly
- [ ] Unlink button clears linked data and enables manual input
- [ ] Certificate generation works with Toppan service
- [ ] Metabase dashboards accessible (if kept)

### Integration Tests

- [ ] PostgreSQL + mongo_fdw connection works
- [ ] Events V2 feature flag toggles correctly
- [ ] Custom field types render in forms
- [ ] Form submission with linked person data succeeds

---

## 12. Risk Assessment

| Component | Risk Level | Mitigation |
|-----------|------------|------------|
| Custom field types | Low | Self-contained, minimal core changes |
| Form definitions | Medium | May need updates for V1 structure changes |
| Person picker | Medium | API endpoints need to be registered |
| goID verification | Low | Self-contained integration |
| Certificate service | Medium | Scope changes (see core docs) |
| PostgreSQL migration | Low | Different port, no conflict |
| Metabase | Medium | Keep separate from core upgrade |

---

## Appendix A: Directory Structure

```
opencrvs-countryconfig/
├── src/
│   ├── api/
│   │   ├── certificates/
│   │   │   ├── toppan-handler.ts      # Toppan templates handler
│   │   │   └── toppan-templates/      # Template files
│   │   └── person-lookup/
│   │       └── handler.ts             # Person lookup endpoint
│   ├── form/
│   │   ├── custom-fields.ts           # All custom field functions
│   │   ├── types/
│   │   │   └── types.ts               # Custom field type definitions
│   │   ├── birth/
│   │   │   └── index.ts               # Birth form with person picker
│   │   ├── death/
│   │   │   └── index.ts               # Death form with person picker
│   │   └── marriage/
│   │       └── index.ts               # Marriage form with person picker
│   ├── client-config.js               # Feature flags
│   └── environment.ts                 # Environment variables
└── infrastructure/
    └── docker-compose.deploy.yml      # Postgres + Metabase config
```

---

## Appendix B: Related Documentation

- [00-MIGRATION-OVERVIEW.md](./00-MIGRATION-OVERVIEW.md) - Overall migration guide
- [01-GOID-INTEGRATION.md](./01-GOID-INTEGRATION.md) - goID feature details
- [03-PERSON-PICKER.md](./03-PERSON-PICKER.md) - Person picker implementation
- [10-BREAKING-CHANGES-ANALYSIS.md](./10-BREAKING-CHANGES-ANALYSIS.md) - Core breaking changes
- [11-EVENTS-V2-INTEGRATION.md](./11-EVENTS-V2-INTEGRATION.md) - Events V2 architecture
