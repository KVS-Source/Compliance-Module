# Frontend inventory

The active frontend is `frontend/`, using React, TypeScript and React Router
data/library mode.

## Active architecture

- `frontend/src/app/router.tsx` — public login, protected shell, live pages and
  status-page routing;
- `frontend/src/app/routeDefinitions.ts` — route/status/navigation metadata;
- `frontend/src/context/` — authentication, Company and toast state;
- `frontend/src/services/` — same-origin API adapters;
- `frontend/src/features/` — live domain pages plus status/dormant reference
  components;
- `frontend/src/components/` — shell, navigation, tables and feedback.

## Operational inventory

There are 16 protected live route patterns for dashboard, Companies, users,
organisation, frameworks/rules, KPI configuration/targets/actuals/approval and
risk workflows. See
[frontend-route-mapping.md](./frontend-route-mapping.md) for the exhaustive
route/status list.

`ModuleStatusPage` is the only page used for visible unfinished, awaiting
integration and compatibility routes. It never represents data as persisted.

`PrototypeRoutePage.tsx` and `prototypeRouteData.ts` are dormant and unrouted.
The active-boundary and route guards protect that boundary.

## Browser storage

The access token is module-memory only and the refresh token is an HTTP-only
cookie. Browser preferences may persist UI state, but authoritative business
records, credentials and tokens are not stored in local/session storage.

## Test interpretation

Playwright validates React behavior using browser-intercepted `/api/v1/**`
responses. It is not browser-to-PostgreSQL E2E. Human real-stack UAT uses the
checklist in [uat-checklist.md](./uat/uat-checklist.md).
