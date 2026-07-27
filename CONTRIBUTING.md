# Contributing to the GenBioCa Compliance Platform

These are the standing architecture, security, workflow, and data constraints for
every contributor. Review them before making non-trivial changes. If a requested
change conflicts with these constraints, stop and resolve the conflict first.

## Project overview

GenBioCa is a multi-Company Governance, Risk & Compliance platform built on the
PERN stack: PostgreSQL, Express, React, and Node, with Prisma ORM and JWT
authentication. The backend is the source of truth for authorization and tenant
isolation. Frontend permission checks are for user experience only.

## Authoritative runtime

Develop production-target functionality only in:

- `frontend/` — React 19, Vite, and TypeScript, with React Router in library/data
  mode through `createBrowserRouter` and `RouterProvider`
- `backend/` — Express 5, TypeScript, and Prisma, with the active schema at
  `backend/prisma/schema.prisma`
- `docker-compose.yml`

## Dormant implementations

Do not edit, import, connect, or delete:

- `legacy/src/`, `legacy/prisma/`, and `legacy/tests/`
- `legacy/legacy_python_backend/`
- Prototype HTML copies at the repository root that remain referenced by the
  active Vite, Express, and Docker configuration

These implementations are retained for reference only. Never import them into
`frontend/` or `backend/`. Stop and resolve the scope before proceeding if a
change appears to require dormant code. See `legacy/README.md`.

## Live and prototype frontend routes

- API-connected routes use the real backend and must not show the prototype
  banner.
- Prototype-only routes render through `PrototypeRoutePage` and must show:
  “Prototype module — demonstration data only. Changes are not saved.”
- Never connect a prototype screen to a fake or undeclared backend write. A
  screen must be genuinely API-backed or clearly labelled as a prototype.

## Non-negotiable business rules

- A KPI must always show its code, name, unit of measure, frequency, owner, and
  department.
- A met KPI target shows “No Risk” and creates no risk record.
- A missed target that evaluates to AMBER or RED creates or updates exactly one
  linked Major or Minor KPI risk. A miss within the configured amber tolerance
  evaluates GREEN and creates no risk. Enforce a database partial unique index
  when this workflow is implemented.
- KPI risk class (`Major` or `Minor`) and enterprise risk level (`Low`, `Medium`,
  `High`, or `Critical`) are separate fields and must not be merged.
- Approved-evidence gates apply to KPI approval, policy approval, gap closure,
  CAPA closure, and configured risk-treatment completion. Enforce these gates in
  the backend.
- Audit events are append-only. The `prevent_audit_event_mutation` database
  trigger enforces this; never add update or delete APIs for `audit_events`.
- Preserve this traceability order in models and interfaces:
  Policy → Framework → Rule → Evidence → Control → KPI → Target vs Actual → Risk.

## Tenant isolation

- Every tenant-owned query must filter by the authenticated tenant from the JWT
  context.
- Never trust a tenant identifier from the request body or query string as the
  authority for tenant context.
- Cross-tenant reads and writes must fail. Add a negative isolation test whenever
  a tenant-owned path changes.
- Shared masters are global and have no `tenant_id`: `frameworks`,
  `framework_rules`, `kpi_definitions`, and `permissions`.
- Tenant-owned tables must carry `tenant_id`.

## Security

- Keep access tokens in memory only.
- Store refresh tokens in HTTP-only cookies, hash them in the database, rotate
  them, and preserve token-family reuse detection.
- Never commit or print secrets. Keep `.env`, `.env.local`, and `backend/.env`
  ignored. Do not place secret values in source code, logs, documentation, or CI
  configuration.
- Integration tests must use `DATABASE_URL_TEST` and refuse the development
  database or anything resembling production.
- Never seed automatically at application startup. Development fixtures run only
  through `npm run prisma:seed:dev`.
- Secure cookies are mandatory in production. Reject weak or placeholder JWT
  secrets and validate the environment at startup with Zod.
- Validate every API boundary with Zod and return safe response envelopes instead
  of Prisma errors or internal details.

## React Router

Remain in library/data mode. The application uses `createBrowserRouter` and must
not introduce framework mode:

- Do not add `@react-router/dev`, `@react-router/node`, or
  `@react-router/serve`.
- Do not add the `reactRouter()` Vite plugin, `react-router.config.ts`,
  file-system routing through `app/routes.ts`, server rendering, React Server
  Components, or server actions.
- Keep the router-mode guard active in CI.

## Workflow

1. Create a focused branch.
2. Make small, focused commits.
3. Run type checking, linting, unit tests, isolated-database integration tests,
   Prisma validation, the frontend build, and Playwright locally.
4. Push a private branch and open a draft pull request.
5. Complete automated static checks and human review.
6. Merge only after all required tests pass and a human approves.

Never auto-merge, accept automatic fixes without human review, run
`npm audit fix --force`, or perform broad unrelated dependency upgrades. Handle
React Router and ESLint advisories separately and deliberately.

### Branch and pull-request rules

- Never checkout, commit to, or push to `main`. All work happens on a feature
  branch cut from the latest `origin/main`.
- Stop at ready-to-push. The human handles the pull request and the merge.
- When reporting a branch as ready, always give the pull-request URL in this
  exact form, which sets the base explicitly:

  ```text
  https://github.com/riracreate/genbioca_compliance_platform/compare/main...<branch>
  ```

  Never use the `/pull/new/<branch>` form. The repository default branch
  resolves to `governance/ci-hardening`, so that form defaults the base
  incorrectly.

## Testing

- Use unit tests for helpers and configuration.
- Run integration tests only against isolated PostgreSQL.
- Run Playwright with its bundled, isolated Chromium environment rather than a
  personal browser profile.
- Maintain negative cross-tenant coverage, expired-token logout coverage, and
  prototype-banner coverage.
- Live routes must not show the prototype banner.

## Style and data

- Do not perform broad cosmetic refactors. Prioritize correctness, security,
  tenant isolation, tests, maintainability, and then cleanup.
- Use anonymized fixtures only, such as Company 001, User 003, KPI-001, POL-001,
  RSK-042, and `.test` email addresses.
- Never use real customer or employee data in seeds or tests.
- Documentation and comments must use exact paths and commands, avoid vague
  assumptions, and contain no secrets.

## Developer onboarding

Read these documents before non-trivial work:

- `docs/architecture/authoritative-runtime.md`
- `docs/reviews/remediation-batch-1-results.md`
- `docs/reviews/react-router-dependency-remediation.md`
