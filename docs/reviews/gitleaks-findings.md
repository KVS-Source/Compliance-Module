# Gitleaks Findings Review

Date: 26 July 2026

## Decision

The three findings below are accepted as false positives or development-only
values. No Git history was rewritten.

The allowlist in `.gitleaksignore` is fingerprint-scoped. Each entry includes
the exact commit, historical path, Gitleaks rule, and line number. No whole
file, path, or rule is allowlisted, so a changed occurrence or any new finding
continues to fail the Gitleaks scan.

## Accepted findings

| Historical location                                                                   | Rule              | Decision and rationale                                                                                                                          |
| ------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/tests/hardening.test.ts:9` at `1e7ddfa49920fee6377a372730ac7b67e8176752`     | `generic-api-key` | Accepted false positive. The value is synthetic and exists only to test environment validation.                                                 |
| `backend/tests/environment.test.ts:5` at `19dd66ed3209e165e272d728e7a654eb0663ef10`   | `generic-api-key` | Accepted false positive. The value is synthetic and exists only to test environment validation.                                                 |
| `legacy_python_backend/.env.example:17` at `64c1b67eb4b9bd1cf99f8482dfe2c3da4509c22a` | `generic-api-key` | Accepted development-only placeholder. The historical file belongs to dormant legacy code and the value was never used in any real environment. |

## Enforcement

CI checks out complete Git history with `fetch-depth: 0` and runs
`gitleaks git`, whose default non-zero exit status remains enforced. The three
fingerprints above are the only accepted findings. All other findings,
including new findings in an otherwise allowlisted file or under the same
rule, remain failures.
