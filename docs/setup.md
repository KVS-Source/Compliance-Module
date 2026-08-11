# Local setup

The only active runtimes are `backend/` and `frontend/`. The root package
orchestrates those packages and contains no third application.

## Prerequisites

- Node.js 20 or newer;
- npm;
- Docker Desktop/Engine with Compose V2.

## Configure

Copy `.env.example` to both the repository root `.env` (Compose) and
`backend/.env` (host-run backend), then replace every placeholder. Never commit
either file.

`JWT_ISSUER` is required. The access TTL must use a supported duration such as
`15m`. Use `FILE_STORAGE_DRIVER=local`; S3 is not implemented and configuration
fails closed if selected.

### Upgrade existing environments

`JWT_ISSUER` is now mandatory. An existing `backend/.env` or deployment
environment that previously relied on the application default must add it
before the backend restarts. Startup intentionally fails closed when the value
is missing or empty.

Use a stable application identifier, not a password, credential or other
secret. Token signing and validation must use the same issuer consistently.
Production must not use a placeholder value. For example:

```dotenv
JWT_ISSUER=genbioca-compliance
```

Upgrade sequence:

1. Stop the backend.
2. Add `JWT_ISSUER` to `backend/.env` or the managed runtime environment.
3. Validate the environment without printing its values:

   ```sh
   cd backend
   npm exec -- tsx -e 'import("./src/config/env.ts")'
   cd ..
   ```

4. Restart the backend.
5. Verify login and refresh through the normal client flow.
6. Require users to authenticate again if issuer behaviour changed and existing
   sessions no longer validate.

## Install and prepare PostgreSQL

```sh
npm run install:all
docker compose up -d postgres
docker compose --profile test up -d postgres_test
npm run prisma:validate --prefix backend
npm run prisma:generate --prefix backend
npm run prisma:migrate --prefix backend
```

Run the repository’s static verification without a database or browser:

```sh
npm run verify:static
```

`verify:static` runs backend/frontend type checking, linting and builds plus the
router, runtime-boundary and route guards. It intentionally does not run Prisma
validation/generation, PostgreSQL integration tests or Playwright and must not
be treated as the complete release gate.

`prisma:migrate` runs `prisma migrate deploy`. Migrations and seeds are never
automatic. If synthetic development fixtures are required, run explicitly:

```sh
npm run prisma:seed:dev --prefix backend
```

Never seed production. The UAT sample seed has a separate explicit procedure in
[uat-sample-seed.md](./operations/uat-sample-seed.md).

## Start

Run the active child applications in two terminals:

```sh
npm run dev --prefix backend
npm run dev --prefix frontend
```

The root `npm run dev` is a convenience orchestrator for exactly those two
commands; it does not start a root backend.

- React: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8000/api/v1`
- liveness: `/api/v1/health`
- readiness: `/api/v1/ready`
- Swagger UI: `/api/docs`

## Test

```sh
npm run test:unit --prefix backend
npm run test:integration --prefix backend
npm run test:e2e --prefix frontend
```

Integration tests require `postgres_test` and refuse unsafe database targets.
Playwright intercepts API responses and is not browser-to-PostgreSQL E2E.
Complete release verification requires the disposable PostgreSQL service,
applied migrations and installed Playwright Chromium. These gates remain
explicit; no verification command migrates or seeds automatically.

For current route and product status, read
[current-status-and-v1-scope.md](./status/current-status-and-v1-scope.md).
