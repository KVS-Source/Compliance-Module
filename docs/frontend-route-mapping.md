# Frontend route inventory

Authority: `frontend/src/app/routeDefinitions.ts` and
`frontend/src/app/router.tsx`. Regenerate this file from those sources rather
than editing counts by hand; `npm run guard:routes` fails the build when the
two disagree.

The route guard enforces unique paths and route IDs, navigation resolution,
status/page consistency and these counts:

- one public login;
- 60 protected `LIVE` route patterns — 46 visible navigation routes (45 grouped
  modules plus the Settings utility), 13 detail/child patterns and one
  account-menu route;
- 0 visible `IN_DEVELOPMENT` routes and 0 `AWAITING_INTEGRATION` routes: no
  client-visible navigation entry may carry a non-live badge;
- 13 hidden `COMPATIBILITY` routes;
- two Evidence compatibility redirects.

## Public route

| Path | Page | Authority |
| --- | --- | --- |
| `/login` | `LoginPage` | real auth API; public |

## Protected LIVE sidebar modules: 45

These render dedicated business pages and call real Express/PostgreSQL APIs.
They must never render `ModuleStatusPage`. Permission is the code the route
requires before it will load; a caller without it sees a permission boundary
rather than an empty screen.

Several Master Data entries deliberately resolve to the same governed source
as their operational counterpart under the name the client uses — Target
Master is KPI Targets and Rule Master is Framework Rules. KPI Master and KPI
Catalogue both read the authoritative KPI definitions API, but render distinct
master-data and Company-catalogue views.

### Overview

| Path | Module | Permission | Primary API |
| --- | --- | --- | --- |
| `/dashboard` | Dashboard | `dashboard:read` | `GET /dashboard/summary` |

### Administration

| Path | Module | Permission | Primary API |
| --- | --- | --- | --- |
| `/admin/companies` | Companies | `tenants:read` | `GET /tenants` |
| `/admin/users` | Users | `users:read` | `GET/POST /users · GET/PATCH /users/:id` |
| `/admin/roles` | Role & Access | `users:read` | `GET /access/profiles` |
| `/admin/departments` | Departments | `organisation:read` | `GET/POST /organisation/departments · PATCH /organisation/departments/:id` |
| `/admin/locations` | Locations | `organisation:read` | `GET/POST /organisation/locations · PATCH /organisation/locations/:id` |
| `/admin/organisation-units` | Organisation Units | `organisation:read` | `GET/POST /organisation/units · PATCH /organisation/units/:id` |

### Master Data

| Path | Module | Permission | Primary API |
| --- | --- | --- | --- |
| `/master/users` | User Master | `users:read` | `GET /users` |
| `/master/frequencies` | Frequency Master | `kpis:read` | `GET /kpis/frequencies` |
| `/master/targets` | Target Master | `kpis:read` | `GET /kpi-configurations · GET /kpi-targets` |
| `/master/frameworks` | Framework Master | `frameworks:read` | `GET /frameworks` |
| `/master/rules` | Rule Master | `frameworks:read` | `GET /frameworks · GET /frameworks/:id/rules` |
| `/master/policies` | Policy Master | `policies:read` | `GET /policies` |
| `/master/controls` | Control Master | `controls:read` | `GET /controls` |
| `/master/kpis` | KPI Master | `kpis:read` | `GET /kpis/catalogue` (definition-master view) |

### KPI Management

| Path | Module | Permission | Primary API |
| --- | --- | --- | --- |
| `/kpi/catalogue` | KPI Catalogue | `kpis:read` | `GET /kpis/catalogue` |
| `/kpi/mapping` | KPI Mapping & Compliance Traceability | `kpis:read` plus source-domain read permissions | `GET /kpis/traceability` |
| `/kpi/configuration` | KPI Configuration | `kpis:read` | `GET/POST /kpi-configurations · PATCH/DELETE /kpi-configurations/:id` |
| `/kpi/targets` | KPI Targets | `kpis:read` | `GET /kpi-configurations · GET/POST /kpi-targets · POST /kpi-targets/:id/submit|approve|reject|versions` |
| `/kpi/actual-entry` | KPI Actual Entry | `kpis:read` | `GET /kpi-configurations · GET /kpi-targets · POST /kpi-actuals` |
| `/kpi/approval` | KPI Approval | `kpis:read` | `GET /kpi-actuals · GET /kpi-actuals/:id · POST /kpi-actuals/:id/approve|reject|resubmit` |

### Compliance Management

| Path | Module | Permission | Primary API |
| --- | --- | --- | --- |
| `/compliance/frameworks` | Frameworks | `frameworks:read` | `GET /frameworks` |
| `/compliance/controls` | Controls | `controls:read` | `GET/POST /controls · GET/PATCH /controls/:id · lifecycle and mappings` |
| `/compliance/checkpoints` | Checkpoints | `checkpoints:read` | `GET/POST /checkpoints · GET/PATCH /checkpoints/:id · Reviews, lifecycle, traceability and audit` |
| `/compliance/policy-register` | Policy Register | `policies:read` | `GET/POST /policies · GET/PATCH /policies/:id · Version lifecycle` |
| `/compliance/risks` | Risk Register | `risk:read` | `GET /risks · GET /risks/:id` |
| `/compliance/gaps` | Gap Register | `gaps:read` | `GET/POST /gaps · GET/PATCH /gaps/:id · owner and closure actions` |
| `/compliance/capa` | CAPA Register | `capa:read` | `GET/POST /capas · GET/PATCH /capas/:id · owner and closure actions` |

### Evidence Management

| Path | Module | Permission | Primary API |
| --- | --- | --- | --- |
| `/evidence` | Evidence Library | `evidence:read` | `GET /evidence · GET /evidence/:id · PATCH /evidence/:id · Lifecycle, file, review and audit` |
| `/evidence/new` | Create Evidence | `evidence:write` | `POST /evidence · POST /evidence/:id/file` |
| `/evidence/review` | Evidence Review | `evidence:review` | `GET /evidence/review-queue · POST /evidence/:id/approve|reject` |
| `/evidence/approved` | Approved Evidence | `evidence:read` | `GET /evidence?lifecycleStatus=APPROVED` |
| `/evidence/rejected` | Rejected Evidence | `evidence:read` | `GET /evidence?lifecycleStatus=REJECTED` |

### Data Management

| Path | Module | Permission | Primary API |
| --- | --- | --- | --- |
| `/data/import` | Data Import | `imports:read` | `POST /imports/workbook/preview · POST /imports/csv/preview · POST /imports/:id/commit` |
| `/data/import-history` | Import History | `imports:read` | `GET /imports · GET /imports/:id · GET /imports/:id/errors` |
| `/data/genrac-integration` | GenRAC Integration | `integrations:read` | `GET /integrations/genrac/status · POST test/preview/sync · GET history` |

### Audit & Operations

| Path | Module | Permission | Primary API |
| --- | --- | --- | --- |
| `/audit-trail` | Audit Trail | `audit:read` | `GET /audit-events · GET /audit-events/:id · GET /audit-events/export.csv` |
| `/compliance/operational-registers` | Operational Registers | `registers:read` | `GET /operational-registers · GET /operational-registers/:code/records` |
### Analytics & Reports

| Path | Module | Permission | Primary API |
| --- | --- | --- | --- |
| `/kpi/analytics` | KPI Analytics | `kpis:read` | `GET /kpis/analytics` |
| `/reports` | Analytics & Reports | `dashboard:read` | `GET /reports` |
| `/reports/kpi-variance` | KPI Reports | `kpis:read` | `GET /reports/kpi-variance` |
| `/reports/framework-compliance` | Compliance Reports | `controls:read` | `GET /reports/framework-compliance` |
| `/reports/evidence-status` | Evidence Reports | `evidence:read` | `GET /reports/evidence-status` |
| `/reports/gaps` | Risk / Gap / CAPA Reports | `gaps:read` | `GET /reports/gaps · /reports/risks · /reports/capa-aging` |
| `/reports/audit-activity` | Audit Reports | `audit:read` | `GET /reports/audit-activity` |

### Settings utility

| Path | Module | Permission | Primary API |
| --- | --- | --- | --- |
| `/settings` | Settings | Authenticated | `GET /organisation/locations` plus non-authoritative local display preferences |


The five `/reports/*` sidebar entries are not the whole Reports centre: the
catalogue holds ten reports and every one of them renders through the
parameterised `/reports/:reportKey` route listed below. KPI target-versus-actual,
risks, CAPA aging, policy review and Operational Registers are reachable from the
hub without a sidebar entry of their own.

## Protected LIVE detail and child patterns: 13

Declared directly in the router, so they carry no `routeDefinitions` entry and
never appear in `migratedPaths`. The guard asserts them separately.


| Path pattern | Page |
| --- | --- |
| `/kpi/configuration/:configurationId/targets` | `KpiTargetsPage` |
| `/compliance/risks/:riskId` | `RiskDetailPage` |
| `/compliance/policies/:policyId` | `PolicyDetailPage` |
| `/compliance/controls/:controlId` | `ControlDetailPage` |
| `/compliance/checkpoints/:checkpointId` | `CheckpointDetailPage` |
| `/master/frameworks/:frameworkId/rules` | `FrameworkRulesPage` |
| `/evidence/:evidenceId` | `EvidenceDetailPage` |
| `/compliance/gaps/:gapId` | `GapDetailPage` |
| `/compliance/capa/:capaId` | `CapaDetailPage` |
| `/data/import-history/:importId` | `ImportDetailPage` |
| `/reports/:reportKey` | `ReportViewPage` |
| `/compliance/operational-registers/:registerCode` | `OperationalRegistersPage` |
| `/compliance/operational-registers/:registerCode/records/:recordId` | `OperationalRegisterDetailPage` |

## Protected LIVE account route: 1

| Path | Page | Notes |
| --- | --- | --- |
| `/account/change-password` | `ChangePasswordPage` | Reached from the Topbar profile menu. Held out of `clientNavigationPaths` and `utilityRoutes` so the sidebar contract stays untouched. |

## Hidden IN DEVELOPMENT deep links: 8

Not in the client sidebar. Each resolves to `ModuleStatusPage` and states
plainly that the module is not operational:

| Path | Module |
| --- | --- |
| `/kpi/dashboard` | KPI Dashboard |
| `/compliance/gaps/review` | Gap Review |
| `/compliance/capa/review` | CAPA Review |
| `/tasks` | Tasks |
| `/notifications` | Notifications |
| `/data/upload-errors` | Upload Errors |
| `/settings/tenant` | Tenant Settings |
| `/settings/integrations` | Integration Settings |

## Hidden COMPATIBILITY routes: 13

Published URLs that stay routable to a compatibility status page. They are
excluded from sidebar navigation and global search and are not operational
authorities:

| Path | Retained name | Superseded by |
| --- | --- | --- |
| `/master/customers` | Customer Master | — (prototype-only concept) |
| `/master/framework-rules` | Framework Rules | `/master/rules` |
| `/compliance/policy-versions` | Policy Versions | Version work inside Policy detail |
| `/upload/policy-master` | Policy Master Upload | `/data/import` |
| `/upload/evidence-master` | Evidence Master Upload | `/data/import` |
| `/upload/kpi-data` | KPI Data Upload | `/data/import` |
| `/upload/customer-data` | Customer Data Upload | — (prototype-only concept) |
| `/upload/audit-reports` | Audit Reports Upload | `/data/import` |
| `/analytics/customers` | Customer Analytics | — (prototype-only concept) |
| `/analytics/kpis` | KPI Analytics | `/kpi/analytics` |
| `/reports/attribution` | Attribution Reports | — (prototype-only concept) |
| `/reports/deals` | Deals Won / Lost | — (prototype-only concept) |
| `/reports/customer-outcomes` | Customer Won / Lost | — (prototype-only concept) |

The guard also rejects any attempt to surface `/master/customers`,
`/analytics/customers` or `/reports/attribution` in visible navigation:
these are prototype-only concepts with no durable model behind them, so a
visible route would claim something the platform cannot honour.

## Evidence compatibility redirects: 2

| Path | Redirects to |
| --- | --- |
| `/evidence/register` | `/evidence/new` |
| `/evidence/upload` | `/evidence/new` |

These must keep resolving to a replace-navigation redirect rather than to the
Evidence detail route or a status page.

## Dormant prototype boundary

`frontend/src/features/prototype/PrototypeRoutePage.tsx` and
`prototypeRouteData.ts` are retained reference source but are not imported by
the active router. `scripts/check-active-boundaries.mjs` rejects active imports
of prototype data and `scripts/check-live-routes.mjs` rejects prototype
components in the router.

The static HTML prototype is a compatibility/reference artifact. It is not an
application runtime, database authority or source of production data.
