# RiskTreatmentStatus values were chosen by us, not by the client

`docs/claude-tasks/02-kpi-risk-schema.md` section 3.7 lists a `status` field on
`RiskTreatment` without naming a type or its values. The client workbook defines
`CAPA_Status` but has no treatment status column, so there was nothing to copy.

Slice E introduces:

```prisma
enum RiskTreatmentStatus {
  PLANNED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}
```

Reasoning:

- `PLANNED` is the default a treatment is recorded in, matching "plan, owner,
  due date" being captured before work starts.
- `IN_PROGRESS` distinguishes started work from a plan nobody has picked up,
  which is the distinction a risk register is usually asked to report on.
- `COMPLETED` is set only by the completion endpoint, which appends a
  superseding row. `createRiskTreatmentSchema` rejects `COMPLETED` on a direct
  write so completion cannot be faked without a completion entry.
- `CANCELLED` records an abandoned treatment without deleting it, which the
  append-only ledger would forbid anyway.

**These values are ours, not the client's.** The client may want them adjusted,
renamed, or aligned with `CAPA_Status` once CAPA is built. Changing them later
means a migration on the enum plus a data migration for existing rows, so it is
worth confirming with the client before the register carries real data.

Related:

- `docs/reviews/risk-reopen-active-duplicate-decision.md`
- `docs/claude-tasks/02-kpi-risk-schema.md` section 3.7
