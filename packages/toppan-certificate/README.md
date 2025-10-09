# Toppan Certificate Service

A .NET-based microservice for generating, signing, and verifying civil registration certificates with ECDSA digital signatures and QR codes.

## Features

- **Certificate Generation**: Generate certificates from Handlebars templates with dynamic data
- **PDF Signing**: Sign PDFs with ECDSA P-256 digital signatures for tamper detection
- **PDF Verification**: Verify PDF signatures cryptographically
- **QR Code Embedding**: Embed signed QR codes in certificates for offline verification
- **Multiple Output Formats**: PDF, PDF/A (archival), JPG, PNG
- **Certificate Types**: Birth, Death, Marriage certificates
- **Public Verifier App**: Standalone web application for certificate verification

## Architecture

```
toppan-certificate/
├── src/
│   ├── CertificateService.Api/       # REST API endpoints
│   ├── CertificateService.Core/      # Business logic & services
│   └── CertificateService.Tests/     # Unit tests
├── templates/                        # ElmLayout certificate templates
│   ├── antigua-birth-v1/
│   ├── antigua-death-v1/
│   └── antigua-marriage-v1/
├── keys/                             # ECDSA signing keys
│   ├── certificate-private-key.pem   # For signing
│   └── certificate-public-key.pem    # For verification
├── verifier-app/                     # Public verification web app
│   ├── index.html
│   ├── app.js
│   └── images/
├── integration-handlers/             # OpenCRVS countryconfig handlers (reference)
│   ├── toppan-print-handler-v2.ts   # GraphQL-based handler (recommended)
│   ├── toppan-print-handler.ts      # FHIR-based handler (legacy)
│   └── README.md
└── Dockerfile
```

## API Endpoints

### Generate Certificate
```
POST /api/certificates/generate
Content-Type: application/json

{
  "certificateType": "Birth",
  "data": {
    "childName": "John Doe",
    "dateOfBirth": "2024-01-15",
    ...
  },
  "outputFormat": "PDFA"
}
```

### Verify PDF Signature
```
POST /api/certificates/verify-pdf
Content-Type: multipart/form-data

file: [PDF file]
```

## Configuration

Key settings in `appsettings.json`:

```json
{
  "CertificateService": {
    "TemplatesBasePath": "/app/templates",
    "OutputFormats": {
      "Enabled": ["PDFA", "JPG"]
    },
    "PdfSigningKeyPath": "/app/keys/certificate-private-key.pem",
    "PdfVerificationKeyPath": "/app/keys/certificate-public-key.pem"
  }
}
```

## Building

### Local Development
```bash
dotnet build
dotnet run --project src/CertificateService.Api
```

### Docker
```bash
docker build -t toppan-crvs/certificate-service:latest .
docker run -p 5000:5000 toppan-crvs/certificate-service:latest
```

## Verifier App

The service includes a public-facing web application for certificate verification:

**Access**: `http://localhost:5000/index.html`

**Features**:
- **QR Code Scanning**: Scan QR codes from certificates using device camera (offline verification)
- **PDF Verification**: Upload PDF certificates to verify digital signatures
- **Offline Capability**: QR verification works completely offline using Web Crypto API

## Security

### Digital Signatures
- **Algorithm**: ECDSA with P-256 curve (secp256r1)
- **Hash**: SHA-256
- **Key Format**: PEM-encoded EC keys

### Key Generation
```bash
# Generate ECDSA P-256 key pair
openssl ecparam -name prime256v1 -genkey -noout -out certificate-private-key.pem
openssl ec -in certificate-private-key.pem -pubout -out certificate-public-key.pem
```

## Integration with OpenCRVS

This service integrates with OpenCRVS Core as a microservice:

1. **Countryconfig Handler**: See [integration-handlers/README.md](integration-handlers/README.md)
   - Use `toppan-print-handler-v2.ts` (GraphQL-based, recommended)
   - Copy to your countryconfig's `src/api/certificates/` directory
   - Register in API routes

2. **Client Feature Flag**: Enable in client config
   ```typescript
   export const config = {
     FEATURES: {
       USE_CERTIFICATE_SERVICE: true
     },
     CERTIFICATE_SERVICE_URL: 'http://certificate-service:5000'
   }
   ```

3. **Environment Variables**:
   - `CERTIFICATE_SERVICE_URL`: Certificate service endpoint
   - `GATEWAY_URL`: OpenCRVS Gateway URL
   - `CLIENT_APP_URL`: Client URL for QR code links

4. **Data Flow**:
   - Client → Countryconfig Handler → Certificate Service
   - Handler fetches data via GraphQL
   - Resolves location UUIDs to names
   - Transforms to CertificateRequest DTO
   - Certificate Service generates signed PDF

## Dependencies

- **.NET 8.0**: Runtime and SDK
- **SkiaSharp**: PDF rendering and image generation
- **Handlebars.Net**: Template processing
- **BouncyCastle**: Cryptographic operations (ECDSA signing/verification)
- **QRCoder**: QR code generation
- **Swashbuckle**: API documentation (Swagger)

## Environment Variables

```bash
ASPNETCORE_URLS=http://+:5000
CertificateService__PdfSigningKeyPath=/app/keys/certificate-private-key.pem
CertificateService__PdfVerificationKeyPath=/app/keys/certificate-public-key.pem
```

## License

Copyright © Toppan
