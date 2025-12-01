## ADDED Requirements

### Requirement: Modal-based goID verification in birth registration
The system SHALL render a "Verify with goID" action next to the existing Search/Link controls for mother and father sections.
Selecting the action opens a modal that gathers goID credentials (username + password), calls the gateway endpoint, displays a consent screen with the returned person data, and on approval applies the data directly to the Formik draft. Verification status is stored in Formik state only (not persisted to MongoDB until the registration is submitted). Person records are created during the normal registration submission flow.

#### Scenario: Successful verification populates mother form
- **GIVEN** a registrar editing a birth draft with mother details required
- **WHEN** they click "Verify with goID", authenticate, and approve the returned data
- **THEN** the modal closes, mother fields (names, DOB, nationality, ID info) are populated from goID
- **AND** the draft stores `motherVerificationStatus = 'goid'` so the UI can show a verified indicator

#### Scenario: Registrar cancels before approval
- **GIVEN** the modal is open
- **WHEN** the registrar cancels or denies consent
- **THEN** no form fields are modified
- **AND** the draft records no goID verification metadata

### Requirement: Gateway goID verification endpoint
The gateway SHALL expose a secured REST endpoint at `/api/goid/verify` that accepts goID credentials (username, password), validates existing registrar auth scope, proxies the request to the external goID service, and returns a normalized person payload (names, DOB, nationality, NID). The goID service URL is configured via gateway environment variable (`GOID_SERVICE_URL`). The mock goID demo service is backed by Postgres with seed-able demo data (e.g., user1 returns Jane Doe, user2 returns John Smith). Failures must surface descriptive errors to the client.

#### Scenario: Happy path returns normalized payload
- **GIVEN** a registrar with valid auth token (existing registrar scope)
- **WHEN** the client POSTs to `/api/goid/verify` with valid goID credentials
- **THEN** the gateway proxies to goID service and responds `200` with normalized person attributes (firstNames, familyName, birthDate, nationality, nationalId)

#### Scenario: Invalid credentials
- **GIVEN** incorrect goID credentials
- **WHEN** the gateway relays them
- **THEN** it returns `401 Unauthorized` (or mapped error) and logs the attempt without mutating the draft
