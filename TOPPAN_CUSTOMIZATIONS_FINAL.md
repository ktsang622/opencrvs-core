# Toppan Customizations - Final Migration Package

**Baseline Commit**: `06abc484e76b95c0bbdbdcc8b469fae93b964e21`
**Author**: Kevin Tsang <mail@ktsang.com>
**Date Range**: August 12, 2025 - September 17, 2025
**Total Commits**: 25 commits

---

## 🎯 Executive Summary

This document provides a complete, finalized package of all Toppan customizations for future migration to new OpenCRVS releases. All changes have been categorized by impact and migration complexity.

### Core Features Added:
1. **Toppan Services Ecosystem** (5 new packages)
2. **PDF Multi-Page Document Support**
3. **Enhanced Person Search with Family Tree**
4. **OpenSearch Integration**
5. **Docker Orchestration System**

---

## 📦 New Packages Created

### 1. **packages/toppan-common/**
**Purpose**: Shared TypeScript types and utilities
```typescript
// Key exports:
export interface FamilyTree { /* family relationship types */ }
```
**Migration Priority**: 🔴 CRITICAL - Required by all other Toppan services

### 2. **packages/toppan-db/**
**Purpose**: Database abstraction layer for PostgreSQL queries
```typescript
// Key functions:
- getFamilyLevels()
- getFamilyRelationships()
- getPersonById()
- OpenSearch indexing utilities
```
**Migration Priority**: 🔴 CRITICAL - Core database integration

### 3. **packages/toppan-service/**
**Purpose**: REST API service for family tree and person search
```typescript
// Key endpoints:
POST /family-tree       // Family tree data
POST /person-search     // Enhanced person search
POST /person-events     // Person event handling
GET  /opensearch        // Search indexing
```
**Migration Priority**: 🔴 CRITICAL - Main API integration point

### 4. **packages/toppan-ui/**
**Purpose**: React frontend for family tree visualization
```typescript
// React + Vite standalone app
- FamilyTreeComponent
- PersonDetailsPanel
- Family tree visualization
```
**Migration Priority**: 🟡 IMPORTANT - UI enhancement

### 5. **packages/toppan/**
**Purpose**: Core database integration and migration service
```sql
-- Key database assets:
- database-functions.sql (custom PostgreSQL functions)
- init-database.sql (schema setup)
- person-db-sync/ (birth/death record sync)
```
**Migration Priority**: 🔴 CRITICAL - Database layer

---

## 🔧 Core OpenCRVS Modifications

### **A. Person Search Enhancement**
**Files Modified**:
```
packages/gateway/src/features/person-search/
├── handler.ts          # Enhanced with Toppan integration
└── index.ts           # OpenSearch alias routing

packages/client/src/components/form/PersonPicker.tsx
# Fixed DOB field population when linking persons
```

**Key Changes**:
- OpenSearch aliases: `person_write` / `person_read`
- Family relationship mapping
- Birth record correction sync
- Enhanced search capabilities

### **B. PDF Multi-Page Support**
**Files Modified**:
```
packages/commons/src/events/FieldConfig.ts
# Added DocumentMimeType.PDF support

packages/client/src/components/form/DocumentUploadField/
├── DocumentPreview.tsx
├── DocumentUploaderWithOption.tsx
└── SimpleDocumentUploader.tsx

packages/client/src/v2-events/components/forms/inputs/FileInput/
├── DocumentPreview.tsx
├── useOnFileChange.ts
└── SimpleDocumentUploader.tsx

packages/components/src/
├── DocumentViewer/DocumentViewer.tsx
└── ImageUploader/ImageUploader.tsx

packages/documents/src/features/uploadDocument/handler.ts
packages/gateway/src/utils/
├── applicationConfig.ts  # NEW: Country config reader
└── validators.ts         # Enhanced PDF validation
```

**Key Features**:
- Feature flag controlled: `ENHANCED_DOCUMENT_VIEWER`
- Browser-native PDF rendering (no conversion)
- Security validations (XSS prevention)
- Universal PDF support across all viewers
- Graceful fallbacks and error handling

### **C. Workflow Integration**
**Files Modified**:
```
packages/workflow/src/integrations/toppan/
├── client.ts           # Toppan service integration
└── mappers.ts          # Data mapping utilities
```

**Key Changes**:
- Birth/death record sync with Toppan service
- Family relationship data mapping
- Integration with OpenCRVS workflow events

---

## 🗄️ Database Schema Changes

### **New Database Assets**:
```sql
-- packages/toppan/src/database-functions.sql
-- Custom PostgreSQL functions for family tree operations

-- packages/toppan/src/init-database.sql
-- Schema setup for Toppan tables and relationships

-- packages/toppan/src/simple-migrations.ts
-- Migration management system
```

### **OpenSearch Integration**:
```typescript
// packages/toppan-db/src/opensrouce/indexing.ts
- Person indexing with family relationships
- Search aliases: person_write/person_read
- Birth/death record indexing
```

---

## 🐳 Docker & DevOps Assets

### **New Docker Configurations**:
```yaml
# Base configurations
toppan-base.yml         # Core services with Toppan
toppan-build.yml        # Build configurations
toppan-override.yml     # Runtime overrides
toppan-deps.yml         # Dependencies
toppan-seeder.yml       # Data seeding

# Individual Dockerfiles
packages/toppan/Dockerfile
packages/toppan-service/Dockerfile
packages/toppan-ui/Dockerfile
Dockerfile.base         # Optimized base image
```

### **New Scripts**:
```bash
scripts/build-docker-images.sh      # Parallel builds with status
scripts/build-docker-compose.sh     # Dynamic compose generation
scripts/start-complete-stack.sh     # Multi-repo orchestration
scripts/stop-complete-stack.sh      # Cleanup script
scripts/view-logs-tmux.sh           # Advanced log viewer
scripts/run-toppan-seeder.sh        # Data seeding
scripts/clear-db.sh                 # Database cleanup
```

### **Key Environment Variables**:
```bash
# Internal service communication
COUNTRY_CONFIG_URL_INTERNAL=http://countryconfig:3040
GATEWAY_URL_INTERNAL=http://gateway:7070

# Feature flags
ENHANCED_DOCUMENT_VIEWER=true

# Database connections
POSTGRES_USER=opencrvs
POSTGRES_PASSWORD=opencrvs
POSTGRES_DB=opencrvs

# OpenSearch configuration
OPENSEARCH_URL=https://opensearch:9200
```

---

## 🔀 Version Compatibility Fixes

### **tRPC v11 Compatibility** (events service):
```typescript
// packages/events/src/router/event/actions/index.ts
// Applied Record<string, any> type workaround

// packages/events/src/router/middleware/
// Added explicit return type annotations
```

### **Package Dependencies**:
```json
// Updated tRPC to v11.0.0-rc.804 across:
- packages/gateway/package.json
- packages/toolkit/package.json
- packages/events/package.json
```

---

## 🚨 Critical Migration Dependencies

### **1. Database Requirements**:
- PostgreSQL with custom functions
- OpenSearch cluster with specific aliases
- Database migration scripts execution

### **2. Service Dependencies**:
- Toppan services must start after core OpenCRVS services
- Health check integrations required
- Internal URL routing for microservices

### **3. Configuration Requirements**:
- Feature flag management system
- Environment variable propagation
- Country config integration

---

## 📋 Migration Checklist

### **Phase 1: Core Infrastructure**
- [ ] Create toppan-common package with types
- [ ] Set up database schema (init-database.sql)
- [ ] Execute custom functions (database-functions.sql)
- [ ] Configure OpenSearch aliases
- [ ] Set up toppan-db package

### **Phase 2: Service Integration**
- [ ] Deploy toppan-service with API endpoints
- [ ] Integrate workflow service with Toppan client
- [ ] Update gateway person-search handlers
- [ ] Configure service health checks

### **Phase 3: Frontend Features**
- [ ] Enable PDF support in document viewers
- [ ] Update PersonPicker component
- [ ] Deploy toppan-ui (if family tree needed)
- [ ] Configure feature flags

### **Phase 4: Production Readiness**
- [ ] Set up Docker orchestration
- [ ] Configure environment variables
- [ ] Test service startup sequence
- [ ] Validate data synchronization

---

## 🔍 Questions for Future Migration

Before applying to new OpenCRVS release, consider:

1. **Architecture Compatibility**: Does the new release change service architecture patterns?
2. **Database Schema**: Are there conflicts with new OpenCRVS database changes?
3. **Search Implementation**: Does the new release modify person search functionality?
4. **Document Handling**: Are there new document processing features that conflict?
5. **Docker Strategy**: Does the new release have different containerization approaches?

---

## 📞 Support Information

**Implementation Contact**: Kevin Tsang <mail@ktsang.com>
**Documentation**: This file + individual commit messages
**Code Location**: Branch `baseline-toppan-customizations`
**Baseline Commit**: `06abc484e76b95c0bbdbdcc8b469fae93b964e21`

---

*This document represents the complete, finalized state of Toppan customizations ready for migration to future OpenCRVS releases.*