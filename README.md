# GenBioCa Compliance Platform

Multi-company compliance platform on PostgreSQL, Express, React/TypeScript, and
Node.js (PERN), with Prisma and JWT authentication.

Standing architecture and security rules live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).
Read that before changing non-trivial behaviour.

> **Picking this project up?** Start with
> [`docs/handover/START-HERE.md`](./docs/handover/START-HERE.md). It covers how
> to run and seed the platform, what is in each Company, what is specified but
> not built, and the non-obvious traps. Active development stopped on
> 2026-08-10.

---

## Route status (read this first)

The product distinguishes `LIVE`, `IN_DEVELOPMENT`,
`AWAITING_INTEGRATION`, `COMPATIBILITY` and `DORMANT` explicitly.

Unfinished navigation entries render `ModuleStatusPage`; they do not display
fake business data or persist changes. The old prototype React page/data are
dormant and unrouted.

See [`docs/frontend-route-mapping.md`](./docs/frontend-route-mapping.md) for the
exhaustive enforced inventory.

### Live (API-connected) routes

These use the real backend and must **not** show the prototype banner. The
client sidebar ships **46 LIVE modules** (`clientNavigationPaths` in
`frontend/src/app/routeDefinitions.ts`):

| Path                                          | Notes                                                                                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`                                      | Authentication (public)                                                                                                                                                                                      |
| `/dashboard`                                  | Company-scoped PostgreSQL aggregates                                                                                                                                                                         |
| `/admin/companies`                            | Companies available to the signed-in user                                                                                                                                                                    |
| `/admin/users`                                | User management                                                                                                                                                                                              |
| `/admin/departments`                          | Organisation masters                                                                                                                                                                                         |
| `/admin/locations`                            | Organisation masters                                                                                                                                                                                         |
| `/admin/organisation-units`                   | Organisation masters                                                                                                                                                                                         |
| `/admin/roles`                                | Role and permission profiles (read-only; production roles are not editable)                                                                                                                                  |
| `/master/users`                               | Master Data entry point for user management                                                                                                                                                                  |
| `/master/frameworks`                          | Framework master (read)                                                                                                                                                                                      |
| `/master/rules`                               | Framework rule browser (read)                                                                                                                                                                                |
| `/master/frameworks/:frameworkId/rules`       | Framework rules (detail)                                                                                                                                                                                     |
| `/master/frequencies`                         | Frequency master (read)                                                                                                                                                                                      |
| `/master/targets`                             | Master Data entry point for KPI targets                                                                                                                                                                      |
| `/master/policies`                            | Master Data entry point for the Policy Register                                                                                                                                                              |
| `/master/controls`                            | Master Data entry point for the Control Register                                                                                                                                                             |
| `/master/kpis`                                | Master Data entry point for the KPI catalogue                                                                                                                                                                |
| `/compliance/frameworks`                      | Framework compliance overview (read)                                                                                                                                                                         |
| `/compliance/policy-register`                 | Policy Register                                                                                                                                                                                              |
| `/compliance/controls`                        | Controls                                                                                                                                                                                                     |
| `/compliance/checkpoints`                     | Checkpoints                                                                                                                                                                                                  |
| `/kpi/catalogue`                              | KPI catalogue (read)                                                                                                                                                                                         |
| `/kpi/mapping`                                | KPI Mapping and compliance traceability (read)                                                                                                                                                               |
| `/kpi/analytics`                              | KPI analytics and trend charts (read)                                                                                                                                                                        |
| `/kpi/configuration`                          | KPI configurations                                                                                                                                                                                           |
| `/kpi/targets`                                | KPI target selection/lifecycle                                                                                                                                                                               |
| `/kpi/configuration/:configurationId/targets` | KPI target lifecycle (detail)                                                                                                                                                                                |
| `/kpi/actual-entry`                           | Submit KPI actuals                                                                                                                                                                                           |
| `/kpi/approval`                               | KPI actual approval lifecycle                                                                                                                                                                                |
| `/compliance/risks`                           | Risk Register                                                                                                                                                                                                |
| `/compliance/risks/:riskId`                   | Risk review, treatment and closure                                                                                                                                                                           |
| `/evidence`                                   | Evidence Library                                                                                                                                                                                             |
| `/evidence/new`                               | Create Evidence                                                                                                                                                                                              |
| `/evidence/review`                            | Evidence Review queue                                                                                                                                                                                        |
| `/evidence/approved`                          | Approved Evidence (read)                                                                                                                                                                                     |
| `/evidence/rejected`                          | Rejected Evidence (read)                                                                                                                                                                                     |
| `/compliance/gaps`                            | Gap Register                                                                                                                                                                                                 |
| `/compliance/capa`                            | CAPA Register                                                                                                                                                                                                |
| `/audit-trail`                                | Audit Trail                                                                                                                                                                                                  |
| `/compliance/operational-registers`           | Operational Registers (UI read-only)                                                                                                                                                                         |
| `/data/import`                                | Data Import (XLSX / CSV templates)                                                                                                                                                                           |
| `/data/import-history`                        | Import History                                                                                                                                                                                               |
| `/data/genrac-integration`                    | GenRAC connector status (CSV adapter when configured; live REST/DB access not claimed)                                                                                                                       |
| `/reports`                                    | Reports centre catalogue; each report carries an `available` flag and renders locked when the caller lacks its permissions                                                                                   |
| `/reports/kpi-variance`                       | KPI variance report (read; CSV needs `exports:read`)                                                                                                                                                         |
| `/reports/framework-compliance`               | Framework compliance report (read; CSV needs `exports:read`)                                                                                                                                                 |
| `/reports/evidence-status`                    | Evidence status report (read; CSV needs `exports:read`)                                                                                                                                                      |
| `/reports/gaps`                               | Gap report (read; CSV needs `exports:read`)                                                                                                                                                                  |
| `/reports/audit-activity`                     | Audit activity report (read; CSV needs `exports:read`)                                                                                                                                                       |
| `/reports/:reportKey`                         | One parameterised view serving all ten catalogue reports; the five above are the sidebar entries, and KPI target-versus-actual, risks, CAPA aging, policy review and Operational Registers open from the hub |
| `/settings`                                   | Working location, regional display preferences and governed administration shortcuts (`/settings/tenant` and `/settings/integrations` stay deferred)                                                         |

Authoritative list: `clientNavigationPaths` / `migratedPaths` in
`frontend/src/app/routeDefinitions.ts`, plus detail routes in
`frontend/src/app/router.tsx`. Client-readable capabilities:
[`docs/handover/module-status.md`](./docs/handover/module-status.md).

### Not operational

Deferred product routes (Tasks, Notifications, Settings, standalone Policy
Versions page, KPI mapping deep links, and similar) are **hidden** and render
truthful **In Development** status pages — they are not in the client sidebar.
Fourteen older URLs, including `/master/framework-rules` (superseded by
`/master/rules`), are hidden **Compatibility** routes.

The Reports centre, KPI catalogue/analytics and role-access pages are read and
export surfaces only; their APIs expose no mutation path, and the access profile
response states `mutable: false` rather than leaving the UI to assert it. GenRAC is a LIVE status page with
optional CSV-adapter operations; live REST or database GenRAC access is not
enabled without approved configuration.

---

## Prerequisites

Verified on a development machine with:

| Tool           | Requirement                                      | Checked                  |
| -------------- | ------------------------------------------------ | ------------------------ |
| Node.js        | `>=20` (`engines` in `backend/` and `frontend/`) | `node -v`                |
| npm            | Ships with Node                                  | `npm -v`                 |
| Docker         | Recent Docker Desktop / Engine                   | `docker --version`       |
| Docker Compose | Compose V2 (`docker compose`)                    | `docker compose version` |

PostgreSQL 16 is provided by Compose (`postgres:16-alpine`). You do not need a
host-installed Postgres for the default workflow.

---

## Environment files (most common first-run failure)

Compose and the Node backend load **different** env files.

| File                       | Used by                                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| **Repository root** `.env` | `docker compose` (Postgres, test Postgres, optional app container)                |
| **`backend/.env`**         | Backend when you run `npm run … --prefix backend` (Prisma + Express via `dotenv`) |

### Setup

1. Copy the example once:

   ```bash
   cp .env.example .env
   cp .env.example backend/.env
   ```

2. Edit **both** files and replace every placeholder. Keep the same database
   credentials in both so Compose Postgres matches `DATABASE_URL` in
   `backend/.env`.

3. Never commit `.env` or `backend/.env`.

### Variables you must set (names only)

From `.env.example`:

- Runtime: `NODE_ENV`, `PORT`
- Dev DB: `DATABASE_URL`, `DOCKER_DATABASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`,
  `POSTGRES_PASSWORD`, `POSTGRES_PORT`
- Test DB: `DATABASE_URL_TEST`, `TEST_POSTGRES_DB`, `TEST_POSTGRES_USER`,
  `TEST_POSTGRES_PASSWORD`, `TEST_POSTGRES_PORT`
- Auth: `JWT_ACCESS_SECRET` (≥ 32 characters, not a placeholder),
  `JWT_ACCESS_TTL`, `JWT_ISSUER`, `REFRESH_TOKEN_DAYS`, `COOKIE_SECURE`
- Proxy / limits: `TRUST_PROXY`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_API_MAX`,
  `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_REFRESH_MAX`, `RATE_LIMIT_DISABLED`
- Paths / logging: `FRONTEND_DIST`, `PROTOTYPE_DIR`, `FILE_STORAGE_DRIVER`,
  `LOCAL_UPLOAD_DIR`, `LOG_LEVEL`

If Compose starts Postgres but Prisma cannot connect, you almost always have a
mismatch between root `.env` and `backend/.env`.

---

## Clone and install

```bash
git clone <repository-url> genbioca_compliance_platform
cd genbioca_compliance_platform
```

Install active packages (authoritative runtime only):

```bash
npm run install:all
```

The root package only orchestrates child-package scripts. It is not a third
application runtime.

---

## Start databases

```bash
docker compose up -d postgres
docker compose --profile test up -d postgres_test
```

- Development Postgres: host port from `POSTGRES_PORT` (default **5432**)
- Isolated test Postgres: host port from `TEST_POSTGRES_PORT` (default **5433**)

Check:

```bash
docker compose ps
docker compose --profile test ps
```

---

## Prisma migrate and seed

Run from a shell where `backend/.env` is loaded (the npm scripts below do that):

```bash
npm run prisma:validate --prefix backend
npm run prisma:generate --prefix backend
npm run prisma:migrate --prefix backend
```

`prisma:migrate` runs `prisma migrate deploy` against `DATABASE_URL`.

**Seed is never automatic.** Load synthetic development fixtures only when you
want them:

```bash
npm run prisma:seed:dev --prefix backend
```

Re-running the seed upserts the same synthetic Companies, users, KPI definition,
draft target, and permissions.

---

## Run the application

In two terminals:

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
```

| Service  | URL                                 |
| -------- | ----------------------------------- |
| React UI | http://127.0.0.1:5173               |
| API      | http://127.0.0.1:8000/api/v1        |
| Health   | http://127.0.0.1:8000/api/v1/health |
| Ready    | http://127.0.0.1:8000/api/v1/ready  |
| Swagger  | http://127.0.0.1:8000/api/docs      |

Vite proxies `/api` to `http://127.0.0.1:8000`.

---

## Seeded accounts

Passwords are **not** listed here. Read the hashes’ plaintext sources in
`backend/prisma/seed.ts` (search for `argon2.hash`).

| Email                   | Role (COM-001)  | Access summary                                                                                                                                                                        |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin001@example.test` | `COMPANY_ADMIN` | Wildcard `*` — full access for local development                                                                                                                                      |
| `user001@example.test`  | `COMPANY_USER`  | Read-oriented only: `tenants:read`, `organisation:read`, `frameworks:read`, `kpis:read`. **No** user/org writes, **no** KPI config/target/actual write or approve, **no** `risk:read` |

Use the admin account for the walkthrough below. These credentials are synthetic
fixtures for local use only — never reuse them in shared or production systems.

---

## Tests

### Backend unit tests

```bash
npm run test:unit --prefix backend
```

### Backend integration tests

Requires the isolated test database:

```bash
docker compose --profile test up -d postgres_test
npm run test:integration --prefix backend
```

The runner refuses to use the development database, production-like names, or
`NODE_ENV=production`. It migrates and seeds the **test** database only.

### Frontend Playwright

First time on a machine, install the browser from `frontend/`:

```bash
cd frontend
npx playwright install chromium
cd ..
```

Then:

```bash
npm run test:e2e --prefix frontend
```

Most Playwright suites mock `/api/v1/**` in the browser. They are **not**
browser-to-PostgreSQL end-to-end tests.

---

## Walkthrough: missed KPI actual → Risk Register

Goal: create a configuration, approve a target, submit a missed actual, and see
the automatic risk.

All routes in this walkthrough are live and API-connected. For the deterministic
local/UAT dataset and synthetic login setup, follow
[`docs/operations/uat-demo-seed.md`](./docs/operations/uat-demo-seed.md).
For the separate GenBioCa Company and actual-workbook backend MVP, follow
[`docs/backend-data-mvp-contract-and-uat.md`](./docs/backend-data-mvp-contract-and-uat.md).

### 1. Sign in

Open http://127.0.0.1:5173/login as `admin001@example.test` (password from
`backend/prisma/seed.ts`).

### 2. Create a KPI configuration

Open **KPI Configuration**:
http://127.0.0.1:5173/kpi/configuration

For a single-developer walkthrough, use:

- `requiresEvidence`: `false`
- `requiresApproval`: `false` (submit auto-approves the target; avoids
  self-approval conflicts)

Use the seeded definition `KPI-001` (Customer Satisfaction Score). Resolve its
id via `GET /api/v1/kpi-definitions`. Set `ownerId` to the admin user id from
the login response. Give `productService` a unique string so the configuration
scope does not collide with the seed.

### 3. Create and submit a target

Open the configuration's **Targets** view, create a period target, and submit
it.

With `requiresApproval: false`, the target becomes `APPROVED` on submit.

If you use `requiresApproval: true`, a **different** user with
`kpi-target:approve` must approve — the submitter cannot self-approve.

### 4. Submit a missed actual (live UI)

Open **KPI Actual Entry**: http://127.0.0.1:5173/kpi/actual-entry

1. Select the configuration you created.
2. Choose the approved period.
3. Enter an actual well below the target (for example `50` against `100`).
4. Submit.

Expect RAG **RED** (or **AMBER** depending on thresholds) and an automatic risk
summary in the response panel.

### 5. Approve the actual and confirm the risk

When approval is required, sign in as an authorised user other than the
submitter and approve it from
http://127.0.0.1:5173/kpi/approval.

Open **Risk Register**: http://127.0.0.1:5173/compliance/risks

- Title is primary (pattern:
  `KPI target missed: KPI-001 Customer Satisfaction Score (<period>)`).
- Code such as `RSK-001` is secondary.
- Open the row for detail at `/compliance/risks/:riskId`.
- With KPI lineage present, the detail page states the risk was raised
  automatically because a KPI target was missed.
- The detail page supports owner assignment, append-only review and treatment,
  residual scoring, closure and reopening for authorised roles.

`COMPANY_USER` cannot open the register (`risk:read` is not granted).

---

## Project structure

| Path                                                                   | Role                                                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `frontend/`                                                            | React 19 + Vite + TypeScript UI. Live pages and truthful module-status routes; prototype React data is dormant. |
| `backend/`                                                             | Express 5 + TypeScript API, auth, middleware, domain modules.                                                   |
| `backend/prisma/`                                                      | Active schema, migrations, and seed scripts.                                                                    |
| `docs/`                                                                | Architecture notes, reviews, and prototype HTML reference assets.                                               |
| `legacy/`                                                              | **Dormant.** Old Node and Python implementations. Do not run their                                              |
| migrations, import them into active code, or build features there. See |
| `legacy/README.md`.                                                    |
| `docker-compose.yml`                                                   | Local Postgres, test Postgres, optional migrate/app images.                                                     |

Authoritative runtime paths are also listed in
`docs/architecture/authoritative-runtime.md`.

---

## Optional: Dockerised app container

Local day-to-day development uses `npm run dev` for backend and frontend.
Compose can also build and run the compiled API:

```bash
docker compose build app
docker compose run --rm migrate
docker compose up -d app
```

Migrations and seed remain separate. Never seed production.

---

## Further reading

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — architecture, tenancy, security, workflow
- `docs/architecture/authoritative-runtime.md`
- `docs/frontend-route-mapping.md`
- `docs/domain/02-kpi-risk-schema.md` — KPI/Risk domain vocabulary

Deployment to AWS (or any cloud) is **out of scope** for this README.
