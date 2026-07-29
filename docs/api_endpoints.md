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

List endpoints use `page` and `pageSize` and return `meta.page`,
`meta.pageSize`, `meta.total` and `meta.totalPages`.

## Explicitly absent

No active API implements Policy, Control, Evidence, Gap, CAPA, Import, Tasks,
Notifications, Reports, audit search/export, settings or GenRAC connectivity.
No active endpoint writes to `kpi_goals`.

The backend route mount in `backend/src/routes/index.ts` and the individual
domain route modules are the code authority. Proposed endpoints in historical
prototype material are not API commitments.
