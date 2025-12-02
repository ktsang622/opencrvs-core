# OpenCRVS 1.9.0 Migration Overview

## Summary

This document provides a comprehensive analysis of all customizations made to OpenCRVS core for the Toppan/Antigua deployment. These changes need to be migrated from the current `local-main` branch (based on v1.8.2) to the new `upstream/release-v1.9.2` branch.

**Total Custom Commits:** 143 commits by Kevin Tsang

**Source Branch:** `local-main` (based on upstream/master v1.8.2)
**Target Branch:** `toppan-1.9.2` (based on upstream/release-v1.9.2)

---

## Feature Categories

| # | Feature | Priority | Commits | Complexity | Documentation |
|---|---------|----------|---------|------------|---------------|
| 1 | [goID Integration](./01-GOID-INTEGRATION.md) | High | 3 | Low | Complete |
| 2 | [Certificate Service](./02-CERTIFICATE-SERVICE.md) | High | ~20 | High | Complete |
| 3 | [Person Picker / Family Tree](./03-PERSON-PICKER.md) | High | ~15 | Medium | Complete |
| 4 | [Death Registration](./04-DEATH-REGISTRATION.md) | Medium | ~10 | Medium | Complete |
| 5 | [PDF Multi-Page Support](./05-PDF-SUPPORT.md) | Medium | ~8 | Medium | Complete |
| 6 | [OpenSearch Person Search](./06-OPENSEARCH-PERSON-SEARCH.md) | High | ~10 | Medium | Complete |
| 7 | [Toppan Packages](./07-TOPPAN-PACKAGES.md) | High | ~40 | High | Complete |
| 8 | [Infrastructure/DevOps](./08-INFRASTRUCTURE.md) | Low | ~25 | Low | Complete |
| 9 | [Enhanced Document Viewer](./09-ENHANCED-DOCUMENT-VIEWER.md) | Medium | ~5 | Low | Complete |

### Breaking Changes & Migration Analysis

| # | Document | Priority | Description |
|---|----------|----------|-------------|
| 10 | [Breaking Changes Analysis](./10-BREAKING-CHANGES-ANALYSIS.md) | **Critical** | 1.8.2 → 1.9.2 breaking changes, scope changes, code rewrites needed |
| 11 | [Events V2 Integration](./11-EVENTS-V2-INTEGRATION.md) | **Critical** | Events V2 architecture, custom event support, field types guide |
| 12 | [Countryconfig Changes](./12-COUNTRYCONFIG-CHANGES.md) | **Critical** | Countryconfig customizations, mongo_fdw fix, infrastructure changes |

---

## New Packages Added

The following custom packages were added to `packages/`:

| Package | Description | Dependencies |
|---------|-------------|--------------|
| `toppan` | Main Toppan service (webhook handler, DB sync) | PostgreSQL |
| `toppan-certificate` | Certificate generation with QR/digital seal | .NET Core |
| `toppan-common` | Shared types and utilities | - |
| `toppan-db` | PostgreSQL schema and migrations | PostgreSQL |
| `toppan-integrations` | External service integrations | - |
| `toppan-service` | OpenSearch indexing, person search | OpenSearch |
| `toppan-ui` | Custom UI components | React |

---

## Modified Core Packages

### packages/gateway
- Added `/api/goid/verify` endpoint
- Added `/person-search` endpoints
- Added toppan proxy routes
- Modified CSP headers for PDF preview

### packages/client
- Added `GoIDVerifyButton` component
- Added `PersonPicker` component
- Added `PersonInfoCard` component
- Added certificate service print integration
- Added PDF multi-page preview support
- Modified `FormFieldGenerator` for new field types
- Updated `window.config` type definitions

### packages/config
- Added `GOID_VERIFY_BUTTON` field type to Zod schema
- Added `EXT_LOOKUP_BUTTON` field type

### packages/documents
- Added PDF upload/processing support
- Modified MIME type handling

### packages/components
- Fixed Safari date compatibility in `DateField`
- Enhanced `DocumentViewer` with PDF support and security validations

---

## Environment Variables Added

```env
# goID Service
GOID_SERVICE_URL=http://localhost:3999

# Toppan Services
TOPPAN_SERVICE_URL=http://localhost:7070
TOPPAN_DB_URL=postgresql://...

# Certificate Service
CERTIFICATE_SERVICE_URL=http://localhost:3890
```

---

## Migration Strategy

### Recommended Approach: Feature-by-Feature Migration

1. **Start with infrastructure** - Copy scripts, docker-compose files
2. **Add new packages** - Copy toppan-* packages
3. **Migrate gateway changes** - Apply gateway modifications
4. **Migrate client changes** - Apply client modifications
5. **Test each feature** - Verify functionality after each migration

### Alternative: Cherry-pick with Conflict Resolution

```bash
# For each commit
git cherry-pick <commit-hash>
# Resolve conflicts if any
git add .
git cherry-pick --continue
```

---

## Files Changed Summary

| Area | Files Added | Files Modified | Lines Added | Lines Removed |
|------|-------------|----------------|-------------|---------------|
| packages/gateway | 10 | 25 | 2,637 | 10,731 |
| packages/client | 50+ | 100+ | 16,489 | 47,119 |
| packages/toppan-* | 164 | 0 | 34,745 | 0 |
| scripts/ | 25 | 5 | 6,220 | 22 |
| docker-compose | 4 | 2 | 300+ | 10 |

---

## Risk Assessment

| Feature | Risk Level | Notes |
|---------|------------|-------|
| goID Integration | Low | Self-contained, few dependencies |
| Certificate Service | Medium | .NET service, external dependencies |
| Person Picker | Medium | Touches multiple client components |
| Death Registration | Medium | Complex workflow logic |
| PDF Support | Low | Mostly backend changes |
| OpenSearch Person Search | Medium | Separate from OpenCRVS search |
| Enhanced Document Viewer | Low | Feature-flagged, backward compatible |
| Infrastructure | Low | Independent scripts |

---

## Testing Checklist

- [ ] goID verification modal works
- [ ] Person picker search returns results
- [ ] Birth certificate generation works
- [ ] Death registration with person linking works
- [ ] PDF document upload and preview works
- [ ] Enhanced document viewer displays PDFs correctly
- [ ] OpenSearch person search returns results
- [ ] Docker services start correctly
- [ ] All form field types render correctly
- [ ] Feature flags enable/disable features correctly

---

## Critical 1.9.x Changes Summary

### Events V2 Architecture

OpenCRVS 1.9.0 introduces a completely new events system:

- **New helper functions**: `defineConfig()`, `defineDeclarationForm()`, `defineFormPage()`
- **New action flow**: DECLARE → VALIDATE → REGISTER (with REJECT, ARCHIVE options)
- **30+ built-in field types** including `HTTP` for external API calls
- **Toolkit package**: `@opencrvs/toolkit` re-exports from `@opencrvs/commons/events`

### Impact on Custom Features

| Feature | Events V2 Impact | Recommendation |
|---------|-----------------|----------------|
| goID Verify Button | ⚠️ Medium | Use `HTTP` + `BUTTON` field types |
| Person Picker | ⚠️ Medium | Evaluate `SEARCH` field or add custom type |
| Certificate Service | ⚠️ High | Update scopes: `CERTIFY` → `record.registered.print-certified-copies` |

### Scope Changes

**Removed scopes** (1.9.1): `CERTIFY`, `DECLARE`, `VALIDATE`, `SYSADMIN`, `NATLSYSADMIN`, etc.

**New scope pattern**: `record.[state].[action]` (e.g., `record.registered.print-certified-copies`)

See [10-BREAKING-CHANGES-ANALYSIS.md](./10-BREAKING-CHANGES-ANALYSIS.md) and [11-EVENTS-V2-INTEGRATION.md](./11-EVENTS-V2-INTEGRATION.md) for details.

---

## Next Steps

### Recommended Migration Order

1. **Infrastructure First**
   - Update `docker-compose.deploy.yml` with mongo_fdw postgres image
   - Add new 1.9.0 environment variables
   - Verify Metabase configuration preserved

2. **Core Changes**
   - Read [10-BREAKING-CHANGES-ANALYSIS.md](./10-BREAKING-CHANGES-ANALYSIS.md)
   - Update scopes in certificate service: `CERTIFY` → `record.registered.print-certified-copies`
   - Read [11-EVENTS-V2-INTEGRATION.md](./11-EVENTS-V2-INTEGRATION.md)

3. **Countryconfig**
   - Read [12-COUNTRYCONFIG-CHANGES.md](./12-COUNTRYCONFIG-CHANGES.md)
   - Migrate custom field types and factory functions
   - Update form definitions
   - Add feature flags to client-config.js

4. **Core Packages**
   - Migrate toppan-* packages
   - Update gateway routes
   - Update client components

5. **Testing**
   - Verify all custom features work
   - Test person picker, goID verification
   - Test certificate generation
   - Run integration tests

### Quick Start Checklist

- [ ] Review all documentation in this folder
- [ ] Set up test environment with 1.9.2
- [ ] **Update postgres image** to `docker.io/chumaky/postgres_mongo_fdw:17.6_fdw5.5.2`
- [ ] **Update scopes** - Certificate service needs scope change
- [ ] Migrate countryconfig customizations
- [ ] Migrate core package customizations
- [ ] Run integration tests after each migration
