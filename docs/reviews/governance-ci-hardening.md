# Governance and CI Hardening

## Current governance authority

Evidence status on 2026-07-29:

| Governance control | Status | Evidence |
| --- | --- | --- |
| Default branch is `main` | **VERIFIED** | Repository Settings screenshot supplied by the repository owner. |
| `main` branch protection or ruleset | **PENDING** | Independent Settings/ruleset evidence is required. |
| Pull requests required before merging | **PENDING** | Independent Settings/ruleset evidence is required. |
| At least one approving review | **PENDING** | Independent Settings/ruleset evidence is required. |
| Stale approvals dismissed | **PENDING** | Independent Settings/ruleset evidence is required. |
| Conversation resolution required | **PENDING** | Independent Settings/ruleset evidence is required. |
| Five exact CI check contexts required | **PENDING** | Independent Settings/ruleset evidence is required. |
| Force pushes blocked | **PENDING** | Independent Settings/ruleset evidence is required. |
| Branch deletion blocked | **PENDING** | Independent Settings/ruleset evidence is required. |
| Administrator bypass policy | **PENDING** | Independent Settings/ruleset evidence is required. |

The five contexts are `Backend and isolated PostgreSQL`, `Frontend and
Playwright`, `Architecture guards`, `Gitleaks` and `Semgrep SAST`.

An administrator must provide evidence from the active rule targeting `main`
that shows the rule status, target and bypass list plus every pull-request,
review, conversation, required-check, force-push and deletion control above.
Milestone 0 does not change repository settings and must not merge until this
protection/ruleset evidence is complete.

## Historical delivery record

Date: 26 July 2026  
Branch: `governance/ci-hardening`

PR #19 later merged with zero checks and remains a recorded governance
exception.

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
