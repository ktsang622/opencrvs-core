# Certificate Service (Toppan Certificate)

## Overview

The Toppan Certificate Service is a .NET Core-based service that generates PDF certificates with QR codes and digital seals. It replaces the default client-side certificate generation for birth certificates.

## Feature Summary

- **Purpose:** Server-side PDF certificate generation with digital signatures
- **Technology:** .NET Core API + Certificate generation library
- **Features:** QR codes, digital seals, key rotation, multi-page support
- **Port:** 3890 (configurable)

---

## Commits (Key commits)

| Commit | Description |
|--------|-------------|
| `94080c347f` | Add toppan-certificate package for certificate generation and signing |
| `bbd8ffe270` | feat: migrate certificate generation to gateway for cleaner architecture |
| `f673b9506a` | feat: add template preloading and HTTP template loading |
| `5f09e9aeff` | feat: Integrate certificate service with OpenCRVS gateway |
| `741b5698da` | feat: Limit Toppan certificate service to birth certificates only |
| `47e08cd868` | Add multi-page certificate previews and limit width |
| `89a0ec61a9` | Add key rotation support for certificate verification |
| `ff5606897a` | Add keyVersion field to QR codes for key rotation support |

---

## Package Structure

```
packages/toppan-certificate/
├── src/
│   ├── CertificateService.Api/          # .NET Web API
│   │   ├── Controllers/
│   │   │   └── CertificateController.cs
│   │   ├── Program.cs
│   │   ├── Startup.cs
│   │   └── appsettings.json
│   └── CertificateService.Core/         # Core library
│       ├── Services/
│       │   ├── CertificateGenerator.cs
│       │   ├── QRCodeGenerator.cs
│       │   └── DigitalSealService.cs
│       ├── Models/
│       └── Templates/
├── Dockerfile
└── package.json
```

---

## Architecture

```
┌──────────────┐     ┌───────────────┐     ┌─────────────────────┐
│   Client     │────▶│    Gateway    │────▶│  Certificate        │
│  (React)     │     │   (Node.js)   │     │  Service (.NET)     │
└──────────────┘     └───────────────┘     └─────────────────────┘
                            │                        │
                            │                        ▼
                            │              ┌─────────────────────┐
                            │              │  PDF Generation     │
                            │              │  - Template loading │
                            │              │  - Data binding     │
                            │              │  - QR code          │
                            │              │  - Digital seal     │
                            │              └─────────────────────┘
                            │                        │
                            ▼                        ▼
                     ┌─────────────┐         ┌─────────────┐
                     │   MinIO     │◀────────│  PDF File   │
                     │  (Storage)  │         └─────────────┘
                     └─────────────┘
```

---

## API Endpoints

### POST /api/certificate/generate

**Request:**
```json
{
  "recordId": "abc123",
  "eventType": "birth",
  "templateId": "birth-certificate-v1",
  "data": {
    "child": {
      "firstName": "John",
      "familyName": "Doe",
      "dateOfBirth": "2024-01-15"
    },
    "mother": { ... },
    "father": { ... }
  }
}
```

**Response:**
```json
{
  "success": true,
  "pdfUrl": "https://minio.../certificate.pdf",
  "qrCode": "https://verify.../abc123"
}
```

---

## Client Integration

### certificateServicePrint.ts

New file that handles certificate service integration:

```typescript
export async function generateCertificateViaService(
  record: IDeclaration,
  eventType: string
): Promise<{ pdfUrl: string }> {
  const response = await fetch(
    `${window.config.TOPPAN_SERVICE_URL}/api/certificate/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordId: record.id,
        eventType,
        data: transformRecordToDTO(record)
      })
    }
  )
  return response.json()
}
```

### usePrintableCertificate.ts

Modified to use certificate service for birth certificates:

```typescript
// Check if certificate service should be used
if (
  window.config?.FEATURES?.USE_CERTIFICATE_SERVICE &&
  eventType === 'birth'
) {
  return generateCertificateViaService(record, eventType)
}
// Fallback to client-side generation
return generateCertificateLocally(record, eventType)
```

---

## Configuration

### Environment Variables

```env
CERTIFICATE_SERVICE_URL=http://localhost:3890
CERTIFICATE_SIGNING_KEY_PATH=/keys/signing.key
CERTIFICATE_VERIFY_URL=https://verify.example.com
```

### client-config.js

```javascript
FEATURES: {
  USE_CERTIFICATE_SERVICE: false  // Set to true in production
}
```

---

## Certificate Data Transformation

The service transforms FHIR data to certificate DTO format:

### Key Transformations

| FHIR Field | Certificate Field |
|------------|-------------------|
| `patient.name[0].given` | `child.firstName` |
| `patient.name[0].family` | `child.familyName` |
| `patient.birthDate` | `child.dateOfBirth` |
| `relatedPerson[mother].name` | `mother.fullName` |
| Location UUIDs | Location names |
| Country codes | Country names |

### Amendments Handling

```typescript
interface Amendment {
  amendmentNumber: number
  fieldName: string
  oldValue: string
  newValue: string
  reason: string
  date: string
}
```

Amendments are extracted from FHIR Task resources with `makeCorrection` extension.

---

## Files Changed

### New Files (packages/toppan-certificate/)
- Full .NET Core service (~5000 lines)

### packages/client

| File | Changes |
|------|---------|
| `src/views/PrintCertificate/certificateServicePrint.ts` | New - Service integration |
| `src/views/PrintCertificate/usePrintableCertificate.ts` | Modified - Add service option |
| `src/views/RecordAudit/ActionButtons.tsx` | Modified - Add print buttons |

### packages/gateway

| File | Changes |
|------|---------|
| `src/features/toppan/certificate.ts` | New - Proxy to certificate service |
| `src/features/toppan/transformer.ts` | New - FHIR to DTO transformation |

---

## Migration Steps

### 1. Copy toppan-certificate package

```bash
cp -r packages/toppan-certificate <target>/packages/
```

### 2. Add to docker-compose

```yaml
certificate-service:
  build:
    context: ./packages/toppan-certificate
  ports:
    - "3890:3890"
  environment:
    - ASPNETCORE_ENVIRONMENT=Development
```

### 3. Apply client changes

```bash
# Copy new files
cp src/views/PrintCertificate/certificateServicePrint.ts <target>

# Apply patches
git diff 741b5698da~1..741b5698da -- packages/client/
```

### 4. Add feature flag

```javascript
// client-config.js
FEATURES: {
  USE_CERTIFICATE_SERVICE: true
}
```

---

## Digital Seal & QR Code

### QR Code Content

```json
{
  "v": 1,
  "id": "certificate-id",
  "type": "birth",
  "issued": "2024-01-15T10:30:00Z",
  "keyVersion": 1,
  "signature": "base64..."
}
```

### Key Rotation

- Keys are versioned (keyVersion field)
- Old keys retained for verification
- New certificates use latest key
- Verification endpoint checks key version

---

## Testing

1. Start certificate service:
   ```bash
   cd packages/toppan-certificate
   dotnet run
   ```

2. Enable feature flag

3. Register a birth and print certificate

4. Verify PDF is generated with QR code

5. Scan QR code to verify certificate
