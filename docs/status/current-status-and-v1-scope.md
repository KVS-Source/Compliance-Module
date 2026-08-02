# Current status and V1 scope

Baseline date: 2026-08-02

## Release classification

The remediated real-stack UAT passed before this Milestone 0 re-baseline.
Production readiness has **not** passed. Milestone 5 closes Evidence metadata,
file handling, linking, review, React UI, and Evidence gates for Checkpoint,
Policy Version, and KPI actual approval. This baseline does not add deployment
infrastructure or resolve production blockers listed in
[known limitations](../known-limitations.md).

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

Current route totals are one public login, 26 protected `LIVE` patterns, 21
visible `IN_DEVELOPMENT` routes, one visible `AWAITING_INTEGRATION` route and 22
hidden `COMPATIBILITY` routes. Authoritative counts come from
`frontend/src/app/routeDefinitions.ts` and `npm run guard:routes`.

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
  history;
- Evidence metadata, local file upload/download/submit, DRAFT-only
  Control/Checkpoint/KpiActual link APIs, approve/reject review, and React
  Evidence Library / Create / Detail / Review / link panels (Milestone 5);
- Checkpoint, Policy Version and KPI actual Evidence gates (HTTP 409
  `EVIDENCE_REQUIRED` with safe configured reasons when coverage is incomplete).

`KpiTarget`/`kpi_targets` is the active target authority. `KpiGoal`/
`kpi_goals` is read-only compatibility data; the active backend has no mutation
path for it.

## Not operational

The standalone Policy Versions navigation page remains `IN_DEVELOPMENT` (Version
management lives inside Policy detail). Gap, CAPA, Import, Tasks, Notifications,
Reports, global audit search/export, settings and most broader operations
modules are not operational. Their visible routes are status pages, not
simulated business screens.

Policy Version obsoletion and Policy `INACTIVE` transitions are deferred.
Malware scanning, S3, inline preview, reverse Control/Checkpoint Evidence list
APIs and GenRAC live sync are not implemented. Policy and Evidence content
render as plain text where applicable. Same-period Checkpoint Review correction
remains unsupported.

This release is not a production deployment.

GenRAC is `AWAITING_INTEGRATION`. No connector, live sync, credentials or
network access exists.

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
- Audit events, KPI and Policy approval history, Checkpoint reviews, Evidence
  review decisions, risk reviews and risk treatments are append-only in PostgreSQL.

## Test boundary

Backend integration tests use real disposable PostgreSQL and all fourteen
migrations. Automated Playwright uses browser-intercepted API responses and is
not browser-to-PostgreSQL E2E. A human real-stack browser walkthrough remains
required for each release candidate.

See:

- [Database dictionary](../database/database-dictionary.md)
- [Route inventory](../frontend-route-mapping.md)
- [Security baseline](../security/security-baseline.md)
- [Coverage matrix](../testing/coverage-matrix.md)
- [Known limitations](../known-limitations.md)
- [Evidence demo and release readiness](../evidence-demo-and-release-readiness.md)
- [UAT checklist](../uat/uat-checklist.md)
