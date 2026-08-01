# Policies

Operational Policy REST APIs for register, versioning, Framework mapping,
submission, approval/rejection, traceability and Policy-scoped audit history.

Permissions:

- `policies:read`
- `policies:write`
- `policies:submit`
- `policies:approve`

Notes:

- Null `effectiveDate` / `reviewDate` are filled on submit (UTC decision day /
  +1 year) because the lifecycle trigger forbids date changes on
  SUBMITTED → APPROVED. Future-effective approval is still rejected at approve.
- Concurrent version allocation locks the Policy row (`FOR UPDATE`) and reads
  the created Version through the same transaction client.

Evidence gate (Milestone 5 Slice 5.5C):

- When `requiresEvidence=true`, approval evaluates exact-version active Control
  mappings: Control.requiresEvidence and Checkpoint.evidenceRequired are
  independent obligations (Control-linked vs Checkpoint-linked Evidence).
- Empty required-target set → 409 `EVIDENCE_REQUIRED` /
  `EVIDENCE_GATE_NOT_CONFIGURED`.
- Incomplete coverage → 409 with
  `EVIDENCE_CONTROL_COVERAGE_INCOMPLETE`,
  `EVIDENCE_CHECKPOINT_COVERAGE_INCOMPLETE`, or `EVIDENCE_COVERAGE_INCOMPLETE`.
- Gate runs inside the approve transaction after Policy/Version locks and
  before supersession/APPROVED writes; selected Evidence is `FOR SHARE` locked.

Out of scope / deferred:

- Policy Version obsoletion endpoint
- Policy INACTIVE transitions
- KPI Evidence satisfaction (still 501)

Frontend status (Milestone 4 Slice 5):

- React Policy Register (`/compliance/policy-register`) and Policy detail
  (`/compliance/policies/:policyId`) are LIVE after verification
- Standalone Policy Versions navigation (`/compliance/policy-versions`) remains
  `IN_DEVELOPMENT`
- React Control and Checkpoint UI remain `IN_DEVELOPMENT`
