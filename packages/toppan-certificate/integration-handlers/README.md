# Integration Handlers

This directory contains reference copies of the OpenCRVS countryconfig handlers that integrate with the Toppan Certificate Service.

## Architecture: Why Countryconfig Instead of Gateway?

**Current placement**: Handler is in **countryconfig** service

**Why?**
1. **Country-specific business logic**: Different countries have different:
   - Address formats and hierarchies
   - Location name structures (parish/district/state)
   - Certificate requirements and fields
   - Amendment rules and descriptions

2. **OpenCRVS design pattern**: Countryconfig is an **API service** (not just config files) that handles:
   - Certificate generation webhooks
   - Notification handlers
   - Custom validation logic
   - Country-specific transformations

3. **Separation of concerns**:
   - **Gateway**: GraphQL API, authentication, service proxying
   - **Countryconfig**: Country-specific business logic and transformations
   - **Core services**: Event-agnostic microservices (workflow, search, etc.)

4. **Customizability**: Each country can customize transformation logic without forking OpenCRVS core

**Alternative**: You could move to `gateway/src/features/certificate/` but you'd lose per-country customization ability.

## Files

### toppan-print-handler-v2.ts

**Location in Production**: `opencrvs-countryconfig/src/api/certificates/toppan-print-handler-v2.ts`

**Purpose**: GraphQL-based handler that receives certificate generation requests from OpenCRVS, transforms the data, and calls the Certificate Service API.

**Flow**:
1. Receives request with `compositionId` and `eventType`
2. Fetches registration data via GraphQL query
3. Resolves location UUIDs to location names
4. Transforms GraphQL response to CertificateRequest DTO
5. Calls Certificate Service `/api/certificates/generate` endpoint
6. Returns generated PDF to client

**Key Features**:
- Location name resolution via Gateway API
- Registrar extraction from GraphQL history
- Amendment extraction from correction history
- Country code to name conversion
- Address line formatting

## Integration Setup

To integrate this handler in your countryconfig:

1. Copy `toppan-print-handler-v2.ts` to your countryconfig's `src/api/certificates/` directory
2. Register the handler in your API routes
3. Ensure `CERTIFICATE_SERVICE_URL` environment variable points to your certificate service instance
4. Enable the `USE_CERTIFICATE_SERVICE` feature flag in client config

## Environment Variables Required

- `GATEWAY_URL` - OpenCRVS Gateway URL (e.g., `http://localhost:7070`)
- `CERTIFICATE_SERVICE_URL` - Certificate Service URL (e.g., `http://localhost:5001`)
- `CLIENT_APP_URL` - Client application URL for QR code record links (e.g., `http://localhost:3000`)

## API Endpoint

```
POST /certificates/toppan/print
Content-Type: application/json

{
  "compositionId": "abc-123-def",
  "eventType": "birth" | "death" | "marriage"
}
```

**Response**: PDF binary (Content-Type: application/pdf)
