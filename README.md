# GenBioCa Compliance Platform

A company-scoped Governance, Risk and Compliance application built with React 19,
TypeScript, Vite, Express 5, Prisma and PostgreSQL 16.

## Capabilities

| Area | Functionality |
| --- | --- |
| Access | Sign-in, refresh/logout, company selection, password change, session revocation and administrator-managed recovery |
| Administration | Company creation, user management/import, fixed role-profile assignment, departments, locations and organisation units |
| Masters | Shared frameworks/rules, KPI definitions and frequency usage; approved imports maintain shared masters |
| Policies and controls | Versioning, independent approval, framework/rule/control mappings, checkpoints and reviews |
| KPIs | Configuration, versioned targets, target approval, individual/grid actual entry, actual approval, calculations and mapping |
| Risks | Automatic KPI risks, manual risks, ownership, reviews, treatment, residual scoring, closure/reopening |
| Evidence | Records, upload/download/preview, links, submission/review and evidence-gated approvals/closures |
| Remediation | Gaps, CAPAs, ownership, due dates and evidence-gated closure/reopening |
| Work | My Work, tasks, in-app notifications, comments and saved register views |
| Dashboard | Calculated compliance percentage, trends, coverage, risks, aging and action queues |
| Reports | Ten on-demand reports, filters, CSV/PDF output and as-of reporting |
| Data | XLSX/CSV preview, validation, explicit commit, history and operational registers |
| GenRAC | Connection status and configured CSV-adapter test/preview/synchronization |
| Settings | Location display preference, timezone/date/time preferences and optional device location |
| Audit | Searchable, exportable append-only activity history |

The route guard verifies 48 visible navigation entries and 62 protected live
route patterns, including detail pages. Permissions govern available actions.
The dashboard percentage comes from measured KPI actuals in the selected company;
it is not fixed at 31%. The working-location preference does not filter records.
Device coordinates require browser permission and are neither saved nor sent to
the API.

## Requirements

Node.js 22 LTS with npm (engines allow Node 20+), Docker with Compose V2 or managed
PostgreSQL 16, and a current browser. Hosted use requires HTTPS.

## First installation

From the repository root:

```bash
npm run install:all
npm run setup:local
docker compose up -d postgres
npm run prisma:validate --prefix backend
npm run prisma:generate --prefix backend
npm run prisma:migrate --prefix backend
npm run build
```

Setup generates matching root `.env` and `backend/.env` with independent random
secrets, restricted to the owner on Unix. It refuses to overwrite existing files
and does not seed accounts or data. For non-default, unused database ports:

```bash
LOCAL_DB_PORT=55432 LOCAL_TEST_DB_PORT=55433 npm run setup:local
```

Alternatively copy `.env.example` to both locations and replace all placeholders.
Root `.env` configures Compose; `backend/.env` configures Express and Prisma.
Changing those files does not change credentials in an existing PostgreSQL volume.
Never delete a populated volume to solve a connection problem.

### Accounts and data

No operational passwords, staff information or private workbooks are shipped.
Choose an onboarding path; seeds never run at application startup.

- Representative local data: set a strong `SAMPLE_SEED_PASSWORD` (12+ characters)
  in ignored `backend/.env`, then run `npm run seed:sample --prefix backend`.
  It loads synthetic records into `SAMPLE-CO` (GenBioCa Operations). Accounts and
  roles are declared in `backend/prisma/sample-seed-data.ts`; use the password
  you supplied. These are validation fixtures, not business records.
- GenBioCa workbook workspace: with that local password configured, run
  `npm run seed:uat:genbioca --prefix backend`. It initializes the `GENBIOCA`
  company and synthetic identities **only**. Sign in as
  `uat-admin@genbioca.test`, open Data Import, preview the approved workbook and
  explicitly commit it. Keep the report. An idempotency replay does not write
  new data.
- Operational installation: use the restricted account-initialization procedure
  in [operations](docs/release/operations.md), then import approved records.
  Never run sample/development seeds against an operational database.

Private workbooks, evidence files and database backups must be transferred
separately through an approved secure channel. Source code alone cannot recreate
private data that has not been supplied.

## Run and stop

In two terminals from the root:

```bash
npm run dev --prefix backend
```

```bash
npm run dev --prefix frontend
```

| Service | Local address |
| --- | --- |
| Application | http://127.0.0.1:5173/login |
| API | http://127.0.0.1:8000/api/v1 |
| Health/readiness | API paths `/api/v1/health` and `/api/v1/ready` |
| API documentation | http://127.0.0.1:8000/api/docs (local only) |

Vite proxies `/api` to port 8000. Use `VITE_API_PROXY_TARGET` for another API
port. Configure exact `CORS_ORIGINS` for direct browser requests: scheme, hostname
and port must match; localhost and 127.0.0.1 differ.

Stop each server with Ctrl+C. `docker compose stop` preserves database volumes.
Do not use `down -v` on a database containing records you need.

Compiled single-service mode: `npm run build`, then
`npm run start --prefix backend`. Optional Docker app mode:

```bash
docker compose --profile tools run --rm migrate
docker compose up -d app
```

The app binds port 8000; do not also run a host backend there. Migrations remain
a separate step.

## Verification

```bash
npm run test:setup
npm run verify:static
npm run test:unit --prefix backend
docker compose --profile test up -d postgres_test
npm run test:integration --prefix backend
npm run verify:catalogue
```

Build the frontend before backend delivery tests. Integration tests reset only the
configured disposable test database for each file. Never point `DATABASE_URL_TEST`
at data you need. The runner rejects the development connection and production
environments/names. Catalogue verification is read-only; it checks tables, enums,
migration checksums and named safeguards. Pass `DATABASE_URL` to check the
development catalogue without resetting it.

Install the isolated test browser once, then run both browser suites:

```bash
cd frontend
npx playwright install chromium
npm run test:e2e
npm run test:e2e:real-stack
```

Most browser suites intercept API responses; they are interface-contract tests.
The separate real-stack suite uses PostgreSQL, Express and React without API
interception. Use `E2E_PORT` or `REAL_STACK_API_PORT`/`REAL_STACK_WEB_PORT` for
separate checkouts. [Verification](docs/release/verification.md) records the
current results; pending tests are not passes.

## Operating boundaries

- Recovery is administrator-managed; email password-reset delivery is not implemented.
- Notifications are in-app; scheduled report delivery/email subscriptions are not implemented.
- GenRAC live REST/database access needs an implemented adapter and approved access.
  The shipped adapter handles CSV files.
- Local evidence storage is the verified provider. Real S3 and malware-scanner
  integrations require separate provider validation.
- MFA, SSO and right-to-erasure workflows are not implemented.
- Permission profiles are fixed; free-form role design is not available.
- Shared framework/KPI master writes use approved imports, not editable master forms.
- Hosting, TLS, backup retention/PITR, monitoring, repository protection and release
  approval remain operator responsibilities.

This source delivery is not a declaration that deferred features or external
integrations are complete. An unconfigured service must not be presented as connected.

Known dependency advisories remain in Prisma's dependency chain. See the
[security review](docs/release/security-review.md); a successful build or source
scan is not security-release approval.
The [Prisma upgrade proposal](docs/release/prisma-upgrade-plan.md) is for review;
it does not authorize or implement a major-version migration.

## Structure and handoff

Run only `frontend/` and `backend/`. The backend contains the authoritative Prisma
schema and 25 migrations. `scripts/` contains setup and verification commands.
Compose and `deploy/` provide deployment templates. `legacy/` and prototype
assets are retained references, not alternate runtimes.

Start with this README and `docs/release/`. Older milestone/review documents
are historical records, not the current readiness authority.
[CONTRIBUTING.md](CONTRIBUTING.md) defines contribution and architecture rules.

The shareable package excludes Git history, environment files, secrets, private
workbooks, uploads, database dumps, dependencies, builds and local screenshots.
Keep third-party asset licenses. Transfer operational data and credentials separately.
