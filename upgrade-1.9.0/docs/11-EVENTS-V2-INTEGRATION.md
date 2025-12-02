# Events V2 Integration Guide

## Overview

OpenCRVS 1.9.0 introduces **Events V2**, a completely new architecture for defining and managing civil registration events. This is the **most significant change** affecting Toppan customizations and is critical for adding custom events.

**Key Insight:** Events V2 provides a way to define custom events (beyond birth/death) using configuration rather than code changes.

---

## Events V2 Architecture

### Core Concepts

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Events V2 System                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│   │   Event     │───▶│   Actions   │───▶│   Forms     │            │
│   │   Config    │    │   (Flow)    │    │   (Pages)   │            │
│   └─────────────┘    └─────────────┘    └─────────────┘            │
│         │                  │                  │                     │
│         ▼                  ▼                  ▼                     │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│   │  id, title  │    │  DECLARE    │    │  FieldConfig│            │
│   │  label,     │    │  VALIDATE   │    │  (30+ types)│            │
│   │  summary    │    │  REGISTER   │    │             │            │
│   └─────────────┘    └─────────────┘    └─────────────┘            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Action Flow (State Machine)

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌────────────┐
│ CREATE  │────▶│ DECLARE  │────▶│ VALIDATE │────▶│  REGISTER  │
└─────────┘     └──────────┘     └──────────┘     └────────────┘
                     │                │                  │
                     ▼                ▼                  ▼
               ┌──────────┐    ┌──────────┐    ┌────────────────┐
               │  REJECT  │    │ ARCHIVE  │    │ PRINT_CERT     │
               └──────────┘    └──────────┘    │ REQUEST_CORR   │
                                               └────────────────┘
```

---

## Key Files in 1.9.x

| File | Purpose |
|------|---------|
| `packages/commons/src/events/EventConfig.ts` | Event configuration schema |
| `packages/commons/src/events/EventConfigInput.ts` | Helper functions for defining events |
| `packages/commons/src/events/defineConfig.ts` | `defineConfig()` function |
| `packages/commons/src/events/FieldConfig.ts` | All 30+ field type schemas |
| `packages/commons/src/events/FieldType.ts` | Field type enum |
| `packages/commons/src/events/ActionConfig.ts` | Action configuration (DECLARE, VALIDATE, etc.) |
| `packages/commons/src/events/PageConfig.ts` | Page configuration |
| `packages/commons/src/events/FormConfig.ts` | Form configuration |
| `packages/commons/src/events/scopes.ts` | New scope system (ACTION_SCOPE_MAP) |
| `packages/toolkit/src/events/index.ts` | Re-exports from @opencrvs/commons/events |

---

## Defining a Custom Event

### Basic Structure

```typescript
import { defineConfig } from '@opencrvs/commons/events/defineConfig'
import { defineDeclarationForm, defineFormPage } from '@opencrvs/commons/events/EventConfigInput'
import { FieldType } from '@opencrvs/commons/events/FieldType'
import { ActionType } from '@opencrvs/commons/events/ActionType'

// 1. Define form pages
const applicantPage = defineFormPage({
  id: 'applicant',
  type: 'FORM',
  title: {
    id: 'event.custom.page.applicant.title',
    defaultMessage: 'Applicant Details',
    description: 'Title for the applicant page'
  },
  fields: [
    {
      id: 'applicant.name',
      type: FieldType.NAME,
      required: true,
      label: { id: 'label.name', defaultMessage: 'Name', description: '' }
    },
    {
      id: 'applicant.dob',
      type: FieldType.DATE,
      required: true,
      label: { id: 'label.dob', defaultMessage: 'Date of Birth', description: '' }
    }
  ]
})

// 2. Define the declaration form
const customForm = defineDeclarationForm({
  label: {
    id: 'event.custom.form.label',
    defaultMessage: 'Custom Event Application',
    description: ''
  },
  pages: [applicantPage]
})

// 3. Define review configuration
const reviewConfig = {
  title: { id: 'review.title', defaultMessage: 'Review Application', description: '' },
  fields: [
    {
      id: 'review.comment',
      type: FieldType.TEXTAREA,
      label: { id: 'label.comment', defaultMessage: 'Comment', description: '' },
      required: true
    }
  ]
}

// 4. Define the complete event
export const customEvent = defineConfig({
  id: 'custom-event',
  label: {
    id: 'event.custom.label',
    defaultMessage: 'Custom Event',
    description: ''
  },
  title: {
    id: 'event.custom.title',
    defaultMessage: '{applicant.name.firstname} {applicant.name.surname}',
    description: ''
  },
  summary: { fields: [] },
  declaration: customForm,
  actions: [
    {
      type: ActionType.READ,
      label: { id: 'action.read', defaultMessage: 'Read', description: '' },
      review: reviewConfig
    },
    {
      type: ActionType.DECLARE,
      label: { id: 'action.declare', defaultMessage: 'Declare', description: '' },
      review: reviewConfig
    },
    {
      type: ActionType.VALIDATE,
      label: { id: 'action.validate', defaultMessage: 'Validate', description: '' },
      review: reviewConfig
    },
    {
      type: ActionType.REGISTER,
      label: { id: 'action.register', defaultMessage: 'Register', description: '' },
      review: reviewConfig
    }
  ],
  advancedSearch: []
})
```

---

## Built-in Field Types (30+)

Events V2 supports these field types out of the box:

| Field Type | Description | Use Case |
|------------|-------------|----------|
| `TEXT` | Single-line text | Names, IDs |
| `TEXTAREA` | Multi-line text | Comments |
| `NUMBER` | Numeric input | Ages, quantities |
| `DATE` | Date picker | DOB, event dates |
| `TIME` | Time picker | Time of event |
| `EMAIL` | Email input | Contact info |
| `PHONE` | Phone number | Contact info |
| `NAME` | Structured name (first/last) | Person names |
| `ID` | ID number | National ID |
| `ADDRESS` | Full address | Locations |
| `SELECT` | Dropdown | Options |
| `RADIO_GROUP` | Radio buttons | Single choice |
| `CHECKBOX` | Checkboxes | Multiple choice |
| `FILE` | File upload | Documents |
| `FILE_WITH_OPTIONS` | File with metadata | Categorized uploads |
| `SIGNATURE` | Signature capture | Approvals |
| `COUNTRY` | Country selector | Nationality |
| `LOCATION` | Location picker | Places |
| `ADMINISTRATIVE_AREA` | Admin area | Districts |
| `FACILITY` | Facility selector | Hospitals |
| `OFFICE` | Office selector | Registration offices |
| `PARAGRAPH` | Display text | Instructions |
| `PAGE_HEADER` | Section header | Organization |
| `BULLET_LIST` | Bullet points | Lists |
| `DIVIDER` | Visual separator | Layout |
| `BUTTON` | Generic button | Actions |
| `HTTP` | HTTP request field | **External API calls** |
| `SEARCH` | Search field | Lookups |
| `QR_READER` | QR code scanner | Scanning |
| `ID_READER` | ID card reader | Document scanning |
| `LOADER` | Loading indicator | Async operations |

---

## HTTP Field - Key for goID Integration

The **HTTP field type** is critical for goID integration. It allows making external API calls from form fields:

```typescript
// Example: HTTP field for external API verification
{
  id: 'verification.result',
  type: FieldType.HTTP,
  label: { id: 'label.verification', defaultMessage: 'Verification Result', description: '' },
  configuration: {
    trigger: { $$field: 'verification.button' },  // Reference to trigger field
    url: 'https://api.example.com/verify',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { nationalId: { $$field: 'person.nid' } },
    params: {
      id: { $$field: 'person.nid' }
    },
    timeout: 15000,
    errorValue: { status: 'error', message: 'Verification failed' }
  }
}
```

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `trigger` | `FieldReference` | Field that triggers the HTTP call |
| `url` | `string` | API endpoint URL |
| `method` | `GET\|POST\|PUT\|DELETE` | HTTP method |
| `headers` | `Record<string, string>` | Request headers |
| `body` | `Record<string, any>` | Request body |
| `params` | `Record<string, string\|FieldReference>` | URL/body params |
| `timeout` | `number` | Request timeout (ms) |
| `errorValue` | `any` | Value on error |

---

## Impact on Toppan Custom Field Types

### Current Custom Field Types (1.8.2)

| Field Type | Location | Purpose |
|------------|----------|---------|
| `GOID_VERIFY_BUTTON` | countryconfig | goID verification |
| `EXT_LOOKUP_BUTTON` | countryconfig | External lookup |
| `PERSON_PICKER` | countryconfig | Family member selection |

### Migration Options

#### Option 1: Use HTTP Field (Recommended)

Replace `GOID_VERIFY_BUTTON` with the built-in `HTTP` field type:

```typescript
// BEFORE (1.8.2) - Custom field type
{
  name: 'goIdVerifyMother',
  type: 'GOID_VERIFY_BUTTON',
  label: { defaultMessage: 'Verify Mother', ... },
  goidVerifyConfig: {
    endpoint: '/goid/verify',
    personFields: { ... }
  }
}

// AFTER (1.9.x) - Using HTTP field
{
  id: 'mother.verification.trigger',
  type: FieldType.BUTTON,
  label: { id: 'button.verify', defaultMessage: 'Verify with goID', description: '' },
  configuration: {
    text: { id: 'button.text', defaultMessage: 'Verify', description: '' }
  }
},
{
  id: 'mother.verification.result',
  type: FieldType.HTTP,
  label: { id: 'label.result', defaultMessage: 'Verification Result', description: '' },
  configuration: {
    trigger: { $$field: 'mother.verification.trigger' },
    url: '/api/goid/verify',
    method: 'POST',
    body: {
      firstName: { $$field: 'mother.name.firstname' },
      lastName: { $$field: 'mother.name.surname' },
      dob: { $$field: 'mother.dob' },
      nationalId: { $$field: 'mother.nid' }
    },
    timeout: 30000
  }
}
```

#### Option 2: Add Custom Field Type to Core

If HTTP field doesn't meet requirements, add custom field type to core:

**1. Add to FieldType enum** (`packages/commons/src/events/FieldType.ts`):

```typescript
export const FieldType = {
  // ... existing types
  GOID_VERIFY_BUTTON: 'GOID_VERIFY_BUTTON',
  PERSON_PICKER: 'PERSON_PICKER',
  EXT_LOOKUP_BUTTON: 'EXT_LOOKUP_BUTTON'
} as const
```

**2. Define field schema** (`packages/commons/src/events/FieldConfig.ts`):

```typescript
const GoIdVerifyButton = BaseField.extend({
  type: z.literal(FieldType.GOID_VERIFY_BUTTON),
  configuration: z.object({
    endpoint: z.string(),
    personFields: z.object({
      firstName: FieldReference,
      lastName: FieldReference,
      dob: FieldReference,
      nationalId: FieldReference.optional()
    }),
    buttonText: TranslationConfig
  })
}).describe('GoID verification button')
```

**3. Add to discriminatedUnion**:

```typescript
export const FieldConfig = z.discriminatedUnion('type', [
  // ... existing fields
  GoIdVerifyButton,
  PersonPickerField,
  ExtLookupButton
])
```

**4. Add client-side component**:

```typescript
// packages/client/src/v2-events/fields/GoIdVerifyButton.tsx
export function GoIdVerifyButton({ field }: { field: GoIdVerifyButtonField }) {
  // Render verification button and handle click
}
```

---

## New Scope System

### Old Scopes (1.8.2) → New Scopes (1.9.x)

| Old Scope | New Scope Pattern | Notes |
|-----------|-------------------|-------|
| `CERTIFY` | `record.registered.print-certified-copies` | Event-specific |
| `DECLARE` | `record.declare` | Event-specific |
| `VALIDATE` | `record.declared.validate` | Event-specific |
| `REGISTER` | `record.register` | Event-specific |
| `SYSADMIN` | Role-based | Different system |

### ACTION_SCOPE_MAP

```typescript
// packages/commons/src/events/scopes.ts

export const ACTION_SCOPE_MAP = {
  [ActionType.READ]: ['record.read'],
  [ActionType.CREATE]: ['record.create'],
  [ActionType.DECLARE]: ['record.declare', 'record.declared.validate', 'record.register'],
  [ActionType.VALIDATE]: ['record.declared.validate', 'record.register'],
  [ActionType.REGISTER]: ['record.register'],
  [ActionType.PRINT_CERTIFICATE]: ['record.registered.print-certified-copies'],
  [ActionType.REQUEST_CORRECTION]: ['record.registered.request-correction', 'record.registered.correct'],
  // ... more actions
}
```

### Impact on Certificate Service

**Current code:**
```typescript
// packages/gateway/src/features/toppan/certificate.ts
options: {
  auth: {
    strategy: 'jwt',
    scope: ['CERTIFY']  // ❌ REMOVED
  }
}
```

**Updated code:**
```typescript
options: {
  auth: {
    strategy: 'jwt',
    scope: ['record.registered.print-certified-copies']  // ✅ New scope
  }
}
```

---

## Translation System

Events V2 uses the `TranslationConfig` type for all labels:

```typescript
type TranslationConfig = {
  id: string              // Message ID for i18n
  defaultMessage: string  // Fallback message
  description: string     // Context for translators
}
```

Example:
```typescript
{
  label: {
    id: 'event.birth.field.child.name',
    defaultMessage: "Child's name",
    description: 'Label for the child name field in birth registration'
  }
}
```

---

## Conditional Fields

Events V2 uses a new conditional system:

```typescript
import { createFieldConditionals } from '@opencrvs/commons/conditionals/conditionals'

{
  id: 'mother.nid',
  type: FieldType.ID,
  conditionals: [
    {
      type: 'SHOW',
      conditional: createFieldConditionals('mother.idType').isEqualTo('NID')
    }
  ]
}
```

### Conditional Types

| Type | Description |
|------|-------------|
| `SHOW` | Show field when condition is true |
| `HIDE` | Hide field when condition is true |
| `REQUIRED` | Make required when condition is true |

---

## Field References

Events V2 uses `FieldReference` to reference other fields:

```typescript
const FieldReference = z.object({
  $$field: z.string()  // Reference to field ID
})

// Example usage
{
  trigger: { $$field: 'verification.button' },
  body: {
    name: { $$field: 'person.name.firstname' }
  }
}
```

---

## Migration Checklist for Events V2

### 1. Update Form Definitions

- [ ] Replace old form structure with `defineDeclarationForm()`
- [ ] Use `defineFormPage()` for each page
- [ ] Use `FieldType` enum for field types
- [ ] Add `TranslationConfig` for all labels

### 2. Handle Custom Field Types

- [ ] Evaluate if `HTTP` field can replace `GOID_VERIFY_BUTTON`
- [ ] Evaluate if `SEARCH` field can replace `PERSON_PICKER`
- [ ] If needed, add custom field types to core

### 3. Update Scopes

- [ ] Replace `CERTIFY` with `record.registered.print-certified-copies`
- [ ] Update all endpoint auth configurations
- [ ] Test all protected endpoints

### 4. Update Actions

- [ ] Define proper action flow (DECLARE → VALIDATE → REGISTER)
- [ ] Configure review pages for each action
- [ ] Add deduplication config if needed

### 5. Test Integration

- [ ] Test form rendering with new field types
- [ ] Test HTTP fields for external API calls
- [ ] Test conditional field display
- [ ] Test complete registration workflow

---

## Example: goID Verification in Events V2

### Complete Implementation

```typescript
import { defineConfig } from '@opencrvs/commons/events/defineConfig'
import { defineDeclarationForm, defineFormPage } from '@opencrvs/commons/events/EventConfigInput'
import { FieldType } from '@opencrvs/commons/events/FieldType'
import { ActionType } from '@opencrvs/commons/events/ActionType'

const motherPage = defineFormPage({
  id: 'mother',
  type: 'FORM',
  title: {
    id: 'page.mother.title',
    defaultMessage: "Mother's Details",
    description: ''
  },
  fields: [
    // Mother's name
    {
      id: 'mother.name',
      type: FieldType.NAME,
      required: true,
      label: { id: 'field.mother.name', defaultMessage: "Mother's Name", description: '' }
    },
    // Mother's DOB
    {
      id: 'mother.dob',
      type: FieldType.DATE,
      required: true,
      label: { id: 'field.mother.dob', defaultMessage: 'Date of Birth', description: '' }
    },
    // Mother's National ID
    {
      id: 'mother.nid',
      type: FieldType.ID,
      required: true,
      label: { id: 'field.mother.nid', defaultMessage: 'National ID', description: '' }
    },
    // Verification Button (triggers HTTP request)
    {
      id: 'mother.verify.button',
      type: FieldType.BUTTON,
      label: { id: 'field.verify.button', defaultMessage: 'Verify with goID', description: '' },
      configuration: {
        text: { id: 'button.verify', defaultMessage: 'Verify Identity', description: '' },
        icon: 'CheckCircle'
      }
    },
    // HTTP Field (performs verification)
    {
      id: 'mother.verify.result',
      type: FieldType.HTTP,
      label: { id: 'field.verify.result', defaultMessage: 'Verification Status', description: '' },
      configuration: {
        trigger: { $$field: 'mother.verify.button' },
        url: '/api/goid/verify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          firstName: { $$field: 'mother.name.firstname' },
          lastName: { $$field: 'mother.name.surname' },
          dateOfBirth: { $$field: 'mother.dob' },
          nationalId: { $$field: 'mother.nid' }
        },
        timeout: 30000,
        errorValue: {
          verified: false,
          error: 'Verification service unavailable'
        }
      }
    },
    // Display verification status
    {
      id: 'mother.verify.status',
      type: FieldType.PARAGRAPH,
      label: { id: 'field.status', defaultMessage: '', description: '' },
      configuration: {
        text: {
          id: 'status.text',
          defaultMessage: 'Verification: {mother.verify.result.verified}',
          description: ''
        }
      }
    }
  ]
})

// Define complete birth event with goID integration
export const birthEventWithGoID = defineConfig({
  id: 'birth',
  label: { id: 'event.birth', defaultMessage: 'Birth', description: '' },
  title: { id: 'event.birth.title', defaultMessage: '{child.name.firstname} {child.name.surname}', description: '' },
  summary: { fields: [] },
  declaration: defineDeclarationForm({
    label: { id: 'form.birth', defaultMessage: 'Birth Declaration', description: '' },
    pages: [childPage, motherPage, fatherPage]
  }),
  actions: [
    // ... actions configuration
  ]
})
```

---

## Recommendations

### For goID Integration

1. **Primary approach**: Use `HTTP` field type with `BUTTON` trigger
2. **Benefits**: No core changes required, fully configurable
3. **Fallback**: Add custom field type if HTTP doesn't meet UX requirements

### For Person Picker

1. **Evaluate `SEARCH` field**: May cover basic person search
2. **If complex UI needed**: Add `PERSON_PICKER` as custom field type

### For Certificate Service

1. **Immediate**: Update scope from `CERTIFY` to `record.registered.print-certified-copies`
2. **Test**: Verify auth flow works with new scope

---

## Resources

- Events V2 fixtures: `packages/commons/src/fixtures/v2-birth-event.ts`
- Library membership example: `packages/commons/src/fixtures/library-membership-event.ts`
- Field configurations: `packages/commons/src/events/FieldConfig.ts`
- Scope mappings: `packages/commons/src/events/scopes.ts`
