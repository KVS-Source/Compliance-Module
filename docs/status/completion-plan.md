# Completion plan — operable to fully usable

Baseline date: 2026-08-08

## Purpose

[Current status and V1 scope](./current-status-and-v1-scope.md) records what is
shipped. [Known limitations](../known-limitations.md) records what is not. This
plan sequences the remaining work into phases that each end at a usable state,
and it is ordered by what blocks an operator rather than by module.

Phase 1 is the only phase that blocks day-one operation. Everything after it
raises quality, coverage or assurance.

## Phase 1 — Close the user lifecycle

**Problem.** An administrator can create a user through Administration → Users,
and that user can sign in, but no role can be assigned to them through any API
or screen. `POST /users` in
[`backend/src/modules/users/routes.ts`](../../backend/src/modules/users/routes.ts)
accepts no role field, `/access` exposes `GET` only, and
`RoleAssignmentService` in
[`backend/src/modules/access/role-assignment-service.ts`](../../backend/src/modules/access/role-assignment-service.ts)
is imported by `prisma/seed.ts`, `prisma/demo-seed.ts`,
`prisma/uat-workbook-seed.ts` and `tests/api.test.ts` — never by
`backend/src/`. The new user therefore signs in with no permissions and an
empty navigation, and onboarding the second employee requires shell and
database access through `npm run client:initialize`.

**Design constraint.** The deliberate decision documented in
[`backend/src/modules/access/routes.ts`](../../backend/src/modules/access/routes.ts)
is that `PRODUCTION_ACCESS_PROFILES` is the authority on what a role may do,
and that a write path which only pretended to save would be worse than its
absence. This phase does not weaken that. It adds **assignment of a user to one
of the five sanctioned profiles**, not free-form role or permission editing.
The profile catalogue stays the authority; only the user-to-role binding
becomes mutable.

### 1.1 Role assignment API

Add to `backend/src/modules/access/routes.ts`:

| Method | Path                          | Permission     | Behaviour                                                                      |
| ------ | ----------------------------- | -------------- | ------------------------------------------------------------------------------ |
| `GET`  | `/access/users/:userId/roles` | `users:read`   | Active and disabled assignments for the user in the active Company             |
| `PUT`  | `/access/users/:userId/roles` | `roles:assign` | Sets the user's role to one profile code; disables any other active assignment |

Notes that matter for correctness:

- Reuse `RoleAssignmentService.upsertActive`. It already refuses assignment
  without an active `userCompany` membership and refuses a role belonging to
  another Company, returning `409 INVALID_ROLE_ASSIGNMENT`. Do not duplicate
  those checks in the route.
- Reject any `roleCode` that fails `isProductionRoleCode` from
  [`backend/src/production/access-profile.ts`](../../backend/src/production/access-profile.ts),
  and reject the wildcard `*` unconditionally, so this endpoint can never
  create the state production readiness refuses.
- Create the `Role` row from the profile on first assignment if the Company has
  no row for that code yet, mirroring `client-initializer.ts` lines 100–125.
  The Role & Access page already lists unassigned profiles at zero, so the
  catalogue and this endpoint agree.
- Follow the existing disable-others-then-upsert order used in
  `prisma/demo-seed.ts` so a user never briefly holds two active roles.
- Write an `AuditEvent` for every assignment. Role grants are the most
  security-relevant mutation in the product and the audit trail is already
  append-only.

**New permission.** Add `roles:assign` to `PRODUCTION_PERMISSIONS` and grant it
to `CLIENT_COMPANY_ADMINISTRATOR` only. Gating on the existing `users:write`
would let anyone who can edit a phone number also grant themselves
`COMPLIANCE_MANAGER`.

**Self-escalation guard.** Refuse assignment where `:userId` equals the
authenticated user. An administrator changing their own role should go through
another administrator.

### 1.2 Role assignment UI

- [`frontend/src/features/users/UserFormModal.tsx`](../../frontend/src/features/users/UserFormModal.tsx)
  currently offers `status` and `departmentId` only. Add a role select
  populated from `GET /access/profiles`.
- On create, submit the user first, then the role assignment. Surface a partial
  failure honestly — a created user with no role must not report success.
- Show the assigned role on the user detail view, and hide the control when the
  caller lacks `roles:assign` rather than showing a disabled field.
- [`frontend/src/features/users/UsersPage.tsx`](../../frontend/src/features/users/UsersPage.tsx)
  already renders a `ROLE` column from `detailDto`, so no list change is needed.

### 1.3 Retire the wildcard permission

`DEMO_ROLES` in
[`backend/prisma/demo-seed-data.ts`](../../backend/prisma/demo-seed-data.ts)
still grants `"*"` to `COMPANY_ADMIN`. Production token issuance strips it,
`client-initializer.ts` never assigns it, and readiness refuses it — so demo
and production diverge on the single most security-relevant behaviour, and the
demo cannot be used to validate the permission model.

Replace the wildcard with the explicit `CLIENT_COMPANY_ADMINISTRATOR`
permission set and align the demo role codes with the five production profile
codes. This is also the cheapest way to discover any screen that silently
depends on `*`.

Removes limitation 1 in [known limitations](../known-limitations.md).

### 1.4 Tests

- Integration: assignment succeeds; cross-Company role rejected `409`;
  wildcard rejected; non-profile code rejected; self-assignment rejected;
  caller without `roles:assign` gets `403`; previous role is disabled, not
  duplicated; audit event written.
- Integration: a user created through `POST /users` and then assigned a role
  can authenticate and reach a permitted route — the loop this phase exists to
  close.
- Playwright: create user, assign role, confirm the list reflects it.

**Exit criterion.** A Company Administrator can onboard a colleague end to end
in the browser, and that colleague signs in to a correctly scoped workspace.
No shell, no seed script, no direct database access.

## Phase 2 — Connect the finished backends

Each item here has a working, tested API and no way to reach it.

### 2.1 Operational Registers write UI

`POST` and `PATCH` exist at
[`backend/src/modules/registers/routes.ts`](../../backend/src/modules/registers/routes.ts)
lines 75 and 94, gated on `registers:write`, and
[`frontend/src/features/registers/OperationalRegistersPage.tsx`](../../frontend/src/features/registers/OperationalRegistersPage.tsx)
is read-only. Add create and edit against the existing endpoints. No backend
work.

### 2.2 Manual risk creation

Every write route in
[`backend/src/modules/risks/routes.ts`](../../backend/src/modules/risks/routes.ts)
is `/:id/...` — reviews, treatments, owner, close, reopen. There is no
`POST /risks`, so a risk can only be born from a KPI miss or a workbook import,
and a risk identified in a review meeting cannot be recorded at all. The
`risk:write` permission already exists in the catalogue and is currently
unreachable.

Add `POST /risks` gated on `risk:write`, with `source` distinguishing a manual
risk from a `KPI_LINKED` one so the automatic-risk invariants asserted in
`prisma/demo-seed.ts` (exactly one server-generated risk per breaching actual)
stay intact. Then add the create control to the Risk Register.

### 2.3 Notifications

The bell in
[`frontend/src/components/navigation/Topbar.tsx`](../../frontend/src/components/navigation/Topbar.tsx)
links to `/kpi/approval` and `/compliance/risks`. There is no notifications
module and no mail transport anywhere in `backend/src`, so nothing reaches
anyone who is not already looking at the application. Approvals and overdue
CAPAs are time-sensitive, which makes this a real operational gap rather than
polish.

Smallest honest first step: an in-app work-queue count served from existing
approval, gap and CAPA queries, replacing the static bell. Defer email until a
transport and a delivery policy are agreed — the Settings page already states
that external delivery is not configured, and it should keep saying so until it
is true.

## Phase 3 — Verification you can trust

Playwright intercepts every API call, so the suites prove the React layer works
against mocked responses. Backend integration tests are the database authority,
and no automated test crosses the whole stack. This is limitation 3, and it is
why a human real-stack walkthrough is required for every release candidate.

Build a browser-to-PostgreSQL suite over the disposable database already used
by `backend/scripts/run-integration-tests.ts`: migrate, seed a known fixture,
run the real backend and built frontend, drive Playwright with no route
interception. Cover the flows where a mock is least trustworthy — login and
refresh rotation, the Phase 1 onboarding loop, KPI actual submission through
approval, and an evidence-gated approval refusal.

Keep the mocked suites. They are fast and they cover rendering. This adds the
layer they cannot reach.

## Phase 4 — Tenant isolation defence in depth

Tenant isolation is enforced by authenticated tenant context, membership
revalidation, repository predicates, composite foreign keys, constraints and
triggers. It is carefully done, but a single missed predicate in a new
repository method is a cross-tenant read with no backstop, and PostgreSQL RLS
is the control an auditor will ask about (limitation 2).

Sequence: enable RLS on tenant-scoped tables in a migration, set the tenant
context on the connection per request, add policies table by table, and run the
existing cross-tenant negative tests as the gate. Expect this to touch every
query path. It is a project in its own right and should not be bundled with
feature work.

## Phase 5 — Production bring-up

Not code. TLS certificate, DNS, secret manager, log destination, alerting,
host and disk encryption, and a backup/restore drill against agreed RPO and RTO
rather than the current mechanics-only local drill (limitations 4 and 5).
Independent GitHub evidence for branch protection closes limitation 6.

## Sequencing

| Phase                 | Effort   | Blocks             | Recommended                             |
| --------------------- | -------- | ------------------ | --------------------------------------- |
| 1 User lifecycle      | Days     | Day-one operation  | Do first                                |
| 2 Connect backends    | Days     | Nothing            | Do next                                 |
| 3 Real E2E            | ~1 week  | Release confidence | Before first production release         |
| 4 RLS                 | Weeks    | Audit posture      | Schedule as its own project             |
| 5 Production bring-up | External | Go-live            | In parallel; needs infrastructure input |

Phases 1 and 2 are days of work against APIs and services that already exist
and are already tested. Phase 3 removes recurring manual release cost. Phase 4
is the largest item and the one most likely to be demanded by an external
assessor.

## Deliberately not in this plan

Report scheduling, subscriptions and PDF output; Policy Version obsoletion and
`INACTIVE` transitions; GenRAC live REST and database adapters; S3 object
storage; malware scanning; inline file preview; same-period Checkpoint Review
correction; Tasks. These are scoped-out product decisions recorded in
[known limitations](../known-limitations.md), not loose ends, and none of them
prevents daily operation.

Administrator-controlled password recovery is also intentional and already
implemented. It is not a gap.
