# KPI target codes should be server-generated

`POST /api/v1/kpi-targets` and `POST /api/v1/kpi-targets/{id}/versions` both
require a caller-supplied `code`
(`backend/src/modules/kpis/management-validators.ts`, `targetFields.code`). It
is unique per Company through the `kpi_targets_tenant_id_code_key` index created
in `backend/prisma/migrations/20260726143000_slice_a_kpi_configuration_targets/migration.sql`.

This is inconsistent with the two neighbouring code sequences, which the server
owns:

- KPI actual codes (`ACT-001`, …) allocated from `Tenant.nextKpiActualNumber`
- Risk codes (`RSK-001`, …) allocated from the equivalent tenant counter

`docs/claude-tasks/02-kpi-risk-schema.md` section 3.3 records why actual codes
moved server-side: callers collide with each other and invent inconsistent
schemes. Targets are periodic and multi-version, so they carry the same risk.

## Current frontend behaviour (interim)

The KPI target form at `/kpi/configuration/:configurationId/targets` pre-fills
an editable suggestion of the form `TGT-<kpiCode>-<period>` — see
`suggestedTargetCode` in `frontend/src/features/kpis/kpiFormatting.ts`. The
suggestion follows the period field until the user edits the code, after which
their value is preserved.

This is a usability measure only. It does not prevent collisions: two users
drafting the same period concurrently still produce the same suggestion, and the
second write fails with `409 CONFLICT`.

## Recommended backend follow-up

Mirror the `nextKpiActualNumber` pattern exactly:

1. Add a `nextKpiTargetNumber` counter to `Tenant`, defaulting to `1`.
2. Allocate and format the code (`TGT-001`, padded to at least three digits,
   expanding after `TGT-999`) inside the target-create and target-version
   transactions.
3. Reject a caller-supplied `code` with `VALIDATION_ERROR` once `.strict()` is
   applied to the target validators.
4. Advance each Company's counter above any existing `TGT-<number>` code in the
   migration so the first allocation cannot collide. Do not rewrite historical
   caller-supplied codes.
5. Return `KPI_TARGET_CODE_COLLISION` (HTTP 500) for a generated-code collision,
   never a client 409, matching the actual-code decision.
6. Remove `suggestedTargetCode` and the target-code field from the frontend form
   once the server owns the value.

Not implemented in the KPI configuration and target UI branch: that work is
frontend-only apart from one read-only endpoint, and this change needs a schema
migration plus a breaking request-shape change.

## Related

- `docs/claude-tasks/02-kpi-risk-schema.md` sections 3.2 and 3.3
- `docs/architecture/overview.md`, "Target snapshot and codes"
