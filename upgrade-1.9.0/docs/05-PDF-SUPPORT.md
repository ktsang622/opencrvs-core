# PDF Multi-Page Support

## Overview

Enhanced the documents service and client to support multi-page PDF uploads and preview. Previously only single-page image documents (PNG/JPEG) were supported.

## Feature Summary

- **Purpose:** Support PDF document uploads and multi-page preview
- **Changes:** Backend PDF processing, client PDF viewer
- **Formats:** PDF, PNG, JPEG supported
- **Storage:** MinIO with proper MIME types

---

## Commits

| Commit | Description |
|--------|-------------|
| `f03e209342` | Implement PDF multi-page document support |
| `51e64fd096` | Fix documents service to support both PDF and PNG uploads |
| `257fa2df39` | Complete PDF multi-page support with browser-native viewing |
| `4ca6dfc04c` | Phase 2: Backend PDF Processing |
| `b2ccaf7491` | Add comprehensive PDF multi-page support implementation plan |
| `e53e538c78` | Enhance PDF viewer security and error handling |

---

## Architecture

```
┌─────────────────┐     ┌───────────────┐     ┌─────────────────┐
│   Client        │────▶│   Documents   │────▶│     MinIO       │
│ (PDF Upload)    │     │   Service     │     │   (Storage)     │
└─────────────────┘     └───────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │              ┌─────────────────┐
        │              │  PDF Processing │
        │              │  - Validation   │
        │              │  - Metadata     │
        │              │  - Thumbnail    │
        │              └─────────────────┘
        │
        ▼
┌─────────────────┐
│   PDF Viewer    │
│ (Browser-native)│
└─────────────────┘
```

---

## Backend Changes

### packages/documents

#### File Upload Handler

```typescript
// documents/src/upload.ts

async function handleUpload(file: Buffer, mimeType: string) {
  // Validate MIME type
  const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg']
  if (!allowedTypes.includes(mimeType)) {
    throw new Error('Unsupported file type')
  }

  // Generate unique filename
  const filename = generateUniqueFilename(mimeType)

  // Upload to MinIO with correct content-type
  await minioClient.putObject(
    bucket,
    filename,
    file,
    { 'Content-Type': mimeType }
  )

  // For PDFs, extract page count
  let pageCount = 1
  if (mimeType === 'application/pdf') {
    pageCount = await getPdfPageCount(file)
  }

  return {
    url: getPresignedUrl(filename),
    mimeType,
    pageCount
  }
}
```

#### PDF Metadata Extraction

```typescript
// Using pdf-lib or similar
import { PDFDocument } from 'pdf-lib'

async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const pdfDoc = await PDFDocument.load(buffer)
  return pdfDoc.getPageCount()
}
```

---

## Client Changes

### Document Preview Component

```typescript
// DocumentPreview.tsx

function DocumentPreview({ document }: Props) {
  const { url, mimeType, pageCount } = document

  if (mimeType === 'application/pdf') {
    return (
      <PdfViewer
        url={url}
        pageCount={pageCount}
      />
    )
  }

  return <ImageViewer url={url} />
}
```

### PDF Viewer Component

```typescript
// PdfViewer.tsx

function PdfViewer({ url, pageCount }: Props) {
  const [currentPage, setCurrentPage] = useState(1)

  return (
    <Container>
      <embed
        src={`${url}#page=${currentPage}`}
        type="application/pdf"
        width="100%"
        height="600px"
      />

      {pageCount > 1 && (
        <Pagination>
          <Button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span>Page {currentPage} of {pageCount}</span>
          <Button
            onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}
            disabled={currentPage === pageCount}
          >
            Next
          </Button>
        </Pagination>
      )}
    </Container>
  )
}
```

---

## CSP Changes

To allow PDF embedding, Content Security Policy was updated:

```typescript
// gateway CSP configuration

const cspDirectives = {
  'object-src': ["'self'", 'data:', 'blob:'],
  'frame-src': ["'self'", 'data:', 'blob:'],
  // ... other directives
}
```

**Commits:**
- `3132190b97` - fix: Update CSP to allow PDF document preview
- `dca7c94229` - fix: Update CSP frame-src

---

## Files Changed

### packages/documents

| File | Description |
|------|-------------|
| `src/upload/handler.ts` | Modified - Add PDF support |
| `src/utils/mimeTypes.ts` | Modified - Add PDF MIME type |
| `src/utils/pdfUtils.ts` | New - PDF processing utilities |

### packages/client

| File | Description |
|------|-------------|
| `src/components/DocumentPreview.tsx` | Modified - Add PDF case |
| `src/components/PdfViewer.tsx` | New - PDF viewer component |
| `src/components/ImageViewer.tsx` | Extracted - Image viewing |

### packages/gateway

| File | Description |
|------|-------------|
| `src/server.ts` | Modified - CSP headers |

---

## MIME Type Handling

### Upload

```typescript
// Determine MIME type from file extension
const mimeTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return mimeTypes[ext] || 'application/octet-stream'
}
```

### Download/Preview

```typescript
// Ensure correct Content-Type in presigned URL
const presignedUrl = await minioClient.presignedGetObject(
  bucket,
  filename,
  60 * 60, // 1 hour expiry
  {
    'response-content-type': mimeType
  }
)
```

---

## Migration Steps

### 1. Apply documents service changes

```bash
git diff 51e64fd096~1..51e64fd096 -- packages/documents/
```

### 2. Apply client PDF viewer

```bash
git diff 257fa2df39~1..257fa2df39 -- packages/client/src/components/
```

### 3. Apply CSP changes

```bash
git diff 3132190b97~1..3132190b97 -- packages/gateway/src/server.ts
```

### 4. Test PDF upload

```bash
# Upload a PDF via the registration form
# Verify it appears in document preview
# Verify multi-page navigation works
```

---

## Security Considerations

1. **PDF Validation:** Validate PDF structure before accepting
2. **Size Limits:** Enforce maximum file size (default 10MB)
3. **Virus Scanning:** Consider adding ClamAV for uploaded files
4. **CSP:** Only allow PDFs from trusted sources (self, blob, data)

---

## Testing

1. Upload a single-page PDF
   - Verify it uploads successfully
   - Verify preview works

2. Upload a multi-page PDF
   - Verify page count is correct
   - Verify pagination controls work
   - Navigate between pages

3. Upload PNG/JPEG
   - Verify backward compatibility
   - Verify image preview works

4. Test error cases
   - Invalid PDF file
   - Corrupted PDF
   - Oversized file
