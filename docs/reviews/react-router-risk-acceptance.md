# React Router Risk Acceptance

Date: 26 July 2026  
Branch: `governance/ci-hardening`  
Advisory: `GHSA-qwww-vcr4-c8h2`  
Status: accepted temporarily with an enforced architecture control

## Decision

GenBioCa currently accepts the audit finding for `react-router` and
`react-router-dom` 7.18.1 because the vulnerable execution path is not present
in the application architecture and no patched 7.x release exists.

This is a temporary, reviewable acceptance. The advisory remains visible and is
not suppressed.

## Architecture and reachability

The frontend uses React Router library/data mode:

- `frontend/src/app/router.tsx` creates the router with
  `createBrowserRouter`;
- `frontend/src/main.tsx` renders it with `RouterProvider`;
- `frontend/vite.config.ts` uses the standard React Vite plugin;
- the Express backend serves static frontend assets and its own JSON API;
- no React Router Framework Mode, server action, SSR, or unstable RSC
  pipeline is present.

The upstream advisory states that the issue affects applications using the
unstable RSC APIs. GenBioCa does not import or execute those APIs, so the
described request/action path is not reachable.

Official advisory:
<https://github.com/advisories/GHSA-qwww-vcr4-c8h2>

## Version position

The installed packages are:

- `react-router-dom` 7.18.1;
- transitive `react-router` 7.18.1.

The official npm registry reports 7.18.1 as the current `version-7` release and
8.3.0 as the patched current major. There is no newer 7.x release to adopt.

The finding therefore cannot be patched within the supported v7 line without
performing a major migration.

## Enforced mitigation

`scripts/check-router-mode.mjs` fails when it detects:

- `@react-router/dev`, `@react-router/node`, or `@react-router/serve`;
- the `@react-router/dev/vite` plugin or `reactRouter()` in Vite config;
- `react-router.config.*`;
- `app/routes.ts` or `app/routes.tsx` file-system route configuration;
- `ssr: true` in a configuration file.

Run it locally with:

```text
npm --prefix frontend run guard:router
```

The same command is a required GitHub Actions job. Introducing a prohibited
mode fails CI and invalidates this risk acceptance.

Server-side authentication, tenant isolation, permissions, and write
validation remain enforced by Express and PostgreSQL. The client router is not
an authorization control.

## Review triggers

Reassess this decision immediately when either condition occurs:

1. a patched release is published for the v7 line; or
2. a deliberate React Router v8 migration is approved.

Reassess before merging any change that adds server rendering, React Server
Components, React Router route actions, or Framework Mode packages/config.

## v8 migration note

React Router v8 removes the `react-router-dom` re-export package. A controlled
migration must remove that dependency, move general imports to `react-router`,
and move DOM-specific imports such as `RouterProvider` to `react-router/dom`.
The official v7-to-v8 guide also raises the minimum React and Node versions.

This is a normal major-version migration requiring its own branch, dependency
review, typecheck, build, Playwright suite, and runtime regression. It must not
be treated as an emergency audit-fix command.

Official migration guide: <https://reactrouter.com/upgrading/v7>
