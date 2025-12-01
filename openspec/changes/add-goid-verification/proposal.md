# Change: Add goID verification flow to birth registration

## Why
- Registrars currently rely on manual data entry or MOSIP integrations; we need a localized goID verification demo that keeps users in the birth form.
- This enables the new "Verify with goID" modal UX and backend orchestration scoped in the integration plan.

## What Changes
- Introduce a modal-based goID verification experience next to existing Search/Link buttons for mother/father sections.
- Gateway service exposes a secure REST endpoint that proxies credentials to the external goID demo service (port 3999) and returns normalized identity payloads.
- Formik-powered client applies returned data directly to registration forms and stores verification status in Formik state.
- Person records are created during normal registration submission flow (not immediately after verification).

## Design Decisions
- **goID Service**: External mock service running on port 3999 (separate from OpenCRVS), backed by Postgres with seed-able demo data
- **Gateway Configuration**: goID endpoint URL configured via gateway env/config (`GOID_SERVICE_URL`), not in countryconfig
- **Countryconfig Role**: Only feature flags (show goID button) and translations; no network endpoints
- **Authentication**: Username-to-data lookup from Postgres (demo users: user1, user2)
- **Verification Status**: Stored in Formik state only (not persisted to MongoDB until registration)
- **Person Records**: Created during registration submit (follows existing flow, not created on verification)
- **Auth Scope**: Uses existing registrar scope (no new scope needed)

## Impact
- Specs: `goid-verification` (new capability for modal verification + backend endpoint)
- Code:
  - Client: birth form modal component, button config in countryconfig
  - Gateway: `/api/goid/verify` proxy endpoint
  - External: goID demo service (port 3999)
  - Docs: INTEGRATION_PLAN update
