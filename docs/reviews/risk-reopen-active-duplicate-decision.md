# Reopening a closed risk against the one-active-per-actual index

`risks_one_active_per_kpi_actual`
(`backend/prisma/migrations/20260726224500_slice_d_automatic_kpi_risk/migration.sql`)
permits one live risk per KPI actual:

```sql
CREATE UNIQUE INDEX risks_one_active_per_kpi_actual
  ON risks (tenant_id, kpi_actual_id)
  WHERE kpi_actual_id IS NOT NULL
    AND status NOT IN ('CLOSED', 'ARCHIVED')
    AND deleted_at IS NULL;
```

Slice E adds reopen, which returns a `CLOSED` risk to `UNDER_REVIEW` and so
brings it back inside that index. The question was whether reopening can
collide with a second risk raised for the same actual after the first closed.

## Is the conflicting state reachable?

Not through the API.

1. Risk rows carrying a `kpiActualId` are created at exactly one call site:
   `RiskService.createAutomaticKpiRisk`, invoked from
   `KpiActualService.submitActual` inside the submission transaction.
2. Approve, reject and resubmit do not create or mutate risks. They only read
   the linked risk through `findLinkedRisk`.
3. Every `POST /api/v1/kpi-actuals` creates a **new `KpiActual` row with a new
   id**, then at most one risk pointing at that new id.

So "a later submission for that same actual raises a new risk" cannot happen.
A later submission is necessarily a different actual row, and its risk carries a
different `kpi_actual_id`. The scenario conflates "same configuration and
period" with "same actual"; the actual id changes. Even the soft-delete path
(delete the actual, resubmit the period) yields a new actual id.

Two risks sharing one `kpi_actual_id` therefore cannot both exist today.

## Why it is still guarded

- **Direct database writes** reach it: create risk A for actual X, close A,
  create risk B for actual X (permitted because A is `CLOSED`), reopen A.
- **A future manual risk workflow.** Section 6 reserves `risk:write` for
  exactly that. If a caller can attach `kpiActualId`, the state becomes
  reachable through the product.
- **A future recalculation feature.** Section 4 assigns any later
  recalculation of a linked risk to Slice E's successors.
- Without a guard the collision surfaces as a bare `P2002`, which the error
  handler reports as `409 CONFLICT` / "A record with these details already
  exists" — useless to the person who pressed Reopen.

## Behaviour

`RiskService.reopenRisk` checks, inside the transaction and before the update,
for another non-deleted risk on the same `(tenantId, kpiActualId)` whose status
is not `CLOSED` or `ARCHIVED`. If one exists it throws
`409 RISK_ACTIVE_DUPLICATE_FOR_ACTUAL`, naming the blocking risk's code. A
`P2002` mentioning the index is mapped to the same error, so a concurrent
reopen that loses the race still fails with a specific message.

`backend/tests/risk-workflow.test.ts` constructs the state directly through
Prisma and asserts the refusal, the named blocking code, and that nothing was
written. The test documents the invariant rather than relying on the state
being unreachable, and keeps guarding the path once manual risk creation lands.

## Alternatives rejected

| Option | Why not |
|---|---|
| Auto-close the competing risk | Silently mutating a second compliance record as a side effect of reopening a first is the kind of hidden state change this product must not make, and it would close a risk with no recorded human decision. |
| Reopen as a new risk row | Breaks record identity. The code, review history and treatment history belong to the original row, and it amounts to a second automatic creation, which Slice E must not introduce. |
| Relax or drop the index | It is an explicit invariant in section 3.5 and a `CONTRIBUTING.md` non-negotiable. Weakening a constraint to make a UI action convenient is out of bounds. |
| Silently no-op | The user must be told why the reopen did not happen. |
