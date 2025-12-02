# Breaking Changes Analysis: 1.8.2 → 1.9.2

## Overview

This document analyzes the breaking changes in OpenCRVS 1.9.x releases and their impact on the Toppan customizations. It identifies which custom code needs rewriting.

**Current Version:** 1.8.2
**Target Version:** 1.9.2

---

## Breaking Changes Summary with Actions

### 1.9.1 Breaking Changes

| Change | Impact | Status | Action | Resolution |
|--------|--------|--------|--------|------------|
| `QUERY_PARAM_READER` returns data under `data` object | ❌ None | ✅ OK | No action | N/A |
| Removed scopes (CERTIFY, etc.) | ⚠️ **High** | 🔴 BREAKING | Update certificate.ts | Replace `CERTIFY` → `record.registered.print-certified-copies` |

### 1.9.0 Breaking Changes

| Change | Impact | Status | Action | Resolution |
|--------|--------|--------|--------|------------|
| **Metabase REMOVED** - Dashboard moved to countryconfig | ⚠️ **High** | 🔴 BREAKING | Decide approach | See Dashboard section below |
| **PostgreSQL ADDED** - Events V2 uses PostgreSQL | ⚠️ Medium | 🟡 NEW | Add PostgreSQL service | Port 5432 (Toppan uses 5433, no conflict) |
| Node.js upgraded to v22 | ⚠️ Medium | 🟡 REQUIRED | Update engines | Update package.json, test all packages |
| Events V2 (new architecture) | ⚠️ Medium | 🟡 REQUIRED | Keep custom types for now | Phase 2 refactor (see below) |
| `COUNTRY_CONFIG_URL` → `COUNTRY_CONFIG_URL_EXTERNAL` | ⚠️ Low | 🟡 REQUIRED | Update env vars | Rename in docker-compose and .env files |

---

## Detailed Impact Analysis

### 1. Scope Changes (1.9.1) 🔴 BREAKING

#### Removed Scopes

| Old Scope | Status | Impact on Toppan | Resolution |
|-----------|--------|------------------|------------|
| `CERTIFY` | 🔴 REMOVED | **Used in certificate.ts** | → `record.registered.print-certified-copies` |
| `DECLARE` | 🔴 REMOVED | Not used directly | → `record.declare` |
| `VALIDATE` | 🔴 REMOVED | Not used directly | → `record.declared.validate` |
| `NATLSYSADMIN` | 🔴 REMOVED | Not used | N/A |
| `PERFORMANCE` | 🔴 REMOVED | Not used | N/A |
| `SYSADMIN` | 🔴 REMOVED | Not used | N/A |
| `TEAMS` | 🔴 REMOVED | Not used | N/A |
| `CONFIG` | 🔴 REMOVED | Not used | N/A |
| `RECORD_EXPORT_RECORDS` | 🔴 REMOVED | Not used | N/A |
| `RECORD_DECLARATION_PRINT` | 🔴 REMOVED | Not used | N/A |
| `RECORD_PRINT_RECORDS_SUPPORTING_DOCUMENTS` | 🔴 REMOVED | Not used | N/A |
| `RECORD_REGISTRATION_PRINT` | 🔴 REMOVED | Not used | N/A |
| `RECORD_PRINT_CERTIFIED_COPIES` | 🔴 REMOVED | Not used | N/A |
| `RECORD_REGISTRATION_VERIFY_CERTIFIED_COPIES` | 🔴 REMOVED | Not used | N/A |
| `PROFILE_UPDATE` | 🔴 REMOVED | Not used | N/A |

#### Certificate Service Endpoint - MUST FIX

**Current code** (`packages/gateway/src/features/toppan/certificate.ts`):
```typescript
// BEFORE (1.8.2):
options: {
  auth: {
    strategy: 'jwt',
    scope: ['CERTIFY']  // ❌ REMOVED in 1.9.1
  }
}

// AFTER (1.9.x) - MUST CHANGE TO:
options: {
  auth: {
    strategy: 'jwt',
    scope: ['record.registered.print-certified-copies']  // ✅ New scope
  }
}
```

**Action:** Update immediately during migration

#### goID Endpoint - NO ACTION NEEDED

```typescript
// packages/gateway/src/features/goid/index.ts
options: {
  auth: false  // ✅ No auth, no impact
}
```

---

### 2. Dashboard / Metabase (1.9.0) 🔴 BREAKING

#### What Changed

**Metabase is FULLY REMOVED from OpenCRVS 1.9.0.** The dashboard package has been deleted and replaced with a new dashboard system built into countryconfig.

#### Impact Assessment

| Aspect | Old (1.8.2) | New (1.9.0) | Impact |
|--------|-------------|-------------|--------|
| Dashboard System | Metabase (standalone) | Built-in countryconfig | **Major change** |
| Configuration | Metabase UI | Code in countryconfig | Different approach |
| Custom Queries | SQL in Metabase | Pre-defined in code | Limited flexibility |
| Package | `packages/dashboard` | REMOVED | Must migrate |

#### Options for Toppan

| Option | Effort | Pros | Cons |
|--------|--------|------|------|
| **A. Use new built-in dashboard** | Low | Native support, maintained | Less flexible than Metabase |
| **B. Run Metabase separately** | Medium | Keep custom dashboards | Not integrated, extra maintenance |
| **C. Hybrid approach** | High | Best of both | Complex setup |

#### Recommended Resolution

**Option B: Run Metabase as separate service**

```yaml
# docker-compose.infra.yml - Add separate Metabase
services:
  metabase:
    image: metabase/metabase:latest
    container_name: metabase
    ports:
      - "4444:3000"
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: metabase
      MB_DB_PORT: 5432
      MB_DB_USER: metabase
      MB_DB_PASS: metabase
      MB_DB_HOST: metabase-db
    depends_on:
      - metabase-db
```

**Action:**
1. Keep Metabase running separately
2. Update client-config to point to external Metabase URLs
3. Document the separate Metabase setup

---

### 3. Node.js 22 Upgrade (1.9.0) 🟡 REQUIRED

#### Files to Update

| Package | File | Current | Required |
|---------|------|---------|----------|
| toppan | `package.json` | `"node": ">=18"` | `"node": ">=22"` |
| toppan-service | `package.json` | `"node": ">=18"` | `"node": ">=22"` |
| goid-demo | `package.json` | `"node": ">=18"` | `"node": ">=22"` |

#### Action Checklist

- [ ] Update all `package.json` engines fields
- [ ] Update Dockerfile base images to `node:22-alpine`
- [ ] Test all packages with Node.js 22 locally
- [ ] Check for deprecated APIs (especially in crypto, stream)

---

### 4. Database Changes (1.9.0) 🟡 NEW - PostgreSQL Added

#### What Changed

**Events V2 introduces PostgreSQL** for the new events service. MongoDB is **NOT replaced** - it's still used for existing services.

#### Database Architecture in 1.9.x

| Database | Service | Purpose | Status |
|----------|---------|---------|--------|
| **PostgreSQL (NEW)** | `events` | Events V2 event storage | 🆕 New in 1.9.0 |
| MongoDB | hearth | FHIR records | ✅ Unchanged |
| MongoDB | user-mgnt | User management | ✅ Unchanged |
| MongoDB | metrics | Performance metrics | ✅ Unchanged |
| MongoDB | webhooks | Webhook configs | ✅ Unchanged |
| MongoDB | application-config | App config | ✅ Unchanged |
| MongoDB | openhim | OpenHIM | ✅ Unchanged |
| Elasticsearch | search | Search index | ✅ Unchanged |
| Redis | - | Caching | ✅ Unchanged |

#### New PostgreSQL Service

```yaml
# docker-compose.dev-deps.yml
postgres:
  image: postgres:17.6   # Note: May need custom image with mongo_fdw - see below
  container_name: postgres
  environment:
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
    POSTGRES_DB: postgres
  ports:
    - '5432:5432'
  volumes:
    - ./data/postgres:/var/lib/postgresql/data
    - ./packages/migration/src/migrations/postgres/0001_init.sql:/docker-entrypoint-initdb.d/0001_init.sql
```

#### MongoDB FDW (Foreign Data Wrapper) - CONFIRMED FIX

> **Commit:** `f7c3cc68f6` in countryconfig (Nov 27, 2025)
> **Author:** Tameem Bin Haider

**PostgreSQL image switched to include mongo_fdw:**

```yaml
# infrastructure/docker-compose.deploy.yml (countryconfig)
postgres:
  image: docker.io/chumaky/postgres_mongo_fdw:17.6_fdw5.5.2  # ✅ Custom image with mongo_fdw

postgres-on-update:
  image: docker.io/chumaky/postgres_mongo_fdw:17.6_fdw5.5.2  # ✅ Same image for migrations
```

**New environment variables required for `migration` service:**
- `EVENTS_SUPERUSER_POSTGRES_URL`
- `MONGO_HOST`

**Why mongo_fdw?**
- Events V2 (PostgreSQL) needs to read data from existing MongoDB collections
- Enables migration of data from MongoDB to PostgreSQL
- Allows joins between PostgreSQL events and MongoDB FHIR records

**Action:**
- [x] Use `docker.io/chumaky/postgres_mongo_fdw:17.6_fdw5.5.2` instead of `postgres:17.6`
- [ ] Add new environment variables for migration service
- [ ] Update countryconfig docker-compose files

#### Events Database Schema

```sql
-- packages/migration/src/migrations/postgres/0001_init.sql
CREATE DATABASE events;

CREATE ROLE events_migrator WITH LOGIN PASSWORD 'migrator_password';
CREATE ROLE events_app WITH LOGIN PASSWORD 'app_password';

GRANT CONNECT ON DATABASE events TO events_migrator, events_app;

CREATE SCHEMA app AUTHORIZATION events_migrator;
GRANT USAGE ON SCHEMA app TO events_app;
```

#### Impact on Toppan

| Aspect | Impact | Action |
|--------|--------|--------|
| Toppan PostgreSQL (port 5433) | ⚠️ Low | May conflict if same port, check docker-compose |
| Events V2 PostgreSQL (port 5432) | ✅ Separate | Different database, no conflict |
| OpenSearch | ✅ None | Still separate from OpenCRVS search |
| MongoDB sync | ✅ None | Existing webhook sync unchanged |

#### Action Required

- [ ] Add PostgreSQL 17.6 to docker-compose
- [ ] Ensure no port conflict with Toppan PostgreSQL (5433 vs 5432)
- [ ] Run Events database migrations
- [ ] Update backup scripts to include PostgreSQL

---

### 5. Events V2 Architecture (1.9.0) 🟡 REQUIRED (Phase 1: Keep Working)

#### Strategy: Two-Phase Approach

**Phase 1 (During Upgrade):** Keep custom field types working
**Phase 2 (Post-Upgrade):** Refactor to use built-in field types

#### Phase 1: Keep Custom Field Types

Our custom field types should still work if we:
1. Add them to the new `FieldConfig.ts` discriminatedUnion
2. Keep the client-side components

```typescript
// packages/commons/src/events/FieldConfig.ts - Add to discriminatedUnion
export const FieldConfig = z.discriminatedUnion('type', [
  // ... existing fields
  GoIdVerifyButton,      // Add our custom type
  PersonPickerField,     // Add our custom type
  ExtLookupButton        // Add our custom type
])
```

#### Impact on Custom Features

| Feature | Phase 1 Action | Phase 2 Refactor |
|---------|----------------|------------------|
| goID Button | Keep `GOID_VERIFY_BUTTON` | → `HTTP` + `BUTTON` |
| PersonPicker | Keep `PERSON_PICKER` | → `SEARCH` field |
| ExtLookup | Keep `EXT_LOOKUP_BUTTON` | → `HTTP` + `BUTTON` |
| Certificate Service | Update scopes only | No change needed |

---

### 5. CSP Changes (1.8.1) 🟢 VERIFY

**Current CSP (our changes):**
```typescript
'object-src': ["'self'", 'data:', 'blob:'],
'frame-src': ["'self'", 'data:', 'blob:'],
```

**Action:** Verify our CSP additions don't conflict with new hardened CSP after migration.

---

## Action Summary Table

| Item | Priority | Status | Action | Owner | Due |
|------|----------|--------|--------|-------|-----|
| Certificate.ts scope | 🔴 Critical | TODO | Change `CERTIFY` → `record.registered.print-certified-copies` | - | Migration |
| Metabase | 🔴 Critical | TODO | Run as separate service OR use new dashboard | - | Migration |
| PostgreSQL + mongo_fdw | 🟡 High | TODO | Use `chumaky/postgres_mongo_fdw:17.6_fdw5.5.2` image | - | Migration |
| Node.js 22 | 🟡 High | TODO | Update all package.json engines | - | Migration |
| Custom field types | 🟡 High | TODO | Add to FieldConfig.ts discriminatedUnion | - | Migration |
| Environment vars | 🟢 Low | TODO | Rename COUNTRY_CONFIG_URL | - | Migration |
| CSP verification | 🟢 Low | TODO | Test PDF preview after migration | - | Post-migration |

---

## Future Refactoring: Custom Buttons to Built-in Types

> **NOTE:** This is Phase 2 work - AFTER the upgrade is complete and stable.

### Why Refactor?

Using built-in field types (HTTP, BUTTON, SEARCH) instead of custom types:
- Reduces maintenance burden
- Benefits from upstream improvements
- Simplifies countryconfig
- Better long-term compatibility

### Refactoring Plan

#### 1. goID Verify Button → HTTP + BUTTON

**Current (Custom):**
```typescript
{
  name: 'goIdVerifyMother',
  type: 'GOID_VERIFY_BUTTON',
  label: { defaultMessage: 'Verify Mother', ... },
  goidVerifyConfig: {
    endpoint: '/goid/verify',
    personFields: {
      firstName: 'mother.firstNamesEng',
      lastName: 'mother.familyNameEng',
      dob: 'mother.motherBirthDate',
      nationalId: 'mother.iD'
    }
  }
}
```

**Future (Built-in):**
```typescript
// Button to trigger verification
{
  id: 'mother.verify.trigger',
  type: 'BUTTON',
  label: { id: 'verify.button', defaultMessage: 'Verify with goID', description: '' },
  configuration: {
    text: { id: 'button.text', defaultMessage: 'Verify Identity', description: '' },
    icon: 'CheckCircle'
  }
},
// HTTP field to perform the call
{
  id: 'mother.verify.result',
  type: 'HTTP',
  label: { id: 'verify.result', defaultMessage: 'Verification Result', description: '' },
  configuration: {
    trigger: { $$field: 'mother.verify.trigger' },
    url: '/api/goid/verify',
    method: 'POST',
    body: {
      firstName: { $$field: 'mother.name.firstname' },
      lastName: { $$field: 'mother.name.surname' },
      dob: { $$field: 'mother.dob' },
      nationalId: { $$field: 'mother.nid' }
    },
    timeout: 30000
  }
}
```

#### 2. Person Picker → SEARCH Field

**Current (Custom):**
```typescript
{
  name: 'selectPerson',
  type: 'PERSON_PICKER',
  label: { defaultMessage: 'Select Person', ... },
  searchConfig: {
    endpoint: '/person-search',
    displayFields: ['name', 'dob', 'nationalId']
  }
}
```

**Future (Built-in):**
```typescript
{
  id: 'person.search',
  type: 'SEARCH',
  label: { id: 'person.search', defaultMessage: 'Search Person', description: '' },
  configuration: {
    // Evaluate if SEARCH field meets requirements
    // May still need custom component for complex UI
  }
}
```

#### 3. Refactoring Checklist (Phase 2)

- [ ] **Evaluate HTTP field** - Can it handle goID verification flow?
- [ ] **Evaluate SEARCH field** - Can it replace PersonPicker UI?
- [ ] **Create proof of concept** - Test with one field type first
- [ ] **Update countryconfig** - Migrate form definitions
- [ ] **Remove custom components** - Clean up client code
- [ ] **Remove custom field types** - Clean up FieldConfig additions
- [ ] **Update documentation** - Reflect new approach

#### 4. Timeline

| Phase | Timeline | Description |
|-------|----------|-------------|
| Phase 1 | Migration | Keep custom types working |
| Phase 2 | Post-migration + 2 weeks | Evaluate built-in alternatives |
| Phase 3 | Post-migration + 4 weeks | Implement refactoring if beneficial |

---

## Migration Checklist

### Pre-Migration

- [ ] Backup current codebase
- [ ] Document all custom scopes used
- [ ] Test current functionality baseline
- [ ] Update local Node.js to v22
- [ ] Decide Metabase approach

### During Migration

- [ ] **Scope Fix:** Update certificate.ts (`CERTIFY` → `record.registered.print-certified-copies`)
- [ ] **Node.js:** Update all package.json engines to `"node": ">=22"`
- [ ] **Custom Fields:** Add GOID_VERIFY_BUTTON, PERSON_PICKER to FieldConfig.ts
- [ ] **Dashboard:** Set up separate Metabase OR use new dashboard
- [ ] **Env Vars:** Rename COUNTRY_CONFIG_URL → COUNTRY_CONFIG_URL_EXTERNAL
- [ ] **CSP:** Verify PDF preview still works

### Post-Migration

- [ ] Test goID verification flow
- [ ] Test Person Picker search
- [ ] Test certificate generation
- [ ] Test death registration workflow
- [ ] Test PDF document preview
- [ ] Test dashboard access
- [ ] Run full E2E test suite

### Phase 2 (Future)

- [ ] Evaluate HTTP field for goID
- [ ] Evaluate SEARCH field for PersonPicker
- [ ] Create refactoring plan if beneficial
- [ ] Implement refactoring
- [ ] Remove custom field types

---

## Risk Assessment

| Risk | Likelihood | Impact | Status | Mitigation |
|------|------------|--------|--------|------------|
| Scope changes break certificate auth | High | High | 🔴 Must fix | Update scope immediately |
| Metabase removal | High | High | 🔴 Must address | Run separately or migrate |
| Node 22 breaks packages | Low | Medium | 🟡 Test | Test locally first |
| Events V2 breaks forms | Medium | Medium | 🟡 Monitor | Keep custom types Phase 1 |
| CSP conflicts | Low | Low | 🟢 Verify | Test after migration |

---

## Quick Reference: Scope Mapping

| Old Scope (1.8.2) | New Scope (1.9.x) | Used by Toppan? |
|-------------------|-------------------|-----------------|
| `CERTIFY` | `record.registered.print-certified-copies` | **YES - certificate.ts** |
| `DECLARE` | `record.declare` | No |
| `VALIDATE` | `record.declared.validate` | No |
| `REGISTER` | `record.register` | No |
| `SYSADMIN` | Role-based / workqueue | No |
