# UAT demo seed

This page describes the synthetic KPI/Risk walkthrough seed. For the separate
GenBioCa Company seed plus actual workbook import, use
[`backend-data-mvp-contract-and-uat.md`](../backend-data-mvp-contract-and-uat.md#repeatable-genbioca-uat-load).

The demo seed is an explicit operator action. It is never called by application
startup, Docker startup, or a migration.

## Run

1. Apply the authoritative Prisma migrations.
2. Choose a temporary UAT password of at least 12 characters.
3. Confirm `DATABASE_URL` targets an isolated, disposable UAT database.
4. Run from `backend/` with an explicitly non-production execution mode,
   supplying the password only through the environment:

   ```sh
   NODE_ENV=development DEMO_SEED_PASSWORD='<temporary-uat-password>' npm run seed:demo
   ```

5. Run the exact command a second time. Entity counts must not increase.

The seed accepts only `NODE_ENV=development` or `NODE_ENV=test`.
`NODE_ENV=production` is always refused and has no override. UAT operators must
use an isolated database and the explicit non-production mode shown above;
production runtime settings must never be weakened to run demonstration data.

## Synthetic login identities

| Email | Demonstration role |
|---|---|
| `demo-admin@example.test` | Company Admin |
| `demo-compliance@example.test` | Compliance Manager |
| `demo-kpi-owner@example.test` | KPI Owner |
| `demo-kpi-approver@example.test` | KPI Approver |
| `demo-risk-manager@example.test` | Risk Manager |
| `demo-viewer@example.test` | Viewer |

All identities use the runtime `DEMO_SEED_PASSWORD`. The seed never prints that
password, and no plaintext credential is stored in the repository.

## Suggested live walkthrough

The seed reserves approved `2026-Q4` targets without actuals for:

- `DEMO-KPI-001` — submit `90` to demonstrate GREEN with no risk;
- `DEMO-KPI-003` — submit `14` to demonstrate RED and automatic risk creation.

Use the demo administrator for tenant, organisation, framework, KPI and Risk
Register screens. Because self-approval is forbidden, use the KPI Approver
identity to approve an actual submitted by the administrator. The administrator
or Risk Manager can then demonstrate owner assignment, append-only review and
treatment, residual scoring, closure and reopening.

These walkthrough actions are real database writes. Re-running the seed
validates its deterministic baseline but does not erase or duplicate subsequent
UAT workflow history.

## Safety and conflict behaviour

- All identities and organisation data are synthetic.
- The seed uses deterministic codes and upserts for mutable master data.
- Approved KPI targets are never updated. If an existing approved target differs
  from the reviewed demo definition, the seed stops with a conflict.
- KPI actuals, derived values, automatic risks, approval history, reviews,
  treatments, closure, and reopening use the real application services.
- Re-running the seed checks existing workflow rows and does not append duplicate
  histories.
