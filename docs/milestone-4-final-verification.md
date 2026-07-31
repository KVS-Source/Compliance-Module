# Milestone 4 final verification

Slice 8 integration and release-readiness note for Policy, Control and
Checkpoint management. Truthful about test layers. Not a production approval.

## Modules implemented

- Policy register, detail, Version create/edit, Framework mappings
- Policy Version submit / approve / reject (self-approval forbidden)
- Control register, detail, lifecycle, Policy Version / Framework / Rule mappings
- Checkpoint register, detail, lifecycle
- Append-only Checkpoint Reviews (one Review per period)
- Latest Review and Review history
- Traceability panels (Policy, Control, Checkpoint)
- Entity-scoped audit history reads
- Permission-aware React routes via `PermissionBoundary`
- Tenant/company-switch protections on registers and detail flows

## LIVE frontend routes

Derived from `frontend/src/app/routeDefinitions.ts` and `router.tsx`:

| Path | Permission |
| --- | --- |
| `/master/frameworks` | `frameworks:read` |
| `/master/framework-rules` | `frameworks:read` |
| `/compliance/policy-register` | `policies:read` |
| `/compliance/policies/:policyId` | `policies:read` |
| `/compliance/controls` | `controls:read` |
| `/compliance/controls/:controlId` | `controls:read` |
| `/compliance/checkpoints` | `checkpoints:read` |
| `/compliance/checkpoints/:checkpointId` | `checkpoints:read` |

`/compliance/policy-versions` remains `IN_DEVELOPMENT` (versions live on Policy
detail). No dedicated approvals-only route.

## Backend API groups

Base path `/api/v1`:

- Auth / health / ready
- Frameworks and Framework Rules
- Policies, Policy Versions, Framework replace, submit / approve / reject
- Controls, lifecycle, Policy Version / Framework / Rule replace
- Checkpoints, lifecycle, Reviews, latest Review
- Traceability and audit-events on Policy, Control and Checkpoint

## Permission matrix

| Permission | UI / API |
| --- | --- |
| `policies:read` | Register, detail, versions, traceability, audit |
| `policies:write` | Create / update / archive / versions / frameworks |
| `policies:submit` | Submit / resubmit Version |
| `policies:approve` | Approve / reject Version |
| `controls:read` | Register, detail, traceability, audit |
| `controls:write` | Create / update / lifecycle / mappings |
| `checkpoints:read` | Register, detail, reviews list, latest, traceability, audit |
| `checkpoints:write` | Create / update / lifecycle |
| `checkpoints:review` | Create Review |

Frontend gates are UX only. Backend `permit(...)` remains authoritative.

## Test layers

| Layer | Authority |
| --- | --- |
| Playwright (`frontend/tests/*`, including `milestone4-integration.e2e.ts`) | Deterministic mocked `/api/v1/**` only; in-memory actor/permission switch simulates UI flows, not JWT/auth or PostgreSQL authority |
| Backend unit tests | Domain/validator behaviour without full stack |
| Backend PostgreSQL integration | Database, permissions, and API authority |
| Postman `Milestone-4-E2E` | Real local API demonstration |
| pgAdmin SQL (`docs/milestone-4-pgadmin-demo.sql`) | Stored-row confirmation |

## Tenant isolation

- Tenant context comes from JWT / active Company switch (`POST /auth/tenant-context`).
- Mutation bodies must not carry `tenantId` as authority.
- Cross-tenant IDs return safe `404`.
- Delayed prior-Company responses must not overwrite new-Company UI state
  (covered in register/workflow Playwright suites; Slice 8 adds a Checkpoint
  detail switch assertion in the integration suite).

## Review and lifecycle rules (verified)

- Reviews are append-only; no edit/delete APIs or UI.
- One Review per `(tenant, checkpoint, review_period)`; duplicates → `409`.
- Reviewer is the authenticated actor (`reviewerId` not accepted in body).
- Review allowlist: `reviewPeriod`, `reviewDate`, `outcome`, `observation`,
  `recommendation`, `nextReviewDate`.
- `verificationFrequency` and `initialReviewDate` freeze after the first Review.
- Control reassignment on an existing Checkpoint is not supported.
- Archiving a Control is blocked while ACTIVE Checkpoints remain.
- An ACTIVE Checkpoint under an INACTIVE Control is allowed.
- Policy self-approval is forbidden.
- Evidence-required Policy approval fails closed (`501`) until Evidence exists.

## Traceability and audit

- Traceability is read-only linkage across Policy ↔ Control ↔ Checkpoint and
  Framework / Rule mappings where modelled.
- Audit events are append-only; no update/delete APIs.
- Review observation/recommendation must not appear in audit metadata displays.

## Known limitations

- Playwright uses deterministic mocked APIs. In-memory actor/permission switching
  is UI-flow simulation only; backend PostgreSQL integration tests remain the
  authority for permissions, auth and database behaviour. Human real-stack
  walkthrough remains required.
- PostgreSQL RLS is not implemented.
- Evidence, Gap, CAPA, GenRAC, imports, notifications, reports, dashboard
  redesign, AWS and production deployment are out of scope for Milestone 4.
- Same-period Review correction/supersession is deferred.
- `COMPANY_ADMIN` still receives wildcard `"*"` in seed (production blocker).
- Standalone Policy Versions navigation page is not LIVE.

## Out of scope (do not claim complete)

Evidence Management, Gap Management, CAPA, GenRAC synchronization, AWS
deployment, PostgreSQL RLS, production deployment, dashboard redesign.

## Slice 8 assets

- `frontend/tests/milestone4-integration.e2e.ts`
- `backend/tests/milestone4-workflow.test.ts`
- `postman/Milestone-4-E2E.postman_collection.json`
- `postman/Milestone-4-E2E.postman_environment.json`
- `postman/README.md`
- `docs/milestone-4-pgadmin-demo.sql`
- `docs/milestone-4-client-demo.md`
- this document
