# KPI Actual Risk Backfill Decision

Date: 26 July 2026

## Decision

Slice B stores KPI actual submissions and returns the calculated
`riskRequired` and `recommendedRiskClass` values without creating a Risk row.
When Slice D adds automatic KPI risk creation, it will apply to new submissions
only.

Existing Slice B actuals will not be backfilled into the Risk Register.
Retroactively creating risks would introduce unreviewed compliance records
without a contemporaneous submission transaction or human decision.

If historical reconciliation is required later, it must be designed as an
explicit, audited, human-triggered operation. It must not run as a schema or
data migration.
