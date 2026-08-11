# Current status and V1 scope

Baseline date: 2026-08-10

## Release classification

The client navigation set is 46 protected **LIVE** visible routes (45 grouped
modules plus the Settings utility), plus login. Production readiness still
depends on operator provisioning (TLS, secrets, host, backup) and the blockers
listed in [known limitations](../known-limitations.md). Authoritative route status is
`frontend/src/app/routeDefinitions.ts` (`clientNavigationPaths`, `migratedPaths`)
and `npm run guard:routes`.

GitHub Settings evidence verifies that the default branch is `main`. Independent
evidence for `main` protection/ruleset enforcement, reviews, required checks,
force-push/deletion blocking and administrator bypass policy remains pending.
GitHub governance verification is therefore incomplete. The authoritative
evidence status is
[governance-ci-hardening.md](../reviews/governance-ci-hardening.md).

## Status vocabulary

| Status                 | Meaning                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `LIVE`                 | A real React page calls a real Express API backed by PostgreSQL.                       |
| `IN_DEVELOPMENT`       | Approved product scope, but not operational. The route renders a truthful status page. |
| `AWAITING_INTEGRATION` | No live integration exists; client access/interface approval is pending.               |
| `COMPATIBILITY`        | A previously published URL is retained but hidden and is not an operational authority. |
| `DORMANT`              | Source/reference material is not imported or routed by the active runtime.             |

Current totals: one public login; **46 protected LIVE** visible navigation
routes (45 grouped modules plus the Settings utility); one protected LIVE **account-menu** route
(Change Password), reached from the Topbar profile menu and deliberately kept
out of the sidebar; deferred product routes are **hidden** `IN_DEVELOPMENT`
deep links (not shown in the client sidebar); 13 hidden `COMPATIBILITY` legacy
URLs. No sidebar item remains `AWAITING_INTEGRATION`. `npm run guard:routes`
reports these totals as 60 protected LIVE route patterns, which counts detail
and parameterised routes in addition to the 46 visible navigation routes.

Client-readable module capabilities: [handover module status](../handover/module-status.md).

## Implemented LIVE capability (shipped sidebar set)

Forward remaining work: [completion plan](./completion-plan.md) (V1.1 / V1.5 /
V2). Spec gaps: [gap register](../handover/gap-register.md).

- authentication, refresh rotation, logout and active Company selection;
- Companies (**read + create** via `POST /tenants` when permitted), users
  (create/update including admin password set and **role assignment** to one of
  the five production profiles), and organisation masters (departments,
  locations, units);
- **self-service password change** for any authenticated role (no permission
  code required), which revokes every session for that user on success;
  administrator-set password is the intentional recovery path (no email
  forgot-password);
- **My Work** personal queue (permission-gated sections, overdue first);
- frameworks and framework rules (read); register **column sort** and
  **URL-synced filters** on major registers;
- Policy, Control and Checkpoint registers with lifecycle, mappings, reviews
  and scoped audit/traceability;
- KPI configuration, versioned targets, actual entry (**single and grid modes**),
  approval, and automatic KPI-linked risks (Major/Minor) with Risk Register
  treatment workflow and **manual risk create**;
- Evidence library, create/upload, review queue, linking and gates for
  Checkpoint, Policy Version and KPI actual approval; **evidence expiring soon**
  on the dashboard and library filters;
- **Gap Register and CAPA Register** (create, update, owner, close/reopen,
  evidence linkage; closure is evidence-gated; Gap Register supports **bulk**
  owner/due-date/close against per-record endpoints);
- **Audit Trail** (searchable company history and CSV export);
- **Operational Registers** (browse, create and edit company register records
  when permitted; also loadable by import);
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
- **Role and access profiles** page (catalogue read-only; `mutable: false` for
  permission sets) plus **privilege access review**
  (`GET /access/privilege-review`) of who holds sensitive permissions.
  **User-to-profile assignment** is mutable via
  `PUT /access/users/:id/roles` (`roles:assign`); free-form role design is not;
- **Approved and Rejected Evidence** views alongside the existing review queue;
- **Settings** utility with a per-Company working-location selector and regional
  date/time display preferences. These preferences are local and
  non-authoritative; Company and permission scope remains server-enforced;
- append-only audit-event writes for active workflows.

`KpiTarget`/`kpi_targets` is the active target authority. `KpiGoal`/
`kpi_goals` is read-only compatibility data; the active backend has no mutation
path for it.

## Not operational / deferred

The following are **not** client sidebar LIVE modules (hidden status pages or
deferred scope). Sequenced remaining work is in the
[completion plan](./completion-plan.md).

- standalone Policy Versions navigation page (versions live inside Policy detail);
- Tasks, Notifications, tenant-settings deep links and KPI mapping deep links;
- **free-form role and permission design**: profiles are fixed; only assignment
  of a user to a sanctioned profile is mutable;
- **report scheduling and subscriptions**: a report runs on demand and exports
  CSV or PDF; scheduled delivery and subscriptions remain deferred;
- GenRAC live REST or PostgreSQL adapters (CSV file adapter only; operator must
  place a file and configure via API);
- Policy Version obsoletion and Policy `INACTIVE` transitions;
- same-period Checkpoint Review correction;
- pseudonymisation / right to erasure, and MFA / SSO (both V2, not started).

Record comments, saved named views, in-app notifications, the Tasks module,
inline file preview, PDF report output, as-of snapshot reports and approver
delegation are implemented on this branch.

An S3 storage driver and a malware-scan hook exist behind the storage
abstraction, but local file storage remains the default and only verified
provider: the S3 path is unit-tested against a fake client and has never run
against real AWS, because no credentials exist in this environment.

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
migrations (25 folders under `backend/prisma/migrations/`), with the schema
dropped, migrated and reseeded before every one of the 44 test files so no
file inherits another's state.

The default Playwright suite intercepts API responses and is therefore a
rendering check, not proof the product works. A separate real-stack suite
(`frontend/tests-real-stack`, `npm run test:e2e:real-stack`) drives the browser
against a live API and real PostgreSQL with no intercepts, and runs in CI. It
currently covers the evidence-gate refusal path; a human walkthrough is still
required for the breadth of a release candidate.

See:

- [Database dictionary](../database/database-dictionary.md)
- [Route inventory](../frontend-route-mapping.md)
- [Security baseline](../security/security-baseline.md)
- [Coverage matrix](../testing/coverage-matrix.md)
- [Known limitations](../known-limitations.md)
- [Evidence demo and release readiness](../evidence-demo-and-release-readiness.md)
- [UAT checklist](../uat/uat-checklist.md)
