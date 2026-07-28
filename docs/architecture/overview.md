# Architecture overview — extending GenBioCa

This guide is for a competent developer joining the active codebase who needs to
add domains such as Evidence, Policies, Controls, Gaps, or CAPA.

It explains **patterns**, not every file. For local setup, live vs prototype
routes, and seeded accounts, start with the repository [`README.md`](../../README.md).
For standing constraints, read [`CONTRIBUTING.md`](../../CONTRIBUTING.md). For
what counts as production-target code, read
[`authoritative-runtime.md`](./authoritative-runtime.md).

---

## Current state and what comes next

### Domains that exist today

| Domain | Backend | Frontend |
|--------|---------|----------|
| **Company & Access** | Auth, tenants, users, roles/permissions, organisation masters | Live users, companies, departments, locations, units |
| **Compliance masters (read)** | Frameworks and rules | Live framework list + rules |
| **KPI** | Definitions (shared), configurations, targets, actuals, approval history, performance calculation | Live configuration, targets, actual entry and approval; mapping remains a prototype |
| **Risk** | Automatic create on KPI miss; owner assignment, review, treatment, residual scoring, closure and reopening | Live Risk Register and workflow-enabled detail |

### README-only seams (not implemented)

These folders exist under `backend/src/modules/` with a short `README.md` only —
no routes, services, or schema:

- Evidence — `backend/src/modules/evidence/`
- Policies — `backend/src/modules/policies/`
- Controls — `backend/src/modules/controls/`
- Gaps — `backend/src/modules/gaps/`
- CAPA — `backend/src/modules/capa/`
- Reports — `backend/src/modules/reports/`
- Uploads — `backend/src/modules/uploads/`
- Audit UI / audit query API — `backend/src/modules/audit/` (append-only
  `AuditEvent` writes already exist elsewhere; there is no list UI or query
  module)

**Notifications** has no module folder yet.

### Highest-value next domain: Evidence

Approved-evidence gates are intended to block:

- KPI actual approval (when `requiresEvidence` is true)
- Policy approval
- Gap closure
- CAPA closure
- Configured risk-treatment completion (future)

Today, `EvidenceGateService`
(`backend/src/modules/kpis/evidence-gate-service.ts`) is the intentional
**fail-closed** seam: if a configuration requires evidence, approval paths
return `501 EVIDENCE_GATE_NOT_IMPLEMENTED` and write nothing. Building a real
Evidence domain means replacing that stub with tenant-scoped evidence records
and wiring the same gate points — not inventing a parallel approval path that
skips evidence.

---

## Module pattern (copy the KPI actual path)

New domains should follow the same layered shape as KPI actual submission.

### Request path (end to end)

```text
HTTP
  → authenticate + authorizeTenantContext   (global, in routes/index.ts)
  → permit("<permission>")                  (per route)
  → validate(zodSchema)                     (body / params / query)
  → Service method                          (rules, orchestration, transactions)
  → Repository / TransactionRepository      (Prisma, tenant-scoped)
  → DTO + ok() / created()                  (response envelope)
```

### Real files for KPI actuals

| Layer | Path | Entry |
|-------|------|--------|
| Mount | `backend/src/routes/index.ts` | `apiRoutes` mounts `/kpi-actuals` after auth |
| Routes | `backend/src/modules/kpis/actual-routes.ts` | `kpiActualRoutes` |
| Permission / validation helpers | `backend/src/common/middleware/http.ts` | `authenticate`, `authorizeTenantContext`, `permit`, `validate`, `errorHandler` |
| Validators | `backend/src/modules/kpis/actual-validators.ts` | e.g. `createKpiActualSchema` (Zod `.strict()`) |
| Service | `backend/src/modules/kpis/actual-service.ts` | `KpiActualService.submitActual` |
| Calculation | `backend/src/modules/kpis/performance-service.ts` | `KpiPerformanceService.calculate` |
| Repository | `backend/src/modules/kpis/actual-repository.ts` | includes, allocate code, create, audits |
| Envelope | `backend/src/common/responses/envelope.ts` | `ok`, `created`, `pageMeta` |
| Errors | `backend/src/common/errors/app-error.ts` | `AppError` → mapped in `errorHandler` |

Sibling KPI management (configurations / targets) uses the same pattern in
`management-routes.ts`, `management-validators.ts`, `management-service.ts`,
`management-repository.ts`.

Risk reads follow a thinner copy: `backend/src/modules/risks/routes.ts` →
`service.ts` → `repository.ts`, mounted at `/risks`.

### Conventions that matter when copying

1. Routes stay thin: permission, validate, call service, return envelope.
2. Services receive `tenantId` and `actorUserId` from `req.auth`, never from the
   body as authority.
3. Repositories filter every tenant-owned query with `tenantId`.
4. Validators reject unknown fields (`.strict()`) and omit client-supplied codes
   / calculated fields where the server owns them.
5. Multi-step writes use a Prisma transaction and write audit rows in the same
   transaction.

---

## Tenant isolation

### How tenant identity flows

1. Login / refresh issues a JWT access token whose claims include `tenantId`
   (active Company).
2. `authenticate` (`http.ts`) verifies the bearer token and sets
   `req.auth = { userId, tenantId, permissions }`.
3. `authorizeTenantContext` loads an **active** `UserCompany` row for that
   user + tenant (and active user/tenant). If membership is gone, the request
   fails as unauthorized.
4. Route handlers pass `req.auth.tenantId` into services.
5. Repositories use `where: { tenantId, … }` (and composite FKs
   `(tenantId, id)` for lineage).

### Why bodies must not carry authoritative `tenantId`

The authenticated Company context is the source of truth. Accepting
`tenantId` from JSON or query strings invites cross-tenant writes. New
validators should not expose a client-controlled tenant field for scoping.

### Shared-global vs tenant-owned

| Kind | Examples | Rule |
|------|----------|------|
| Shared-global | `Framework`, `FrameworkRule`, `KpiDefinition`, `Permission` | No `tenantId`. Readable across Companies (still behind auth + permission). |
| Tenant-owned | `KpiConfiguration`, `KpiTarget`, `KpiActual`, `Risk`, org masters, `AuditEvent`, roles | Always carry `tenantId`. Queries and FKs must be tenant-scoped. |

When a tenant-owned row points at another tenant-owned row, prefer composite
foreign keys that include `tenantId` so PostgreSQL rejects cross-tenant
lineage.

---

## What lives in raw SQL (and why)

Prisma models relations and many uniques, but it cannot express several
invariants GenBioCa relies on. Those are enforced in SQL migrations.

| Invariant | Why | Migration |
|-----------|-----|-----------|
| Audit events append-only | History must not be updated/deleted via ORM | `backend/prisma/migrations/20260721181500_milestone_1/migration.sql` (`prevent_audit_event_mutation`) |
| Role / membership tenant match | Stop cross-tenant role assignment | `20260721190000_membership_hardening` |
| Active role requires membership | See dedicated note | `20260724200000_user_role_membership_invariant` — also [`user-role-membership-invariant.md`](./user-role-membership-invariant.md) |
| One active KPI config per scope with `NULLS NOT DISTINCT` | Nullable BU/Location/Product/Unit dimensions | `20260726143000_slice_a_kpi_configuration_targets` |
| Approved targets immutable | Freeze numbers after approval | same Slice A migration (`kpi_targets_approved_immutable`) |
| `kpi_approvals` append-only | Approval history is a ledger | `20260727113000_slice_c_kpi_actual_approval` |
| One active risk per KPI actual (partial unique) | Soft-closed rows allowed; open duplicates not | `20260726224500_slice_d_automatic_kpi_risk` (`risks_one_active_per_kpi_actual`) |
| Likelihood/impact CHECKs, inherent score equality, KPI lineage all-or-none | Assessment integrity | same Slice D migration |

**Implication for new domains:** if you need a partial unique index, a trigger,
`NULLS NOT DISTINCT`, or a CHECK Prisma cannot model, add a hand-written
`migration.sql`. Do not assume the Prisma schema alone is enough.

---

## Audit events

- Rows are inserted with `auditEvent.create` inside the **same database
  transaction** as the business change (see KPI actual/management repositories,
  risk repository, users, organisation, auth).
- There is no separate Audit domain service or Audit UI yet
  (`backend/src/modules/audit/README.md`).
- The database trigger rejects UPDATE/DELETE on `audit_events`. Never add APIs
  that mutate audit history.
- Prefer structured `metadata` (codes, ids, before/after summaries) plus optional
  IP / user-agent from the request context.

---

## Permissions

### Runtime

`permit("some:code")` in `http.ts` allows the request if
`req.auth.permissions` contains that code **or** `"*"`.

Frontend `PermissionBoundary` / `hasPermission` is UX only. Backend `permit`
remains authoritative.

### Seeding new permissions

1. Add the code to the permission upsert list in `backend/prisma/seed.ts`.
2. Assign it to the correct roles (do not silently widen `COMPANY_USER`).
3. For databases that already exist, also insert the permission in a migration
   (KPI slices did this for new codes) so deploy environments stay consistent.
4. Protect routes with `permit("…")` and document the code in OpenAPI.

### Known debt

`COMPANY_ADMIN` still receives the wildcard `"*"` permission. That is deliberate
deferred work, not a pattern to copy for new roles. See
[`docs/reviews/kpi-slice-a-permission-debt.md`](../reviews/kpi-slice-a-permission-debt.md).

---

## Testing layers

| Layer | How | What it is for |
|-------|-----|----------------|
| **Unit** | `npm run test:unit --prefix backend` | Pure calculation, filter builders, middleware behaviour, small service rules — fast, no integration DB |
| **Integration** | `npm run test:integration --prefix backend` (isolated Postgres on the test port) | Real HTTP + Prisma + migrations; tenancy, permissions, uniqueness, transactional rollback |
| **Playwright** | `npm run test:e2e --prefix frontend` | UI flows against **mocked** `**/api/v1/**` browser routes |

There is **no browser-to-database end-to-end suite**. Do not describe mocked
Playwright tests as full-stack E2E.

Every new tenant-owned write or read path needs integration coverage that
proves another Company’s token cannot see or mutate the resource (typically
safe `404 NOT_FOUND` or `403 FORBIDDEN` — match established behaviour; do not
weaken it for test convenience).

---

## How to add a new domain module

Follow the KPI shape. Example name: `evidence`.

1. **Decide the product rules** (see ambiguity note below). Record non-obvious
   decisions under `docs/reviews/` before coding.
2. **Schema** in `backend/prisma/schema.prisma`: tenant-owned tables get
   `tenantId`; shared masters do not. Add SQL invariants in a migration when
   Prisma cannot express them.
3. **Module folder** `backend/src/modules/<domain>/`:
   - `validators.ts` — Zod
   - `repository.ts` — Prisma, tenant-scoped
   - `service.ts` — orchestration + DTOs
   - `routes.ts` — `permit` + `validate` + envelope
4. **Mount** in `backend/src/routes/index.ts` **after**
   `authenticate` / `authorizeTenantContext`.
5. **Permissions** — seed + migration insert; wire `permit`.
6. **Audits** — create events in the write transaction.
7. **OpenAPI** — extend `backend/src/docs/openapi.ts`.
8. **Tests**
   - Unit for pure rules
   - Integration happy path
   - **Mandatory** cross-tenant negative tests for list/get/write
9. **Frontend** — only when the API is real. Add a live route +
   `migratedPaths` entry; otherwise leave `PrototypeRoutePage` and the
   prototype banner. Never connect a prototype screen to fake writes.
10. **Gates** — if Evidence (or another gate) is required, fail closed until
    implemented (copy the `EvidenceGateService` idea).

### What to do when the spec is ambiguous

KPI slices shipped cleanly because the implementer **stopped and asked** instead
of guessing. Dozens of design questions were resolved in writing; several
prevented real product errors.

Business rules such as:

- what makes a risk Major vs Minor,
- whether rejecting an actual closes its risk,
- whether historical rows are backfilled,

are **product-owner decisions**, not defaults to invent in code.

When ambiguous:

1. Stop implementation for that decision.
2. Ask with options and a recommended default.
3. Record the answer under `docs/reviews/` (see
   [`kpi-automatic-risk-creation-decision.md`](../reviews/kpi-automatic-risk-creation-decision.md),
   [`kpi-actual-risk-backfill-decision.md`](../reviews/kpi-actual-risk-backfill-decision.md),
   and neighbours in that folder).
4. Implement only the recorded rule, with tests that lock it in.

---

## KPI domain business rules (summary)

Full vocabulary and schema notes:
[`docs/claude-tasks/02-kpi-risk-schema.md`](../claude-tasks/02-kpi-risk-schema.md).
Creation policy and backfill decisions: `docs/reviews/kpi-*.md`.

### Directions (`KpiDirection`)

- `HIGHER_IS_BETTER`
- `LOWER_IS_BETTER`
- `TARGET_EXACT` (band via min/max when both set; otherwise exact equality)
- `INFORMATIONAL` — variance may be stored; **RAG is null**; **never** raises a risk

Calculation and RAG live only in `KpiPerformanceService.calculate`. Do not
reimplement direction/threshold logic in the frontend or in other services.

### Thresholds and RAG

- Tenant defaults: `Tenant.defaultAmberThresholdPct` /
  `defaultRedThresholdPct`.
- Optional per-configuration overrides: `KpiConfiguration.amberThresholdPct` /
  `redThresholdPct`.
- Shortfall against the target (direction-aware) maps to GREEN / AMBER / RED.
- A miss still inside the amber band is GREEN (no risk).

### Automatic risk

| RAG | Risk |
|-----|------|
| GREEN | **No** risk row |
| AMBER | Create **Minor** KPI risk (fixed starting 3×3 assessment) |
| RED | Create **Major** KPI risk (fixed starting 4×4 assessment) |
| INFORMATIONAL (null RAG) | **No** risk row |

- Risk is created in the **same transaction** as the actual submit when
  required.
- Approval, rejection, and resubmission **do not mutate** the linked risk
  (recorded decision: automatic creation is create-only for that actual).
- No historical backfill of risks for older actuals unless a separate approved
  task says otherwise.

### Target snapshot and codes

- On submit, persist `targetValueSnapshot` from the approved target (highest
  approved version for the period).
- Actual codes (`ACT-…`) and risk codes (`RSK-…`) are allocated from tenant
  counters server-side; clients must not supply them.

### Evidence gate

When `requiresEvidence` is true, approval paths call `EvidenceGateService` and
fail closed until Evidence exists.

---

## Related documents

- [`authoritative-runtime.md`](./authoritative-runtime.md)
- [`user-role-membership-invariant.md`](./user-role-membership-invariant.md)
- [`docs/claude-tasks/02-kpi-risk-schema.md`](../claude-tasks/02-kpi-risk-schema.md)
- [`docs/reviews/`](../reviews/) — recorded product/architecture decisions
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
- [`README.md`](../../README.md) — setup, live vs prototype routes
