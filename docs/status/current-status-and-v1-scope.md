# Current status and V1 scope

Baseline date: 2026-08-06

## Release classification

The client navigation set is 44 protected **LIVE** modules (API-connected React
pages backed by PostgreSQL), plus login. Production readiness still depends on
operator provisioning (TLS, secrets, host, backup) and the blockers listed in
[known limitations](../known-limitations.md). Authoritative route status is
`frontend/src/app/routeDefinitions.ts` (`clientNavigationPaths`, `migratedPaths`)
and `npm run guard:routes`.

GitHub Settings evidence verifies that the default branch is `main`. Independent
evidence for `main` protection/ruleset enforcement, reviews, required checks,
force-push/deletion blocking and administrator bypass policy remains pending.
GitHub governance verification is therefore incomplete. The authoritative
evidence status is
[governance-ci-hardening.md](../reviews/governance-ci-hardening.md).

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `LIVE` | A real React page calls a real Express API backed by PostgreSQL. |
| `IN_DEVELOPMENT` | Approved product scope, but not operational. The route renders a truthful status page. |
| `AWAITING_INTEGRATION` | No live integration exists; client access/interface approval is pending. |
| `COMPATIBILITY` | A previously published URL is retained but hidden and is not an operational authority. |
| `DORMANT` | Source/reference material is not imported or routed by the active runtime. |

Current totals: one public login; **44 protected LIVE** sidebar modules (all
entries in `clientNavigationPaths`); one protected LIVE **account-menu** route
(Change Password), reached from the Topbar profile menu and deliberately kept
out of the sidebar; deferred product routes are **hidden** `IN_DEVELOPMENT`
deep links (not shown in the client sidebar); 14 hidden `COMPATIBILITY` legacy
URLs. No sidebar item remains `AWAITING_INTEGRATION`. `npm run guard:routes`
reports these totals as 58 protected LIVE route patterns, which counts detail
and parameterised routes in addition to the 44 sidebar entries.

Client-readable module capabilities: [handover module status](../handover/module-status.md).

## Implemented LIVE capability (shipped sidebar set)

- authentication, refresh rotation, logout and active Company selection;
- Companies (read), users (create/update including admin password set), and
  organisation masters (departments, locations, units);
- **self-service password change** for any authenticated role (no permission
  code required), which revokes every session for that user on success;
- frameworks and framework rules (read);
- Policy, Control and Checkpoint registers with lifecycle, mappings, reviews
  and scoped audit/traceability;
- KPI configuration, versioned targets, actual entry, approval, and automatic
  KPI-linked risks (Major/Minor) with Risk Register treatment workflow;
- Evidence library, create/upload, review queue, linking and gates for
  Checkpoint, Policy Version and KPI actual approval;
- **Gap Register and CAPA Register** (create, update, owner, close/reopen,
  evidence linkage; closure is evidence-gated);
- **Audit Trail** (searchable company history and CSV export);
- **Operational Registers** (read company register types and records; write API
  exists but the UI is read-only in this release);
- **Data Import** (browser XLSX workbook and approved CSV template preview and
  commit) and **Import History**;
- **GenRAC Integration** page: connector status, sync history, and CSV-adapter
  test/preview/sync when configured by operations. Live REST/database GenRAC
  access is **not** claimed (`liveAccess` remains false until approved access
  exists);
- tenant-scoped dashboard and CSV exports where permitted, including dashboard
  analytics (KPI trend, evidence status, framework compliance, risk heat map,
  CAPA aging, policies due for review and the action queue). A section the API
  withholds reads as restricted rather than as zero;
- **Reports centre**: a catalogue of **ten** reports — KPI target versus actual,
  KPI variance and achievement, framework compliance, evidence status and aging,
  risks, gaps, CAPA aging and overdue, policy review schedule, audit activity and
  Operational Registers. Five carry a sidebar entry; all ten run through the
  parameterised `/reports/:reportKey` view. The catalogue lists every report and
  marks one the caller may not run as locked rather than hiding it. These are **read-only**; CSV export additionally requires
  `exports:read`, so export can be withheld from a role that may still read the
  report on screen;
- **KPI catalogue and KPI analytics** pages (read-only) and the **Frequency
  master** (read-only);
- **Role and access profiles** page (read-only). The API exposes no role
  mutation path and states `mutable: false` in the response; production roles
  are still provisioned by initialization, not by the UI;
- **Approved and Rejected Evidence** views alongside the existing review queue;
- append-only audit-event writes for active workflows.

`KpiTarget`/`kpi_targets` is the active target authority. `KpiGoal`/
`kpi_goals` is read-only compatibility data; the active backend has no mutation
path for it.

## Not operational / deferred

The following are **not** client sidebar LIVE modules (hidden status pages or
deferred scope):

- standalone Policy Versions navigation page (versions live inside Policy detail);
- Tasks, Notifications, tenant/settings screens and KPI mapping deep links;
- **role and permission administration writes**: the role-access page reads
  profiles only, so creating a role or changing a permission assignment is not
  possible from the client;
- **report scheduling, subscriptions and PDF output**: the Reports centre runs a
  report on demand and exports CSV only;
- free-form manual risk **create** in the API (risks are auto-raised from KPI
  misses and import; treatment/close work on the Risk Register);
- GenRAC live REST or PostgreSQL adapters (CSV file adapter only; operator must
  place a file and configure via API);
- Policy Version obsoletion and Policy `INACTIVE` transitions;
- malware scanning, S3 object storage, inline file preview;
- same-period Checkpoint Review correction.

S3 is not active. Local file storage is the only usable provider; selecting S3
fails configuration closed.

This documentation describes shipped software capability. Hosted production
bring-up still requires human infrastructure and secrets.

## Security boundary

- Tenant isolation uses authenticated tenant context, active membership
  revalidation, repository predicates, composite tenant foreign keys,
  constraints and triggers.
- PostgreSQL row-level security is not implemented.
- Development/test seed data may still assign `COMPANY_ADMIN` with wildcard
  permission `"*"` (UAT-only technical debt). Production initialization uses
  five explicit roles only; readiness refuses active wildcard assignments.
  Seed wildcards must never be used for a production or client-demo load.
- Access tokens are memory-only. Opaque refresh tokens are hashed at rest and
  transported only by an HTTP-only, `SameSite=Strict` cookie; production
  requires `Secure`.
- Audit events, KPI and Policy approval history, Checkpoint reviews, Evidence
  review decisions, risk reviews and risk treatments are append-only in PostgreSQL.

## Test boundary

Backend integration tests use real disposable PostgreSQL and all applied
migrations (sixteen folders under `backend/prisma/migrations/`). Automated
Playwright uses browser-intercepted API responses and is not
browser-to-PostgreSQL E2E. A human real-stack browser walkthrough remains
required for each release candidate.

See:

- [Database dictionary](../database/database-dictionary.md)
- [Route inventory](../frontend-route-mapping.md)
- [Security baseline](../security/security-baseline.md)
- [Coverage matrix](../testing/coverage-matrix.md)
- [Known limitations](../known-limitations.md)
- [Evidence demo and release readiness](../evidence-demo-and-release-readiness.md)
- [UAT checklist](../uat/uat-checklist.md)
