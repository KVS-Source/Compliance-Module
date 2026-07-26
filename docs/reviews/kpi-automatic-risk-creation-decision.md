# KPI Automatic Risk Creation Decision

Date: 26 July 2026

## Decision

Slice D creates a Risk only for a new KPI actual that evaluates AMBER or RED.
The caller supplies no Risk fields. The server allocates a transaction-safe,
tenant-scoped `RSK-001` sequence, derives traceability title and description,
and links the actual, configuration and target as one all-or-none source group.

MINOR risks start at likelihood 3 and impact 3; MAJOR risks start at likelihood
4 and impact 4. The service computes the inherent score, the database verifies
that equality, and enterprise level is derived independently: Critical at 20 or
above, High at 15–19, Medium at 8–14, and Low below 8.

Automatic creation is part of the KPI actual submission transaction and is
authorised by `kpi-actual:write`, without a second `risk:write` check. Slice D
exposes only tenant-scoped Risk list and detail reads guarded by `risk:read`.

Slice D does not update an existing linked risk and does not backfill Slice B
actuals. Slice C must explicitly resolve and audit the effect of actual
rejection or resubmission on an existing risk. Later recalculation or updates
belong to Slice E and must be explicit and audited.

## Deployment compatibility

The Slice D migration intentionally remains compatible with existing Slice B
rows and does not create historical Risk Register entries. That also means the
application change and migration must not be deployed as an ordinary
mixed-version rollout: an old Slice B instance could otherwise accept a new
AMBER or RED actual without creating its required risk.

Before applying the migration, quiesce KPI actual submissions. Re-enable them
only after every serving instance runs Slice D. Do not roll the application back
to Slice B while submissions are enabled. If an application rollback is
required, disable KPI actual submission first and keep it disabled until Slice D
is restored or an explicit reviewed recovery is approved. This operational gate
prevents new omissions without violating the no-backfill decision.

Slice C adds a second compatibility boundary to the same deployment sequence.
Older Slice B/D instances create actuals in legacy `SUBMITTED` state and do not
write `KpiApproval` history or automatic approval events. Quiesce KPI actual
submission and approval endpoints before applying the Slice C migration. Enable
them only after every serving instance runs Slice C.

Do not roll the application back to Slice B/D while those endpoints are
enabled. If rollback is required, disable actual submission and approval first
and keep them disabled until Slice C is restored or an explicit reviewed
recovery is approved. Existing legacy `SUBMITTED` rows are preserved and remain
eligible for an explicit human approve or reject decision; they are never
backfilled or silently auto-approved.
