# Governance and CI Hardening

Date: 26 July 2026  
Branch: `governance/ci-hardening`

## Steps 1–8 (approved scope)

| Step | Status | Deliverable |
|------|--------|-------------|
| 1 | Done | Repository governance instructions (`CONTRIBUTING.md`) |
| 2 | Done | Secret exposure review (`docs/reviews/secret-exposure.md`) |
| 3 | Done | Architecture guards (`scripts/check-router-mode.mjs`, `scripts/check-active-boundaries.mjs`) |
| 4 | Done | React Router risk acceptance (`docs/reviews/react-router-risk-acceptance.md`) |
| 5 | Done | Separate ESLint advisory (`docs/reviews/eslint-advisory.md`) |
| 6 | Done | Quarantine dormant directories under `legacy/` via `git mv` |
| 7 | Done | CI workflow (backend, frontend, architecture guards, Gitleaks, Semgrep) |
| 8 | Done | Local verification suite before push |

## Quarantine map

| Former path | New path |
|-------------|----------|
| `src/` | `legacy/src/` |
| `prisma/` | `legacy/prisma/` |
| `tests/` | `legacy/tests/` |
| `legacy_python_backend/` | `legacy/legacy_python_backend/` |

Root prototype HTML copies were **not** moved:

- `GenBioCa-Compliance-Platform (1).html`
- `.GenBioCa-Compliance-Platform.backup.html`

They remain referenced by Vite (`frontend/vite.config.ts`), Express
(`backend/src/app.ts`), and Docker (`backend/Dockerfile`).

## Explicit non-goals

- No Prisma schema changes
- No new product modules
- No auth rate-limit / trust-proxy work (tracked on `security/auth-hardening`)
- No deletion of dormant code
