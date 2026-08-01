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
| Organisation | `GET/POST /organisation/departments`; `PATCH /organisation/departments/:id`; equivalent `locations` and `units` paths |
| Frameworks | `GET /frameworks`; `GET /frameworks/:id`; `GET /frameworks/:id/rules` |
| KPI catalogue/compatibility | `GET /kpi-definitions`; `GET /kpi-goals` (compatibility read only) |
| KPI configuration | `GET/POST /kpi-configurations`; `GET /kpi-configurations/threshold-defaults`; `GET/PATCH/DELETE /kpi-configurations/:id` |
| KPI Targets | `GET/POST /kpi-targets`; `GET/PATCH/DELETE /kpi-targets/:id`; `POST /kpi-targets/:id/submit`; `/approve`; `/reject`; `/versions` |
| KPI actuals | `GET/POST /kpi-actuals`; `GET /kpi-actuals/:id`; `POST /kpi-actuals/:id/approve`; `/reject`; `/resubmit` |
| Risks | `GET /risks`; `GET /risks/:id`; `POST /risks/:id/reviews`; `/treatments`; `/treatments/:treatmentId/complete`; `PATCH /risks/:id/owner`; `POST /risks/:id/close`; `/reopen` |
| Policies | `GET/POST /policies`; `GET/PATCH /policies/:policyId`; `POST /policies/:policyId/archive`; `GET/POST /policies/:policyId/versions`; `GET /policies/:policyId/versions/:versionId`; `GET /policies/:policyId/traceability`; `GET /policies/:policyId/audit-events`; `PATCH /policy-versions/:versionId`; `PUT /policy-versions/:versionId/frameworks`; `POST /policy-versions/:versionId/submit`; `/approve`; `/reject` |
| Controls | `GET/POST /controls`; `GET/PATCH /controls/:controlId`; `POST /controls/:controlId/activate`; `/deactivate`; `/archive`; `PUT /controls/:controlId/policy-versions`; `/frameworks`; `/framework-rules`; `GET /controls/:controlId/traceability`; `/audit-events` |
| Checkpoints | `GET/POST /checkpoints`; `GET/PATCH /checkpoints/:checkpointId`; `POST /checkpoints/:checkpointId/activate`; `/deactivate`; `/archive`; `GET/POST /checkpoints/:checkpointId/reviews`; `GET /checkpoints/:checkpointId/latest-review`; `/traceability`; `/audit-events` |
| Evidence | `GET/POST /evidence`; `GET/PATCH /evidence/:evidenceId`; `POST /evidence/:evidenceId/file`; `GET /evidence/:evidenceId/file`; `POST /evidence/:evidenceId/submit`; `/archive`; `POST /evidence/:evidenceId/controls/:controlId`; `/unlink`; `GET /evidence/:evidenceId/controls`; `POST /evidence/:evidenceId/checkpoints/:checkpointId`; `/unlink`; `GET /evidence/:evidenceId/checkpoints`; `GET /evidence/:evidenceId/audit-events` |

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
targets. Soft unlink uses `POST …/unlink`. Reverse Control/Checkpoint Evidence
lists and approve/reject HTTP are not present. Linking does not submit or
approve Evidence and does not satisfy Policy/KPI/Checkpoint Evidence gates.

## Explicitly absent

No active API implements Evidence approve/reject, reverse Evidence lookup on
Controls/Checkpoints, Gap, CAPA, Import, Tasks, Notifications, Reports,
global audit search/export, settings or GenRAC connectivity.
Policy Version obsoletion and Policy INACTIVE transitions are deferred.
No Control or Checkpoint DELETE route exists. No Review PATCH/DELETE or same-period
Review correction route exists. No nested `GET /controls/:controlId/checkpoints`
route exists — use `GET /checkpoints?controlId=`. No active endpoint writes to
`kpi_goals`. No Evidence hard-delete route exists.

The backend route mount in `backend/src/routes/index.ts` and the individual
domain route modules are the code authority. Proposed endpoints in historical
prototype material are not API commitments.
