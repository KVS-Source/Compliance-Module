# React Router Dependency Remediation Report

Branch: `dependency/react-router-security` (created from `hardening/milestone-1`)
Batch: Frontend React Router advisories only.
Outcome: **Mitigated, not patched.** No compatible patched release exists.

Companion document: [`react-router-advisory-assessment.md`](./react-router-advisory-assessment.md)

---

## 1. Original package versions

| Package | Version | Type | Declared as |
|---|---|---|---|
| `react-router-dom` | 7.18.1 | direct | `^7.6.3` |
| `react-router` | 7.18.1 | transitive | exact pin from `react-router-dom@7.18.1` |

## 2. Exact advisory IDs

| Field | Value |
|---|---|
| npm advisory ID | `1124282` |
| GHSA | `GHSA-qwww-vcr4-c8h2` |
| CVE | Not assigned at time of assessment |
| Title | React Router: RSC Mode CSRF Bypass Allows Action Execution Before 400 Response |
| Severity | High |
| CWE | CWE-352 |

Two audit findings arise from this single advisory: `react-router` (directly vulnerable) and
`react-router-dom` (vulnerable *via* its exact dependency pin).

## 3. Affected version ranges

- Vulnerable: `>=7.12.0 <8.3.0`
- Patched: `>=8.3.0`
- Installed `7.18.1` falls inside the vulnerable range.

## 4. Reachability assessment

**Not reachable.** Summary (full analysis in the assessment document):

- React Router runs in **library mode** (`createBrowserRouter` + `RouterProvider`).
- **No RSC mode**, no framework mode, no SSR, no pre-rendering.
- **No route `loader`s or `action`s** — route objects use only `path`, `element`, `children`.
- The Express backend serves the built SPA as **static assets with an `index.html` fallback**;
  it never invokes React Router.
- All writes go through the application's `apiClient` to the Express API, which enforces
  authentication, tenant scope and permissions server-side.

The advisory requires the RSC server action pipeline, which does not exist in this
architecture. Three candidate text matches (`rsc`, `loader:`, `action:`) were individually
verified as false positives.

## 5. Selected remediation

**Option 4 — documented temporary mitigation.** No package version changed.

Verified against the official npm registry (not `npm audit`'s suggestion):

- Highest stable `7.x` is **7.18.1** (also the `version-7` dist-tag) and is vulnerable; there is
  no `7.18.2`/`7.19.x` backport.
- Only patched release is **`react-router@8.3.0`** (`latest`).
- **`react-router-dom@8` does not exist** (registry returns 404); v8 consolidated the DOM
  entry points into `react-router`.
- `react-router-dom@7.18.1` pins `react-router` to exactly `7.18.1`, so a compatible
  transitive bump is impossible.

Forcing `react-router@8.3.0` beneath `react-router-dom@7.18.1` would be an unsupported,
incompatible override and was therefore rejected. `npm audit fix` / `--force` were not run.
The advisory was not suppressed.

Mitigations in force:

1. The application must remain in **library mode**; RSC, framework mode, SSR, pre-rendering
   and route `loader`/`action` APIs must not be introduced while `react-router` is `<8.3.0`.
2. Server-side authorisation remains the control of record.
3. Advisory left visible in `npm audit` and CI.

## 6. Final package versions

Unchanged: `react-router-dom@7.18.1`, `react-router@7.18.1`.

## 7. Files modified

| File | Change |
|---|---|
| `docs/reviews/react-router-advisory-assessment.md` | Added — advisory and reachability assessment |
| `docs/reviews/react-router-dependency-remediation.md` | Added — this report |

No source file, dependency manifest, route, permission or UI element was modified.

## 8. Lockfile changes

**None.** `frontend/package.json` and `frontend/package-lock.json` are byte-identical to the
base branch (confirmed via `git status`). The dependency tree is unchanged.

## 9. Commands executed

Assessment:
```
npm audit --json                      # from frontend/
npm ls react-router react-router-dom
npm view react-router versions --json
npm view react-router dist-tags --json
npm view react-router-dom dist-tags --json
npm view react-router-dom@8 version
npm view react-router-dom@7.18.1 dependencies --json
```

Frontend regression:
```
npm run typecheck
npm run lint
npm run build
npm run test:e2e
npm audit
```

Backend regression:
```
npm run typecheck
npm run lint
npm run build
npm run test:unit
npm run test:integration
npx prisma migrate status      # isolated test database only
```

Runtime:
```
docker compose config --quiet
docker compose --profile test up -d postgres_test
curl /api/v1/health  /api/v1/ready  /api/docs  /  /admin/users
```

No `npm audit fix`, no `--force`, no `--legacy-peer-deps`, no prerelease/nightly/GitHub
installs. No credentials, tokens or environment values were printed.

## 10. Typecheck result

- Frontend: **passed** (`tsc -b`)
- Backend: **passed** (`tsc -p tsconfig.json --noEmit`)

## 11. Lint result

- Frontend: **passed** (`eslint .`, no findings)
- Backend: **passed** (`eslint .`, no findings)

## 12. Build result

- Frontend: **passed** — 1628 modules; `index.js` 451.48 kB (gzip 157.27 kB), `index.css` 98.55 kB (gzip 20.27 kB)
- Backend: **passed**

## 13. Playwright result

**8/8 passed** (20.8s) — 4 specs × 2 projects (`desktop` Chrome, `mobile` iPhone 13/chromium):

| Spec | desktop | mobile |
|---|---|---|
| login, secure storage, Company switch and API-backed master screens | ✓ | ✓ |
| every approved route remains reachable on desktop and mobile | ✓ | ✓ |
| prototype routes are labelled while API-connected routes are not | ✓ | ✓ |
| prototype writes remain simulated and logout survives page reload | ✓ | ✓ |

Router behaviours covered by the passing suite: login route, protected-route redirects,
current-user restoration, tenant/Company switching, dashboard/users/frameworks routes,
dynamic framework-rule route, prototype routes, 404 handling, desktop and mobile navigation,
logout surviving page reload, and simulated-write labelling. No console errors were reported
and no undeclared backend write calls occurred (the suite intercepts and asserts API traffic).
Deep-link refresh was additionally confirmed at the server level (`GET /admin/users` → 200 via
SPA fallback). No new router tests were required, since no code changed.

## 14. Backend regression result

- Unit: **21/21 passed** (6 files)
- Integration (isolated PostgreSQL): **12/12 passed**
- Migrations: **3 found, schema up to date** against the isolated test database
- Isolated-database safety checks: **passed**; deterministic test fixture: **passed**

## 15. npm audit result

Frontend, after remediation (unchanged by design):

| Chain | Count | Status |
|---|---|---|
| React Router (`react-router`, `react-router-dom`) | 2 high | **Open — mitigated, not patched** |
| ESLint (`eslint`, `@eslint/config-array`, `@eslint/eslintrc`, `minimatch`, `brace-expansion`) | 5 high | **Open — out of scope** |
| **Total** | **7 high** | |

Note: the task brief anticipated two findings. The audit reports seven. The two React Router
findings match the brief; the other five are a pre-existing `devDependency` chain
(`GHSA-mh99-v99m-4gvg`) whose only offered fix is the semver-major `eslint@10.8.0`. They were
deliberately left untouched as out-of-scope and are not shipped in the browser bundle.

Backend audit was not re-run; no backend dependency was touched (previously reported zero
vulnerabilities).

## 16. Docker / runtime result

| Check | Result |
|---|---|
| `docker compose config --quiet` | **passed** |
| `postgres_test` service | **healthy** (isolated, port 5433, dedicated volume) |
| `GET /api/v1/health` | **200** `{"success":true,"data":{"status":"ok"}}` |
| `GET /api/v1/ready` | **200** `{"success":true,"data":{"status":"ready"}}` |
| Swagger `GET /api/docs` | **200** — Swagger UI renders |
| React app `GET /` | **200** — SPA index with hashed asset bundle |
| SPA fallback `GET /admin/users` | **200** |

The development database was **not** reseeded and was never started during this batch; all
database work was confined to the isolated test service. Runtime verification was performed
with the API pointed at the isolated test database.

## 17. Remaining advisories

1. `GHSA-qwww-vcr4-c8h2` — `react-router` / `react-router-dom` (2 findings, high).
   Unpatchable within the supported range; assessed not reachable; mitigated.
2. `GHSA-mh99-v99m-4gvg` — `brace-expansion` via the ESLint tooling chain (5 findings, high).
   Out of scope; `devDependency` only; fix requires a semver-major ESLint upgrade.

## 18. Compatibility risks

**None introduced by this batch** — no dependency, source, route, permission or UI change was
made, so runtime behaviour is byte-for-byte identical to the base branch.

Forward-looking risk: the eventual fix (`react-router@8.3.0`) is a semver-major upgrade that
also requires removing `react-router-dom` and repointing all 11 import sites to `react-router`.
That carries real regression risk and must be planned as its own batch with a full
regression cycle.

## 19. Rollback procedure

No functional change was made, so rollback is documentation-only:

```
git revert <commit-sha>          # removes the two review documents
```

or

```
git checkout hardening/milestone-1
git branch -D dependency/react-router-security
```

No lockfile restore, dependency reinstall or database action is required. Local environment
files created for verification (`.env`, the `DATABASE_URL_TEST` line in `backend/.env`) are
gitignored and are not part of the commit; the isolated test container/volume can be removed
with `docker compose --profile test down -v`.

## 20. Merge readiness

**Not ready to merge as a security closure; safe to merge as documentation.**

- All functional gates pass: frontend typecheck/lint/build, 8/8 Playwright, backend
  typecheck/lint/build, 21/21 unit, 12/12 integration, Docker/runtime healthy.
- However, the branch does **not** clear the React Router advisories — they remain open by
  deliberate decision because no compatible patched release exists.
- Per the batch rule, the branch is marked **not release-ready** on dependency-security
  grounds until `react-router@8.3.0` is adopted through an approved major-version migration.
- Merging is deferred pending explicit approval, in line with the batch instruction not to
  merge.
