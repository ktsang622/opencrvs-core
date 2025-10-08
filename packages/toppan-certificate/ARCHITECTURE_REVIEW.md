# Certificate Service - Architecture & Technical Review

## Executive Summary

This document reviews the current certificate signing and verification architecture, evaluates its technical approach, and proposes improvements aligned with international standards.

---

## Current Architecture

### 1. Certificate Security Layers

```
┌─────────────────────────────────────────────────────────┐
│  Physical Certificate (PDF/A-1b)                        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │  1. QR Code (Embedded in PDF)                   │  │
│  │     - JSON data + ECDSA signature               │  │
│  │     - Client-side verification (Web Crypto API) │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │  2. PDF Digital Signature (Invisible)           │  │
│  │     - ECDSA P-256 signature in PDF metadata     │  │
│  │     - Server-side verification                   │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2. Verification Methods

| Method | Use Case | Online/Offline | Trust Level |
|--------|----------|----------------|-------------|
| **QR Code Scan** | Public verification | Offline (after key load) | Medium |
| **PDF Signature** | Official verification | Requires backend | High |

---

## ✅ What's Working Well

### 1. **Dual-Layer Security**
- QR code for quick public verification
- PDF signature for tamper detection
- Defense in depth approach

### 2. **Offline Capability**
- QR verification works offline (Web Crypto API)
- No server dependency after initial key load
- Fast, user-friendly verification

### 3. **Key Rotation Support**
- Multi-version public key management
- Old certificates remain valid
- Centralized key distribution via API

### 4. **Standards-Based**
- ECDSA P-256 (FIPS 186-4 compliant)
- SHA-256 hashing
- PDF/A-1b for archival (ISO 19005-1)

---

## ⚠️ Architectural Concerns

### 1. **QR Code as Primary Trust Anchor**

**Current Issue:**
```javascript
// QR code contains raw JSON data
{
  "certificateNumber": "BRN123456",
  "childName": "John Doe",
  "dateOfBirth": "2024-01-15",
  "signature": "base64_ecdsa_sig"
}
```

**Problems:**
- ❌ QR is **not** a visual trust indicator (looks like any QR code)
- ❌ Public doesn't know what they're verifying
- ❌ Easy to copy QR from valid cert to fake cert
- ❌ No visual authentication for non-technical users

**Risk Scenario:**
1. Attacker scans QR from legitimate certificate
2. Prints QR on fake certificate with different details
3. QR verifies as "valid" but certificate is fraudulent

### 2. **Missing Visual Trust Indicator**

Current certificate has:
- ✅ Digital signature (invisible)
- ✅ QR code (data only)
- ❌ No visual security seal
- ❌ No way to visually authenticate without scanning

### 3. **Verifier App Trust Model**

**Current Flow:**
```
User → Scan QR → Verifier App → Web Crypto → "Valid" ✓
```

**Questions:**
- How does user know they're using official verifier app?
- What prevents malicious app from showing "Valid" for any QR?
- No visual confirmation that certificate matches QR data

---

## 🌐 International Standards & Best Practices

### 1. **ICAO Doc 9303 (Passport Security)**

Used for e-Passports worldwide:

```
┌──────────────────────────────────────┐
│  Passport Data Page                  │
│  ┌────────────────────────────────┐  │
│  │  Visual Inspection Zone (VIZ)  │  │  ← Human-readable
│  │  - Name, Photo, DOB, etc.      │  │
│  └────────────────────────────────┘  │
│                                       │
│  ┌────────────────────────────────┐  │
│  │  Machine Readable Zone (MRZ)   │  │  ← Barcode/OCR
│  │  P<USADOE<<JOHN<<<<<<<<<<<     │  │
│  └────────────────────────────────┘  │
│                                       │
│  ┌────────────────────────────────┐  │
│  │  RFID Chip (Contactless IC)   │  │  ← Digital signature
│  │  - Signed biometric data       │  │
│  │  - Country signing certificate │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

**Key Principles:**
1. **Three-layer security**: Visual, Machine-readable, Digital
2. **Visual Security Features**: Holograms, UV ink, microprinting
3. **Digital Signature**: Signs the entire document data, not separate QR
4. **Certificate Chain**: Country CA → Document Signer → Certificate

### 2. **PAdES (PDF Advanced Electronic Signatures)**

European standard for PDF signatures:

```
PDF Document
├── Visible Signature Panel (Optional)
│   ├── Signer name
│   ├── Timestamp
│   └── Visual seal/logo
├── Digital Signature Dictionary
│   ├── Signature value
│   ├── Signer certificate
│   ├── Timestamp token
│   └── Validation data
└── Document hash (signed)
```

**Features:**
- ✅ Long-term validation (LTV)
- ✅ Visual signature appearance
- ✅ Certificate chain embedded
- ✅ Tamper-evident

### 3. **ISO 32000-2 (PDF 2.0)**

Modern PDF signatures support:
- Visible signature fields with graphics
- Certificate chains
- Timestamping (TSA)
- Revocation information (OCSP/CRL)

---

## 🎯 Recommended Architecture

### Option A: **Visual Digital Seal (Recommended)**

Adopt a visual seal similar to notary stamps or apostilles:

```
┌──────────────────────────────────────────────┐
│  Birth Certificate                           │
│                                              │
│  Child Name: John Doe                        │
│  Date of Birth: 15 Jan 2024                  │
│  Place: Kingston Hospital                    │
│  Registration No: BRN-2024-001234            │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │  [OFFICIAL SEAL]                       │ │
│  │                                        │ │
│  │  ╔══════════════════════════════╗     │ │
│  │  ║   DIGITALLY SEALED           ║     │ │
│  │  ║   MINISTRY OF HEALTH         ║     │ │
│  │  ║                              ║     │ │
│  │  ║   [QR Code]  Cert: BRN-001234║     │ │
│  │  ║              Date: 15/01/24  ║     │ │
│  │  ║              Seal: VALID ✓   ║     │ │
│  │  ╚══════════════════════════════╝     │ │
│  │                                        │ │
│  │  Digitally signed by:                  │ │
│  │  Registrar General of Births & Deaths │ │
│  │  Timestamp: 2024-01-15 10:30:00 UTC   │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  _______________________                     │
│  Registrar Signature                         │
└──────────────────────────────────────────────┘
```

**Visual Seal Components:**

1. **Seal Graphic** - Official government/Toppan logo with security design
2. **QR Code** - Contains signed hash of entire certificate
3. **Text Elements**:
   - "DIGITALLY SEALED" header
   - Issuing authority
   - Certificate number
   - Seal date/time
   - Validation status indicator
4. **Security Features** (for printed version):
   - Microtext
   - Color-shifting elements
   - Guilloche patterns
   - UV-reactive inks (optional)

**QR Code Content (Changed):**
```json
{
  "sealId": "SEAL-2024-BRN-001234",
  "issuer": "Ministry of Health - Civil Registration",
  "certificateType": "BIRTH",
  "certificateNumber": "BRN-2024-001234",
  "issuedDate": "2024-01-15T10:30:00Z",
  "documentHash": "sha256_hash_of_entire_pdf",
  "keyVersion": "v1",
  "signature": "ecdsa_signature"
}
```

**Verification URL:**
```
https://verify.gov.an/certificate/SEAL-2024-BRN-001234
```

**Benefits:**
- ✅ **Visual Trust**: Looks official, recognizable
- ✅ **Tamper-Evident**: Hash covers entire document
- ✅ **User-Friendly**: Clear "VALID" indicator
- ✅ **Print-Compatible**: Works on paper copies
- ✅ **Authority**: Shows issuing organization

### Option B: **Enhanced QR with Visual Frame**

Simpler approach - wrap QR in visual security frame:

```
┌─────────────────────────────────┐
│  ╔═══════════════════════════╗  │
│  ║  SECURED BY TOPPAN        ║  │
│  ║  ┌─────────────────────┐  ║  │
│  ║  │                     │  ║  │
│  ║  │    [QR CODE]        │  ║  │
│  ║  │                     │  ║  │
│  ║  └─────────────────────┘  ║  │
│  ║  Scan to verify           ║  │
│  ║  Cert: BRN-2024-001234    ║  │
│  ╚═══════════════════════════╝  │
└─────────────────────────────────┘
```

**Pros:** Simple, quick to implement
**Cons:** Less authoritative than full seal

### Option C: **PAdES-Compliant Visible Signature**

Full PAdES (PDF Advanced Electronic Signature) implementation:

```
┌─────────────────────────────────────────┐
│  [Visible Signature Field]              │
│                                         │
│  Digitally signed by:                   │
│  Registrar General                      │
│  Date: 2024.01.15 10:30:00 +00'00'     │
│  Reason: Certificate Issuance          │
│  Location: Kingston, Antigua            │
│                                         │
│  Status: Signature valid ✓              │
│  Certificate valid ✓                    │
│  Document unmodified ✓                  │
└─────────────────────────────────────────┘
```

**Pros:**
- Industry standard (EU, Adobe)
- Built-in PDF reader support
- Long-term validation (LTV)

**Cons:**
- Requires certificate infrastructure (CA)
- Complex implementation
- May not work with all PDF readers

---

## 🔧 Technical Recommendations

### 1. **Implement Visual Digital Seal (High Priority)**

#### Changes Needed:

**A. Generate Seal Graphic**
```csharp
public class DigitalSealGenerator
{
    public byte[] GenerateSeal(CertificateData cert, byte[] qrCodeBytes)
    {
        using var canvas = SKSurface.Create(info);
        var ctx = canvas.Canvas;

        // 1. Draw security border with guilloche pattern
        DrawSecurityBorder(ctx);

        // 2. Add official logo/emblem
        DrawOfficialLogo(ctx);

        // 3. Embed QR code
        ctx.DrawImage(qrCode, x, y);

        // 4. Add text: "DIGITALLY SEALED", cert number, date
        DrawSealText(ctx, cert);

        // 5. Add micro-text for print security
        DrawMicrotext(ctx);

        return canvas.Snapshot().Encode().ToArray();
    }
}
```

**B. Change QR Content**
```csharp
// OLD: QR contains all certificate data
var qrData = new {
    childName = "John Doe",
    dateOfBirth = "...",
    // ... all fields
};

// NEW: QR contains document hash + seal info
var qrData = new {
    sealId = $"SEAL-{year}-{type}-{number}",
    issuer = "Ministry of Health",
    certificateNumber = "BRN-2024-001234",
    documentHash = ComputeSHA256(pdfBytes), // Hash of ENTIRE PDF
    issuedDate = DateTime.UtcNow,
    keyVersion = "v1"
};

var signature = SignData(JsonSerializer.Serialize(qrData));
qrData.signature = signature;
```

**C. Update Verifier App**
```javascript
async function verifyDigitalSeal(qrData) {
    // 1. Verify signature
    const signatureValid = await verifySignature(qrData);

    // 2. If PDF available, verify hash matches
    if (uploadedPdf) {
        const pdfHash = await computeSHA256(uploadedPdf);
        const hashMatches = (pdfHash === qrData.documentHash);

        return {
            signatureValid,
            hashMatches,
            overall: signatureValid && hashMatches
        };
    }

    // 3. If QR only (no PDF), can still verify signature
    return { signatureValid, note: "PDF not available for hash verification" };
}
```

**D. Visual Feedback**
```html
<!-- Show clear seal status -->
<div class="seal-status valid">
    <div class="seal-icon">🛡️</div>
    <h2>AUTHENTIC DIGITAL SEAL</h2>
    <p>Issued by: Ministry of Health</p>
    <p>Seal ID: SEAL-2024-BRN-001234</p>
    <p>Signature: VALID ✓</p>
    <p>Document: UNMODIFIED ✓</p>
</div>
```

### 2. **Add Timestamp Authority (TSA) - Medium Priority**

For long-term validation:

```csharp
public class TimestampService
{
    public async Task<byte[]> GetTimestamp(byte[] signature)
    {
        // RFC 3161 - Timestamp Protocol
        var request = new TimeStampRequest(
            sha256Oid,
            signature,
            certReq: true
        );

        var response = await httpClient.PostAsync(
            "https://timestamp.gov.an/tsa",
            new ByteArrayContent(request.GetEncoded())
        );

        return await response.Content.ReadAsByteArrayAsync();
    }
}
```

**Benefits:**
- Proves signature was created at specific time
- Protects against key compromise (signature valid before compromise date)
- Required for legal archival in many jurisdictions

### 3. **Certificate Chain / PKI - Low Priority (Future)**

For full PAdES compliance:

```
Root CA (Government)
  └── Intermediate CA (Civil Registration Authority)
       └── Document Signer (Registrar)
            └── Certificate Document
```

**Complexity:** High - requires full PKI infrastructure
**Timeline:** 6-12 months
**Value:** Maximum trust, international recognition

---

## 📊 Comparison Matrix

| Feature | Current | Visual Seal | PAdES |
|---------|---------|-------------|-------|
| **Visual Trust** | ❌ Low | ✅ High | ✅ High |
| **Offline Verify** | ✅ Yes | ✅ Yes | ⚠️ Partial |
| **Tamper Detection** | ⚠️ Partial | ✅ Full | ✅ Full |
| **Print Security** | ❌ No | ✅ Yes | ❌ No |
| **User-Friendly** | ⚠️ Medium | ✅ High | ❌ Low |
| **Implementation** | ✅ Simple | ⚠️ Medium | ❌ Complex |
| **Standards Compliance** | ⚠️ Partial | ⚠️ Custom | ✅ ISO/EU |
| **Cost** | Low | Medium | High |
| **Timeline** | Done | 2-4 weeks | 3-6 months |

---

## 🎬 Recommended Implementation Plan

### Phase 1: Visual Digital Seal (2-4 weeks)

**Week 1:**
- [ ] Design seal graphics (work with designer)
- [ ] Define seal data structure
- [ ] Update QR generation to include document hash

**Week 2:**
- [ ] Implement `DigitalSealGenerator` class
- [ ] Integrate seal into certificate generation
- [ ] Update PDF signature to sign entire document

**Week 3:**
- [ ] Update verifier app UI for seal verification
- [ ] Add document hash verification
- [ ] Test with sample certificates

**Week 4:**
- [ ] User acceptance testing
- [ ] Documentation
- [ ] Deploy to production

### Phase 2: Timestamp Authority (1-2 months)

- [ ] Evaluate TSA providers (commercial or government)
- [ ] Implement RFC 3161 timestamp requests
- [ ] Embed timestamps in PDF signatures
- [ ] Add timestamp verification

### Phase 3: PKI Infrastructure (6-12 months)

- [ ] Design certificate hierarchy
- [ ] Implement CA/RA systems
- [ ] Certificate lifecycle management
- [ ] Integration with PAdES standard

---

## 🚨 Security Considerations

### Current Vulnerabilities

1. **QR Code Reuse Attack**
   - **Threat:** Copy QR from valid cert to fake cert
   - **Impact:** High
   - **Mitigation:** Hash entire document, not just data

2. **Verifier App Spoofing**
   - **Threat:** Fake verifier app shows "Valid" for any QR
   - **Impact:** Medium
   - **Mitigation:** Use official .gov.an domain, SSL cert

3. **Key Compromise**
   - **Threat:** Private signing key leaked
   - **Impact:** Critical
   - **Mitigation:** HSM, key rotation, timestamps

### Recommended Mitigations

1. ✅ **Document Hash in QR** - Prevents QR reuse
2. ✅ **Visual Seal** - Adds human-verifiable trust
3. ✅ **HSM for Keys** - Prevents key extraction
4. ⚠️ **Timestamp Authority** - Limits impact of key compromise
5. ⚠️ **Certificate Revocation** - Invalidate compromised certificates

---

## 💡 Final Recommendations

### ✅ Keep Current Approach For:
- ECDSA P-256 signing (good choice)
- Key rotation architecture (well designed)
- Verifier app (good UX)
- PDF/A archival format (correct standard)

### 🔄 Change/Improve:
1. **HIGH PRIORITY: Add Visual Digital Seal**
   - Makes verification user-friendly
   - Adds print security
   - Professional appearance

2. **MEDIUM PRIORITY: QR Contains Document Hash**
   - Prevents QR reuse attacks
   - Binds QR to specific document

3. **LOW PRIORITY: Add Timestamps**
   - For long-term validation
   - Legal compliance in some jurisdictions

### ❌ Don't Change (Yet):
- PDF signature approach (works well)
- Key management (good design)
- Verifier app architecture (solid)

---

## 📝 Conclusion

**Current architecture is 70% correct**, but missing critical visual trust elements.

**Primary Issue:** QR code is not a visual security indicator - it's just data.

**Solution:** Add visual digital seal that combines:
- Official graphic design
- Clear trust indicators ("DIGITALLY SEALED", "VALID")
- QR code that signs document hash
- Print security features

**Timeline:** 2-4 weeks for visual seal implementation
**Cost:** Low (design + development)
**Impact:** High (much better user trust and security)

**Recommendation:** Implement Visual Digital Seal (Option A) before production rollout.
