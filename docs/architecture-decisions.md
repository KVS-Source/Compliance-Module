# Architecture decisions

## AD-001 React frontend with preserved prototype reference

The production frontend is React/TypeScript with React Router, reusable components, domain service adapters and authentication/Company contexts. The approved vanilla artifact is preserved unchanged at `docs/prototype/GenBioCa-Compliance-Platform.html` and can be served at `/prototype/GenBioCa-Compliance-Platform.html` for comparison. Its CSS tokens, route names, navigation, terminology and workflow rules remain the migration baseline.

## AD-002 Same-origin API and token handling

The frontend and `/api/v1` share one origin. JWT access tokens are short-lived and memory-only. Rotating opaque refresh tokens are hashed in PostgreSQL and delivered only through a `Secure` (when configured), HTTP-only, `SameSite=Strict` cookie. Rotation tracks token families; reuse revokes the family. API mode never stores tokens or authoritative business data in local/session storage.

## AD-003 Company context is a verified claim

The access token carries one active Company UUID. Login chooses an active membership. Company switching validates `user_companies` and account/Company status, revokes the replaced refresh token and issues a new context. Protected resource requests revalidate that the claimed user, membership and Company remain active before tenant-scoped repositories run. Persistence uses “tenant”; frontend-facing DTOs use “Company.”

## AD-004 Shared master provider boundary

Shared catalogue/organisation reads use `SharedMasterProvider`. The local implementation uses PostgreSQL/Prisma. This keeps future external shared-master sources possible without allowing business services to query shared tables directly.

## AD-005 Milestone boundary

Only auth, Company/membership/access, users, organisation masters, frameworks/rules, KPI definitions/goals, refresh sessions and minimal auth audit are persisted. Policy/control/evidence/risk/gap/CAPA/upload/report routes remain registered in React but are explicit migration-pending screens; they do not create authoritative-looking browser-local records.

## AD-006 KPI target authority and traceability

`kpi_definitions` is catalogue data; `kpi_goals` is Company target configuration. A future Target Service must be the only authoritative active-target interface. The accepted ribbon remains **Policy → Framework → Rule → Evidence → Control → KPI → Target vs Actual → Risk**. KPI risk `MAJOR`/`MINOR` and enterprise risk `LOW`/`MEDIUM`/`HIGH`/`CRITICAL` are separate dimensions.

## AD-007 Audit and evidence isolation

Milestone 1 records login, logout and Company switch where practical. A database trigger rejects audit update/delete. Future evidence services must validate Company identity across evidence, linked record, reviewer and storage metadata; files cannot be linked across Companies. Future audit query/export must always use verified Company context.

## AD-008 File storage seam

`FileStorageProvider` defines put/get/delete. Local disk is the development adapter. The S3-compatible class is an explicit unconfigured foundation, not a production implementation. Malware scanning, signed URLs, encryption/key policy, retention and object-level Company isolation remain Milestone 2 work.

## AD-009 Errors, logging and environment

Zod validates environment and request inputs. Safe response envelopes hide stack traces and Prisma details. Pino emits structured logs with auth/cookie/password redaction. Helmet includes a React-compatible Content Security Policy: scripts and API connections are same-origin; Google font styles/fonts are explicitly allowed; objects and external framing are blocked. The legacy prototype is reference-only and receives an isolated compatibility CSP so its approved inline behavior remains available for visual comparison; it does not define the production CSP architecture.

## AD-010 Deployment

Docker Compose runs PostgreSQL and the app. The app waits for database health, applies committed migrations, runs idempotent seed logic and starts the compiled server. This is development/reference infrastructure, not a production-readiness claim.
