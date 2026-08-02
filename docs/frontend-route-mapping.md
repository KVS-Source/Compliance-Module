# Frontend route inventory

Authority: `frontend/src/app/routeDefinitions.ts` and
`frontend/src/app/router.tsx`

The route guard enforces unique paths and route IDs, navigation resolution,
status/page consistency and these counts:

- one public login;
- 26 protected `LIVE` route patterns;
- 21 visible `IN_DEVELOPMENT` routes;
- one visible `AWAITING_INTEGRATION` route;
- 22 hidden `COMPATIBILITY` routes.

## Public route

| Path | Page | Authority |
| --- | --- | --- |
| `/login` | `LoginPage` | real auth API; public |

## Protected LIVE routes: 26

These render dedicated business pages and call real Express/PostgreSQL APIs.
They must never render `ModuleStatusPage`.

| Path pattern | Page | Primary API |
| --- | --- | --- |
| `/dashboard` | `DashboardPage` | `GET /dashboard/summary` |
| `/admin/companies` | `CompaniesPage` | `GET /tenants` |
| `/admin/users` | `UsersPage` | user read/write API |
| `/admin/departments` | `OrganisationPage` | department read/write API |
| `/admin/locations` | `OrganisationPage` | location read/write API |
| `/admin/organisation-units` | `OrganisationPage` | unit read/write API |
| `/master/frameworks` | `FrameworksPage` | `GET /frameworks` |
| `/master/framework-rules` | `FrameworksPage` | framework/rule reads |
| `/master/frameworks/:frameworkId/rules` | `FrameworkRulesPage` | framework/rule reads |
| `/kpi/configuration` | `KpiConfigurationPage` | KPI configuration API |
| `/kpi/targets` | `KpiConfigurationPage` target mode | KPI configuration/target APIs |
| `/kpi/configuration/:configurationId/targets` | `KpiTargetsPage` | KPI target lifecycle |
| `/kpi/actual-entry` | `KpiActualEntryPage` | target/configuration reads and actual submission |
| `/kpi/approval` | `KpiApprovalPage` | actual read/approve/reject/resubmit |
| `/compliance/risks` | `RiskRegisterPage` | risk reads |
| `/compliance/risks/:riskId` | `RiskDetailPage` | risk review/treatment/owner/close/reopen |
| `/compliance/policy-register` | `PolicyRegisterPage` | Policy list/create |
| `/compliance/policies/:policyId` | `PolicyDetailPage` | Policy detail, Versions, decisions |
| `/compliance/controls` | `ControlRegisterPage` | Control list/create |
| `/compliance/controls/:controlId` | `ControlDetailPage` | Control detail, lifecycle, mappings |
| `/compliance/checkpoints` | `CheckpointRegisterPage` | Checkpoint list/create |
| `/compliance/checkpoints/:checkpointId` | `CheckpointDetailPage` | Checkpoint detail, Review, lifecycle |
| `/evidence` | `EvidenceLibraryPage` | Evidence list/read |
| `/evidence/new` | `EvidenceCreatePage` | Evidence create and file upload |
| `/evidence/review` | `EvidenceReviewQueuePage` | Evidence review queue |
| `/evidence/:evidenceId` | `EvidenceDetailPage` | Evidence detail, links, lifecycle |

The 19 top-level paths are in `migratedPaths`; seven child/detail patterns are
declared directly in the router and separately asserted by the guard.

## Visible IN DEVELOPMENT routes: 21

Each path resolves to `ModuleStatusPage` and explicitly states that the module
is not operational:

| Area | Paths |
| --- | --- |
| Administration | `/admin/roles` |
| Policies & Controls | `/compliance/policy-versions` |
| KPI | `/master/kpis`, `/kpi/dashboard`, `/kpi/mapping` |
| Gap & CAPA | `/compliance/gaps`, `/compliance/gaps/review`, `/compliance/capa`, `/compliance/capa/review` |
| Audit & Operations | `/audit-trail`, `/tasks`, `/notifications` |
| Data Management | `/data/import`, `/data/import-history`, `/data/upload-errors` |
| Reports | `/reports`, `/reports/kpi-performance`, `/reports/risk-summary`, `/reports/compliance-summary` |
| Settings | `/settings/tenant`, `/settings/integrations` |

Legacy Evidence URLs (`/evidence/register`, `/evidence/upload`, etc.) redirect
to the live Evidence routes; they are not listed as `IN_DEVELOPMENT`.

## AWAITING INTEGRATION route: 1

| Path | Status page contract |
| --- | --- |
| `/data/genrac-integration` | **Awaiting GenRAC Access**; no live connection is configured; client access and interface review are pending; a manual/CSV path is not represented as working integration |

## Hidden COMPATIBILITY routes: 22

These published URLs remain routable to a compatibility status page. They are
excluded from sidebar navigation and global search and are not operational
authorities:

`/master/users`, `/master/frequencies`, `/master/targets`,
`/master/customers`, `/master/controls`, `/master/policies`, `/master/rules`,
`/compliance/frameworks`, `/upload/policy-master`,
`/upload/evidence-master`, `/upload/kpi-data`, `/upload/customer-data`,
`/upload/audit-reports`, `/analytics/customers`, `/analytics/kpis`,
`/reports/compliance`, `/reports/evidence`, `/reports/audit`,
`/reports/attribution`, `/reports/deals`, `/reports/customer-outcomes`, and
`/settings`.

## Dormant prototype boundary

`frontend/src/features/prototype/PrototypeRoutePage.tsx` and
`prototypeRouteData.ts` are retained reference source but are not imported by
the active router. `scripts/check-active-boundaries.mjs` rejects active imports
of prototype data and `scripts/check-live-routes.mjs` rejects prototype
components in the router.

The static HTML prototype is a compatibility/reference artifact. It is not an
application runtime, database authority or source of production data.
