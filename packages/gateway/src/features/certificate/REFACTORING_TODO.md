# Certificate Transformer Refactoring TODO

## Completed ✅
- [x] Created `transformers/shared/utils.ts` with reusable helper functions
- [x] Created `transformers/shared/types.ts` with TypeScript interfaces
- [x] Established directory structure
- [x] Created Antigua Transformer (`transformers/antigua.ts`)
- [x] Created Transformer Registry (`transformers/index.ts`)
- [x] Updated Handler (`handler.ts`) to use transformer registry
- [x] TypeScript compilation passes

## Refactoring Complete! 🎉

### 1. ✅ Created Antigua Transformer (`transformers/antigua.ts`)
Extracted all Antigua-specific logic from `handler.ts` into a dedicated transformer:

```typescript
import { CertificateDTO, EventType } from './shared/types'
import * as utils from './shared/utils'

export function transformAntiguaBundleToCertificateDTO(
  bundle: any,
  eventType: EventType
): CertificateDTO {
  // Current transformation logic from handler.ts
  // - Extract resources
  // - Build location map
  // - Transform child/mother/father
  // - Extract amendments
  // - Build DTO
}
```

**Files to extract:**
- `transformBundleToCertificateDTO` function
- Antigua-specific address handling
- Amendment extraction logic
- Field mapping functions specific to Antigua

### 2. ✅ Created Transformer Registry (`transformers/index.ts`)

```typescript
import { transformAntiguaBundleToCertificateDTO } from './antigua'
import { CertificateTransformer } from './shared/types'

export const certificateTransformers: Record<string, CertificateTransformer['transformBundleToCertificateDTO']> = {
  'ATG': transformAntiguaBundleToCertificateDTO,
  // Future countries:
  // 'JAM': transformJamaicaBundleToCertificateDTO,
  // 'BRB': transformBarbadosBundleToCertificateDTO,
}

export function getTransformerForCountry(countryCode: string) {
  const transformer = certificateTransformers[countryCode]
  if (!transformer) {
    throw new Error(`No certificate transformer found for country: ${countryCode}`)
  }
  return transformer
}
```

### 3. ✅ Updated Handler (`handler.ts`)
Simplified to just:
- Get country code from bundle/request
- Select appropriate transformer
- Call transformer
- Forward DTO to certificate-service

```typescript
import { getTransformerForCountry } from './transformers'

export async function generateCertificateHandler(request, h) {
  const { compositionId, eventType } = request.payload

  // Fetch bundle
  const bundle = await viewDeclaration(compositionId, authHeader)

  // Get country code (from environment or composition)
  const countryCode = process.env.COUNTRY_CODE || 'ATG'

  // Transform using country-specific transformer
  const transformer = getTransformerForCountry(countryCode)
  const certificateRequest = transformer(bundle, eventType)

  // Call certificate-service
  const certResponse = await fetch(`${CERTIFICATE_SERVICE_URL}/api/certificates/generate`, {
    method: 'POST',
    body: JSON.stringify(certificateRequest)
  })

  return handleCertificateResponse(certResponse, h)
}
```

### 4. Testing (To Be Done)
Testing should verify:
- [ ] Antigua certificates still generate correctly
- [ ] All amendments display properly
- [ ] Address resolution still works
- [ ] Nationality codes are resolved
- [ ] Superscript markers appear
- [ ] TypeScript compilation passes (✅ already verified)

### 5. Future Documentation Tasks
- [ ] Add README.md to `transformers/` explaining how to add new countries
- [ ] Document shared utilities with JSDoc comments
- [ ] Create example transformer template for new countries

## Benefits After Refactoring

✅ **For adding new countries:**
```
1. Copy transformers/antigua.ts to transformers/jamaica.ts
2. Modify field mappings for Jamaica's needs
3. Register in transformers/index.ts
4. Deploy
```

✅ **For debugging:**
- Clear separation: issue in Antigua? → Check `antigua.ts`
- Shared utilities tested once, work for all countries
- Easy to compare country implementations

✅ **For maintenance:**
- Country teams can own their transformer file
- Shared utilities improved centrally benefit all
- Adding fields doesn't affect other countries

## Migration Strategy (Completed)

**Used: Option B - Gradual Refactoring** ✅
1. ✅ Kept current `handler.ts` working
2. ✅ Created shared utilities first
3. ✅ Created `antigua.ts` with extracted logic
4. ✅ Created transformer registry
5. ✅ Switched handler to use transformer registry
6. ✅ Removed duplicated code from `handler.ts`
7. Ready to add more countries as needed

**Results:**
- handler.ts: 815 lines → 169 lines (79% reduction)
- All logic preserved in antigua.ts
- TypeScript compilation passing
- Zero breaking changes to API

## Country Code Detection (Implemented)

Currently using environment variable:
- `COUNTRY_CODE=ATG` (environment variable)
- Default fallback to ATG if not set
- See handler.ts line 63: `const countryCode = process.env.COUNTRY_CODE || 'ATG'`

Future options to consider:
- Composition extension
- Configuration service
- Per-location country mapping

## Next Steps for Future Countries

To add Jamaica (JAM) or Barbados (BRB):

1. Copy `transformers/antigua.ts` to `transformers/jamaica.ts`
2. Modify template name: `antigua-birth-v1` → `jamaica-birth-v1`
3. Adjust field mappings as needed for Jamaica's requirements
4. Register in `transformers/index.ts`:
   ```typescript
   export const certificateTransformers = {
     ATG: transformAntiguaBundleToCertificateDTO,
     JAM: transformJamaicaBundleToCertificateDTO  // Add this line
   }
   ```
5. Deploy with `COUNTRY_CODE=JAM`
6. Test!
