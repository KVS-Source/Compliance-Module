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

Current route totals are one public login, 22 protected `LIVE` patterns, 26
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
- append-only audit-event writes for active workflows;
- Policy register, Policy Version, Framework mapping, submit/approve/reject,
  Policy-scoped audit read and traceability APIs (Milestone 4 Slice 2);
- React Policy Register and Policy detail workflows (Milestone 4 Slice 5),
  including Version create/edit, Framework mapping, submit/approve/reject,
  archive, traceability and Policy-scoped audit history;
- React Control Register and Control detail workflows (Milestone 4 Slice 6),
  including create/edit, activate/deactivate/archive, Policy Version / Framework /
  Framework Rule mappings, Checkpoint counts, Control traceability and
  Control-scoped audit history;
- React Checkpoint Register and Checkpoint detail workflows (Milestone 4 Slice 7),
  including create/edit, activate/deactivate/archive, Submit Review, latest
  Review, Review history, Checkpoint traceability and Checkpoint-scoped audit
  history.

`KpiTarget`/`kpi_targets` is the active target authority. `KpiGoal`/
`kpi_goals` is read-only compatibility data; the active backend has no mutation
path for it.

## Not operational

Control REST APIs are operational after Milestone 4 Slice 3. React Control
Register and detail pages are operational after Milestone 4 Slice 6. Checkpoint
register, lifecycle, Review, latest-review, traceability and audit APIs are
operational after Milestone 4 Slice 4, with a dedicated Postman collection and
pgAdmin guide. React Checkpoint Register and detail pages are operational after
Milestone 4 Slice 7. The standalone Policy Versions navigation page remains
`IN_DEVELOPMENT` (Version management lives inside Policy detail for Slice 5).
Milestone 5 Slice 1 delivers Evidence **metadata** backend foundation (create,
list, detail, patch, fail-closed submit, archive, audit). Evidence React routes
remain `IN_DEVELOPMENT`. Gap, CAPA, Import, Tasks, Notifications, Reports,
global audit search/export, settings and most broader operations modules are
not operational. Their visible routes are status pages, not simulated business
screens.

Policy Version obsoletion and Policy `INACTIVE` transitions are deferred.
Evidence-dependent KPI and Policy approval behaviour remains fail-closed where
`requiresEvidence=true`. Evidence file upload, download, malware scanning and
approve/reject HTTP are not implemented; submit returns `EVIDENCE_FILE_REQUIRED`.
Control/Checkpoint Evidence link mutation APIs are not implemented. Policy
content is rendered as plain text only.

This release is not a production deployment.

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
