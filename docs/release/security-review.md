# Delivery security review

Date: 2026-10-09. This review records local source/dependency checks, not a
penetration test or an operational release approval.

## Targeted compatible updates

| Dependency | Before | Delivered |
| --- | --- | --- |
| proxy-addr | 2.0.7 | 2.0.8 |
| qs | 6.15.3 | 6.16.0 |
| ip-address | 10.3.1 | 10.7.3 |
| react-router-dom / react-router | 7.18.1 | 7.18.2 |
| Vitest (backend test runner) | 3.2.7 | 4.1.11 |
| Vite (backend test-runner dependency) | 7.3.6 transitive | 7.3.6 explicit pin |

The test-runner major upgrade was deliberate and regression-tested, rather than
an automatic audit fix. Compatible transitive updates also cover brace-expansion,
js-yaml, nanoid, postcss and source-map-js in both active packages. Tinypool is no
longer in the backend dependency tree. Prisma remains 6.19.3 and the schema and
migrations are unchanged. No force fix, unsupported transitive major override or
router-mode migration was used.

The proxy patch addresses [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).
The added regression sends a forged forwarding header through a short mapped-IPv6
trust subnet and requires the actual loopback peer address, not the forged value.
The router patch addresses [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2).
Historical router reports predate this compatible patch; they are not current
release evidence. Router/boundary guards remain active.

CI action release tags were resolved from the upstream Git repositories and
pinned to immutable 40-character commits. Proxy templates now use configured
hosts, not a request-supplied Host header, for upstream requests and redirects.
Production browser policy allows same-origin geolocation subject to browser
consent; camera and microphone remain disabled.

## Outstanding dependency advisories

Fresh `npm audit --omit=dev --json` results:

- Frontend: zero reported production dependency vulnerabilities.
- Backend: three high package findings in the Prisma/config/deepmerge-ts chain,
  representing the [DeepmergeTS advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
  No critical production dependency finding remains in that audit.

Full development-inclusive audits now report backend three high package
findings and frontend zero. No critical or moderate finding remains in these
audits. Prisma 6's config package pins deepmerge-ts 7.1.5; forcing version 8
beneath it is not a verified compatible fix. The separately prepared
[Prisma upgrade plan](prisma-upgrade-plan.md) requires approval before work:
stable Prisma 7 currently retains the same affected dependency, so a major bump
alone is not security closure.

These findings are not suppressed or treated as safe merely because they are
tooling-related. Do not expose development/test services publicly. A dedicated
dependency remediation and reachability review remains a release gate. Counts
are npm package findings, not counts of independently exploitable application
bugs. Re-run audits at release time; advisory data changes.

## Secret and source handling

Test environment-validation keys now use ephemeral generated values rather than
fixed high-entropy strings. The source export omits dormant environment templates
with old development defaults, all real environment files, Git history, uploads,
workbooks, backups and screenshots. Synthetic fixtures are explicitly marked by
the seeds and use `.test` addresses; they are not approved operational records.

Gitleaks scans the final exported folder with redaction enabled and its default
rules. The existing vendored-font exclusion remains documented and integrity-
checked by PDF tests; no blanket test-directory exemption was added. Semgrep uses
the Typescript, Express and OWASP presets, including the broader CI/deployment
template scan. Neither scanner establishes an absence of all vulnerabilities.

The desktop/mobile browser suite passed 632 tests, with six explicitly skipped.
Two additional real-stack tests passed without API interception, covering API
dashboard totals, department persistence/company isolation, and refusal of gap
closure without approved evidence. These are limited automated paths, not an
all-feature human walkthrough. Remote CI, repository protection, real provider
access, TLS hosting and production approval were not performed or inferred.

The destructive test-reset entry point now validates isolated-runner flags and a
matching, clearly named nonproduction PostgreSQL test URL before constructing a
database client. Five negative subprocess tests prove refusal of unsafe calls.
