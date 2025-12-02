# Enhanced Document Viewer

## Overview

The Enhanced Document Viewer adds support for viewing PDF documents directly in the browser, alongside the existing image viewing functionality. It includes security validations, error handling, and responsive design for both modal and side panel viewers.

## Feature Summary

- **Purpose:** Universal document viewer supporting both images and PDFs
- **Features:**
  - PDF detection and browser-native rendering
  - Security validations to prevent XSS attacks
  - Graceful error handling with fallback options
  - Responsive full viewport PDF display
  - Conditional UI controls (zoom/rotate hidden for PDFs)
- **Feature Flag:** `ENHANCED_DOCUMENT_VIEWER`

---

## Commits

| Commit | Description |
|--------|-------------|
| `257fa2df39` | Complete PDF multi-page support with browser-native viewing |
| `e53e538c78` | Enhance PDF viewer security and error handling |
| `7d77d7cc4c` | Integrate certificate service pipeline |
| `13c6c31b91` | Add comprehensive migration comments |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    DocumentViewer                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ViewerHeader                                       │ │
│  │  ┌──────────────┐  ┌──────────────────────────────┐│ │
│  │  │   Select     │  │ PanControls (images only)    ││ │
│  │  │   Document   │  │ [Zoom In][Zoom Out][Rotate]  ││ │
│  │  └──────────────┘  └──────────────────────────────┘│ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ViewerContent                                      │ │
│  │                                                     │ │
│  │  ┌─────────────────┐  OR  ┌─────────────────────┐  │ │
│  │  │   PanViewer     │      │   PDFContainer      │  │ │
│  │  │   (Images)      │      │   <embed> element   │  │ │
│  │  │   - Zoom        │      │   - Native PDF      │  │ │
│  │  │   - Rotate      │      │   - Error fallback  │  │ │
│  │  │   - Pan         │      │   - Loading state   │  │ │
│  │  └─────────────────┘      └─────────────────────┘  │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Key Functions

### PDF Detection

```typescript
// Helper function to detect if URL is a PDF
function isPdfUrl(url: string): boolean {
  return (
    url.toLowerCase().includes('.pdf') ||
    url.includes('application/pdf') ||
    url.startsWith('data:application/pdf')
  )
}
```

### URL Security Validation

```typescript
// Security: Validate and sanitize PDF URLs
function isValidPdfUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false
  }

  // Allow data URLs with PDF content
  if (url.startsWith('data:application/pdf;base64,')) {
    return true
  }

  // Allow HTTP/HTTPS URLs
  try {
    const urlObj = new URL(url)
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return false
    }
    // Validate URL patterns
    // ... additional checks
    return true
  } catch {
    return false
  }
}
```

---

## Files Changed

### packages/components

| File | Description |
|------|-------------|
| `src/DocumentViewer/DocumentViewer.tsx` | Enhanced with PDF support |
| `src/DocumentViewer/components/PanViewer.tsx` | Image viewer (unchanged) |
| `src/DocumentViewer/components/PanControls.tsx` | Zoom/rotate controls |

### packages/client

| File | Description |
|------|-------------|
| `src/v2-events/components/forms/inputs/FileInput/DocumentPreview.tsx` | Uses DocumentViewer |
| `src/v2-events/components/forms/inputs/FileInput/useOnFileChange.ts` | File upload handling |
| `src/components/form/DocumentUploadField/DocumentUploaderWithOption.tsx` | Upload component |
| `typings/window.d.ts` | ENHANCED_DOCUMENT_VIEWER type |

### packages/documents

| File | Description |
|------|-------------|
| `src/features/uploadDocument/handler.ts` | PDF upload support |

### packages/gateway

| File | Description |
|------|-------------|
| `src/utils/validators.ts` | ENHANCED_DOCUMENT_VIEWER check |
| `src/utils/applicationConfig.ts` | Feature flag config |

---

## Component States

### Loading State
```typescript
{pdfLoading && (
  <PDFLoading>
    <div>📄</div>
    <div>Loading PDF...</div>
  </PDFLoading>
)}
```

### Error State (with Fallback)
```typescript
{pdfError && (
  <PDFError>
    <div>📄</div>
    <div>Unable to preview PDF in browser</div>
    <a href={selectedDocument} target="_blank" rel="noopener noreferrer">
      Open PDF in new tab
    </a>
  </PDFError>
)}
```

### Invalid PDF State
```typescript
{!isValidPdf && (
  <PDFError>
    <div>⚠️</div>
    <div>Invalid PDF file or URL</div>
    <div>Please upload a valid PDF document</div>
  </PDFError>
)}
```

---

## Feature Flag Configuration

### client-config.js

```javascript
FEATURES: {
  ENHANCED_DOCUMENT_VIEWER: true
}
```

### Usage in Code

```typescript
// Check feature flag
const isEnhancedViewerEnabled = window.config?.FEATURES?.ENHANCED_DOCUMENT_VIEWER === true

// Conditional rendering
if (isEnhancedViewerEnabled && isPdfUrl(documentUrl)) {
  // Use new PDF viewer
} else {
  // Fall back to image viewer
}
```

---

## Styled Components

```typescript
const PDFContainer = styled.div`
  width: 100%;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;

  & embed {
    width: 100%;
    height: 100%;
    border: none;
  }
`

const PDFError = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.grey600};

  & a {
    color: ${({ theme }) => theme.colors.primary};
    text-decoration: underline;
  }
`
```

---

## Security Considerations

1. **URL Validation:** All PDF URLs are validated before rendering
2. **Protocol Check:** Only http/https and data: URLs are allowed
3. **XSS Prevention:** No inline script execution in PDFs
4. **Content-Type:** PDFs must have correct MIME type
5. **Click Protection:** Additional validation on "Open in new tab" link

### Validated URL Patterns

| Pattern | Allowed |
|---------|---------|
| `https://example.com/doc.pdf` | ✅ |
| `data:application/pdf;base64,...` | ✅ |
| `http://minio.local/ocrvs/...` | ✅ |
| `javascript:alert(1)` | ❌ |
| `file:///etc/passwd` | ❌ |

---

## CSP Requirements

The Content Security Policy must allow PDF embedding:

```typescript
const cspDirectives = {
  'object-src': ["'self'", 'data:', 'blob:'],
  'frame-src': ["'self'", 'data:', 'blob:']
}
```

---

## Migration Steps

### 1. Apply DocumentViewer changes

```bash
git diff 257fa2df39~1..257fa2df39 -- packages/components/src/DocumentViewer/
```

### 2. Apply client changes

```bash
git diff e53e538c78~1..e53e538c78 -- packages/client/src/
```

### 3. Enable feature flag

```javascript
// client-config.js
FEATURES: {
  ENHANCED_DOCUMENT_VIEWER: true
}
```

### 4. Apply CSP changes

Ensure gateway CSP allows PDF embedding (see 08-INFRASTRUCTURE.md).

---

## Testing

1. **PDF Upload:**
   - Upload a single-page PDF
   - Verify it appears in document list
   - Verify preview shows embedded PDF

2. **Multi-page PDF:**
   - Upload a multi-page PDF
   - Verify browser PDF controls work
   - Verify page navigation works

3. **Image Files:**
   - Upload PNG/JPEG
   - Verify image viewer shows with zoom/rotate
   - Verify backward compatibility

4. **Error Handling:**
   - Upload corrupted PDF
   - Verify error message shows
   - Verify "Open in new tab" fallback works

5. **Security:**
   - Try to inject malicious URL
   - Verify URL validation blocks it
   - Verify no XSS execution
