# Project Context

## Purpose
OpenCRVS is a digital civil registration and vital statistics (CRVS) platform.  
The aim is to let governments capture, validate, and certify life events (births, deaths, corrections, certificates) while integrating with national ID ecosystems and operating in low-connectivity environments.

## Tech Stack
- Monorepo managed with Yarn workspaces + Lerna
- TypeScript across client, server, and tooling
- React + Redux + Formik + Styled Components for the SPA
- Apollo/GraphQL client with generated TypeScript types
- Node.js microservices built with Hapi, BullMQ, and shared commons
- MongoDB, Redis, and OpenSearch/Elasticsearch storage layers
- Docker Compose for local orchestration, Kubernetes/Helm for environments
- Country configuration package for forms, translations, and workflows

## Project Conventions

### Code Style
- ESLint + Prettier enforce formatting; run `yarn lint` before commits
- TypeScript preferred; shared interfaces in `packages/commons`
- React components are functional with hooks; PascalCase filenames
- GraphQL operations colocated with components, types generated into `gateway.ts`
- Environment variables documented via `.env` templates; secrets never committed

### Architecture Patterns
- Modular services under `packages/` (gateway, client, user-mgnt, webhooks, login, etc.)
- Gateway exposes GraphQL API consumed by the SPA and other services
- Services communicate through REST/GraphQL plus BullMQ queues
- Country-specific business logic isolated in `opencrvs-countryconfig`
- Shared utilities/types centralised to keep contracts consistent

### Testing Strategy
- Jest unit tests for client components, hooks, reducers, and Node services
- GraphQL schema + fixture tests in `packages/client/src/tests`
- Integration/service tests executed via Docker Compose harnesses (`yarn test:<service>`)
- Manual QA aided by seeded demo data and scripted end-to-end flows
- New features expected to add or update relevant tests before merge

### Git Workflow
- Feature branches cut from `main` (or active release branch)
- Rebase preferred over merge to keep history linear; squash at merge if needed
- Pull requests require CI green checks and peer review
- Descriptive commits using `type(scope): message` style (e.g., `feat(webhooks): add goid verify endpoint`)

## Domain Context
- CRVS workflows span registration, verification, certification, and notifications for life events
- Registrars often work offline; drafts sync when connectivity returns
- Integrations include MOSIP/goID for national ID, notification gateways, certificate printers
- Country configuration drives forms, validation rules, address hierarchies, and localisation

## Important Constraints
- Must comply with government data privacy and civil registration regulations
- Offline-first requirements demand deterministic validation and conflict handling
- Secure handling of PII/PHI; all APIs authenticated/authorised via JWT scopes
- Multi-language (including RTL) UI, plus low-bandwidth optimisations
- Deployments target resource-constrained infrastructure—monitoring and logging mandatory

## External Dependencies
- MOSIP / goID (national ID verification & OAuth providers)
- Keycloak for authentication/identity management
- OpenSearch/Elasticsearch for search + analytics
- Redis (queues/cache) and MongoDB (primary data store)
- SMS/Email gateways, certificate printing services, and national registries integrated via webhooks
