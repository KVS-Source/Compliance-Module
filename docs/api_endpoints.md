# Active API endpoint inventory

Base path: `/api/v1`
Swagger UI: `/api/docs`

All responses use the success/error envelope. `health`, `ready`, login,
refresh and logout have their route-specific authentication behavior; business
routes require bearer authentication and active Company membership.

| Domain | Active endpoints |
| --- | --- |
| Operations | `GET /health`; `GET /ready` |
| Auth | `POST /auth/login`; `POST /auth/refresh`; `POST /auth/logout`; `GET /auth/me`; `POST /auth/tenant-context` |
| Companies/dashboard | `GET /tenants`; `GET /dashboard/summary` |
| Users | `GET /users`; `GET /users/:id`; `POST /users`; `PATCH /users/:id` |
| Bulk user import | `GET /users/import/template` and `GET /users/import/template.csv` (`users:read`); `POST /users/import/preview` (dry run, `users:write`); `POST /users/import/commit` (`users:write`, plus `roles:assign` when any row carries a role). The file carries no password: `initialPassword` is supplied with the commit request and is never returned |
| Organisation | `GET/POST /organisation/departments`; `PATCH /organisation/departments/:id`; equivalent `locations` and `units` paths |
| Frameworks | `GET /frameworks`; `GET /frameworks/:id`; `GET /frameworks/:id/rules` |
| KPI catalogue/compatibility | `GET /kpi-definitions`; `GET /kpi-goals` (compatibility read only) |
| KPI catalogue, analytics and traceability | `GET /kpis/catalogue`; `GET /kpis/frequencies`; `GET /kpis/analytics` (read-only, `kpis:read`); `GET /kpis/traceability` (read-only derived graph; requires `kpis:read`, `evidence:read`, `controls:read`, `frameworks:read`, `policies:read` and `risk:read`) |
| Role and access profiles | `GET /access/profiles` (read-only, `users:read`; response states `mutable: false`); `GET /access/privilege-review` (`users:read`); `GET/PUT /access/users/:userId/roles` (read `users:read`, write `roles:assign`) |
| Reports | `GET /reports` (catalogue with a per-report `available` flag); `GET /reports/:reportKey`; `GET /reports/:reportKey/export.csv`. `dashboard:read` plus the report's own module permission; CSV additionally requires `exports:read` |
| KPI configuration | `GET/POST /kpi-configurations`; `GET /kpi-configurations/threshold-defaults`; `GET/PATCH/DELETE /kpi-configurations/:id` |
| KPI Targets | `GET/POST /kpi-targets`; `GET/PATCH/DELETE /kpi-targets/:id`; `POST /kpi-targets/:id/submit`; `/approve`; `/reject`; `/versions` |
| KPI actuals | `GET/POST /kpi-actuals`; `GET /kpi-actuals/:id`; `POST /kpi-actuals/:id/approve`; `/reject`; `/resubmit` |
| Risks | `GET/POST /risks`; `GET /risks/:id`; `POST /risks/:id/reviews`; `/treatments`; `/treatments/:treatmentId/complete`; `PATCH /risks/:id/owner`; `POST /risks/:id/close`; `/reopen` |
| Policies | `GET/POST /policies`; `GET/PATCH /policies/:policyId`; `POST /policies/:policyId/archive`; `GET/POST /policies/:policyId/versions`; `GET /policies/:policyId/versions/:versionId`; `GET /policies/:policyId/traceability`; `GET /policies/:policyId/audit-events`; `PATCH /policy-versions/:versionId`; `PUT /policy-versions/:versionId/frameworks`; `POST /policy-versions/:versionId/submit`; `/approve`; `/reject` |
| Controls | `GET/POST /controls`; `GET/PATCH /controls/:controlId`; `POST /controls/:controlId/activate`; `/deactivate`; `/archive`; `PUT /controls/:controlId/policy-versions`; `/frameworks`; `/framework-rules`; `GET /controls/:controlId/traceability`; `/audit-events` |
| Checkpoints | `GET/POST /checkpoints`; `GET/PATCH /checkpoints/:checkpointId`; `POST /checkpoints/:checkpointId/activate`; `/deactivate`; `/archive`; `GET/POST /checkpoints/:checkpointId/reviews` (Evidence gate when `evidenceRequired`); `GET /checkpoints/:checkpointId/latest-review`; `/traceability`; `/audit-events` |
| Evidence | `GET/POST /evidence`; `GET /evidence/review-queue`; `GET/PATCH /evidence/:evidenceId`; `POST /evidence/:evidenceId/file`; `GET /evidence/:evidenceId/file`; `POST /evidence/:evidenceId/submit`; `/archive`; `/approve`; `/reject`; `GET /evidence/:evidenceId/review-decisions`; Control/Checkpoint link routes; `GET /evidence/:evidenceId/audit-events` |
| Gaps | `GET/POST /gaps`; `GET/PATCH /gaps/:gapId`; `PATCH /gaps/:gapId/owner`; `POST /gaps/:gapId/close`; `/reopen`; `POST /gaps/:gapId/evidence`; `DELETE /gaps/:gapId/evidence/:evidenceId` |
| CAPAs | `GET/POST /capas`; `GET/PATCH /capas/:capaId`; `PATCH /capas/:capaId/owner`; `POST /capas/:capaId/close`; `/reopen`; `POST /capas/:capaId/evidence`; `DELETE /capas/:capaId/evidence/:evidenceId` |
| Operational registers | `GET /operational-registers`; `GET/POST /operational-registers/:registerCode/records`; `GET/PATCH /operational-registers/:registerCode/records/:recordId` |
| Workbook imports | `GET /imports`; `GET /imports/:importId`; `GET /imports/:importId/errors`; `POST /imports/workbook/preview`; `POST /imports/csv/preview?type=`; `POST /imports/:importId/commit`; `GET /imports/csv/templates`; `GET /imports/csv/templates/:type` |
| Audit trail | `GET /audit-events`; `GET /audit-events/:eventId`; `GET /audit-events/export.csv` |
| GenRAC integration | `GET /integrations/genrac/status`; `POST /integrations/genrac/test-connection`; `POST /integrations/genrac/configure-csv`; `POST /integrations/genrac/preview`; `POST /integrations/genrac/sync`; `GET /integrations/genrac/history`; `GET /integrations/genrac/history/:syncRunId` |
| CSV exports | `GET /exports/gaps.csv`; `/capas.csv`; `/kpi-actuals.csv`; `/risks.csv`; `/evidence.csv`; `/operational-registers/:registerCode.csv` |

List endpoints use `page` and `pageSize` and return `meta.page`,
`meta.pageSize`, `meta.total` and `meta.totalPages`.

Policy list filters: `versionStatus` and `frameworkId` refer to `latestVersion`;
`reviewDueFrom` / `reviewDueTo` refer to `currentApprovedVersion` when present.

Control list filters: `policyId` / `policyVersionId` / `frameworkId` /
`frameworkRuleId` match active mappings only; `reviewDueFrom` / `reviewDueTo`
use `Control.nextReviewDate`.

Checkpoint list filters: `controlId` matches the direct parent;
`controlLifecycleStatus`, `frameworkId` and `policyId` follow the parent Control
(active mappings only for framework/policy); `latestOutcome` uses the
database-authoritative latest Review; `dueFrom` / `dueTo` use
`Checkpoint.nextReviewDate`. Default list includes all lifecycle states.

Evidence list filters: `q` (code/title), `lifecycleStatus`, `ownerId`,
`departmentId`, `expiresBefore` / `expiresAfter`. File upload is
`POST /evidence/:evidenceId/file` (multipart field `file`, max 10 MiB,
allowlisted types). Download is `GET /evidence/:evidenceId/file` and requires
`evidence:read` plus `evidence:download`. Submit requires a stored file.
Control and Checkpoint link mutations require DRAFT Evidence and
`evidence:write`; lists require `evidence:read`. New links require ACTIVE
targets. Soft unlink uses `POST …/unlink`. Approve/reject require
`evidence:review` and only apply to SUBMITTED Evidence (maker-checker:
creator/uploader/submitter cannot decide). Review queue requires
`evidence:review`. Reverse Control/Checkpoint Evidence lists are not present.
Checkpoint reviews with `evidenceRequired=true` require qualifying linked
APPROVED Evidence (`409 EVIDENCE_REQUIRED` otherwise). Policy Version approval
with `requiresEvidence=true` requires exact-version Control/Checkpoint
coverage (`409 EVIDENCE_REQUIRED` with configured reasons). KPI actual approval
with `requiresEvidence=true` requires qualifying Evidence↔KpiActual links
(`409 EVIDENCE_REQUIRED` with `EVIDENCE_KPI_LINK_REQUIRED` or
`EVIDENCE_KPI_COVERAGE_INCOMPLETE`).

The frozen request/response shapes, permissions, lifecycle gates, dashboard
extensions, export contract and GenBioCa UAT load are documented in
[backend-data-mvp-contract-and-uat.md](./backend-data-mvp-contract-and-uat.md).

## Explicitly absent

No active API implements reverse Evidence lookup on Controls/Checkpoints,
workbook upload preview/commit, Tasks, Notifications, a report builder, global
audit search/export, settings or GenRAC connectivity.
Policy Version obsoletion and Policy INACTIVE transitions are deferred.
No Control or Checkpoint DELETE route exists. No Review PATCH/DELETE or same-period
Review correction route exists. No nested `GET /controls/:controlId/checkpoints`
route exists — use `GET /checkpoints?controlId=`. No active endpoint writes to
`kpi_goals`. No Evidence hard-delete route exists.

The backend route mount in `backend/src/routes/index.ts` and the individual
domain route modules are the code authority. Proposed endpoints in historical
prototype material are not API commitments.
