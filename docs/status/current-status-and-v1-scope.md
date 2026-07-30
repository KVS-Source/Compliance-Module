# Current status and V1 scope

Baseline date: 2026-07-30

## Release classification

The remediated real-stack UAT passed before this Milestone 0 re-baseline.
Production readiness has **not** passed. Milestone 0 establishes truthful
repository, database, security, route, test and operating documentation; it
does not add business domains or deployment infrastructure.

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

Current route totals are one public login, 16 protected `LIVE` patterns, 29
visible `IN_DEVELOPMENT` routes, one visible `AWAITING_INTEGRATION` route and 22
hidden `COMPATIBILITY` routes.

## Implemented V1/UAT capability

- authentication, refresh rotation, logout and active Company selection;
- Companies, users and organisation masters;
- frameworks and framework rules;
- KPI configurations and versioned KPI Targets;
- KPI actual entry, server-side calculation and append-only approval history;
- automatic KPI-linked risks;
- Risk Register, owner assignment, append-only review/treatment, residual
  scoring, closure and reopening;
- tenant-scoped database-backed dashboard;
- append-only audit-event writes for active workflows.

`KpiTarget`/`kpi_targets` is the active target authority. `KpiGoal`/
`kpi_goals` is read-only compatibility data; the active backend has no mutation
path for it.

## Not operational

Policy, Policy Version, Control and Checkpoint PostgreSQL persistence exists as
the Milestone 4 Slice 1 foundation. No backend API or operational frontend page
exists for it yet. Policies, Controls and Checkpoints therefore remain
`IN_DEVELOPMENT`, alongside Evidence, Gap, CAPA, Import, Tasks, Notifications,
Reports, audit search/export, settings and most broader operations modules.
Their visible routes are status pages, not simulated business screens.

GenRAC is `AWAITING_INTEGRATION`. No connector, live sync, credentials or
network access exists. Client access and reviewed interface documentation are
required before a later integration milestone.

S3 is not active. Local development file storage is the only usable provider;
selecting S3 fails configuration closed. AWS is not configured and this
baseline does not establish cloud deployment readiness.

## Security boundary

- Tenant isolation uses authenticated tenant context, active membership
  revalidation, repository predicates, composite tenant foreign keys,
  constraints and triggers.
- PostgreSQL row-level security is not implemented.
- `COMPANY_ADMIN` still uses wildcard permission `"*"` as UAT-only technical
  debt; removal is mandatory before production.
- Access tokens are memory-only. Opaque refresh tokens are hashed at rest and
  transported only by an HTTP-only, `SameSite=Strict` cookie; production
  requires `Secure`.
- Audit events, KPI and Policy approval history, Checkpoint reviews, risk
  reviews and risk treatments are append-only in PostgreSQL.

## Test boundary

Backend integration tests use real disposable PostgreSQL and all ten
migrations. Automated Playwright uses browser-intercepted API responses and is
not browser-to-PostgreSQL E2E. A human real-stack browser walkthrough remains
required for each release candidate.

See:

- [Database dictionary](../database/database-dictionary.md)
- [Route inventory](../frontend-route-mapping.md)
- [Security baseline](../security/security-baseline.md)
- [Coverage matrix](../testing/coverage-matrix.md)
- [Known limitations](../known-limitations.md)
- [UAT checklist](../uat/uat-checklist.md)
