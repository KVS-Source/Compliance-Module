# Delivery verification and change report

Verification: 2026-10-08–2026-10-09. Source baseline: `51ed36e54332f0dd90166b356d4a0d3680877833`.
Prepared on `release/genbioca-delivery`; no push, merge or deployment performed.
This report supersedes historical milestone counts for this delivery.

## Changes

- Shortened operational page wording across dashboard, administration, policies,
  controls, checkpoints, KPIs, evidence, remediation, reports, tasks and settings.
  Removed engineering/milestone filler while retaining validation, permissions,
  independent-review and evidence requirements.
- Simplified login branding and recovery guidance; removed nonfunctional
  sign-in-persistence and footer actions. Recovery is honestly administrator-
  managed, not a simulated email-reset flow.
- Removed the nonfunctional Add Framework action. Shared masters remain managed
  through approved imports. Deferred and unconfigured features remain labelled
  unavailable; no route was promoted to LIVE.
- Preserved the original local UI changes, including frequency-chart padding and
  explicit, permission-based device-location tracking with cleanup/stop handling.
  Location is not persisted, sent to the API or used as a record filter.
- Added safe local environment generation: independent random secrets, matching
  Compose/API configuration, private file modes, port validation and no overwrite.
- Corrected Compose refresh-secret/origin settings, persistent upload directory
  and project-scoped test volumes to avoid reusing a shared test volume.
- Added read-only catalogue reconciliation against the actual schema and all
  migration checksums. Isolated frontend-serving tests from local prototype flags.
- Updated interface assertions to match removed prose; retained behavior checks.
  Removed personal machine paths and a personal repository link from handoff docs.
- Replaced the root README and added current setup, operating boundaries, private
  data transfer and verification guidance. Added reproducible source packaging.
- Applied compatible proxy-addr, qs, ip-address and React Router security patches;
  added forwarding-spoofing coverage. Generated test secrets replace fixed keys.
- Pinned CI actions to immutable commits and removed request-controlled Host
  values from proxy templates. Same-origin geolocation still requires consent.
- Replaced the vulnerable backend test runner with pinned Vitest 4.1.11 and
  Vite 7.3.6, removed tinypool, and patched compatible transitive dependencies.
- Guarded direct test-schema reset calls before any database connection; added
  five subprocess refusal tests for unsafe flags, URLs and production targets.
- Added an isolated browser-to-PostgreSQL test for calculated dashboard totals,
  saved department persistence and company isolation, without API mocks.
- Prepared a separate Prisma major-upgrade proposal for approval; no upgrade
  implementation is included or claimed to resolve the remaining advisory.

No Prisma schema, enum or migration was changed. Existing business records were
not overwritten, and the original working tree was preserved.

## Verified

| Check | Result |
| --- | --- |
| Fresh backend/frontend locked dependency installation | Passed |
| Local setup tests | 5 passed |
| Backend unit tests | 378 passed |
| Disposable PostgreSQL integration tests | Clean full rerun: 398 passed across 44 files; see regression history below |
| Backend/frontend typecheck, lint and build | Passed |
| Router, boundaries, live routes and production API guards | Passed |
| Prisma validate/generate; migrations on an empty PostgreSQL database | Passed, 25 migrations |
| Schema catalogue | 55 model tables; 33 enum types and their values |
| Migration-named safeguards | 224 indexes, 318 constraints, 53 triggers, 31 functions present |
| Full catalogue | 280 indexes, 322 constraints, 53 non-internal triggers; none disabled |
| RLS restore comparison | 48 policies matched |
| Actual HTTP checks | Login, 29 read endpoints, ten JSON/CSV/PDF reports, five compiled SPA paths passed |
| Synthetic seed idempotency | Two executions produced identical entity counts |
| Calculated dashboard | 22.2% = 2 of 9 measured KPIs met target; no fixed 31% |
| Backup/restore | Custom-format restore to a new disposable database; all 56 public tables' row counts matched |
| Restored database catalogue | Migration checksums, indexes, constraints, triggers, enum values and RLS policies matched |
| Restored backend readiness | Passed |
| Desktop/mobile browser suite | 632 passed, 6 skipped; 638 collected tests in 30 files |
| Real-stack browser suite | 2 passed, no API interception; persistence/isolation and missing-evidence refusal |
| Expanded Semgrep scan | 270 rules, 1606 targets, zero findings; 2 files exceeded the size limit and configured exclusions apply |
| Proxy templates | Production and local-smoke rendered configurations passed `nginx -t` in an isolated container using a synthetic certificate |

Backup CHECK expressions were compared after PostgreSQL reparse normalization
where restore regrouped equivalent AND expressions. No condition was omitted.
Integration tests exercise tenant isolation, RLS, authentication, maker-checker,
workflow transitions, evidence gates, append-only histories and imports. HTTP
checks prove API/compiled serving. Browser suites are automated tests, not a
human all-feature sign-off.

## Regression history

The first browser run had six failures (three old dashboard prose assertions on
each viewport). The tests now assert the current approved wording and explicit
GenRAC access status without weakening behavioral checks. The focused rerun
passed 26 tests; the subsequent full run passed 632 with six skips.

The first PostgreSQL regression after the tooling update failed two assertions
in `checkpoints-api.test.ts`: archive returned 404, and review creation returned
401. The same file passed all 15 tests when rerun on a fresh isolated fixture.
No checkpoint/auth business behavior was changed to hide those failures. After
clean dependency installation, the full regression rerun passed all 398 tests
across 44 files, including those 15 checkpoint tests. The initial failure remains
recorded and its cause has not been established; no application fix is claimed
for it. Reproduce and investigate if it recurs in CI or subsequent verification.

## Pending release gates and boundaries

- An all-feature human walkthrough and sign-off remain required. Automated
  real-stack coverage is limited to the two paths described above, not every
  successful multi-account approval/evidence lifecycle.
- No external GenRAC REST/database adapter or provider credentials were verified.
  CSV-adapter support is implemented; unconfigured status remains truthful.
- Real S3 and malware scanning, email delivery, hosting/TLS, monitoring, production
  backup/PITR, repository protection and remote CI require independent evidence.
- Automated email password reset, MFA/SSO, scheduled reports/email subscriptions,
  free-form role design and right-to-erasure are not implemented.
- The frontend bundle-size warning remains (about 1.07 MB minified). Build passed;
  this warning is not hidden or treated as a failure.
- No private operational workbook/database snapshot was included or imported into
  the isolated verification database. Synthetic fixture names are not staff data.
- Dependency advisories remain: backend production audit has 3 high package
  findings in Prisma/config/deepmerge-ts; backend full audit has the same three,
  frontend full audit zero. See [security review](security-review.md) and the
  [upgrade proposal](prisma-upgrade-plan.md).

## Handoff status

Source handoff prepared with verified backend/database/API functionality.
Not certified as an all-features-complete or production-approved release.
Archive integrity and secret-scan results are supplied alongside the final
package. Keep the generated environment files, credentials, uploads and database
backups outside the source handoff.
