# API-to-frontend mapping

This document is a navigation pointer. The previous Milestone 1 snapshot became
incorrect after KPI and Risk workflow delivery and is retired as an endpoint
authority.

- Current backend endpoints:
  [api_endpoints.md](./api_endpoints.md)
- Current frontend routes and status classification:
  [frontend-route-mapping.md](./frontend-route-mapping.md)
- Current product scope:
  [current-status-and-v1-scope.md](./status/current-status-and-v1-scope.md)
- Database models and authority:
  [database-dictionary.md](./database/database-dictionary.md)

Runtime mapping rules remain:

1. the same-origin client uses `/api/v1`;
2. `apiClient.ts` owns the memory-only access token and one refresh/retry path;
3. `AuthContext` and `TenantContext` own identity and validated Company switch;
4. domain adapters call only implemented endpoints;
5. unfinished routes render `ModuleStatusPage` and never simulate persistence.
