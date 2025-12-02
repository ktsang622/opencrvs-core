# goID Integration

## Overview

goID is an identity verification service that allows form fields to be auto-populated by verifying a person's credentials against an external identity database.

## Feature Summary

- **Purpose:** Verify person identity and auto-populate form fields
- **Trigger:** Button click in birth registration form (mother/father sections)
- **Flow:** Modal dialog → Enter credentials → Verify → Auto-fill fields
- **Feature Flag:** `GOID_ENABLED` in client-config.js (disabled by default)

---

## Commits

| Commit | Description |
|--------|-------------|
| `bc957da899` | feat(client): Add goID verification button component |
| `172e59862c` | feat(gateway): Add goID verification endpoint |
| `253a15b9ae` | feat: Add goID verification OpenSpec proposal and Safari date fix |

---

## Files Changed

### packages/gateway

#### New Files
- `src/features/goid/handler.ts` - API handler for verification
- `src/features/goid/index.ts` - Route definitions

#### Modified Files
- `src/config/routes.ts` - Register goid routes
- `src/constants.ts` - Add GOID_SERVICE_URL constant
- `src/environment.ts` - Add GOID_SERVICE_URL env var

### packages/client

#### New Files
- `src/components/form/GoIDVerifyButton.tsx` - Modal component (448 lines)

#### Modified Files
- `src/components/form/FormFieldGenerator.tsx` - Add GOID_VERIFY_BUTTON case
- `src/forms/index.ts` - Export goID types
- `typings/window.d.ts` - Add GOID_ENABLED to window.config

### packages/config
- `src/handlers/forms/field.ts` - Add GoIDVerifyButtonField Zod schema

### packages/components
- `src/DateField/DateField.tsx` - Safari date format fix (leading zeros)

---

## API Endpoint

### POST /api/goid/verify

**Request:**
```json
{
  "username": "user1",
  "password": "pass1"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "firstNames": "Jane",
    "familyName": "Doe",
    "gender": "female",
    "birthDate": "1990-05-15",
    "nationality": "ATG",
    "idType": "NATIONAL_ID",
    "idNumber": "1234567890"
  }
}
```

**Response (Failure):**
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

---

## Client Configuration

### client-config.js (Development)
```javascript
FEATURES: {
  GOID_ENABLED: true
}
```

### client-config.prod.js (Production)
```javascript
FEATURES: {
  GOID_ENABLED: true
}
```

---

## Form Configuration (countryconfig)

Add to birth form mother/father sections:

```typescript
{
  name: 'goIdVerifyMother',
  type: 'GOID_VERIFY_BUTTON',
  label: {
    defaultMessage: 'Verify with goID',
    id: 'form.field.label.goIdVerify'
  },
  initialValue: '',
  validator: [],
  conditionals: [
    {
      action: 'hide',
      expression: 'values.searchPersonId !== undefined'
    }
  ]
}
```

---

## Component Architecture

### GoIDVerifyButton.tsx

```
┌─────────────────────────────────────────┐
│           GoIDVerifyButton              │
│  ┌───────────────────────────────────┐  │
│  │    Step 1: Credentials Input      │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  Username: [____________]   │  │  │
│  │  │  Password: [____________]   │  │  │
│  │  │  [Cancel]      [Verify]     │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
│                    ↓                    │
│  ┌───────────────────────────────────┐  │
│  │    Step 2: Preview & Confirm      │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  Name: Jane Doe             │  │  │
│  │  │  DOB: 1990-05-15            │  │  │
│  │  │  Gender: Female             │  │  │
│  │  │  National ID: 1234567890    │  │  │
│  │  │  [Back]       [Apply Data]  │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## Migration Steps

### 1. Gateway Changes

```bash
# Copy new files
cp packages/gateway/src/features/goid/handler.ts <target>
cp packages/gateway/src/features/goid/index.ts <target>

# Apply patches to existing files
git diff 172e59862c~1..172e59862c -- packages/gateway/src/config/routes.ts
git diff 172e59862c~1..172e59862c -- packages/gateway/src/constants.ts
git diff 172e59862c~1..172e59862c -- packages/gateway/src/environment.ts
```

### 2. Client Changes

```bash
# Copy new component
cp packages/client/src/components/form/GoIDVerifyButton.tsx <target>

# Apply patches
git diff bc957da899~1..bc957da899 -- packages/client/src/components/form/FormFieldGenerator.tsx
git diff bc957da899~1..bc957da899 -- packages/client/src/forms/index.ts
```

### 3. Config Changes

```bash
git diff bc957da899~1..bc957da899 -- packages/config/src/handlers/forms/field.ts
```

---

## Dependencies

- External goID demo service running on port 3999
- PostgreSQL database with persons table
- Feature flag enabled in client-config

---

## Testing

1. Start goID demo service:
   ```bash
   cd /home/ktsang/goid-demo
   DATABASE_URL=postgresql://... npm run dev
   ```

2. Enable feature flag in client-config.js

3. Navigate to birth registration form

4. Click "Verify with goID" button in mother/father section

5. Enter test credentials: user1/pass1

6. Verify data is populated in form fields
