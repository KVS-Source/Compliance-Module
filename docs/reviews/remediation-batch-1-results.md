# GenBioCa Compliance Platform

## Remediation Batch 1 Results

Date: 24 July 2026  
Branch: `hardening/milestone-1`  
Baseline: `milestone-1-baseline` (`64c1b67`)  
Scope: controlled Milestone 1 hardening only

## 1. Executive summary

Remediation Batch 1 is complete on the required branch. The active PERN runtime is now documented, Docker startup no longer seeds data, production environment validation rejects unsafe authentication and cookie settings, logout is refresh-cookie driven and idempotent, integration tests are isolated behind `DATABASE_URL_TEST`, prototype-only routes are consistently labelled, tenant role assignments require a matching active membership at both service and database layers, and liveness/readiness endpoints are distinct.

All 21 backend unit tests, 12 isolated PostgreSQL integration tests, and 8 Playwright project tests passed. Backend and frontend type checks, lint, and production builds passed. Prisma validation and generation passed, and all three active migrations are applied to the isolated test database.

The backend dependency audit reports no known vulnerabilities. The frontend audit reports two high-severity findings in the React Router dependency chain. No automatic audit fix was run. The branch is ready for pull-request review but should not be considered release-ready until that advisory is handled through a controlled dependency update and regression run.

## 2. Files created

- `backend/prisma/migrations/20260724200000_user_role_membership_invariant/migration.sql`
- `backend/prisma/seed-safety.ts`
- `backend/scripts/run-integration-tests.ts`
- `backend/src/config/test-database.ts`
- `backend/src/modules/access/role-assignment-service.ts`
- `backend/tests/auth-logout.test.ts`
- `backend/tests/environment.test.ts`
- `backend/tests/health.test.ts`
- `backend/tests/test-database.test.ts`
- `docs/architecture/authoritative-runtime.md`
- `docs/architecture/user-role-membership-invariant.md`
- `docs/reviews/remediation-batch-1-results.md`
- `legacy_python_backend/DORMANT.md`
- `prisma/DORMANT.md`
- `src/DORMANT.md`
- `tests/DORMANT.md`

## 3. Files modified

- `.env.example`
- `.gitignore`
- `README.md`
- `backend/Dockerfile`
- `backend/package.json`
- `backend/prisma/seed.ts`
- `backend/src/config/env.ts`
- `backend/src/docs/openapi.ts`
- `backend/src/modules/auth/repository.ts`
- `backend/src/modules/auth/routes.ts`
- `backend/src/modules/auth/service.ts`
- `backend/src/routes/index.ts`
- `backend/tests/api.test.ts`
- `backend/tsconfig.json`
- `docker-compose.yml`
- `frontend/src/features/auth/LoginPage.tsx`
- `frontend/src/features/prototype/PrototypeRoutePage.tsx`
- `frontend/src/styles/react-adapter.css`
- `frontend/tests/milestone1.e2e.ts`

Dormant implementation source was not moved, deleted, connected to the active runtime, or otherwise modified beyond the four notice files.

## 4. Migrations created

`20260724200000_user_role_membership_invariant`

The migration:

- performs a read-only preflight check and aborts when inconsistent active assignments already exist;
- creates a PostgreSQL trigger that rejects an active tenant role assignment without an active `UserCompany` membership for the same user and tenant;
- does not perform destructive cleanup;
- leaves the global user and multi-company membership model unchanged.

The documented cleanup query and review procedure are in `docs/architecture/user-role-membership-invariant.md`.

## 5. Configuration changes

- Docker Compose credentials and connection values now use environment-variable interpolation.
- `.env.example` contains variable names and non-secret guidance only.
- Production rejects a missing or short JWT access secret, known placeholder secret text, and `COOKIE_SECURE=false`.
- Development and test may use `COOKIE_SECURE=false`; production may not.
- Application startup, migration deployment, development seed, and test fixture execution are separate commands.
- `npm run start:docker` starts only the built application.
- Development seed execution requires `npm run prisma:seed:dev`.
- Test fixture execution requires the isolated runner and `npm run prisma:seed:test`.
- The Docker build and runtime images include OpenSSL for Prisma.
- Login email and password state starts empty, with no development password in the production frontend bundle.
- Seed logs do not print seed passwords.

## 6. Authentication changes

- Existing JWT access authentication and refresh-token rotation remain in place.
- Refresh-token reuse detection remains enabled and revokes the token family.
- Logout no longer requires bearer authentication.
- The frontend clears its in-memory access token in a `finally` path regardless of the logout API result.
- Authentication headers and cookies remain covered by logger redaction.

## 7. Logout behaviour before and after

Before:

- an expired or absent bearer access token could prevent logout from reaching refresh-session revocation;
- the refresh cookie might remain effective and restore the session on reload.

After:

- the refresh cookie is the primary logout-session identifier;
- the raw refresh token is hashed with the existing SHA-256 token-hashing function before lookup;
- a known active token revokes its token family and creates one `AUTH_LOGOUT` audit event;
- missing, unknown, or already-revoked cookies return a successful idempotent result without duplicate audit noise;
- the response always clears the refresh cookie;
- refresh after logout fails;
- the frontend clears access state even when the API fails;
- a browser reload after logout stays on the login page.

Covered cases: valid bearer plus cookie, expired bearer plus cookie, cookie without bearer, already-revoked token, unknown token, missing cookie, repeated logout, refresh after logout, and browser reload after logout.

## 8. Test-database safety controls

The integration runner refuses to proceed when:

- `DATABASE_URL_TEST` is missing;
- `DATABASE_URL_TEST` equals the normal `DATABASE_URL`;
- the database name does not clearly indicate test use;
- the host or database name resembles production;
- `NODE_ENV` is production;
- the test file is invoked outside the isolated runner.

Only the child test processes receive the isolated URL as `DATABASE_URL`. Connection strings are not printed. Migrations and deterministic fixtures ran only against the dedicated PostgreSQL test service on its separate port and volume. Test-created user records are explicitly removed; normal development data is not seeded by the integration runner.

The negative safety unit test proving refusal of the normal development database passed.

## 9. Prototype-page labelling

Every route rendered through `PrototypeRoutePage` now displays:

> Prototype module — demonstration data only. Changes are not saved.

Dashboard, users, and frameworks do not display this banner because they use API-connected route components. Prototype toast notifications identify their actions as simulations and state that no PostgreSQL data was changed. Existing prototype interactions and mock data remain available for design reference, and no new APIs were added.

Playwright verified multiple prototype categories, all three API-connected exclusions, and the absence of undeclared backend write requests from a simulated update.

## 10. Database integrity changes

The new role-assignment service validates:

- an active membership exists for the user and tenant;
- the role is active;
- the role belongs to the same tenant.

The PostgreSQL trigger independently rejects invalid direct writes. Negative integration coverage proves that both the service layer and direct Prisma creation reject a tenant-scoped role for a user without membership.

No existing inconsistent record is deleted or changed automatically.

## 11. Commands executed

Baseline and branch:

- `git init`
- `git branch -M main`
- `git status --short`
- `git check-ignore -v backend/.env`
- `git add .`
- `git commit -m "chore: establish Milestone 1 baseline"`
- `git tag milestone-1-baseline`
- `git checkout -b hardening/milestone-1`

Backend:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:unit`
- `npm run test:integration`
- `npm run prisma:validate`
- `npm run prisma:generate`
- `npm exec -- prisma migrate status` with only the isolated test database selected

Frontend:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`

Docker and runtime:

- `docker compose config --quiet` with resolved values kept out of output
- started the existing development PostgreSQL service without recreating its volume
- started the separate test PostgreSQL service and volume
- built and started only the current application service, with no migration or seed command
- checked container health, `/api/v1/health`, `/api/v1/ready`, Swagger, and the React dashboard route

Security:

- `npm audit` in `backend/`
- `npm audit` in `frontend/`
- tracked-file checks for `.env`, build/test/upload/database artifacts, private-key markers, JWT-shaped values, and credential-related patterns
- no automatic audit fix command was run

## 12. Passed tests

Backend unit tests: **21 passed**

- environment validation: 7
- test-database safety: 5
- logout unit behaviour: 2
- health/readiness: 3
- frontend serving: 2
- existing unit coverage: 2

Backend isolated integration tests: **12 passed**

- liveness and readiness
- successful login and current-user access
- invalid login
- disabled user
- refresh rotation
- refresh-token reuse and concurrent rotation
- reliable cookie-first logout matrix
- authorised tenant switching
- unauthorised tenant switching
- cross-tenant user and department isolation
- permission enforcement and validation errors
- membership, tenant, and append-only audit database invariants
- active-membership recheck for an issued access token

Frontend Playwright: **8 passed** across desktop and mobile projects.

Type checking, lint, builds, Prisma validation, Prisma generation, Compose validation, isolated migration deployment, and test fixture execution also passed.

## 13. Failed tests and checks

### Resolved during the batch

1. Command: `npm run test:integration`
   - Error: the restricted execution environment denied the local IPC socket used by `tsx`.
   - Likely cause: sandbox listener/IPC restriction, not application logic.
   - Affected module: integration-test runner.
   - Action: reran with approved local execution after the isolated database was available; 12 tests passed.

2. Command: `npm run test:e2e`
   - Error: the restricted execution environment denied the local Vite listener.
   - Likely cause: sandbox localhost restriction.
   - Affected module: Playwright web server.
   - Action: reran with approved localhost execution.

3. Command: first approved `npm run test:e2e` after adding the new tests.
   - Error: three project cases failed because two accessible names matched the password and sign-out selectors.
   - Likely cause: Playwright strict-selector ambiguity.
   - Affected file: `frontend/tests/milestone1.e2e.ts`.
   - Action: targeted the password input and profile-menu sign-out control directly; all 8 project cases then passed.

4. Command: initial sandboxed `npm audit` in both active packages.
   - Error: the npm advisory host could not be resolved.
   - Likely cause: restricted network access.
   - Affected module: dependency audit only.
   - Action: reran with approved network access.

5. Command: first Docker application image build.
   - Error: Prisma warned that OpenSSL could not be detected in the slim image.
   - Likely cause: missing runtime package in `node:22-bookworm-slim`.
   - Affected file: `backend/Dockerfile`.
   - Action: installed the minimal OpenSSL package in build and runtime stages; rebuild and runtime verification passed without the warning.

6. Command: first application-only Compose start invocation.
   - Error: Compose validation also required test-profile interpolation variables.
   - Likely cause: Compose interpolates required variables before profile/service selection.
   - Affected file: `docker-compose.yml`; invocation only, not application code.
   - Action: supplied all required names in process memory without printing values; Compose validation and application start passed.

7. Command: initial restricted localhost health probe.
   - Error: the running container was unreachable from the restricted process.
   - Likely cause: sandbox network isolation.
   - Affected module: runtime verification only.
   - Action: reran with approved localhost access; all four runtime URLs passed.

### Unresolved

Command: `npm audit` in `frontend/`

- Error: two high-severity vulnerabilities in the React Router dependency chain.
- Likely cause: the currently locked React Router versions fall within the published advisory range.
- Affected modules: `react-router` and `react-router-dom`.
- Proposed action: perform a controlled update to a patched compatible version on a separate dependency-hardening commit, then rerun typecheck, lint, build, all 8 E2E project tests, and `npm audit`.

## 14. Tests not executed and why

- No migration, seed, reset, drop, or cleanup operation was run against an unknown or production database.
- The readiness-unavailable path was tested with a controlled database failure in the unit suite; the healthy shared test service was not deliberately interrupted during the final integration run.
- No production deployment was attempted. Production environment rules were covered by automated configuration tests.
- The test volume removal command was documented but not executed, so the user can inspect the verified running services.

## 15. Prisma validation result

Passed. `backend/prisma/schema.prisma` is valid and is the only active Prisma schema.

## 16. Migration status

Passed against the isolated test database. Prisma found three migrations and reported the schema up to date. The new membership-invariant migration was applied successfully only to that test database.

## 17. Docker status

- Development PostgreSQL: running and healthy
- Isolated test PostgreSQL: running and healthy
- Application: running
- Compose configuration: valid
- Application image: rebuilt successfully with OpenSSL available to Prisma
- Liveness endpoint: HTTP 200
- Readiness endpoint: HTTP 200
- Swagger: HTTP 200
- React dashboard route: HTTP 200
- Automatic development seed at startup: absent

## 18. npm audit results

- Backend: 0 known vulnerabilities
- Frontend: 2 high-severity vulnerabilities in the React Router dependency chain
- Automatic fixes: not run

## 19. Remaining risks

### Critical

None identified in this batch.

### High

- Two frontend dependency audit findings remain unresolved. These block release approval until a controlled patched-version update and full regression pass are complete.

### Medium

- Dormant implementations still contain historical authentication, seed, and workflow logic. They are labelled and disconnected, but require a separate review before archival.
- Browser E2E uses deterministic API interception while backend integration tests exercise PostgreSQL separately; there is not yet a single end-to-end browser-to-database test environment.
- Production infrastructure, TLS termination, cookie delivery, backup/restore, and external observability were not exercised in this local batch.

### Low

- The Docker base image and Debian packages are not digest/patched-version governed beyond the current base-image digest resolution.
- Prisma reports that a new major version is available; no major upgrade was attempted in this hardening batch.
- Synthetic development/test credentials remain in explicit seed and test fixture source, but are `.test`-scoped, are not logged, and are not included in the production frontend bundle.

## 20. Known limitations

- Prototype modules remain demonstrations and intentionally do not persist changes.
- No new prototype write APIs were implemented.
- Dormant code remains in the repository for later workflow review.
- The local containers use development-mode cookie settings; production rejects those settings.
- The current test database volume remains present and running for inspection.

## 21. Recommended next task

Create a narrowly scoped dependency-hardening change on this branch or a child review branch that updates `react-router-dom` and its `react-router` dependency to a patched compatible release, without broad dependency upgrades. Then rerun frontend typecheck, lint, build, all Playwright tests, and `npm audit`. If those checks pass, request pull-request review for Remediation Batch 1.

Do not begin Milestone 2 as part of that dependency correction.

## 22. Pull-request review readiness

**Ready for pull-request review: yes.**

**Ready to merge or release: no**, pending resolution of the two high-severity frontend dependency audit findings and reviewer confirmation of the migration preflight/cleanup procedure.

