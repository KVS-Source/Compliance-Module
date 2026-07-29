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

## Install and verify

```sh
npm run install:all
docker compose up -d postgres
docker compose --profile test up -d postgres_test
npm run prisma:validate --prefix backend
npm run prisma:generate --prefix backend
npm run prisma:migrate --prefix backend
```

`prisma:migrate` runs `prisma migrate deploy`. Migrations and seeds are never
automatic. If synthetic development fixtures are required, run explicitly:

```sh
npm run prisma:seed:dev --prefix backend
```

Never seed production. The UAT demo seed has a separate explicit procedure in
[uat-demo-seed.md](./operations/uat-demo-seed.md).

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

For current route and product status, read
[current-status-and-v1-scope.md](./status/current-status-and-v1-scope.md).
