# Verification and coverage matrix

| Concern | Unit | Real PostgreSQL integration | Playwright (intercepted API) | Manual / operational |
| --- | --- | --- | --- | --- |
| Environment fail-closed rules | `environment.test.ts`, `hardening.test.ts` | startup exercised by runner | — | production values independently reviewed |
| Login/session/cookie response | auth/logout and logger suites | `api.test.ts` | login/session UI fixtures | real-stack login/logout |
| Tenant context and membership | service/middleware cases | API, user and organisation suites | Company-switch fixtures | cross-Company walkthrough |
| RBAC and wildcard boundary | service route tests | negative permission tests across domain suites | permission UI states | enumerate production roles (pending) |
| Audit append-only | — | `api.test.ts` UPDATE and DELETE rejection | — | catalogue trigger inspection |
| KPI configuration/target | management unit suite | `kpi-management.test.ts` | KPI UI flows | real target lifecycle |
| KPI calculations/actual | performance/approval unit suites | `kpi-actuals.test.ts`, `kpi-approval.test.ts` | actual/approval UI flows | real target-versus-actual |
| Automatic risk | risk/performance unit suites | `kpi-actuals.test.ts` | risk fixture flows | real missed KPI |
| Risk review/treatment/closure | risk service unit suite | `risk-workflow.test.ts` | Risk Register/detail flows | real append-only history |
| Dashboard | — | `dashboard.test.ts` | dashboard fixture flows | compare API/database counts |
| Route truthfulness | route/router/boundary scripts | — | navigation/status assertions | visible route review |
| Migration history | — | runner deploys nine migrations | — | fresh catalogue and restore drill |
| Trigger/constraint/index catalogue | — | domain invariants exercised | — | PostgreSQL catalogue reconciliation |
| Backup/restore | — | — | — | custom-format disposable drill |
| Secrets/SAST | — | — | — | Gitleaks and Semgrep CI/local scans |

## Test-suite inventory decisions

Existing tenant-isolation coverage is distributed across:

- `api.test.ts`;
- `users-write.test.ts`;
- `organisation-write.test.ts`;
- `kpi-management.test.ts`;
- `kpi-actuals.test.ts`;
- `kpi-approval.test.ts`;
- `risk-workflow.test.ts`;
- `dashboard.test.ts`.

Existing immutability coverage is retained in the domain suites:

- AuditEvent UPDATE/DELETE: `api.test.ts`;
- approved KPI targets: `kpi-management.test.ts`;
- KPI approval UPDATE/DELETE: `kpi-approval.test.ts`;
- risk review/treatment UPDATE/DELETE: `risk-workflow.test.ts`.

Milestone 0 extends these files rather than adding duplicate tenant or audit
suites.

## Interpretation

Backend integration means real Express/Prisma behavior against an isolated
PostgreSQL service migrated from the authoritative nine migrations. Playwright
uses `page.route`/browser interception for `/api/v1/**`; it verifies frontend
behavior but does not prove the browser, Express and PostgreSQL together.

Release acceptance therefore requires both automated layers plus the human
real-stack checklist in [uat-checklist.md](../uat/uat-checklist.md).
