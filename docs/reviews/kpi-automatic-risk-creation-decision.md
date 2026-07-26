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
