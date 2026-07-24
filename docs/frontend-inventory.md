# Frontend inventory

> Architecture update: this document inventories the approved vanilla
> prototype used as the migration reference. The production frontend is now the
> React/TypeScript application under `frontend/src`. The unchanged prototype is
> preserved at `docs/prototype/GenBioCa-Compliance-Platform.html`; current route
> status is authoritative in `docs/frontend-route-mapping.md`.

## Source and preservation boundary

This inventory was produced by reading the complete approved
`docs/prototype/GenBioCa-Compliance-Platform.html`, including its CSS, route catalogue,
seed constants, application state, render functions, event delegation and FX
layer. The current artifact is derived from the repository-root
`GenBioCa-Compliance-Platform (1).html` and remains one HTML file with inline
CSS and vanilla JavaScript. Milestone 1 adds only the same-origin API adapter,
database-backed read screens, authentication/session handling and explicit
API/mock labels. Hash routes, navigation labels, Company terminology, the
visual design and existing prototype workflows remain the migration baseline.

## Navigation and route inventory

The sidebar groups are, in order: Overview; Admin; Master Data Setup; KPI
Management; Compliance Management; File Upload; Evidence Management; Analytics
& Reports. Audit Trail and Settings are utility links below the groups.
Quick Add links to KPI Master, KPI Actual Entry, Evidence Upload, Risk, CAPA,
Policy and User Management. The accepted trace ribbon order is exactly
**Policy → Framework → Rule → Evidence → Control → KPI → Target vs Actual →
Risk**.

| Navigation | Hash route | Render path and behaviour | Milestone 1 source |
|---|---|---|---|
| Authentication | `#login` | Form validation, password reveal, forgot-password information flow, session restore and logout | API |
| Overview | `#dashboard` | KPI/evidence/risk/CAPA/policy cards, charts, tasks and recent activity calculated over Company-scoped prototype state | Mock |
| Admin | `#admin/users` | Search/filter/sort/page/export; database user list and database detail; write controls explain the read-only Milestone 1 boundary | API |
| Admin | `#admin/roles` | Role cards, permission matrix, compare/reset/save simulation | Mock |
| Admin | `#admin/companies` | Membership-limited Company list and Company selector; write controls are read-only in Milestone 1 | API |
| Admin | `#admin/departments` | Database department list; local list controls retained; writes are read-only in Milestone 1 | API |
| Admin | `#admin/locations` | Database location list; local list controls retained; writes are read-only in Milestone 1 | API |
| Master Data | `#master/users` | Reference user list derived from prototype state | Mock |
| Master Data | `#master/frequencies` | Daily through ad-hoc frequency catalogue and generic CRUD shell | Mock |
| Master Data | `#master/targets` | Targets derived from prototype KPI records | Mock |
| Master Data | `#master/customers` | Customer/source/attribution/deal reference rows | Mock |
| Master Data | `#master/frameworks` | Database framework catalogue; database detail and framework rules; reference-only cards remain explanatory mock content | API |
| Master Data | `#master/controls` | Control catalogue and generic CRUD shell | Mock |
| Master Data | `#master/policies` | Policy master list over prototype policy state | Mock |
| Master Data | `#master/rules` | Prototype business-rule catalogue | Mock |
| Master Data | `#master/kpis` | KPI catalogue and generic create/edit simulation | Mock |
| KPI Management | `#kpi/mapping` | Full trace ribbon, mapped rows and linked-risk drawer | Mock |
| KPI Management | `#kpi/configuration` | Enable/configure target shell | Mock |
| KPI Management | `#kpi/actual-entry` | Draft, evidence attach, variance/RAG preview, submit and conditional risk creation | Mock |
| KPI Management | `#kpi/approval` | Evidence-gated approve/reject/clarification queue | Mock |
| KPI Management | `#kpi/dashboard` | Target/actual analytics, owner/department charts and RAG table | Mock |
| Compliance | `#compliance/frameworks` | Framework compliance cards and table | Mock |
| Compliance | `#compliance/controls` | Control status list | Mock |
| Compliance | `#compliance/checkpoints` | Recurring checkpoint list | Mock |
| Compliance | `#compliance/policy-register` | Policy lifecycle, document upload and evidence-gated approval | Mock |
| Compliance | `#compliance/gaps` | Gap list with evidence-gated closure | Mock |
| Compliance | `#compliance/capa` | CAPA list, evidence status and verified closure gate | Mock |
| Compliance | `#compliance/risks` | Risk cards, heat map, treatment list and evidence-gated completion | Mock |
| File Upload | `#upload/policy-master` | File selection, metadata, validation, workflow ladder and submit simulation | Mock |
| File Upload | `#upload/evidence-master` | Evidence metadata/link simulation and pending review creation | Mock |
| File Upload | `#upload/kpi-data` | KPI CSV/XLSX validation simulation | Mock |
| File Upload | `#upload/customer-data` | Customer import validation simulation | Mock |
| File Upload | `#upload/audit-reports` | Audit report import validation simulation | Mock |
| Evidence | `#evidence/register` | Prototype evidence inventory | Mock |
| Evidence | `#evidence/review` | Review queue, preview, approve/reject/more-evidence actions | Mock |
| Evidence | `#evidence/approved` | Approved evidence filter | Mock |
| Evidence | `#evidence/rejected` | Rejected evidence filter | Mock |
| Analytics | `#analytics/customers` | Acquisition, funnel, source and industry analytics | Mock |
| Analytics | `#analytics/kpis` | KPI target/actual and RAG analytics | Mock |
| Reports | `#reports` | Combined report catalogue and generated-summary simulation | Mock |
| Reports | `#reports/compliance` | Compliance report catalogue | Mock |
| Reports | `#reports/evidence` | Evidence report catalogue | Mock |
| Reports | `#reports/audit` | Audit report catalogue | Mock |
| Reports | `#reports/attribution` | Attribution cards/charts/detail | Mock |
| Reports | `#reports/deals` | Won/lost cards/charts/detail | Mock |
| Reports | `#reports/customer-outcomes` | Customer outcome/retention detail | Mock |
| Utility | `#audit-trail` | Immutable-in-UI prototype audit list and CSV export | Mock |
| Utility | `#settings` | Organisation, security, notifications, approval, integrations and data settings simulation | Mock |

Every routed page uses `pageHead`. In API mode the five database-backed master
routes display `API connected`; every other routed page displays `Mock screen`.
An unknown hash renders the explicit page-not-found view.

## JavaScript state, entities and seeds

`createSeed()` creates the following top-level state:

- lifecycle/UI persistence: `version`, `session`, `selectedCompanyId`,
  `sidebar`, `savedView`, `notificationsTab`, `selectedEvidenceId`;
- business prototype collections: `companies`, `users`, `kpis`, `risks`,
  `evidence`, `capa`, `policies`, `kpiActuals`, `uploads`, `comments`,
  `auditTrail`, `recentReports`;
- extensibility/workflow state: `genericRecords`, `taskStatus`, `settings`,
  `rolePermissions`.

Seed constants are:

- `COMPANY_SEED`: three anonymised Companies (`COM-001` through `COM-003`);
- `KPI_SEED`: Company KPIs with target, actual, direction, owner, framework,
  control, policy, rule, evidence, criticality and mapping status;
- `RISK_SEED`: enterprise level plus separate KPI Major/Minor class,
  likelihood, impact, treatment, owner and linked records;
- `EVIDENCE_SEED`: evidence type/module/record, owner/reviewer, status, hash,
  remarks and priority;
- `CAPA_SEED`: source/reference, root cause, corrective/preventive action,
  owner, due date, evidence and verification;
- `POLICY_SEED`: lifecycle dates, owner/department, framework/control/KPI,
  document, reviewer, approval and evidence.

Generated catalogues include active and reference frameworks, departments,
locations, frequencies, targets, customers, controls, rules, checkpoints,
gaps, reports and analytics rows. `UPLOAD_META` defines accepted extensions,
required metadata and representative validation failures for each upload route.
`REPORTS` defines compliance, evidence and audit report catalogues.

Transient `ui` state holds current route, global/page search, filters, sort,
page and page size, modal/drawer/menu/loading state, KPI actual draft inputs,
upload selection/metadata/validation, current evidence review, notifications
tab and focus restoration. It is not authoritative server data.

## Authentication, Company context and roles

- API login sends email/password to the same origin. The response access token
  is assigned only to the module variable `accessToken`.
- Startup attempts refresh-cookie rotation; success restores identity and the
  active Company, while failure renders `#login`.
- A 401 from an authenticated request triggers one shared refresh attempt and
  one request retry. Refresh failure clears the in-memory access token.
- Logout revokes the refresh session server-side, clears the cookie and clears
  frontend identity.
- `applyApiIdentity` maps database UUIDs to preserved Company business codes.
  The UUID is retained only for API Company-switch requests; mock collections
  continue to scope by `COM-xxx`, so existing mock routes remain populated.
- Company switching uses `POST /auth/tenant-context`; the server validates
  active membership and issues a fresh token context before master data reload.
- `user_companies` determines visible Companies. `user_roles`,
  `role_permissions` and `permissions` determine token permissions for the
  active Company. API mode does not treat the mock role matrix as authority.
- The seeded admin has `*`; middleware also accepts named permissions
  `tenants:read`, `users:read`, `organisation:read`, `frameworks:read` and
  `kpis:read`.

## Action catalogue

Common shell actions are hash navigation, group expand/collapse, responsive
drawer, Company switch, global search/keyboard selection, Quick Add,
notifications/read state, approval centre, profile/help, logout and focus
management. Common list actions are local search, filters, saved views, sort,
pagination, row count, select-all, detail/edit affordances and formula-safe CSV
export.

Prototype-only actions include:

- user add/edit/bulk and role-matrix save;
- generic add/edit records;
- KPI enable, mapping, actual draft/evidence/submit, risk preview/create/update,
  approve/reject/clarify;
- evidence upload/review/approve/reject/request-more;
- policy document upload/approval;
- CAPA/gap/risk closure or completion gates;
- upload validation/submission;
- report generate/favourite/schedule/export/print;
- comments, tasks, notifications, settings and demo reset.

On database-backed master screens, unsupported create/edit/bulk operations do
not create temporary authoritative-looking rows; they explain that write APIs
are outside Milestone 1.

## Browser storage contract

Mock development mode may use:

- `localStorage["genbiocaPrototype_v1"]` for the complete prototype state;
- `sessionStorage["genbiocaPrototype_v1_session"]` for a non-persistent mock
  session.

API mode uses only `localStorage["genbiocaPrototype_v1_ui"]`, containing the
selected Company business code and UI preferences (`sidebar`, `savedView`,
`notificationsTab`). It removes the legacy full-state key and mock session key.
No password, access token, refresh token, database Company/user/master record or
operational record is stored in local/session storage. The access token is
memory-only; the raw rotating refresh token is an HTTP-only same-origin cookie.

## Business rules and calculations

- `scoped()` accepts either the active database UUID or preserved Company code;
  no mock record from another Company contributes to a view.
- Higher-is-better, lower-is-better and target-range KPIs calculate variance,
  variance percentage and RAG.
- A met target is Green and creates no risk. A miss within 10% may be
  Amber/Minor; a critical KPI, repeat miss or miss beyond tolerance is
  Red/Major.
- KPI class `Major`/`Minor` is separate from enterprise level `Low`/`Medium`/
  `High`/`Critical`.
- Submitted missed actuals create or update one linked prototype risk and retain
  KPI, target, actual, period, variance, owner, evidence and actual record.
- KPI final approval requires approved evidence.
- Policy approval requires approved policy evidence/document.
- CAPA closure requires approved evidence linked to that exact CAPA.
- Gap closure and configured risk-treatment completion require approved linked
  evidence.
- Risk score is likelihood × impact: Low `<6`, Medium `6–11`, High `12–19`,
  Critical `>=20`.
- Active frameworks contribute to active totals; reference frameworks do not.
- CSV export is Company-scoped and prefixes spreadsheet formula characters.
- Audit rows have no edit/delete UI.

## Frontend-to-database/API field mapping

| Frontend entity and fields | Prisma/API source |
|---|---|
| Company `id,name,industry,country,status,created` | `Tenant.id` (UUID), `code`, `name`, `industry`, `country`, `status`, `createdAt`; DTO uses Company terminology |
| Session `name,role,selectedCompanyId` | `/auth/me`/auth response `name`, `permissions`, `activeCompany`, `companies`; no token is copied into stored state |
| User `id,name,email,phone,department,role,status,lastLogin,companyId` | `User.id/code/fullName/email/phone/status/lastLoginAt`; department from `UserCompany.department`; roles from active Company `UserRole`; membership from `UserCompany` |
| Department `id,name,head,status,companyId` | `OrgDepartment.id/code/name/headName/status/tenantId`; `tenantId` is omitted from DTO |
| Location `id,name,city,state,country,type,status,companyId` | `OrgLocation.id/code/name/city/state/country/type/status/tenantId`; `tenantId` is omitted |
| Business unit `id,name,status,companyId` | `OrgUnit.id/code/name/status/tenantId`; endpoint exists but screen is not API-connected in Milestone 1 |
| Framework `id,name,version,status` | `Framework.id/code/name/version/description/status` |
| Rule `id,name/ title,description,status` | `FrameworkRule.id/code/title/description/status/frameworkId` |
| KPI catalogue `id,name,desc,unit,direction,frequency,status` | `KpiDefinition.id/code/name/description/unit/direction/frequency/status` |
| KPI target `id,kpi,target,warning,critical,period,from,to,status,companyId` | `KpiGoal.id/code/kpiDefinitionId/targetValue/warningValue/criticalValue/period/effectiveFrom/effectiveTo/status/tenantId` |

Evidence, policy, control, KPI actual, risk, gap, CAPA, upload, report, customer,
notification, comment, task, settings and prototype audit fields intentionally
have no Milestone 1 database mapping.

## API proposed/implemented per action

All paths below are relative to `/api/v1`. All list endpoints accept `page` and
`pageSize`.

| Frontend action | Method/path | Milestone status |
|---|---|---|
| Sign in | `POST /auth/login` | Implemented |
| Restore/rotate session | `POST /auth/refresh` | Implemented |
| Sign out | `POST /auth/logout` | Implemented |
| Current identity | `GET /auth/me` | Implemented |
| Company selector/list | `GET /tenants` | Implemented |
| Switch Company | `POST /auth/tenant-context` | Implemented |
| User list | `GET /users` | Implemented |
| Open user detail | `GET /users/:id` | Implemented and used |
| Add/edit/enable/disable user, assign role/Company | Proposed `POST /users`, `PATCH /users/:id`, role/membership commands | Milestone 2 |
| Company create/edit | Proposed `POST /tenants`, `PATCH /tenants/:id` | Milestone 2 |
| Department list | `GET /organisation/departments` | Implemented |
| Department create/edit | Proposed `POST /organisation/departments`, `PATCH /organisation/departments/:id` | Milestone 2 |
| Location list | `GET /organisation/locations` | Implemented |
| Location create/edit | Proposed `POST /organisation/locations`, `PATCH /organisation/locations/:id` | Milestone 2 |
| Business-unit adapter | `GET /organisation/units` | Implemented; no screen integration required |
| Framework list/detail | `GET /frameworks`, `GET /frameworks/:id` | Implemented and used |
| Framework rules | `GET /frameworks/:id/rules` | Implemented and used |
| Framework/rule writes | Proposed framework/rule write commands | Milestone 2 |
| KPI definition adapter | `GET /kpi-definitions` | Implemented; no screen integration required |
| KPI goal adapter | `GET /kpi-goals` | Implemented; no screen integration required |
| All operational prototype actions | Dedicated Company-scoped policy/control/evidence/KPI actual/risk/gap/CAPA/upload/report APIs | Exact Milestone 2 scope |
