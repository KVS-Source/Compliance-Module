# GenBioCa submission readiness report

Date: 2026-08-07

Branch: `integration/all-lanes`

Classification: controlled client submission candidate; not a production deployment

## Outcome

The active PERN application now presents the populated GenBioCa workspace as a
database-backed product rather than a prototype. The dashboard reports 31%
compliance from 9 of 29 measured KPI actuals, the Settings and Reports centres
are live, and navigation distinguishes KPI Master, KPI Catalogue and governed
KPI Mapping.

## Product changes in this completion pass

- Restored the populated GenBioCa dashboard and made the Company data scope
  explicit.
- Counted KPI definitions configured for the active Company instead of unrelated
  shared/demo definitions.
- Removed out-of-scope demo frameworks from GenBioCa dashboard analytics and
  reports while retaining operational `Active – In Scope` and `Certified`
  framework rows.
- Added a working Settings centre for location and regional display preferences,
  with links to the relevant administration and workflow screens.
- Added the Reports centre and ten live, filterable, tenant-scoped report views
  with permission-aware CSV export.
- Kept KPI Master, KPI Catalogue and KPI Mapping as distinct live views.
- Added the governed traceability view for the declared Policy → Framework →
  Rule → Evidence → Control → KPI → Target vs Actual → Risk chain.
- Fixed sidebar density, mobile layout, active-route highlighting, Operations
  record layout and full-card hover behaviour.
- Removed the development technology badge and misleading prototype navigation.
- Replaced the non-working forgot-password promise with a truthful secure
  administrator recovery path; authenticated users retain self-service Change
  Password.
- Normalised the legacy `Asia/Calcutta` browser value to `Asia/Kolkata`.
- Updated route and handover documentation for 46 visible protected live routes
  and 18 migrations.

## Imported GenBioCa data verified in PostgreSQL

| Data set | Current count |
| --- | ---: |
| Departments | 13 |
| Locations | 3 |
| Organisation units | 6 |
| Company KPI definitions | 91 |
| KPI configurations | 91 |
| Enabled KPI configurations | 24 |
| KPI actuals | 29 |
| KPI actuals meeting target | 9 |
| Compliance | 31% |
| Policies | 18 |
| Evidence records | 20 |
| Risks | 32 |
| Gaps | 10 |
| CAPAs | 10 |
| Operational register records | 106 |
| Audit events | 31 |

Approved locations present in the workspace are Thane (India), UK and USA.
Every enabled KPI configuration has a structured organisation-unit and location
mapping and retains its workbook owner reference.

## Identity and privacy boundary

The supplied Users/Roles worksheet contains placeholder user IDs but no employee
names, emails, role assignments or contact details. The local controlled
workspace therefore uses three professional synthetic role identities:

- GenBioCa Platform Administrator
- GenBioCa Compliance Manager
- GenBioCa KPI Owner

No real employee identity was invented or committed. Passwords and environment
values are not recorded in this report or in source control.

## Workbook import reconciliation

- Preview: 773 rows valid, 0 errors and 0 unmapped rows.
- Commit: 751 updated, 20 unchanged and 2 safely skipped in the final replay.
- The two skipped rows are `LD-005` and `HR-025` in
  `16_KPI_Actuals_Entry`; both use the review-frequency value `Per-Event` in the
  Period column. The importer correctly refuses to invent a reporting period.
- Replacing those two Period values with `FY26-27` in the source workbook allows
  their already-defined targets to be used in a later import.
- Checksum and explicit idempotency-key behaviour prevents an identical commit
  from duplicating records.

## Verification completed

- Prisma schema validation and client generation: passed.
- Static verification: backend/frontend typecheck, lint and build passed.
- Architecture, router, live-route and production-API guards: passed.
- Backend unit tests: 336 passed.
- Disposable PostgreSQL integration tests: 344 passed across 32 files and all
  18 migrations.
- Playwright on a fresh isolated Vite server: 582 passed, 6 expected skips, 0
  failures across desktop and mobile.
- Gitleaks: 0 findings in the CI-equivalent Git-history scan and 0 findings in
  the current working diff. A whole-directory scan additionally sees known
  ignored/local fixtures (development TLS, build output and synthetic security
  tests); none is part of this change set.
- Semgrep: 0 findings across 711 targets; approximately 99.9% of lines parsed.
- Human real-stack walkthrough: dashboard, Settings and all ten report routes
  connected successfully to the local API/PostgreSQL stack.
- Runtime at handoff: PostgreSQL healthy, backend API health `ok`, frontend login
  HTTP 200.

## Deliberate limitations requiring client or operator input

- Real employee names and emails must be supplied and provisioned through the
  Users administration workflow; they must not be placed in seeds or tests.
- The two invalid workbook Period cells require a client source correction.
- Imported Evidence rows preserve source metadata/path references but do not
  prove that file bytes are stored; file-backed approval gates remain enforced.
- Live GenRAC REST/database access is not configured. The product states this
  truthfully and does not claim a successful connection.
- Reports are interactive and CSV-exportable; PDF, scheduling and subscriptions
  are not part of this release.
- Settings location/time preferences are display preferences and do not override
  server-enforced tenant scope or permissions.
- `docs/database/database-dictionary.md` is still the earlier foundation
  snapshot (37 models, 18 enums and 11 migrations). The current schema contains
  50 models, 29 enums and 18 migrations, so that catalogue must be regenerated
  before a formal architecture or production handover.
- Production hosting still requires operator-owned TLS, secrets, backups,
  monitoring and deployment approval.

## Git handoff

The work is intentionally uncommitted on `integration/all-lanes` so a
human can review the complete diff before staging, committing or pushing. No
merge or deployment was performed.
