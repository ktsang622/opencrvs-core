# PDF Multi-page Support Implementation Plan

## Overview
Comprehensive implementation of PDF multi-page document support in OpenCRVS with browser-native PDF viewing and enhanced security.

## Implementation Summary

### 1. Feature Flag Integration
- **Component**: Gateway validation (`packages/gateway/src/utils/validators.ts`)
- **Enhancement**: Dynamic PDF support based on `ENHANCED_DOCUMENT_VIEWER` feature flag
- **Pattern**: Follows OpenCRVS config service integration without complex authentication

### 2. Frontend Upload Support
- **Component**: Legacy uploader (`packages/client/src/components/form/DocumentUploadField/DocumentUploaderWithOption.tsx`)  
- **Enhancement**: PDF file type acceptance when feature enabled
- **Security**: Client-side validation with proper MIME type checking

### 3. Universal PDF Viewing
Enhanced all document viewers with browser-native PDF support:

#### Core Document Viewer (`packages/components/src/DocumentViewer/DocumentViewer.tsx`)
- Universal viewer used across OpenCRVS applications
- PDF detection and validation
- Full viewport utilization with responsive design
- Security-hardened URL validation

#### Legacy Preview Modal (`packages/client/src/components/form/DocumentUploadField/DocumentPreview.tsx`)
- Modal preview for document uploads
- Comprehensive PDF detection (type, data URL, file extension)
- Security validation for PDF data URLs

#### V2 Events Preview (`packages/client/src/v2-events/components/forms/inputs/FileInput/DocumentPreview.tsx`)
- Preview component for v2-events form system
- MinIO URL-based PDF viewing
- Enhanced error handling and loading states

### 4. Backend PDF Storage
- **Component**: Documents service (`packages/documents/src/features/uploadDocument/handler.ts`)
- **Enhancement**: Direct PDF storage in MinIO without conversion
- **Optimization**: Removed complex PDF-to-image processing for better performance

### 5. Security Enhancements
Comprehensive security measures across all PDF viewers:

#### XSS Prevention
- URL validation functions preventing malicious PDF URLs
- Validation of both data URLs and HTTP/HTTPS URLs
- Protocol restrictions and file extension verification

#### Error Handling
- Loading states for better user experience
- Graceful fallback with download options when browser can't display PDF
- Comprehensive error messaging for invalid files

#### Input Validation  
- PDF data URL format validation
- MinIO URL security checking
- Click event validation before downloads/navigation

## Technical Architecture

### Configuration Pattern
```typescript
// Dynamic config reading following OpenCRVS patterns
async function isEnhancedDocumentViewerEnabled(): Promise<boolean> {
  const config = await fetchApplicationConfig()
  return config.FEATURES?.ENHANCED_DOCUMENT_VIEWER === true
}
```

### PDF Detection Strategy
```typescript
// Multi-method PDF detection
function isPdfFile(file): boolean {
  return file.type === 'application/pdf' ||
         file.data?.startsWith('data:application/pdf') ||
         file.filename?.toLowerCase().endsWith('.pdf')
}
```

### Security Validation
```typescript
// Comprehensive URL validation
function isValidPdfUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  
  if (url.startsWith('data:application/pdf;base64,')) return true
  
  try {
    const urlObj = new URL(url)
    return (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') &&
           url.toLowerCase().endsWith('.pdf')
  } catch {
    return false
  }
}
```

## File Structure Impact

```
packages/
├── gateway/
│   └── src/utils/
│       ├── validators.ts         # PDF validation logic
│       └── applicationConfig.ts  # Config service integration
├── client/
│   └── src/components/form/DocumentUploadField/
│       ├── DocumentUploaderWithOption.tsx  # Upload component
│       └── DocumentPreview.tsx             # Preview modal
├── client/
│   └── src/v2-events/components/forms/inputs/FileInput/
│       └── DocumentPreview.tsx    # V2 events preview
├── components/
│   └── src/DocumentViewer/
│       └── DocumentViewer.tsx     # Universal viewer
└── documents/
    └── src/features/uploadDocument/
        └── handler.ts             # Backend upload handler
```

## Dependencies Cleaned
- Removed unused `react-pdf` library from client package
- Eliminated unnecessary PDF processing dependencies  
- Cleaned up package-lock.json conflicts with yarn.lock

## Security Considerations
- **XSS Prevention**: All PDF URLs validated before rendering
- **Content Security**: Only allow trusted PDF sources (MinIO, base64 data URLs)
- **Error Boundaries**: Graceful handling of malformed PDF files
- **User Safety**: Validation before downloads and external navigation

## Testing Strategy
1. **Feature Flag Testing**: Verify PDF support enables/disables correctly
2. **Upload Flow**: Test PDF upload through forms with validation
3. **Viewer Testing**: Test all three viewer components with various PDF sources
4. **Security Testing**: Verify URL validation prevents malicious content
5. **Error Scenarios**: Test behavior with corrupted/invalid PDFs

## Performance Optimizations
- **Browser-Native Rendering**: Uses HTML5 `<embed>` for optimal performance
- **No Client Processing**: Eliminated PDF-to-image conversion overhead
- **Lazy Loading**: PDF content loaded on-demand when viewed
- **Efficient Storage**: Direct PDF storage in MinIO without conversion

## Future Enhancements
- **Multi-page Navigation**: Add page controls for complex PDFs
- **Thumbnail Generation**: Optional PDF page thumbnails for better UX
- **Print Support**: Enhanced printing capabilities for PDF documents
- **Accessibility**: Screen reader and keyboard navigation support

## Deployment Notes
1. Enable `ENHANCED_DOCUMENT_VIEWER` feature flag in country configuration
2. No database migrations required
3. MinIO storage automatically handles PDF files
4. Backward compatible with existing image documents
5. All existing uploads remain functional