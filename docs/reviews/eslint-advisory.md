# ESLint Advisory Record

Date: 26 July 2026  
Branch: `governance/ci-hardening`  
Advisory: `GHSA-mh99-v99m-4gvg` / `CVE-2026-14257`  
Status: open; separate controlled upgrade required

## Finding

The frontend `npm audit` reports five high-severity dependency-chain findings
through:

```text
eslint
├── @eslint/config-array
├── @eslint/eslintrc
└── minimatch
    └── brace-expansion
```

The underlying `brace-expansion` advisory describes a denial of service caused
by unbounded expansion length. The currently installed ESLint 9 dependency
chain resolves affected versions. npm's offered remediation is ESLint 10.8.0,
which is a semver-major change.

Official advisory:
<https://github.com/advisories/GHSA-mh99-v99m-4gvg>

## Scope decision

This advisory is not part of the React Router risk-acceptance work:

- React Router is a production frontend dependency with an architecture-based
  mitigation;
- ESLint is development tooling and is not included in the browser bundle;
- the dependency paths and remediation plans are unrelated;
- npm offers only a major ESLint update for the current locked tree.

Combining both would make regression causes and rollback less clear. No ESLint
package or lockfile was changed in the Router/governance batch, and no
`npm audit fix` command was run.

## Interim controls

- CI executes ESLint only against repository-controlled source and config.
- Lint failure remains a blocking CI result.
- No service endpoint passes attacker-controlled patterns to ESLint,
  `minimatch`, or `brace-expansion`.
- The audit finding remains documented and visible.

## Required follow-up

Schedule a separate ESLint 10 upgrade assessment. That task must:

1. review Node compatibility and all ESLint/plugin peer ranges;
2. update only the lint toolchain and lockfile;
3. run frontend and backend lint;
4. run both typechecks, both builds, backend tests, and Playwright;
5. rerun `npm audit`;
6. document any remaining transitive path rather than forcing an override.

Do not use `npm audit fix --force`.
