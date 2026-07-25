# CLAUDE.md — GenBioCa Compliance Platform

Operating rules for Claude Code in this repository. Read this fully before editing
anything. If a request conflicts with these rules, follow the rules and say so.

## What this is
Multi-tenant (multi-Company) Governance, Risk & Compliance platform. PERN stack:
PostgreSQL + Express + React + Node, Prisma ORM, JWT auth. **The backend is the
source of truth for authorization and tenant isolation. Frontend checks are UX only.**

## Authoritative runtime — the ONLY code you may develop
- `frontend/` — React 19 + Vite + TypeScript; react-router-dom in **library/data mode**
  (`createBrowserRouter` + `RouterProvider`).
- `backend/` — Express 5 + TypeScript + Prisma; schema at `backend/prisma/schema.prisma`.
- `docker-compose.yml`

## Dormant — DO NOT edit, import, wire in, or delete
- `src/`, `prisma/`, `tests/` (root-level old Node backend)
- `legacy_python_backend/` (old FastAPI backend)
- Stray prototype HTML copies at the repo root
Preserved on purpose, for reference only. Never import from these into `frontend/`
or `backend/`. If a task seems to require them, stop and ask.

## Live vs prototype (frontend)
- API-connected routes hit the real backend and must NOT show the prototype banner.
- Prototype-only routes render through `PrototypeRoutePage` and MUST show:
  “Prototype module — demonstration data only. Changes are not saved.”
- Never wire a prototype page to a fake or undeclared backend write. A screen is
  either genuinely API-backed or clearly labelled prototype — never a fake in between.

## Non-negotiable business rules (honor when building these modules)
- A KPI must always show: code, name, unit of measure, frequency, owner, department.
- KPI target met → show “No Risk”; create NO risk record.
- KPI target missed → create or update exactly ONE linked risk, class Major or Minor,
  tied to the KPI actual. Prevent duplicate active risk for one actual (DB partial
  unique index when this is built).
- KPI risk class (Major/Minor) and enterprise risk level (Low/Medium/High/Critical)
  are SEPARATE fields — never merged.
- Approved-evidence gates: KPI approval, policy approval, gap closure, CAPA closure,
  and risk-treatment completion (where configured). Enforce in the backend, not the UI.
- Audit events are append-only — the DB trigger `prevent_audit_event_mutation`
  enforces this. Never add update/delete APIs for `audit_events`.
- Traceability chain, in this order: Policy → Framework → Rule → Evidence → Control
  → KPI → Target vs Actual → Risk. Preserve the order in any mapping model or UI.

## Tenant isolation (mandatory)
- Every tenant-owned query filters by the authenticated tenant from the JWT context.
  Never trust a tenant id from the request body or query alone.
- Cross-tenant read or write must fail. Add a negative test whenever you touch a
  tenant-owned path.
- Shared masters are global (no `tenant_id`): `frameworks`, `framework_rules`,
  `kpi_definitions`, `permissions`. Tenant-owned tables carry `tenant_id`.

## Security rules
- Access token in memory only. Refresh token in an HTTP-only cookie, hashed in the DB,
  rotating, with family reuse detection. Do not weaken this.
- Never commit or print secrets. `.env`, `.env.local`, `backend/.env` are gitignored —
  keep them that way. No secret values in code, logs, docs, or CI files.
- Integration tests use `DATABASE_URL_TEST` only and must refuse to run against the dev
  DB or anything resembling production.
- No automatic seeding on startup. Seeds are explicit (`npm run prisma:seed:dev`).
- Production: `COOKIE_SECURE=true`; reject weak/placeholder JWT secrets; validate env
  with Zod at boot. Zod-validate every API boundary; never leak Prisma/internal errors
  to clients — use the response envelope.

## React Router — stay in library/data mode
The 2026 React Router advisories are Framework-Mode issues; library/data mode
(`createBrowserRouter`) is not affected. Do NOT introduce framework mode:
- no `@react-router/dev`, `@react-router/node`, `@react-router/serve`
- no `reactRouter()` Vite plugin, no `react-router.config.ts`, no `app/routes.ts`
  file-system routing, no `ssr: true`, no RSC / server actions
The router-mode guard script enforces this in CI.

## Workflow (never bypass)
1. Create a branch. 2. Small, focused commits. 3. Run locally before pushing:
`typecheck`, `lint`, `test` (unit + isolated-DB integration), `prisma validate`, and
frontend `build` + Playwright. 4. Push a private branch, open a DRAFT PR.
5. CodeRabbit reviews. 6. Human reviews. 7. Merge only after tests pass and a human
approves.
- NEVER auto-merge. Never let CodeRabbit or any tool apply fixes without human review.
- Never run `npm audit fix --force`. No broad or unrelated dependency upgrades. The
  React Router and ESLint advisories are handled separately and deliberately.

## Testing rules
- Unit tests for helpers/config; integration tests against the isolated Postgres only;
  Playwright with bundled/isolated Chromium (never a personal Chrome profile).
- Cross-tenant access tested negatively. Logout-after-expired-token tested. Prototype
  routes show the banner; live routes don’t.

## Style and data
- Do NOT do broad cosmetic “make it look less AI” refactors. Priority order:
  correctness → security → tenant isolation → tests → maintainability → cleanup.
- Anonymized data only in seeds/tests (Company 001, User 003, KPI-001, POL-001,
  RSK-042); `.test` email domain. No real customer or employee data, ever.
- Docs and comments: exact paths, exact commands, no vague assumptions, no secrets.

## Read before non-trivial work
- `docs/architecture/authoritative-runtime.md`
- `docs/reviews/remediation-batch-1-results.md`
- `docs/reviews/react-router-dependency-remediation.md`
- The project handoff document.
