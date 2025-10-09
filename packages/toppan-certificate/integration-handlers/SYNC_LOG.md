# Integration Handlers Sync Log

## Last Sync: 2025-10-09

### Files Synced from opencrvs-countryconfig

All handlers synced from: `/home/ktsang/opencrvs-countryconfig/src/api/certificates/`

#### toppan-print-handler-v2.ts
- **Status**: ✅ Synced
- **Version**: GraphQL-based (V2)
- **Key Changes**:
  - Added `regStatus` field to GraphQL query (line 389)
  - Fixed registrar extraction to use `regStatus === 'REGISTERED'` instead of `action === 'REGISTERED'`
  - Includes location UUID resolution
  - Includes amendment extraction from history
  - Transforms GraphQL response to CertificateRequest DTO

#### toppan-print-handler.ts
- **Status**: ✅ Synced
- **Version**: FHIR-based (Legacy)
- **Note**: Original FHIR-based implementation, kept for reference

#### toppan-handler.ts
- **Status**: ✅ Synced
- **Note**: Basic handler implementation

## Key Features in V2 Handler

### 1. GraphQL Query (lines 236-464)
- Fetches transformed registration data (not raw FHIR)
- Includes complete child, mother, father, informant details
- Fetches history with amendments
- Requests `regStatus` field for proper registrar extraction

### 2. Location Resolution (lines 111-190)
- Resolves location UUIDs to human-readable names
- Caches location lookups for performance
- Handles mother, father, informant, and event location addresses
- Converts country codes to country names

### 3. Registrar Extraction (lines 714-752)
- Priority 1: Check registration.assignment
- Priority 2: Find history entry with `regStatus === 'REGISTERED'`
- Priority 3: Check certificates for certifier name
- Fallback: "Unknown Registrar"

### 4. Amendment Processing (lines 589-622)
- Extracts amendments from history with `action === 'CORRECTED'`
- Compares input vs output to find changes
- Maps correction reasons to amendment types
- Includes amendment dates and descriptions

## Integration Instructions

1. Copy `toppan-print-handler-v2.ts` to your countryconfig:
   ```bash
   cp integration-handlers/toppan-print-handler-v2.ts \
      /path/to/opencrvs-countryconfig/src/api/certificates/
   ```

2. Register in your countryconfig API routes

3. Configure environment variables:
   - `GATEWAY_URL`
   - `CERTIFICATE_SERVICE_URL`
   - `CLIENT_APP_URL`

4. Enable client feature flag:
   ```typescript
   FEATURES: { USE_CERTIFICATE_SERVICE: true }
   ```

## Next Sync

When syncing in the future:
1. Copy updated handler from countryconfig to this directory
2. Update this SYNC_LOG.md with changes
3. Update README.md if integration instructions change
4. Test with actual OpenCRVS registration data
