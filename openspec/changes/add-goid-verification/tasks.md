## 1. goID Demo Service (External)
- [ ] Create Node/Express app at `/home/ktsang/goid-demo/`
- [ ] Set up Postgres database for mock identity data
- [ ] Create schema: `persons` table (username, password_hash, first_name, family_name, gender, dob, nationality, national_id)
- [ ] Add SQL seed script with demo users:
  - `user1` / `pass1` → Jane Doe (female, DOB 1990-05-15, NID 123456789)
  - `user2` / `pass2` → John Smith (male, DOB 1985-08-22, NID 987654321)
- [ ] Implement `POST /verify` endpoint accepting `{ username, password }`
- [ ] Query Postgres to validate credentials and return person data
- [ ] Add CORS support for local development
- [ ] Create `package.json` with start script (port 3999)
- [ ] Add docker-compose.yml for Postgres + app
- [ ] Document setup and demo credentials in README

## 2. Gateway Backend
- [ ] Add `GOID_SERVICE_URL` to gateway config (`packages/gateway/src/config.ts`)
- [ ] Add env variable to `.env` template (default: `http://localhost:3999`)
- [ ] Add `/api/goid/verify` route in gateway routes config
- [ ] Implement handler that:
  - Validates registrar auth token (existing scope)
  - Reads goID URL from gateway config
  - Proxies request to goID service `/verify` endpoint
  - Normalizes response to standard person format
  - Returns error responses for invalid credentials

## 3. Client - Button Configuration
- [ ] Add `createGoIDVerifyButton()` function in `countryconfig-atg/src/form/custom-fields.ts`
- [ ] Define `GOID_VERIFY_BUTTON` field type
- [ ] Add button to mother form (`mother.ts`)
- [ ] Add button to father form (`father.ts`)
- [ ] Configure conditionals (hide if already linked, registrar only)

## 4. Client - Modal Component
- [ ] Create `GoIDVerifyButton.tsx` in `opencrvs-core/packages/client/src/components/form/`
- [ ] Implement login screen (username + password inputs)
- [ ] Implement consent screen showing returned person data
- [ ] Add loading and error states
- [ ] Export from `components/form/index.ts`

## 5. Client - Form Integration
- [ ] Add `GOID_VERIFY_BUTTON` case in `FormFieldGenerator.tsx`
- [ ] Implement Formik field population on approval:
  - `firstNamesEng`, `familyNameEng`
  - `${section}BirthDate`
  - `nationality`
  - `${section}IdType`, `${section}NationalId`
- [ ] Store verification status in Formik state (`${section}VerificationStatus`)
- [ ] Add visual indicator for verified fields

## 6. Documentation & Validation
- [ ] Update INTEGRATION_PLAN.md with goID flow
- [ ] Add local dev instructions for running goID service
- [ ] Run `openspec validate add-goid-verification --strict`
