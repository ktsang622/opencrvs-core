# Toppan Customizations Migration Guide

**Migration Reference**: From commit `8bec678c3c` to `06abc484e7` (baseline)
**Author**: Kevin Tsang <mail@ktsang.com>
**Date Range**: August 12, 2025 - September 17, 2025

---

## 🎯 Overview of Toppan Customizations

This guide documents all custom modifications made by Kevin Tsang to integrate Toppan family tree services, PDF multi-page support, and enhanced person search capabilities into OpenCRVS. Each change is categorized for future migration planning.

---

## 📋 Summary of Key Features Added

### 1. **Toppan Services Architecture**
- **toppan**: Core database integration service
- **toppan-service**: REST API for family tree and person search
- **toppan-ui**: React frontend for family tree visualization
- **toppan-common**: Shared types and utilities
- **toppan-db**: Database query abstractions

### 2. **PDF Multi-Page Support**
- Browser-native PDF viewing (replaces pdf2pic conversion)
- Feature flag controlled PDF uploads
- Security enhancements and XSS prevention
- Universal PDF support across all document viewers

### 3. **Enhanced Person Search**
- OpenSearch integration with person indexing
- Family relationship mapping
- Advanced search capabilities with DOB handling

### 4. **Docker Orchestration**
- Complete containerization strategy
- Health check integrations
- Multi-repository build system
- Development environment optimizations

---

## 🔄 Migration Categories

Each change is marked with migration priority:
- 🔴 **CRITICAL**: Core functionality, must migrate
- 🟡 **IMPORTANT**: Enhanced features, should migrate
- 🟢 **OPTIONAL**: Development tools, nice to have

---

## 📁 Detailed Change Analysis

### **Commit: ecd5524193** - Toppan Services Foundation 🔴 CRITICAL
**Date**: Aug 12, 2025
**Migration Impact**: Core Toppan architecture setup

#### New Packages Created:
```
packages/toppan-common/         # Shared TypeScript types
packages/toppan-db/            # Database abstraction layer
packages/toppan-service/       # REST API service
packages/toppan-ui/           # React family tree frontend
```

#### Migration Notes:
- **toppan-common**: Contains `FamilyTree.ts` types - must migrate for type consistency
- **toppan-db**: Database queries for family relationships - critical for person search
- **toppan-service**: Main API endpoints - integrate with v1.9.0 routing patterns
- **toppan-ui**: Standalone React app - may need toolkit component migration

#### Files Modified:
- `packages/gateway/src/features/person-search/` - Enhanced with Toppan integration
- `packages/client/src/views/PersonDetails/` - Added family tree integration

---

### **Commit: 517eabbe06** - License Configuration 🟢 OPTIONAL
**Date**: Aug 12, 2025
**Migration Impact**: Legal compliance

#### Changes:
- Added LICENSE files to all Toppan packages
- Updated `license-config.json` for Toppan header
- Created `toppan-license-header.txt`

#### Migration Notes:
- Ensure proper licensing in v1.9.0
- Update license headers if package structure changes

---

### **Commit: b614aa89c1** - OpenSearch Integration 🔴 CRITICAL
**Date**: Aug 13, 2025
**Migration Impact**: Search functionality completely rewritten

#### Key Changes:
```typescript
// NEW: OpenSearch indexing moved to toppan-service
packages/toppan-db/src/opensrouce/indexing.ts       # Person indexing logic
packages/toppan-service/src/features/opensearch/    # Search API endpoints
```

#### Migration Notes:
- **CRITICAL**: Person search now depends on Toppan service
- OpenSearch aliases: `person_write` / `person_read` - must maintain compatibility
- Birth record correction sync - integrate with v1.9.0 workflow service
- PersonPicker DOB fix - affects person linking in registrations

#### Database Changes:
- `packages/toppan/src/database-functions.sql` - Custom PostgreSQL functions
- `packages/toppan/src/init-database.sql` - Schema setup

---

### **Commit: 4ca6dfc04c** - PDF Processing Backend 🟡 IMPORTANT
**Date**: Sep 11, 2025
**Migration Impact**: Document handling enhancement

#### New Dependencies:
```json
{
  "pdf-lib": "^1.17.1",
  "pdf2pic": "^2.1.4"
}
```

#### Files Added:
- `packages/documents/src/features/pdfProcessor.ts` - PDF to image conversion

#### Migration Notes:
- Feature flag controlled: `ENHANCED_DOCUMENT_VIEWER`
- Later replaced with browser-native PDF viewing (commit 257fa2df39)
- Consider v1.9.0's document handling strategy before migrating

---

### **Commit: 9847f4647c** - PDF MIME Type Support 🟡 IMPORTANT
**Date**: Sep 11, 2025
**Migration Impact**: File validation changes

#### Changes:
```typescript
// packages/commons/src/events/FieldConfig.ts
export enum DocumentMimeType {
  PDF = 'application/pdf'
}

export type MimeType = ImageMimeType | DocumentMimeType
```

#### Migration Notes:
- Extends file upload validation to accept PDFs
- Check if v1.9.0 has similar enhancements
- Maintain backward compatibility with image-only workflows

---

### **Commit: f03e209342** - PDF Feature Flag Integration 🟡 IMPORTANT
**Date**: Sep 11, 2025
**Migration Impact**: Frontend PDF upload capability

#### Files Modified:
```typescript
// Frontend PDF support
packages/client/src/components/form/DocumentUploaderWithOption.tsx
packages/client/src/components/form/FormFieldGenerator.tsx
packages/client/src/forms/inputs/FileInput/useOnFileChange.ts

// Backend validation
packages/gateway/src/utils/applicationConfig.ts    # NEW: Config reader
packages/gateway/src/utils/validators.ts           # Enhanced PDF validation
```

#### Migration Notes:
- **NEW**: `applicationConfig.ts` utility reads country config
- Dynamic PDF validation based on feature flags
- Check v1.9.0's config service integration patterns

---

### **Commit: 257fa2df39** - Complete PDF Implementation 🟡 IMPORTANT
**Date**: Sep 12, 2025
**Migration Impact**: Full PDF viewing capability

#### Major Refactor:
- **REMOVED**: pdf2pic dependency (complex conversion)
- **ADDED**: Browser-native PDF rendering
- **ENHANCED**: Security validations and error handling

#### Files Transformed:
```typescript
// Universal PDF viewers
packages/client/src/components/form/DocumentUploadField/DocumentPreview.tsx
packages/client/src/forms/inputs/FileInput/DocumentPreview.tsx
packages/components/src/DocumentViewer/DocumentViewer.tsx

// Simplified backend
packages/documents/src/features/uploadDocument/handler.ts
```

#### Migration Notes:
- **SECURITY**: URL validation prevents XSS attacks
- **PERFORMANCE**: Reduced bundle size, faster rendering
- **UX**: Graceful fallbacks, responsive design
- Check v1.9.0's document viewer architecture

---

### **Commit: ff4b55e690** - Docker Orchestration 🟢 OPTIONAL
**Date**: Sep 14, 2025
**Migration Impact**: Development and deployment tools

#### New Scripts:
```bash
scripts/build-docker-images.sh        # Parallel builds with status tracking
scripts/start-complete-stack.sh       # Multi-repo orchestration
scripts/start-docker.sh              # Updated with Toppan services
```

#### New Dockerfiles:
```dockerfile
packages/toppan/Dockerfile
packages/toppan-service/Dockerfile
packages/toppan-ui/Dockerfile
```

#### Migration Notes:
- Development convenience scripts
- May conflict with v1.9.0's build system
- Adapt to v1.9.0's Docker strategy rather than direct migration

---

### **Commit: 74baab9a2d** - CORS and Environment Fixes 🔴 CRITICAL
**Date**: Sep 17, 2025
**Migration Impact**: Service communication

#### Key Files:
```yaml
# Docker Compose configurations
toppan-base.yml          # Base services with Toppan integration
toppan-build.yml         # Build configurations
toppan-override.yml      # Runtime overrides
toppan-deps.yml          # Dependencies
toppan-seeder.yml        # Data seeding
```

#### Environment Variables Added:
```bash
COUNTRY_CONFIG_URL_INTERNAL=http://countryconfig:3040
GATEWAY_URL_INTERNAL=http://gateway:7070
```

#### Migration Notes:
- **CRITICAL**: Fixes 502 errors in nginx proxy configuration
- Internal URL routing for microservices
- Check v1.9.0's service discovery patterns

---

### **Commit: 64a26dd778** - Documentation Updates 🟢 OPTIONAL
**Date**: Sep 17, 2025
**Migration Impact**: Developer guidance

#### Updated:
- `docker/README.md` - Complete architecture documentation

#### Migration Notes:
- Comprehensive deployment guide
- Update for v1.9.0's actual architecture
- Good reference for understanding Toppan integration points

---

### **Commit: 06abc484e7** - Final Integration 🔴 CRITICAL
**Date**: Sep 17, 2025
**Migration Impact**: Production-ready state

#### Configuration Updates:
```typescript
// Enhanced environment configurations
packages/toppan-service/prod.env
packages/toppan/prod.env

// Database connection improvements
packages/toppan/src/database.ts
```

#### Migration Notes:
- Production environment configurations
- Enhanced error handling and connection pooling
- Health check integrations for Docker Compose

---

## 🚀 Migration Priority Matrix

### **Phase 1: Core Dependencies (Must Migrate First)**
1. **toppan-common** types and interfaces
2. **Person search integration** (OpenSearch changes)
3. **Gateway routing** modifications
4. **Database schema** (toppan tables and functions)

### **Phase 2: Feature Enhancements**
1. **PDF support** (if desired in v1.9.0)
2. **Family tree services** (toppan-service, toppan-db)
3. **Enhanced document viewers**

### **Phase 3: Development Tools**
1. **Docker configurations** (adapt to v1.9.0 patterns)
2. **Build scripts** (update for v1.9.0 structure)
3. **Documentation updates**

---

## ⚠️ Critical Migration Considerations

### **1. OpenSearch Dependencies**
- Person search functionality completely rewritten
- Requires OpenSearch cluster with specific aliases
- May conflict with v1.9.0's search implementation

### **2. Database Schema Changes**
- Custom PostgreSQL functions in `database-functions.sql`
- New tables for family relationships
- Migration scripts in `run-migrations.ts`

### **3. Service Architecture**
- New microservices (toppan-service, toppan-ui)
- Inter-service communication patterns
- Health check dependencies

### **4. Configuration Management**
- Feature flags for PDF support
- Environment variable requirements
- Country config integration

---

## 🔧 Recommended Migration Strategy

### **Option A: Full Integration**
1. Migrate all Toppan services to v1.9.0
2. Adapt to v1.9.0's architecture patterns
3. Update dependencies and configurations
4. Test thoroughly with v1.9.0's test suite

### **Option B: Selective Migration**
1. Extract only core person search enhancements
2. Migrate PDF support if needed
3. Leave family tree as optional extension
4. Minimize impact on v1.9.0 core

### **Option C: Parallel Development**
1. Maintain Toppan customizations separately
2. Create integration points with v1.9.0
3. Deploy as microservices alongside OpenCRVS
4. Gradual integration over time

---

## 📞 Migration Support

For questions about specific implementations:
- **Author**: Kevin Tsang <mail@ktsang.com>
- **Documentation**: This guide + commit messages
- **Code Comments**: Inline comments in modified files

---

*Generated for OpenCRVS v1.9.0 migration planning*
*Last updated: September 18, 2025*