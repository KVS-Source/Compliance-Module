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
| Policy/Control/Checkpoint foundation | `governance-domain-unit.test.ts` | `governance-foundation.test.ts` reciprocal lifecycle and catalogue invariants | — (React Checkpoint routes remain `IN_DEVELOPMENT`) | `INACTIVE` Control + `ACTIVE` Checkpoint remains accepted |
| Policy APIs | `policies-unit.test.ts` | `policies-api.test.ts` tenant isolation, concurrency, submit/approve/reject, Evidence 501, archive rules, audit metadata safety | `policy-register.e2e.ts`, `policy-workflow.e2e.ts` (mocked HTTP only; not PostgreSQL E2E) | Postman Policy collection + pgAdmin inspection guide; backend suites remain DB authority |
| Control APIs | `controls-unit.test.ts` | `controls-api.test.ts` tenant isolation, concurrency, lifecycle, archive protection, mapping replace, audit metadata safety | `control-register.e2e.ts`, `control-workflow.e2e.ts` (mocked HTTP only; not PostgreSQL E2E) | Postman Control collection + pgAdmin inspection guide; backend suites remain DB authority |
| Checkpoint APIs | `checkpoints-unit.test.ts` | `checkpoints-api.test.ts` tenant isolation, concurrent codes/reviews, lifecycle, frequency freeze, latest-review ties, reciprocal archive/activation, audit metadata safety | — (React Checkpoint UI remains `IN_DEVELOPMENT`) | Postman Checkpoint collection + pgAdmin inspection guide |
| Dashboard | — | `dashboard.test.ts` | dashboard fixture flows | compare API/database counts |
| Route truthfulness | route/router/boundary scripts | — | navigation/status assertions | visible route review |
| Migration history | — | runner deploys ten migrations | — | empty history and nine-migration upgrade drills |
| Trigger/constraint/index catalogue | — | migration-defined governance objects reconciled in `governance-foundation.test.ts`; domain invariants exercised | — | PostgreSQL catalogue reconciliation |
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
- `dashboard.test.ts`;
- `policies-api.test.ts`;
- `controls-api.test.ts`.

Existing immutability coverage is retained in the domain suites:

- AuditEvent UPDATE/DELETE: `api.test.ts`;
- approved KPI targets: `kpi-management.test.ts`;
- KPI approval UPDATE/DELETE: `kpi-approval.test.ts`;
- risk review/treatment UPDATE/DELETE: `risk-workflow.test.ts`.

Milestone 0 extends these files rather than adding duplicate tenant or audit
suites.

Milestone 4 Slice 1 adds focused `governance-domain-unit.test.ts` and
`governance-foundation.test.ts` files because Policy, Control and Checkpoint are
new domain boundaries not cleanly represented by the existing KPI/Risk suites.
The review suite intentionally proves that a same-period replacement is
rejected; it does not claim a correction workflow exists.

## Interpretation

Backend integration means real Express/Prisma behavior against an isolated
PostgreSQL service migrated from the authoritative ten migrations. Playwright
uses `page.route`/browser interception for `/api/v1/**`; it verifies frontend
behavior but does not prove the browser, Express and PostgreSQL together.

Release acceptance therefore requires both automated layers plus the human
real-stack checklist in [uat-checklist.md](../uat/uat-checklist.md).
