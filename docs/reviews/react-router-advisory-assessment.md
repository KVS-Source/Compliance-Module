# React Router Advisory Assessment

Branch: `dependency/react-router-security` (from `hardening/milestone-1`)
Scope: frontend React Router audit findings only.
Status of this document: **assessment completed before any package version was changed.**

---

## 1. Audit capture

Command executed from `frontend/`:

```
npm audit --json
```

Environment: Node v25.9.0, npm 11.12.1. No environment values, tokens or credentials were read or printed.

### 1.1 Discrepancy against the stated baseline

The task brief states the frontend audit reports **two** high-severity findings. The audit
actually reports **seven** high-severity findings in total:

| Findings | Count | In scope |
|---|---|---|
| React Router dependency chain (`react-router`, `react-router-dom`) | 2 | **Yes** |
| ESLint dependency chain (`eslint`, `@eslint/config-array`, `@eslint/eslintrc`, `minimatch`, `brace-expansion`) | 5 | No |

The two React Router findings match the brief exactly. The remaining five are a separate,
pre-existing `devDependency` chain (advisory `GHSA-mh99-v99m-4gvg`, brace-expansion DoS,
reachable only through `eslint` tooling, never shipped to the browser bundle). Their only
offered fix is `eslint@10.8.0`, a **semver-major** upgrade. They are therefore
**out of scope** for this batch, are not modified, and remain visible in the audit output.

---

## 2. Finding detail

Both in-scope findings originate from a single upstream advisory.

| Field | Value |
|---|---|
| Advisory ID (npm) | `1124282` |
| GHSA identifier | `GHSA-qwww-vcr4-c8h2` |
| CVE identifier | Not assigned at time of assessment |
| Title | React Router: RSC Mode CSRF Bypass Allows Action Execution Before 400 Response |
| Severity | High |
| CWE | CWE-352 (Cross-Site Request Forgery) |
| CVSS | No CVSS vector published in the advisory feed (`cvss.score` reported as `0`) |
| Vulnerable range | `>=7.12.0 <8.3.0` |
| Patched range | `>=8.3.0` |
| Advisory URL | https://github.com/advisories/GHSA-qwww-vcr4-c8h2 |

### Finding 1 — `react-router`

- Package: `react-router`
- Installed version: **7.18.1** (inside vulnerable range)
- Dependency type: **transitive**
- Dependency path: `genbioca-compliance-frontend > react-router-dom@7.18.1 > react-router@7.18.1`
- Node: `node_modules/react-router`
- Effects: `react-router-dom`

### Finding 2 — `react-router-dom`

- Package: `react-router-dom`
- Installed version: **7.18.1**
- Declared in `frontend/package.json` as `"react-router-dom": "^7.6.3"`
- Dependency type: **direct**
- Reported vulnerable range for this package: `>=7.12.0-pre.0`
- Cause: flagged solely *via* its dependency on `react-router`. `react-router-dom@7.18.1`
  pins `react-router` to the **exact** version `7.18.1` (`"dependencies": { "react-router": "7.18.1" }`),
  so the transitive version cannot be floated independently.

---

## 3. Application architecture facts

Determined by inspecting `frontend/src`, `frontend/vite.config.ts`, `frontend/package.json`
and `backend/src/app.ts`.

| Question | Finding | Evidence |
|---|---|---|
| React Router mode | **Library mode** | `createBrowserRouter` + `RouterProvider`; routes declared with `path`/`element`/`children` only |
| Framework mode? | **No** | No `react-router.config.ts`; no `@react-router/dev`, `@react-router/node` or `@react-router/serve` dependency |
| RSC (React Server Components) mode? | **No** | No `react-router/rsc` import, no RSC entry, no server component boundary anywhere in `src` |
| SSR / server rendering? | **No** | No `entry.server`, `renderToString`, `renderToPipeableStream`, `StaticRouter` or `createStaticHandler` |
| Pre-rendering? | **No** | Vite SPA build; `vite.config.ts` uses only `@vitejs/plugin-react` and a dev-only middleware that streams two static prototype HTML files |
| Route `loader` / `action` data APIs? | **No** | Route objects in `src/app/router.tsx` use only `path`, `element`, `children` |
| Server actions? | **No** | None defined; the app performs writes exclusively through explicit `fetch` calls to the Express API |
| How is the app served? | **Static assets + SPA fallback** | `backend/src/app.ts`: `express.static(frontendDist, { index: false })` with `res.sendFile(index.html)` fallback |

### 3.1 Verified non-matches

Three raw text matches were investigated and confirmed to be false positives:

- `rsc` — substring of `overscroll-behavior` in `src/styles/prototype.css:431`.
- `loader:` — an application-defined property name in `src/features/organisation/OrganisationPage.tsx`
  and `src/hooks/useApiResource.ts`, holding a plain `() => Promise<T>` fetch function. This is
  **not** a React Router route loader.
- `action:` — audit-trail display strings (`"Signed In"`, `"Approved Evidence"`,
  `"Submitted Review"`) in `src/features/prototype/prototypeRouteData.ts`.

All React Router imports in the codebase are client-side primitives only:
`RouterProvider`, `Navigate`, `useNavigate`, `useLocation`, `useParams`, `Outlet`,
`NavLink`, `Link` (11 import sites, all from `react-router-dom`).

---

## 4. Reachability assessment

**Not reachable in the current architecture.**

The advisory describes a CSRF bypass **specific to RSC mode**, in which a server-side action
can be executed before the framework returns its `400` response. Exploitation requires the
React Router RSC request/action pipeline to be serving requests.

This application:

1. Runs React Router in **library mode** only, as a client-side router.
2. Ships **no server**-side React Router surface — the Express backend never invokes React
   Router; it serves compiled static assets and a JSON API.
3. Defines **no route `action`s or `loader`s**, so there is no React Router action pipeline
   to reach, in any mode.
4. Performs every state-changing request through the application's own `apiClient`, which
   targets the Express API and is protected independently by the backend's own CSRF/auth
   controls (bearer access token + refresh cookie).

Therefore the vulnerable code path is not present in the built bundle's execution model, and
no attacker-reachable entry point to it exists in the deployed system.

Residual consideration: the vulnerable package remains **present in the dependency tree and
in the shipped bundle graph**, so the advisory stays visible in `npm audit` and must not be
suppressed. Reachability is an argument for *deferring* an unsafe upgrade — not for
dismissing the finding.

---

## 5. Availability of a compatible patch

Verified directly against the official npm registry (not from `npm audit`'s suggestion).

```
npm view react-router versions --json
npm view react-router dist-tags --json
npm view react-router-dom dist-tags --json
npm view react-router-dom@8 version
```

Findings:

- Highest **stable 7.x** release of `react-router` is **7.18.1** (49 stable 7.x releases; no
  `7.18.2`, no `7.19.x`). The `version-7` dist-tag also resolves to `7.18.1`.
- `7.18.1` is **inside** the vulnerable range `>=7.12.0 <8.3.0`.
- The only patched release is **`react-router@8.3.0`** (`latest`).
- **`react-router-dom@8` does not exist** — the registry returns `404`. The v8 line
  consolidated the DOM entry points into the `react-router` package, so `react-router-dom`'s
  own `latest` remains `7.18.1`.

### Conclusion

**No patched release exists within the currently used major version, and no
minor-compatible patched release exists.**

Evaluated against the required preference order:

| # | Option | Verdict |
|---|---|---|
| 1 | Patched release within current major (7.x) | **Unavailable** — 7.18.1 is the line head and is vulnerable |
| 2 | Patched release within minor-compatible range | **Unavailable** — same reason |
| 3 | Targeted dependency alignment | **Not safe** — `react-router-dom@7.18.1` pins `react-router` to exactly `7.18.1`. Forcing `react-router@8.3.0` underneath it would be an unsupported, incompatible override and is explicitly prohibited |
| 4 | Documented temporary mitigation | **Selected** |
| 5 | Major-version migration | **Deferred** — requires a separate proposal and explicit approval (see below) |

No package version is changed in this batch.

---

## 6. Temporary mitigation

Applied/confirmed for the interim period:

1. **Architectural containment (already in force).** The application must remain in React
   Router **library mode**. RSC mode, framework mode, SSR, pre-rendering and route
   `loader`/`action` APIs must not be introduced while `react-router` remains `<8.3.0`,
   because doing so would move the vulnerable code path into a reachable position.
2. **Server-side authorisation remains the control of record.** All writes continue to go
   through the Express API, which enforces authentication, tenant scope and permissions
   server-side. No security decision depends on the client router.
3. **Advisory left visible.** The finding is not suppressed, ignored, or worked around with
   an override, so it continues to surface in `npm audit` and in CI.
4. **Branch marked not release-ready** on dependency-security grounds (see §7).

---

## 7. Release readiness

**This branch is NOT release-ready from a dependency-security standpoint.**

Two high-severity React Router advisories remain open and unpatchable within the supported
version range. They are assessed as **not reachable**, which lowers practical risk, but the
advisories are unresolved.

## 8. Proposed follow-up (requires approval — not performed here)

A migration to `react-router@8.3.0` is the only true fix. It is out of scope for this batch
because it is a semver-major change that additionally requires **removing `react-router-dom`**
and repointing all 11 import sites to `react-router`. This should be raised as a separate,
explicitly approved proposal with its own regression cycle.

Re-evaluation trigger: if a patched `7.x` backport is published, it becomes the preferred
minimal remediation and should be applied immediately in a new batch.
