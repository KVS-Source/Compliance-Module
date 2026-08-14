# GenBioCa Compliance Platform

GenBioCa is a tenant-isolated Governance, Risk and Compliance platform built
with PostgreSQL, Express, React, TypeScript, Node.js and Prisma ORM.

The application provides working administration, KPI, policy, control,
evidence, risk, gap, CAPA, operational-register, import, reporting and audit
workflows. External services remain disabled until their approved connection
details and infrastructure are supplied.

Repository rules, security requirements and contribution workflow are defined
in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Contents

- [Capabilities](#capabilities)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Environment configuration](#environment-configuration)
- [Install and run locally](#install-and-run-locally)
- [Load GenBioCa data](#load-genbioca-data)
- [Authentication and access](#authentication-and-access)
- [Testing and verification](#testing-and-verification)
- [Production containers](#production-containers)
- [Backups and restore](#backups-and-restore)
- [Storage and integrations](#storage-and-integrations)
- [Security and data handling](#security-and-data-handling)
- [Known deployment dependencies](#known-deployment-dependencies)
- [Repository structure](#repository-structure)
- [Technical documentation](#technical-documentation)

## Capabilities

| Area | Working functionality |
| --- | --- |
| Authentication | Login, JWT access tokens, rotating HTTP-only refresh cookies, logout, password change, session listing and revocation |
| Company administration | Companies, users, departments, locations, organisation units, governed role assignment and tenant switching |
| Frameworks | Shared framework catalogue, framework rules and company-scoped compliance reporting |
| KPI management | KPI catalogue, configuration, targets, target approval, actual entry, actual approval, server-side evaluation, analytics and traceability |
| Risk management | Automatic KPI-linked risk creation, Risk Register, review, treatment, residual scoring, closure and reopening |
| Policies | Policy Register, controlled versions, framework mappings, submission, approval and rejection |
| Controls and checkpoints | Control mappings, checkpoints, review history and evidence requirements |
| Evidence | Evidence Library, file upload, checksum capture, links, review queue, approval and rejection |
| Gaps and CAPAs | Registers, ownership, workflow transitions, evidence gates, closure and reopening |
| Data management | XLSX workbook preview/commit/report, CSV import templates, import history and row-level validation reports |
| Operational registers | Nine register types with company-scoped records and reporting |
| Reports | KPI variance, target versus actual, framework compliance, risks, evidence, gaps, CAPA aging, policy review, audit activity and operational registers; CSV and PDF where supported |
| Audit | Append-only audit trail enforced by PostgreSQL triggers |
| Settings | Location selection, browser geolocation consent, regional display preferences and governed administration shortcuts |
| GenRAC | Connection-status surface and CSV adapter; live REST/database connectivity requires approved external access |

The authoritative route inventory and delivery status are maintained in
[`docs/frontend-route-mapping.md`](./docs/frontend-route-mapping.md). Hidden or
deferred paths show truthful status pages and do not simulate operational data.

## Architecture

```text
Browser
  -> React 19 + Vite + React Router
  -> Express 5 REST API
  -> authentication, RBAC and tenant enforcement
  -> Prisma ORM
  -> PostgreSQL 16
```

The authoritative runtime is:

- `frontend/` — React, Vite, TypeScript and Playwright
- `backend/` — Express, TypeScript, Prisma and Vitest
- `backend/prisma/schema.prisma` — database schema authority
- `backend/prisma/migrations/` — ordered PostgreSQL migrations
- `docker-compose.yml` — local runtime and isolated test database
- `docker-compose.production.yml` — production-oriented container topology

Tenant scope is derived from the authenticated token. Request bodies and query
parameters are never trusted as the tenant authority.

## Prerequisites

| Tool | Requirement |
| --- | --- |
| Node.js | Version 20 or newer |
| npm | Version shipped with the selected Node.js release |
| Docker | Current Docker Desktop or Docker Engine |
| Docker Compose | Compose V2 (`docker compose`) |

PostgreSQL 16 is supplied by Docker Compose. A host-installed PostgreSQL server
is not required for the standard local workflow.

## Environment configuration

Create local environment files from the committed templates:

```bash
cp .env.example .env
cp .env.example backend/.env
```

Replace every placeholder before starting the application. The root `.env` is
read by Docker Compose. `backend/.env` is read by Prisma and Express when npm
commands are run directly.

Important variable groups:

- Database: `DATABASE_URL`, `DOCKER_DATABASE_URL`, `POSTGRES_DB`,
  `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`
- Isolated tests: `DATABASE_URL_TEST`, `TEST_POSTGRES_DB`,
  `TEST_POSTGRES_USER`, `TEST_POSTGRES_PASSWORD`, `TEST_POSTGRES_PORT`
- Authentication: `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `JWT_ISSUER`,
  `REFRESH_TOKEN_DAYS`, `COOKIE_SECURE`
- Browser/API boundary: `CORS_ORIGINS`, `TRUST_PROXY`, rate-limit variables
- Files: `FILE_STORAGE_DRIVER`, `LOCAL_UPLOAD_DIR`, optional S3 variables
- Runtime: `NODE_ENV`, `PORT`, `FRONTEND_DIST`, `PROTOTYPE_DIR`, `LOG_LEVEL`

Keep the database credentials in the root and backend files aligned. Never
commit either local environment file.

## Install and run locally

Install exact locked dependencies:

```bash
npm run install:all
```

Start the development and test databases:

```bash
docker compose up -d postgres
docker compose --profile test up -d postgres_test
docker compose --profile test ps
```

Validate and apply the database schema:

```bash
npm run prisma:validate --prefix backend
npm run prisma:generate --prefix backend
npm run prisma:migrate --prefix backend
```

For isolated local development only, synthetic fixtures may be loaded
explicitly:

```bash
npm run prisma:seed:dev --prefix backend
```

Seeding is never performed automatically at application startup.

Start the API and web application in separate terminals:

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
```

| Service | URL |
| --- | --- |
| Web application | `http://127.0.0.1:5173` |
| REST API | `http://127.0.0.1:8000/api/v1` |
| Health | `http://127.0.0.1:8000/api/v1/health` |
| Readiness | `http://127.0.0.1:8000/api/v1/ready` |
| OpenAPI/Swagger | `http://127.0.0.1:8000/api/docs` |

Vite proxies same-origin `/api` calls to the API during local development.

## Load GenBioCa data

The authorised XLSX source is operational input and must remain outside Git.
Do not place workbooks, preview reports, database dumps or imported files in the
repository.

### Local validation identity setup

The following command creates the GenBioCa company, explicit roles and
synthetic `.test` accounts without loading business records. It is refused in
production and requires a runtime-only password:

```bash
NODE_ENV=development \
SAMPLE_SEED_PASSWORD='<strong-temporary-local-password>' \
npm run seed:uat:genbioca --prefix backend
```

### Production company and first operator

Create a one-time password in a protected file and set its permissions to
`0600`. Supply the production environment plus these process-only values:

```bash
INITIAL_COMPANY_CODE=GENBIOCA \
INITIAL_COMPANY_NAME=GenBioCa \
INITIAL_USER_CODE='<approved-user-code>' \
INITIAL_USER_NAME='<approved-user-name>' \
INITIAL_USER_EMAIL='<approved-user-email>' \
INITIAL_USER_ROLE='<approved-role-code>' \
INITIAL_USER_PASSWORD_FILE='<absolute-mode-0600-file>' \
npm run tenant:initialize --prefix backend
```

The initializer validates production configuration, hashes the password with
Argon2id, provisions one company-scoped user and explicit role, and records the
action in the append-only audit trail. It rejects `.test` addresses and never
prints the password.

### Preview and import the workbook

Always preview before committing:

```bash
npm run import:workbook:preview --prefix backend -- \
  --file '<external-workbook-path>' \
  --json '<protected-preview-report-path>'

npm run import:workbook:commit --prefix backend -- \
  --file '<external-workbook-path>' \
  --tenant GENBIOCA \
  --actor '<approved-operator-email>' \
  --json '<protected-commit-report-path>'

npm run import:workbook:report --prefix backend -- --tenant GENBIOCA
```

The import is tenant-scoped and idempotent. Use a new idempotency key only when
the source file has intentionally changed. Never modify workbook values merely
to force expected counts.

## Authentication and access

Production access uses explicit permission profiles:

| Role | Primary responsibilities |
| --- | --- |
| Company Administrator | Company setup, users, organisation masters and all current governed workflows |
| Compliance Manager | Compliance configuration and operational workflows without company/user administration |
| Department Owner | Operational contribution without approval or administrative rights |
| Reviewer/Approver | Independent review, approval and closure decisions |
| Read-only Management Viewer | Read and export access only |

Important workflow rules:

- A submitter cannot approve their own target, actual, evidence or policy.
- Approved KPI targets are immutable.
- Approved evidence gates KPI approval, policy approval, gap closure, CAPA
  closure and configured risk-treatment completion.
- Missed KPI targets can create one linked automatic risk; met targets create
  no risk.
- Audit events and workflow histories are append-only.

Passwords and login identities are deliberately absent from this README.
Provision or reset them through the approved administrator workflow and secret
delivery channel.

## Testing and verification

Run static verification:

```bash
npm run typecheck
npm run lint
npm run build
npm run guard
npm run prisma:validate --prefix backend
npm run prisma:generate --prefix backend
```

Run backend unit tests:

```bash
npm run test:unit --prefix backend
```

Run PostgreSQL integration tests against the isolated test database:

```bash
docker compose --profile test up -d postgres_test
npm run test:integration --prefix backend
```

The integration runner refuses the development database, production-like
database names and `NODE_ENV=production`.

Install the isolated Playwright browser once and run frontend tests:

```bash
cd frontend
npx playwright install chromium
cd ..
npm run test:e2e --prefix frontend
```

Run the browser-to-PostgreSQL smoke workflow when the complete local stack is
available:

```bash
npm run test:e2e:real-stack --prefix frontend
```

Security scanning is expected before release:

```bash
gitleaks detect --source . --no-banner
semgrep scan --config auto backend/src frontend/src
```

## Production containers

Review and populate `.env.production` from `.env.production.example`, then:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml build

docker compose --env-file .env.production \
  -f docker-compose.production.yml run --rm migrate

docker compose --env-file .env.production \
  -f docker-compose.production.yml up -d
```

Terminate TLS at the approved reverse proxy, restrict database exposure, use a
secret manager, and verify `/api/v1/health` and `/api/v1/ready` through the
public HTTPS endpoint before opening access.

Never run development or sample seeds in production.

## Backups and restore

Operational scripts:

- `ops/backup.sh` — PostgreSQL backup
- `ops/restore-drill.sh` — disposable restore verification

Keep database backups and uploaded files under the same retention and recovery
policy. Perform restore drills in an isolated environment and record recovery
time, integrity checks and migration status.

Detailed procedures:

- [`docs/operations/backup-and-restore.md`](./docs/operations/backup-and-restore.md)
- [`docs/production/backup-restore-release-rollback.md`](./docs/production/backup-restore-release-rollback.md)

## Storage and integrations

Local file storage is the verified default. It must use a persistent volume and
an external backup policy.

The repository contains an S3 storage port and driver, but real cloud
credentials and live bucket verification are deployment responsibilities. Do
not select S3 unless the production adapter, bucket policy, encryption,
retention and recovery checks have been completed.

GenRAC currently supports truthful status reporting and a CSV adapter. Live
REST or database connectivity requires approved interface specifications,
credentials, network access, field mapping and end-to-end verification.

## Security and data handling

- Never commit `.env`, passwords, tokens, connection strings or private keys.
- Never commit workbooks, imported rows, database dumps, uploads or generated
  reports containing operational data.
- Use only synthetic identities and `.test` addresses in seeds and tests.
- Access tokens remain in memory; refresh tokens use rotating HTTP-only cookies
  and are hashed in PostgreSQL.
- Authorization and tenant isolation are enforced by the API and database,
  never solely by the browser.
- Sensitive request and response headers are redacted from logs.
- Production rejects placeholder secrets, insecure cookies, permissive proxy
  settings and wildcard role permissions.
- File types, sizes, names and storage paths are validated by the API.

## Known deployment dependencies

The following require environment-specific completion or independent evidence:

- live S3 adapter wiring and bucket verification;
- malware scanning for uploaded files;
- live GenRAC connectivity;
- managed TLS, DNS, monitoring and alert destinations;
- organisation-approved SSO/MFA if required;
- final branch-protection and required-check configuration;
- backup retention approval and a recorded restore drill.

See [`docs/known-limitations.md`](./docs/known-limitations.md) for the complete,
current list. Do not represent an external integration as active until its
readiness checks pass.

## Repository structure

| Path | Purpose |
| --- | --- |
| `frontend/` | React application, route definitions, API services, styles and Playwright tests |
| `backend/` | Express API, domain modules, providers, Prisma schema, migrations, scripts and tests |
| `deploy/` | Container and reverse-proxy configuration |
| `ops/` | Backup and restore scripts |
| `scripts/` | Architecture, route and production-boundary guards |
| `docs/` | Architecture, database, API, operations, security and release documentation |
| `postman/` | API collections and environment templates without secrets |
| `legacy/` | Dormant reference implementations; never part of the active runtime |
| `uploads/` | Empty tracked mount point; operational files are ignored |

## Technical documentation

- [Authoritative runtime](./docs/architecture/authoritative-runtime.md)
- [Architecture overview](./docs/architecture/overview.md)
- [API endpoints](./docs/api_endpoints.md)
- [Frontend route mapping](./docs/frontend-route-mapping.md)
- [Database dictionary](./docs/database/database-dictionary.md)
- [Constraints and triggers](./docs/database/constraints-and-triggers.md)
- [Migration strategy](./docs/database/migration-strategy.md)
- [Production architecture](./docs/production/architecture-environment-deployment.md)
- [Security baseline](./docs/security/security-baseline.md)
- [Known limitations](./docs/known-limitations.md)
