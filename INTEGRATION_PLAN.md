# Certificate Service Integration - Current Status

## What You Want

**Client → Gateway → Certificate Service** (direct)

- Gateway fetches FHIR bundle from `/records/{id}/view`
- Gateway transforms FHIR to certificate DTO
- Gateway calls certificate-service API
- Returns PDF to client

## Current Status

✅ Certificate-service: Working (tested directly)
✅ Countryconfig handler: Has working FHIR → DTO transformation
❌ Gateway handler: Tried GraphQL (doesn't exist in v1.8)

## Next Steps

1. Copy FHIR transformation logic from countryconfig `toppan-print-handler.ts` to gateway `service.ts`
2. Gateway fetches FHIR via `/records/{id}/view` (standard OpenCRVS endpoint)
3. Gateway transforms FHIR bundle → certificate DTO
4. Gateway calls certificate-service
5. Returns PDF

## Why This Approach

- No GraphQL needed (doesn't exist in OpenCRVS v1.8)
- `/records/{id}/view` is standard OpenCRVS API
- Transformation logic already works in countryconfig
- Clean separation: Gateway handles orchestration, certificate-service handles PDF generation

## Implementation

Need to update:
- `packages/gateway/src/features/certificate/handler.ts` - Fetch FHIR via `/records/{id}/view`
- `packages/gateway/src/features/certificate/service.ts` - Add FHIR → DTO transformation

The transformation code is in:
- `/home/ktsang/opencrvs-countryconfig-atg/src/api/certificates/toppan-print-handler.ts` (lines 175-260)
