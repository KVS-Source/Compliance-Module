# Frontend route mapping

The approved prototype is preserved byte-for-byte at
`docs/prototype/GenBioCa-Compliance-Platform.html` (SHA-256
`3883b74dca30a55f72a36e062fa3d0c43e2447b799e8937a478a219cda277714`).
Legacy hash URLs are translated by the React router when opened at the app
root. Milestone 1 routes use PostgreSQL-backed Express APIs. Later-phase routes
remain registered and navigable, but deliberately do not create browser-local
business records.

| Existing HTML route | React route | React page component | API endpoint | Migration status |
|---|---|---|---|---|
| `#login` | `/login` | `LoginPage` | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` | Migrated — M1 |
| `#dashboard` | `/dashboard` | `DashboardPage` | Connected master-data summary endpoints | Migrated — M1; later operational metrics remain unclaimed |
| `#admin/users` | `/admin/users` | `UsersPage` | `GET /users`, `GET /users/:id` | Migrated — M1, read-only |
| `#admin/roles` | `/admin/roles` | `PendingPage` | Role/permission write APIs pending | Preserved — later milestone |
| `#admin/companies` | `/admin/companies` | `CompaniesPage` | `GET /tenants` | Migrated — M1, read-only |
| `#admin/departments` | `/admin/departments` | `OrganisationPage` | `GET /organisation/departments` | Migrated — M1, read-only |
| `#admin/locations` | `/admin/locations` | `OrganisationPage` | `GET /organisation/locations` | Migrated — M1, read-only |
| Endpoint-only in prototype | `/admin/organisation-units` | `OrganisationPage` | `GET /organisation/units` | Migrated — M1, new visible adapter route |
| `#master/users` | `/master/users` | `PendingPage` | User-master API pending | Preserved — Phase 3 |
| `#master/frequencies` | `/master/frequencies` | `PendingPage` | Frequency API pending | Preserved — Phase 3 |
| `#master/targets` | `/master/targets` | `PendingPage` | KPI target APIs exist; full screen migration pending | Preserved — Phase 3 |
| `#master/customers` | `/master/customers` | `PendingPage` | Customer API pending | Preserved — Phase 3 |
| `#master/frameworks` | `/master/frameworks` | `FrameworksPage` | `GET /frameworks` | Migrated — M1, read-only |
| Framework drawer in `#master/frameworks` | `/master/frameworks/:frameworkId/rules` | `FrameworkRulesPage` | `GET /frameworks/:id`, `GET /frameworks/:id/rules` | Migrated — M1, read-only |
| `#master/controls` | `/master/controls` | `PendingPage` | Control API pending | Preserved — Phase 3 |
| `#master/policies` | `/master/policies` | `PendingPage` | Policy API pending | Preserved — Phase 3 |
| `#master/rules` | `/master/rules` | `PendingPage` | Business-rule API pending | Preserved — Phase 3; distinct from framework rules |
| `#master/kpis` | `/master/kpis` | `PendingPage` | `GET /kpi-definitions`; full workflow pending | Preserved — Phase 3 |
| `#kpi/mapping` | `/kpi/mapping` | `PendingPage` | Traceability APIs pending | Preserved — Phase 3 |
| `#kpi/configuration` | `/kpi/configuration` | `PendingPage` | KPI configuration APIs pending | Preserved — Phase 3 |
| `#kpi/actual-entry` | `/kpi/actual-entry` | `PendingPage` | KPI actual/evidence/risk APIs pending | Preserved — Phase 4 |
| `#kpi/approval` | `/kpi/approval` | `PendingPage` | Evidence-gated approval APIs pending | Preserved — Phase 4 |
| `#kpi/dashboard` | `/kpi/dashboard` | `PendingPage` | KPI analytics APIs pending | Preserved — Phase 4 |
| `#compliance/frameworks` | `/compliance/frameworks` | `PendingPage` | Company framework-adoption APIs pending | Preserved — Phase 3 |
| `#compliance/controls` | `/compliance/controls` | `PendingPage` | Control APIs pending | Preserved — Phase 3 |
| `#compliance/checkpoints` | `/compliance/checkpoints` | `PendingPage` | Checkpoint APIs pending | Preserved — Phase 3 |
| `#compliance/policy-register` | `/compliance/policy-register` | `PendingPage` | Policy/evidence approval APIs pending | Preserved — Phase 3 |
| `#compliance/gaps` | `/compliance/gaps` | `PendingPage` | Gap and closure APIs pending | Preserved — Phase 5 |
| `#compliance/capa` | `/compliance/capa` | `PendingPage` | CAPA and closure APIs pending | Preserved — Phase 5 |
| `#compliance/risks` | `/compliance/risks` | `PendingPage` | Risk/treatment APIs pending | Preserved — Phase 5 |
| `#upload/policy-master` | `/upload/policy-master` | `PendingPage` | Upload processing API pending | Preserved — Phase 5 |
| `#upload/evidence-master` | `/upload/evidence-master` | `PendingPage` | Evidence upload API pending | Preserved — Phase 5 |
| `#upload/kpi-data` | `/upload/kpi-data` | `PendingPage` | KPI upload API pending | Preserved — Phase 5 |
| `#upload/customer-data` | `/upload/customer-data` | `PendingPage` | Customer upload API pending | Preserved — Phase 5 |
| `#upload/audit-reports` | `/upload/audit-reports` | `PendingPage` | Audit upload API pending | Preserved — Phase 5 |
| `#evidence/register` | `/evidence/register` | `PendingPage` | Evidence API pending | Preserved — Phase 4 |
| `#evidence/review` | `/evidence/review` | `PendingPage` | Evidence review API pending | Preserved — Phase 4 |
| `#evidence/approved` | `/evidence/approved` | `PendingPage` | Evidence API pending | Preserved — Phase 4 |
| `#evidence/rejected` | `/evidence/rejected` | `PendingPage` | Evidence API pending | Preserved — Phase 4 |
| `#analytics/customers` | `/analytics/customers` | `PendingPage` | Customer analytics API pending | Preserved — Phase 5 |
| `#analytics/kpis` | `/analytics/kpis` | `PendingPage` | KPI analytics API pending | Preserved — Phase 5 |
| `#reports` | `/reports` | `PendingPage` | Report-generation API pending | Preserved — Phase 5 |
| `#reports/compliance` | `/reports/compliance` | `PendingPage` | Compliance report API pending | Preserved — Phase 5 |
| `#reports/evidence` | `/reports/evidence` | `PendingPage` | Evidence report API pending | Preserved — Phase 5 |
| `#reports/audit` | `/reports/audit` | `PendingPage` | Audit report API pending | Preserved — Phase 5 |
| `#reports/attribution` | `/reports/attribution` | `PendingPage` | Attribution report API pending | Preserved — Phase 5 |
| `#reports/deals` | `/reports/deals` | `PendingPage` | Deal report API pending | Preserved — Phase 5 |
| `#reports/customer-outcomes` | `/reports/customer-outcomes` | `PendingPage` | Customer outcome API pending | Preserved — Phase 5 |
| `#audit-trail` | `/audit-trail` | `PendingPage` | Audit API pending | Preserved — Phase 5 |
| `#settings` | `/settings` | `PendingPage` | Settings APIs pending | Preserved — Phase 5 |

## Milestone 1 component inventory

- Application: `App`, React Router configuration and protected shell.
- Context: `AuthProvider`, `TenantProvider`, `ToastProvider`.
- Layout/navigation: `AppShell`, `Sidebar`, `Topbar` and Company selector.
- Tables/forms: generic `DataTable` and `SearchToolbar`.
- Feedback: badges, page headers, loading/error states, permission boundary,
  modal and toasts.
- Charts: reusable `MetricCard` plus preserved dashboard bar/trace layouts.
- Features: login, dashboard, Companies, users, departments, locations,
  organisation units, frameworks and framework rules.

The browser stores only `genbioca_ui_preferences` (sidebar collapse and open
navigation groups). Access tokens remain module-memory only; refresh tokens
remain HTTP-only cookies; database records are never persisted as local browser
state.
