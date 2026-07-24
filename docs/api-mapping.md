# API mapping

Base URL: `/api/v1`. Swagger UI: `/api/docs`. All responses use either `{ "success": true, "data": ..., "meta"?: ... }` or `{ "success": false, "error": { "code", "message", "details"? } }`.

| Method/path | Auth/context | Permission | Frontend use |
|---|---|---|---|
| `GET /health` | Public | — | Service diagnostics |
| `POST /auth/login` | Public | — | Login; sets rotating HTTP-only refresh cookie |
| `POST /auth/refresh` | Refresh cookie | — | Rotation; restores memory-only access token |
| `POST /auth/logout` | Bearer + cookie | — | Revocation and audit |
| `GET /auth/me` | Bearer | Membership | Current identity |
| `POST /auth/tenant-context` | Bearer | Target membership | Company switch; issues new token context |
| `GET /tenants` | Bearer | `tenants:read` or `*` | Company selector and Company Setup |
| `GET /users` | Bearer | `users:read` or `*` | User Management |
| `GET /users/:id` | Bearer | `users:read` or `*` | Company-isolated user detail |
| `GET /organisation/departments` | Bearer | `organisation:read` or `*` | Department Setup |
| `GET /organisation/locations` | Bearer | `organisation:read` or `*` | Location Setup |
| `GET /organisation/units` | Bearer | `organisation:read` or `*` | Available to adapter |
| `GET /frameworks` | Bearer | `frameworks:read` or `*` | Framework Master |
| `GET /frameworks/:id` | Bearer | `frameworks:read` or `*` | Framework detail |
| `GET /frameworks/:id/rules` | Bearer | `frameworks:read` or `*` | Framework rules adapter |
| `GET /kpi-definitions` | Bearer | `kpis:read` or `*` | Available to adapter |
| `GET /kpi-goals` | Bearer + Company | `kpis:read` or `*` | Available to adapter |

Every list endpoint supports `page` (minimum 1) and `pageSize` (1–100), and returns `meta.page`, `meta.pageSize`, `meta.total`, `meta.totalPages`.

## Request flow

Routes apply authentication, revalidate the claimed active Company membership against PostgreSQL, enforce permission claims and run Zod validation before controller invocation. Controllers translate HTTP. Services hold account/membership and mapping rules. Repositories or `SharedMasterProvider` access Prisma. No route handler trusts a body Company identifier as the active context.

## React frontend adapter

`frontend/src/services/apiClient.ts` owns the memory-only access token, response
envelope handling, one shared refresh attempt and one retry. Domain adapters are
split across `authApi.ts`, `tenantApi.ts`, `frameworkApi.ts` and
`masterDataApi.ts`. `AuthContext` owns identity and permission checks;
`TenantContext` performs backend-validated Company switching.

React Milestone 1 integrates authentication, Company context, Company Setup,
User Management, Framework Master/Rules, Department Setup, Location Setup and
Organisation Units. These master screens are read-only because Milestone 1
defines no write endpoints. Remaining routes are registered and visibly marked
with their future migration phase rather than storing mock business data in the
browser.
