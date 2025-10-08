# Simple Certificate Service Integration (No MinIO)

## Goal

Replace OpenCRVS's client-side PDF generation with certificate-service, **following the existing behavior**:
- ✅ Generate PDF server-side (instead of browser)
- ✅ Return PDF directly to client for print/download
- ✅ Add digital signature + QR code
- ❌ NO MinIO upload (keep existing behavior)
- ✅ Feature flag for easy enable/disable

## Current Flow (Client-Side)

```
User clicks "Certify"
  ↓
Client (Browser):
  - Fetch SVG template
  - Compile with Handlebars
  - Generate PDF using pdfMake
  - Open print dialog / download
  ↓
Backend:
  - Store metadata only
  - Mark as CERTIFIED
```

## New Flow (Server-Side with Certificate-Service)

```
User clicks "Certify"
  ↓
Client:
  - Send certificate data to country-config
  ↓
Country-Config (if flag enabled):
  - Call certificate-service with template data
  - Receive signed PDF bytes
  - Return PDF to client
  ↓
Client:
  - Open print dialog / download (same as before)
  ↓
Backend:
  - Store metadata only (same as before)
  - Mark as CERTIFIED
```

**Key Change:** PDF generation moves from client to server, but final behavior is identical.

## Implementation

### 1. Country-Config Handler

```typescript
// /home/ktsang/opencrvs-countryconfig-atg/src/api/print-certificate/handler.ts
import { Request, ResponseToolkit } from '@hapi/hapi'
import fetch from 'node-fetch'

const USE_TOPPAN_CERTIFICATE_SERVICE = process.env.USE_TOPPAN_CERTIFICATE_SERVICE === 'true'
const TOPPAN_CERTIFICATE_SERVICE_URL = process.env.TOPPAN_CERTIFICATE_SERVICE_URL || 'http://localhost:3889'

export async function printCertificateHandler(
  request: Request,
  h: ResponseToolkit
) {
  if (!USE_TOPPAN_CERTIFICATE_SERVICE) {
    // Disabled: Use client-side generation (existing behavior)
    return h.response().code(200)
  }

  try {
    const { event, action } = request.payload as any

    // Call certificate-service to generate signed PDF
    const certificateRequest = {
      certificateType: event.type,
      templateId: action.certificate.certificateTemplateId,
      certificateNumber: `${event.type.toUpperCase()}-${event.id.substring(0, 8)}`,
      data: {
        // Map event data to template variables
        child: event.child,
        mother: event.mother,
        father: event.father,
        informant: event.informant,
        registration: event.registration,
        // ... other data needed for template
      },
      recordUrl: `${process.env.CLIENT_APP_URL}/record-details/${event.id}`,
      keyVersion: 'v1'
    }

    const response = await fetch(
      `${TOPPAN_CERTIFICATE_SERVICE_URL}/api/certificates/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': request.headers.authorization || ''
        },
        body: JSON.stringify(certificateRequest)
      }
    )

    if (!response.ok) {
      console.error('Certificate service failed:', await response.text())
      // Fallback: Return 200 to allow client-side generation
      return h.response().code(200)
    }

    const result = await response.json()

    // Return 200 with PDF base64 for client to print/download
    return h.response({
      pdfBase64: result.pdfBase64,  // Signed PDF as base64
      qrCodeData: result.qrCodeData,
      signature: result.signature
    }).code(200)

  } catch (error) {
    console.error('Certificate service error:', error)
    // Fallback: Return 200 to allow client-side generation
    return h.response().code(200)
  }
}
```

### 2. Certificate-Service API Update

Update certificate-service to return PDF as base64 instead of uploading to MinIO:

```csharp
// packages/toppan-certificate/src/CertificateService.Api/Controllers/CertificatesController.cs

[HttpPost("generate")]
public async Task<ActionResult<CertificateGenerationResponse>> GenerateCertificate(
    [FromBody] CertificateGenerationRequest request)
{
    try
    {
        // Generate PDF with signature and QR code
        var pdfBytes = await _pdfGenerator.GenerateCertificatePdf(request);

        // Return PDF as base64 (NO MINIO UPLOAD)
        var pdfBase64 = Convert.ToBase64String(pdfBytes);

        return Ok(new CertificateGenerationResponse
        {
            PdfBase64 = pdfBase64,  // Client will print/download this
            QrCodeData = request.QrCodeData,
            Signature = request.Signature,
            CertificateNumber = request.CertificateNumber
        });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error generating certificate");
        return StatusCode(500, "Failed to generate certificate");
    }
}
```

### 3. Client Update (Optional Enhancement)

Optionally update client to handle server-generated PDF:

```typescript
// packages/client/src/views/PrintCertificate/usePrintableCertificate.ts

const handleCertify = async () => {
  if (!declaration || !certificateTemplateConfig) {
    return
  }

  const draft = cloneDeep(declaration)
  draft.submissionStatus = SUBMISSION_STATUS.READY_TO_CERTIFY
  draft.action = isPrintInAdvance
    ? SubmissionAction.CERTIFY_DECLARATION
    : SubmissionAction.CERTIFY_AND_ISSUE_DECLARATION

  // ... existing code ...

  // Submit to backend
  dispatch(modifyDeclaration(draft))
  dispatch(writeDeclaration(draft))

  // Navigate to ready to print queue
  navigate(generateGoToHomeTabUrl({ tabId: WORKQUEUE_TABS.readyToPrint }))
}
```

**Note:** Client can remain unchanged because:
- If flag disabled: Client generates PDF locally (current behavior)
- If flag enabled: Country-config can return PDF, but client fallback still works

### 4. Environment Configuration

```bash
# /home/ktsang/opencrvs-countryconfig-atg/.env
USE_TOPPAN_CERTIFICATE_SERVICE=true
TOPPAN_CERTIFICATE_SERVICE_URL=http://localhost:3889
```

```yaml
# /home/ktsang/opencrvs-countryconfig-atg/toppan-override.yml
version: '3.3'

services:
  countryconfig:
    environment:
      USE_TOPPAN_CERTIFICATE_SERVICE: 'true'
      TOPPAN_CERTIFICATE_SERVICE_URL: 'http://toppan-certificate:3889'

  toppan-certificate:
    image: ${DOCKER_REGISTRY}/toppan-certificate:${VERSION:-latest}
    restart: unless-stopped
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - ASPNETCORE_URLS=http://+:3889
    volumes:
      - ./opencrvs-core/packages/toppan-certificate/keys:/app/keys:ro
      - ./opencrvs-core/packages/toppan-certificate/templates:/app/templates:ro
    networks:
      - opencrvs
```

### 5. Register Route in Country-Config

```typescript
// /home/ktsang/opencrvs-countryconfig-atg/src/index.ts
import { printCertificateHandler } from '@countryconfig/api/print-certificate/handler'
import { ActionType } from '@opencrvs/commons/events'

// Add near line 575 (after default action interceptor)
const USE_TOPPAN_CERTIFICATE_SERVICE = process.env.USE_TOPPAN_CERTIFICATE_SERVICE === 'true'

if (USE_TOPPAN_CERTIFICATE_SERVICE) {
  const eventTypes = ['birth', 'death', 'marriage']

  for (const eventType of eventTypes) {
    server.route({
      method: 'POST',
      path: `/events/${eventType}/actions/${ActionType.PRINT_CERTIFICATE}`,
      handler: printCertificateHandler,
      options: {
        tags: ['api', 'events'],
        description: 'Generate certificate using Toppan Certificate Service'
      }
    })
  }
}
```

## Benefits (With Same User Experience)

### What Users Get:
- ✅ **Digital signatures** - Tamper-evident certificates
- ✅ **QR codes** - Officers can scan to verify
- ✅ **Better quality** - Server-side rendering is more consistent
- ✅ **Same workflow** - Print/download works exactly as before

### What Changes:
- 🔄 PDF generation: Browser → Server
- 🔄 Rendering: pdfMake → SkiaSharp (.NET)
- ✅ Everything else: **Same as before**

### What DOESN'T Change:
- ❌ No MinIO storage (certificates still only local)
- ❌ No server-side archival (same as current)
- ❌ No additional database records
- ❌ No changes to workflow state machine

## Rollout Plan

### Step 1: Deploy with Flag Disabled (Week 1)
```bash
USE_TOPPAN_CERTIFICATE_SERVICE=false
```
- Deploy certificate-service container
- No behavior change (safety check)

### Step 2: Enable for Test Office (Week 2)
```bash
USE_TOPPAN_CERTIFICATE_SERVICE=true
```
- Enable for one office
- Test birth/death/marriage certificates
- Verify QR codes work in verifier app

### Step 3: Gradual Rollout (Week 3-4)
- Enable for pilot district
- Monitor error rates
- Collect user feedback

### Step 4: Full Rollout (Week 5)
- Enable nationwide
- Monitor performance
- Support hotline ready

## Rollback Plan

If issues occur:
```bash
# Instant rollback
USE_TOPPAN_CERTIFICATE_SERVICE=false
```

System immediately reverts to client-side PDF generation.

## Testing Checklist

- [ ] Birth certificate generation
- [ ] Death certificate generation
- [ ] Marriage certificate generation
- [ ] QR code scanning in verifier app
- [ ] PDF signature verification
- [ ] Print dialog works
- [ ] Download works
- [ ] Mobile device compatibility
- [ ] Offline fallback (client-side generation)
- [ ] Error handling (service unavailable)

## File Structure

```
/home/ktsang/opencrvs-countryconfig-atg/
├── src/
│   ├── api/
│   │   └── print-certificate/
│   │       ├── handler.ts          (NEW)
│   │       └── index.ts            (NEW)
│   ├── environment.ts              (MODIFY - add flags)
│   └── index.ts                    (MODIFY - register route)
├── .env                            (MODIFY - add flags)
└── toppan-override.yml             (MODIFY - add service)

/home/ktsang/opencrvs-core/packages/toppan-certificate/
├── src/
│   └── CertificateService.Api/
│       └── Controllers/
│           └── CertificatesController.cs  (MODIFY - return base64)
└── templates/                      (NEW - copy from country-config)
    ├── birth-certificate.hbs
    ├── death-certificate.hbs
    └── marriage-certificate.hbs
```

## Timeline

| Task | Time | Status |
|------|------|--------|
| Update certificate-service API (return base64) | 1-2 hours | 📋 Pending |
| Create print-certificate handler | 2-3 hours | 📋 Pending |
| Copy & adapt templates | 4-6 hours | 📋 Pending |
| Environment configuration | 1 hour | 📋 Pending |
| Local testing | 2-3 hours | 📋 Pending |
| Deploy to staging | 1 hour | 📋 Pending |
| User acceptance testing | 1 day | 📋 Pending |
| Production deployment | 1 hour | 📋 Pending |

**Total: 2-3 days**

## Next Steps

1. **Confirm approach** - Does this match your requirements?
2. **Update certificate-service** - Modify API to return PDF base64
3. **Create country-config handler** - Implement print-certificate endpoint
4. **Copy templates** - Adapt SVG templates for certificate-service
5. **Test locally** - Verify end-to-end flow
6. **Deploy & rollout** - Gradual enablement with feature flag

## Questions Resolved

✅ **Should we upload to MinIO?** → No, return PDF directly to client (existing behavior)
✅ **Should we store certificates server-side?** → No, only client print/download (existing behavior)
✅ **Can we rollback easily?** → Yes, single environment variable
✅ **Is it backward compatible?** → Yes, client can still generate PDFs if flag disabled

Ready to implement?
