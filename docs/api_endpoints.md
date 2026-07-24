# API endpoints

All routes except login and health require a bearer JWT. Permission middleware additionally protects mutations and approvals.

| Module | Endpoints |
|---|---|
| Health/docs | `GET /health`, `GET /api-docs`, `GET /openapi.json` |
| Auth | `POST /api/v1/auth/login`, `GET /api/v1/auth/me` |
| Dashboard | `GET /api/v1/dashboard/summary` |
| KPI | CRUD under `/api/v1/kpis`, `/kpi-targets`, `/kpi-actuals`; actual actions `submit`, `approve`, `reject`, `create-risk` |
| KPI mapping | CRUD/deactivate under `/api/v1/kpi-mapping`; UI order from `GET /api/v1/kpi-mapping/sequence` |
| Evidence | `POST /evidence/upload`, list/get, `approve`, `reject`, `request-more-info`, `link` |
| Policy lifecycle | CRUD under `/policy-register`; `submit-review`, `approve`, `reject`, `mark-reviewed` |
| Remediation | CRUD under `/gaps` and `/capa`; gap `reopen`; CAPA `close`, `reopen` |
| Risk register | CRUD under `/api/v1/risks`; filter by `classification` or `kpi_id`; missed KPI endpoint `POST /api/v1/kpi-actuals/:id/create-risk` |
| Admin/catalog | clients, users, roles, permissions, departments, employees, frameworks, controls, checkpoints, policies, lookups |
| Audit | `GET /api/v1/audit-trail` with module/action/record filters |

Pagination uses `?offset=0&limit=50` (maximum 200). Cross-tenant IDs respond as not found.

KPI actual list/detail responses include the related KPI, exposing `unit` and `frequency` for the actual-entry page. `create-risk` accepts a `risk_code`, `classification` (`major` or `minor`), and optional ownership/mitigation fields; it is rejected when the KPI target was achieved or an open risk already exists for that actual.

Dashboard summary includes `open_risks`, `major_risks`, and `minor_risks`, scoped to the authenticated client.
