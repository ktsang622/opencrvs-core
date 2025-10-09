# Certificate Service Architecture Proposal

## Current Architecture (Unnecessary Hop)

```
┌─────────┐
│ Client  │
└────┬────┘
     │ POST /certificates/toppan/print
     ↓
┌─────────────┐
│   Gateway   │ (just proxies)
└─────┬───────┘
      │
      ↓
┌──────────────┐
│ Countryconfig│ (toppan-print-handler-v2.ts)
│              │ - Fetches GraphQL data from Gateway (HTTP back to gateway!)
│              │ - Resolves locations via Gateway API
│              │ - Transforms to DTO
└──────┬───────┘
       │
       ↓
┌─────────────────────┐
│ Certificate Service │ (C#/.NET)
│                     │ - Generates PDF
└─────────────────────┘
```

**Problems**:
1. **Unnecessary hop**: Gateway → Countryconfig → Gateway (for GraphQL data)
2. **Circular dependency**: Countryconfig calls back to Gateway for GraphQL queries
3. **Config vs Logic**: Countryconfig has business logic, not just config

## Proposed Architecture (Cleaner)

```
┌─────────┐
│ Client  │
└────┬────┘
     │ GraphQL mutation: generateCertificate(compositionId, eventType)
     ↓
┌──────────────────────┐
│      Gateway         │
│ - Certificate handler│
│ - Fetches data via   │
│   GraphQL resolvers  │ ← No HTTP calls, direct resolver access!
│ - Fetches config from│───┐
│   countryconfig      │   │ GET /certificate-config
│ - Transforms to DTO  │   │
└──────┬───────────────┘   │
       │                   │
       │                   ↓
       │            ┌──────────────┐
       │            │Countryconfig │ (Config only!)
       │            │ - Templates  │
       │            │ - Settings   │
       │            │ - Feature    │
       │            │   flags      │
       │            └──────────────┘
       ↓
┌─────────────────────┐
│ Certificate Service │ (C#/.NET)
│                     │ - Generates PDF
└─────────────────────┘
```

## Implementation Changes

### 1. Move Handler to Gateway

**File**: `packages/gateway/src/features/certificate/root-resolvers.ts`

```typescript
export const resolvers = {
  Mutation: {
    generateCertificate: async (_, { compositionId, eventType }, context) => {
      // 1. Fetch config from countryconfig
      const config = await fetch(`${COUNTRY_CONFIG_URL}/certificate-config`)

      // 2. Fetch registration data using GraphQL resolvers (NO HTTP!)
      const data = await context.dataSources.registration.fetchById(compositionId)

      // 3. Resolve locations using GraphQL resolvers (NO HTTP!)
      const resolvedData = await resolveLocations(data, context)

      // 4. Transform using config
      const dto = transformToCertificateRequest(resolvedData, eventType, config)

      // 5. Call certificate-service
      const pdf = await fetch(`${CERTIFICATE_SERVICE_URL}/generate`, {
        method: 'POST',
        body: JSON.stringify(dto)
      })

      return pdf
    }
  }
}
```

### 2. Countryconfig: Config Only

**File**: `opencrvs-countryconfig/src/api/certificates/config.ts`

```typescript
export function certificateConfigHandler(request: Request, h: ResponseToolkit) {
  return {
    // Country-specific configuration
    addressFormat: 'parish-district-state',
    locationHierarchy: ['parish', 'district', 'state'],
    amendmentTypes: {
      child: 'BirthNameAndParticularsChanged',
      mother: 'MothersNameAndParticularsChanged',
      father: 'FathersNameAndParticularsChanged'
    },
    templates: {
      birth: 'antigua-birth-v1',
      death: 'antigua-death-v1',
      marriage: 'antigua-marriage-v1'
    }
  }
}
```

## Benefits

### 1. **No Circular Dependencies**
- Gateway doesn't call countryconfig which calls back to gateway
- Clean unidirectional flow: Client → Gateway → Certificate Service

### 2. **Direct GraphQL Access**
- Handler can use GraphQL resolvers directly via `context`
- No HTTP overhead for data fetching
- Can leverage existing DataSources and resolvers

### 3. **True Config Separation**
- Countryconfig = configuration only
- Gateway = API logic
- Certificate Service = PDF generation

### 4. **Better Performance**
- Fewer HTTP hops
- Can use GraphQL batching/caching
- Single request path

### 5. **Easier Testing**
- Gateway handler can mock GraphQL context
- No need to mock HTTP calls between services
- Config is simple JSON

## Migration Path

### Phase 1: Add Config Endpoint
1. Add `/certificate-config` endpoint in countryconfig
2. Return country-specific settings as JSON

### Phase 2: Create Gateway Handler
1. Create `gateway/src/features/certificate/`
2. Add GraphQL mutation `generateCertificate`
3. Implement handler using GraphQL context
4. Fetch config from countryconfig

### Phase 3: Switch Over
1. Update client to use new GraphQL mutation
2. Remove old countryconfig handler
3. Remove old REST endpoint

## Backward Compatibility

Keep both during migration:
- Old: `POST /certificates/toppan/print` (countryconfig handler)
- New: GraphQL mutation `generateCertificate` (gateway resolver)

Use feature flag to switch between them.

## Conclusion

This architecture follows OpenCRVS patterns better:
- **Gateway**: Business logic, GraphQL API
- **Countryconfig**: Configuration data
- **Services**: Specialized microservices

Current implementation works but has an unnecessary hop. Proposed architecture is cleaner and more performant.
