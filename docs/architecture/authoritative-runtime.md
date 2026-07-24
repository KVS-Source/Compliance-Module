# Authoritative Runtime

## Production-target application

The only production-target implementation of the GenBioCa Compliance Platform is:

- `frontend/` — React and TypeScript frontend
- `backend/` — Express and TypeScript backend
- `backend/prisma/` — active Prisma schema, migrations, and development seed
- `backend/Dockerfile` — application image build
- `docker-compose.yml` — local PostgreSQL and application infrastructure

All setup, build, database, test, and Docker commands must target these directories.

## Dormant implementations

The following implementations are retained for controlled review but are not part of the active application:

- root `src/`
- root `prisma/`
- root `tests/`
- `legacy_python_backend/`

Do not connect the React application, active Express backend, Docker services, or active database migrations to dormant code. Do not implement new features in dormant implementations.

Dormant code may contain business rules needed by future migration work. Those rules must be reviewed, reconciled with the active tenant and shared-master models, and covered by approved tests before eventual archival or removal.

## Change-control rule

Milestone work must identify whether a file belongs to the active runtime before it is changed. A change to dormant code is permitted only when it adds an archival/status notice or is part of a separately approved migration task.
