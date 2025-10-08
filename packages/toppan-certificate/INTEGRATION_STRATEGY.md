# Certificate Service Integration Strategy

## Current OpenCRVS Certificate Generation Flow

### 1. **Client-Side Generation (Current)**

```
User clicks "Certify"
  → Client generates PDF using pdfMake (browser)
  → SVG template + Handlebars compilation
  → Client prints/downloads PDF
  → NO server-side generation
  → NO MinIO upload of final certificate
  → NO digital signature
```

**Key Files:**
- [packages/client/src/views/PrintCertificate/usePrintableCertificate.ts:228](/home/ktsang/opencrvs-core/packages/client/src/views/PrintCertificate/usePrintableCertificate.ts#L228) - `printPDF()` call
- [packages/client/src/pdfRenderer/index.ts:24](/home/ktsang/opencrvs-core/packages/client/src/pdfRenderer/index.ts#L24) - Uses pdfMake in browser
- [packages/client/src/views/PrintCertificate/PDFUtils.ts:90](/home/ktsang/opencrvs-core/packages/client/src/views/PrintCertificate/PDFUtils.ts#L90) - `compileSvg()` with Handlebars

**Current Behavior:**
1. User clicks "Certify & Issue" or "Certify for Print in Advance"
2. **Frontend (React):**
   - Fetches certificate SVG template from country-config
   - Compiles template with Handlebars (fills in data)
   - Converts SVG → PDF using `pdfMake` (pure JavaScript)
   - Opens browser print dialog or downloads PDF
   - **Certificate exists ONLY in browser memory, never uploaded to server**

3. **Backend (workflow service):**
   - Receives certify request at [packages/workflow/src/records/handler/certify.ts:30](/home/ktsang/opencrvs-core/packages/workflow/src/records/handler/certify.ts#L30)
   - Uploads collector affidavit/photo attachments to MinIO
   - **Does NOT upload certificate PDF** (only metadata)
   - Marks record as CERTIFIED in database

### 2. **Certificate Metadata Flow**

The backend stores certificate **metadata** but not the PDF file itself:

```typescript
// packages/workflow/src/records/handler/certify.ts:32-39
const certificateDetails = await uploadCertificateAttachmentsToDocumentsStore(
  certificateDetailsWithRawAttachments,
  getAuthHeader(request)
)
```

**What gets uploaded to MinIO:**
- ✅ Collector's affidavit (if present)
- ✅ Collector's photo (if present)
- ❌ Certificate PDF itself (NOT uploaded)

**Certificate data structure:**
```json
{
  "registration": {
    "certificates": [
      {
        "certificateTemplateId": "birth-certificate",
        "collector": {
          "name": "John Doe",
          "affidavit": [{"data": "minio://path/to/affidavit.pdf"}],
          "photo": [{"data": "minio://path/to/photo.jpg"}]
        },
        "payments": { "type": "MANUAL", "amount": 5 }
      }
    ]
  }
}
```

### 3. **Action Confirmation Flow (Country Config)**

When user initiates PRINT_CERTIFICATE action:

```
Client → Events Service
  → POST /events/{eventType}/actions/PRINT_CERTIFICATE
  → Country Config Handler (optional override)
  → Returns 200 (accept) / 400 (reject) / 202 (async)
```

**Current Implementation:**
- Default interceptor returns 200 (auto-accept) - [packages/events/src/router/event/actions/index.ts:92](/home/ktsang/opencrvs-core/packages/events/src/router/event/actions/index.ts#L92)
- Country-config can override this to add custom logic

## Problems with Current Approach

1. **No Tamper-Evident Certificate**
   - Anyone can modify the PDF after printing
   - No digital signature to verify authenticity
   - No way to detect forgery

2. **No Archival Copy on Server**
   - Certificate only exists in browser/local printer
   - Server has no record of actual certificate issued
   - Cannot regenerate exact certificate later

3. **No QR Code with Verification**
   - No machine-readable verification method
   - Officers must manually check records

4. **Client-Side Generation Issues**
   - Complex SVG → PDF conversion in browser
   - Inconsistent rendering across browsers
   - Large JavaScript bundle size
   - Font loading issues

## Proposed Integration: Toppan Certificate Service

### **Option 1: Full Server-Side Generation (Recommended)**

Replace client-side PDF generation with server-side certificate-service.

#### **Architecture:**

```
User clicks "Certify"
  ↓
Client sends certificate data to Gateway
  ↓
Gateway routes to Certificate-Service
  ↓
Certificate-Service:
  - Generates PDF from template
  - Signs PDF with ECDSA
  - Embeds QR code with signed data
  - Uploads PDF to MinIO
  - Returns MinIO URL + metadata
  ↓
Client downloads signed PDF from MinIO
```

#### **Feature Flag Implementation:**

**1. Environment Variable (country-config-atg):**

```typescript
// /home/ktsang/opencrvs-countryconfig-atg/src/environment.ts
export const USE_TOPPAN_CERTIFICATE_SERVICE =
  process.env.USE_TOPPAN_CERTIFICATE_SERVICE === 'true'

export const TOPPAN_CERTIFICATE_SERVICE_URL =
  process.env.TOPPAN_CERTIFICATE_SERVICE_URL || 'http://localhost:3889'
```

**2. Docker Compose Override:**

```yaml
# opencrvs-countryconfig-atg/toppan-override.yml
version: '3.3'

services:
  countryconfig:
    environment:
      USE_TOPPAN_CERTIFICATE_SERVICE: 'true'
      TOPPAN_CERTIFICATE_SERVICE_URL: 'http://toppan-certificate:3889'

  toppan-certificate:
    image: ${DOCKER_REGISTRY}/${TOPPAN_CERTIFICATE_IMAGE:-toppan-certificate}:${VERSION:-latest}
    restart: unless-stopped
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - ASPNETCORE_URLS=http://+:3889
    volumes:
      - /home/ktsang/opencrvs-core/packages/toppan-certificate/keys:/app/keys:ro
    ports:
      - "3889:3889"
    networks:
      - opencrvs
```

**3. Country Config Handler (PRINT_CERTIFICATE action):**

```typescript
// /home/ktsang/opencrvs-countryconfig-atg/src/api/print-certificate/handler.ts
import { Request, ResponseToolkit } from '@hapi/hapi'
import fetch from 'node-fetch'
import { USE_TOPPAN_CERTIFICATE_SERVICE, TOPPAN_CERTIFICATE_SERVICE_URL } from '@countryconfig/environment'
import { ActionType } from '@opencrvs/commons/events'

interface PrintCertificatePayload {
  event: {
    id: string
    type: 'birth' | 'death' | 'marriage'
    child?: { name: string; dateOfBirth: string }
    deceased?: { name: string; dateOfDeath: string }
    // ... other event data
  }
  action: {
    type: typeof ActionType.PRINT_CERTIFICATE
    certificate: {
      certificateTemplateId: string
      collector: {
        name: string
        relationship: string
      }
    }
  }
  actionId: string
}

export async function printCertificateHandler(
  request: Request,
  h: ResponseToolkit
) {
  const payload = request.payload as PrintCertificatePayload

  if (!USE_TOPPAN_CERTIFICATE_SERVICE) {
    // Default: Client-side generation (legacy behavior)
    return h.response().code(200)
  }

  try {
    // Call Toppan Certificate Service to generate signed PDF
    const certificateRequest = {
      certificateType: payload.event.type,
      templateId: payload.action.certificate.certificateTemplateId,
      certificateNumber: `${payload.event.type.toUpperCase()}-${payload.event.id.substring(0, 8)}`,
      data: payload.event, // Full event data for template
      recordUrl: `${process.env.CLIENT_APP_URL}/record-details/${payload.event.id}`,
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
      console.error('Certificate service error:', await response.text())
      return h.response({
        error: 'Failed to generate certificate'
      }).code(500)
    }

    const result = await response.json()

    // Return 200 with certificate URL and metadata
    return h.response({
      certificateUrl: result.certificateUrl,  // MinIO URL
      certificateId: result.certificateId,
      qrCodeData: result.qrCodeData,
      signature: result.signature
    }).code(200)

  } catch (error) {
    console.error('Error calling certificate service:', error)
    return h.response({
      error: 'Certificate service unavailable'
    }).code(500)
  }
}
```

**4. Register Route in Country Config:**

```typescript
// /home/ktsang/opencrvs-countryconfig-atg/src/index.ts
import { printCertificateHandler } from '@countryconfig/api/print-certificate/handler'
import { ActionType } from '@opencrvs/commons/events'

// Add after line 575 (after default interceptor setup)
if (USE_TOPPAN_CERTIFICATE_SERVICE) {
  // Override default PRINT_CERTIFICATE handler for all event types
  const eventTypes = ['birth', 'death', 'marriage', 'v2-birth', 'tennis-club-membership']

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

**5. Client-Side Integration (Optional):**

If you want to show certificate preview before printing:

```typescript
// packages/client/src/views/PrintCertificate/usePrintableCertificate.ts:178
const handleCertify = async () => {
  if (!declaration || !certificateTemplateConfig) {
    return
  }

  const draft = cloneDeep(declaration)
  draft.submissionStatus = SUBMISSION_STATUS.READY_TO_CERTIFY
  draft.action = isPrintInAdvance
    ? SubmissionAction.CERTIFY_DECLARATION
    : SubmissionAction.CERTIFY_AND_ISSUE_DECLARATION

  // Feature flag check
  const useToppanService = window.config.CERTIFICATE_SERVICE_ENABLED

  if (useToppanService) {
    // Server-side generation: Just submit the action
    // Certificate will be generated by country-config handler
    dispatch(modifyDeclaration(draft))
    dispatch(writeDeclaration(draft))
    navigate(generateGoToHomeTabUrl({ tabId: WORKQUEUE_TABS.readyToPrint }))
  } else {
    // Legacy: Client-side generation
    const base64ReplacedTemplate = await replaceMinioUrlWithBase64(draft.data.template)
    const svg = compileSvg(svgTemplate, { ...base64ReplacedTemplate, preview: false }, state)
    const pdfTemplate = svgToPdfTemplate(svg, certificateFonts)
    printPDF(pdfTemplate, draft.id)

    dispatch(modifyDeclaration(draft))
    dispatch(writeDeclaration(draft))
    navigate(generateGoToHomeTabUrl({ tabId: WORKQUEUE_TABS.readyToPrint }))
  }
}
```

### **Option 2: Hybrid Approach (Easier Migration)**

Keep client-side generation but add optional server-side signing and upload.

#### **Flow:**

```
User clicks "Certify"
  ↓
Client generates PDF (existing flow)
  ↓
Client uploads PDF to Certificate-Service for signing
  ↓
Certificate-Service:
  - Signs existing PDF
  - Embeds QR code
  - Uploads to MinIO
  - Returns URL
  ↓
Client downloads signed version
```

**Pros:**
- ✅ Minimal changes to existing code
- ✅ Easy to toggle on/off
- ✅ Backward compatible

**Cons:**
- ❌ Still requires client-side PDF generation
- ❌ Larger payload (PDF upload)
- ❌ Two-step process

## Implementation Plan

### **Phase 1: Certificate Service API (Already Complete)**

- ✅ POST /api/certificates/generate
- ✅ POST /api/certificates/verify-pdf
- ✅ GET /api/certificates/public-keys
- ✅ Verifier app with QR scanning

### **Phase 2: Feature Flag Setup (Country Config)**

**Files to Create:**

1. `/home/ktsang/opencrvs-countryconfig-atg/src/api/print-certificate/handler.ts`
2. `/home/ktsang/opencrvs-countryconfig-atg/src/api/print-certificate/index.ts`

**Files to Modify:**

1. `/home/ktsang/opencrvs-countryconfig-atg/src/environment.ts` - Add feature flags
2. `/home/ktsang/opencrvs-countryconfig-atg/src/index.ts` - Register route
3. `/home/ktsang/opencrvs-countryconfig-atg/toppan-override.yml` - Add service config
4. `/home/ktsang/opencrvs-countryconfig-atg/.env` - Add environment variables

**Estimated Time:** 4-6 hours

### **Phase 3: Template Migration**

Certificate-service needs templates in Handlebars format.

**Convert SVG templates:**

```bash
# Copy templates from country-config
cp /home/ktsang/opencrvs-countryconfig-atg/src/api/certificates/source/*.svg \
   /home/ktsang/opencrvs-core/packages/toppan-certificate/templates/

# Templates need to be adapted for .NET Handlebars syntax
```

**Template Compatibility:**
- OpenCRVS uses JavaScript Handlebars helpers
- Certificate-service uses .NET Handlebars.Net
- May need to recreate some custom helpers

**Estimated Time:** 8-12 hours (per template type)

### **Phase 4: Gateway Integration (Optional)**

Add certificate-service as a microservice in opencrvs-core.

**Benefits:**
- Unified authentication
- Better service mesh integration
- Centralized logging

**Files to Modify:**

1. `/home/ktsang/opencrvs-core/packages/gateway/src/routes.ts` - Add proxy route
2. `/home/ktsang/opencrvs-core/docker-compose.yml` - Add toppan-certificate service

**Estimated Time:** 2-3 hours

### **Phase 5: Testing & Rollout**

1. **Unit Tests:**
   - Country-config handler tests
   - Certificate-service integration tests

2. **Integration Tests:**
   - End-to-end certificate generation
   - QR code verification
   - PDF signature validation

3. **Deployment:**
   - Deploy with `USE_TOPPAN_CERTIFICATE_SERVICE=false` (default)
   - Test in staging with flag enabled
   - Gradual rollout to production

**Estimated Time:** 8-10 hours

## Timeline Summary

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Certificate Service API | 2 weeks | ✅ Complete |
| Phase 2: Feature Flag Setup | 4-6 hours | 📋 Planned |
| Phase 3: Template Migration | 8-12 hours/template | 📋 Planned |
| Phase 4: Gateway Integration | 2-3 hours | 📋 Optional |
| Phase 5: Testing & Rollout | 8-10 hours | 📋 Planned |

**Total Estimated Time:** 3-4 days of focused development

## Feature Flag Configuration

### **Development Environment:**

```bash
# .env
USE_TOPPAN_CERTIFICATE_SERVICE=true
TOPPAN_CERTIFICATE_SERVICE_URL=http://localhost:3889
```

### **Production Environment:**

```bash
# .env.production
USE_TOPPAN_CERTIFICATE_SERVICE=true
TOPPAN_CERTIFICATE_SERVICE_URL=http://toppan-certificate:3889
```

### **Rollback Plan:**

If issues arise, set:
```bash
USE_TOPPAN_CERTIFICATE_SERVICE=false
```

System reverts to client-side PDF generation immediately.

## Security Considerations

1. **Key Management:**
   - Private keys must be mounted as Docker secrets
   - Never commit keys to git (already in .gitignore)
   - Rotate keys using multi-version support

2. **Authentication:**
   - Certificate-service should validate JWT tokens
   - Forward auth headers from country-config

3. **MinIO Upload:**
   - Certificate-service needs MinIO credentials
   - Use service account with limited permissions
   - Only write access to certificates/ bucket

4. **Template Security:**
   - Templates should be validated before rendering
   - Prevent template injection attacks
   - Sanitize user input in certificate data

## Benefits Summary

### **With Toppan Certificate Service:**

✅ **Tamper-Evident Certificates**
- Digital signature prevents forgery
- QR code enables instant verification
- PDF/A compliance for long-term archival

✅ **Server-Side Archival**
- MinIO stores exact certificate issued
- Can regenerate certificate later
- Audit trail of all certificates

✅ **Better Performance**
- Server-side rendering is faster
- Consistent output across all devices
- Reduced client bundle size

✅ **Key Rotation Support**
- Multi-version key management
- Update keys without invalidating old certificates
- HSM integration ready

✅ **International Standards**
- ECDSA P-256 (NIST/FIPS approved)
- SHA-256 hashing
- Web Crypto API for verification

### **Migration Path:**

1. **Day 1:** Deploy with flag OFF (no changes)
2. **Week 1:** Enable for test office only
3. **Week 2:** Enable for pilot district
4. **Week 3:** Enable for all birth certificates
5. **Week 4:** Enable for all certificate types

## Next Steps

1. **Review this document** - Confirm approach with team
2. **Create feature branch** - `feature/toppan-certificate-integration`
3. **Implement Phase 2** - Feature flag setup in country-config-atg
4. **Test locally** - Verify end-to-end flow
5. **Deploy to staging** - Test with real data
6. **Production rollout** - Gradual enablement

## Questions to Resolve

1. **Template Format:** Should we use SVG templates or create new HTML templates for certificate-service?
2. **MinIO Integration:** Should certificate-service upload directly to MinIO, or return PDF bytes to country-config?
3. **Gateway Proxy:** Should certificate-service be exposed through gateway or accessed directly from country-config?
4. **Client Changes:** Do we want to remove client-side PDF generation code entirely, or keep as fallback?
5. **Certificate Storage:** Should we store certificate metadata in PostgreSQL in addition to MinIO?

## Conclusion

The integration strategy provides a **backward-compatible, feature-flagged approach** to replace OpenCRVS's client-side certificate generation with Toppan's secure, server-side certificate service.

**Recommendation:** Proceed with **Option 1 (Full Server-Side Generation)** for maximum benefit, with feature flag for safe rollout.
