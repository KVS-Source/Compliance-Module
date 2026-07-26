# Legacy quarantine

These directories are dormant reference implementations. They are not part of the
active GenBioCa runtime and must not be imported, wired into Docker, migrated,
or extended with new features.

| Path | Former location | Contents |
|------|-----------------|----------|
| `legacy/src/` | `src/` | Old Express/TypeScript backend |
| `legacy/prisma/` | `prisma/` | Old Prisma schema |
| `legacy/tests/` | `tests/` | Tests for the old Node backend |
| `legacy/legacy_python_backend/` | `legacy_python_backend/` | Old FastAPI backend |

Active runtime:

- `frontend/`
- `backend/`
- `backend/prisma/`
- `docker-compose.yml`

Root prototype HTML copies (`GenBioCa-Compliance-Platform (1).html` and the
hidden backup) remain at the repository root because Vite, Express, and Docker
still reference them for the approved prototype comparison path. Do not move or
delete those files as part of this quarantine.
