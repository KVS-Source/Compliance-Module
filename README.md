# GenBioCa Compliance Platform — PERN React Milestone 1

GenBioCa is a multi-company compliance platform built with PostgreSQL, Express, React/TypeScript, and Node.js.

## Authoritative runtime

Only these paths belong to the active application:

- `frontend/` — React frontend
- `backend/` — Express backend
- `backend/prisma/` — active Prisma schema and migrations
- `backend/Dockerfile` and `docker-compose.yml` — local application infrastructure

Root `src/`, root `prisma/`, root `tests/`, and `legacy_python_backend/` are dormant. Do not run their migrations or add new features to them. See `docs/architecture/authoritative-runtime.md`.

## Requirements

- Node.js 20 or later
- PostgreSQL 16
- npm
- Docker with Compose for the container workflow

## Configuration

Copy `.env.example` to an ignored local environment file and replace every placeholder. Never commit environment files or reuse development credentials in a shared environment.

The backend validates required configuration at startup. Production requires a strong non-placeholder JWT secret and secure cookies.

## Install active dependencies

```bash
npm ci --prefix backend
npm ci --prefix frontend
```

## Local development

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Prepare the active Prisma client and schema:

```bash
npm run prisma:validate --prefix backend
npm run prisma:generate --prefix backend
npm run prisma:migrate --prefix backend
```

Development seed data is never loaded automatically. Load deterministic synthetic fixtures only when explicitly required:

```bash
npm run prisma:seed:dev --prefix backend
```

Start the backend and frontend in separate terminals:

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
```

The frontend runs at `http://127.0.0.1:5173` and proxies `/api` to the backend at `http://127.0.0.1:8000`.

## Docker application

The Docker application startup command starts the compiled application only. Migrations and development seed data are separate operations.

```bash
docker compose build app
docker compose run --rm migrate
docker compose up -d app
```

Development seed data remains an explicit local backend command and must never be run in production.

Open:

- React application: `http://127.0.0.1:8000/`
- Liveness: `http://127.0.0.1:8000/api/v1/health`
- Readiness: `http://127.0.0.1:8000/api/v1/ready`
- Swagger: `http://127.0.0.1:8000/api/docs`

## Isolated integration tests

Integration tests require `DATABASE_URL_TEST`. The runner refuses to use the normal development database, a production-like database name, or any database while `NODE_ENV=production`.

```bash
docker compose --profile test up -d postgres_test
npm run test:integration --prefix backend
docker compose --profile test stop postgres_test
```

To remove only the isolated test volume after the service is stopped, use the explicit test-volume command documented in the remediation report. Never remove the normal development volume during test cleanup.

## Verification

```bash
npm run typecheck --prefix backend
npm run lint --prefix backend
npm run build --prefix backend
npm run test:unit --prefix backend
npm run test:integration --prefix backend
npm run prisma:validate --prefix backend
npm run prisma:generate --prefix backend

npm run typecheck --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
npm run test:e2e --prefix frontend

docker compose config
```

## Milestone 1 scope

React provides authentication, Company switching, the application shell, the dashboard, and the read-only master pages connected to the active API. Routes rendered through `PrototypeRoutePage` remain interactive design references and display demonstration data only; their changes are not persisted.

Access tokens remain in memory. Rotating refresh tokens use a same-origin HttpOnly cookie.

## Documentation

- `docs/architecture/authoritative-runtime.md`
- `docs/frontend-route-mapping.md`
- `docs/schema-alignment.md`
- `docs/api-mapping.md`
- `docs/architecture-decisions.md`
