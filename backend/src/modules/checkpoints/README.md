# Checkpoints

Operational Checkpoint register, lifecycle, and Review APIs for Milestone 4
Slice 4.

Permissions:

- `checkpoints:read` — list, detail, Review history, latest Review, traceability,
  audit-event history
- `checkpoints:write` — create, update, activate, deactivate, archive
- `checkpoints:review` — create Checkpoint Reviews

Notes:

- Checkpoint codes are server-allocated (`CHK-001` pattern) with counter heal
  before `GovernanceCodeRepository.allocateCheckpointCode`.
- Create and activate lock the parent Control (`FOR UPDATE`) before the
  Checkpoint row. Review creation uses the same Control-then-Checkpoint order.
- Server-controlled lifecycle starts as `ACTIVE`. Same-state lifecycle POSTs
  return `409 CHECKPOINT_INVALID_STATE`.
- ACTIVE Checkpoints under INACTIVE Controls are allowed (accepted limitation).
  ARCHIVED parent Controls reject create, activate, and Review with
  `409 CHECKPOINT_PARENT_CONTROL_ARCHIVED`.
- Reviewer is always the authenticated actor; client-supplied reviewer fields
  are rejected.
- `verificationFrequency` and `initialReviewDate` freeze after the first Review.
- Latest Review is database-authoritative (`submitted_at`, then UUID text).
- Duplicate review periods return `409 CHECKPOINT_REVIEW_DUPLICATE`.
- List via `GET /checkpoints?controlId=` — no nested Control Checkpoint routes.
- Observation and recommendation are visible on Review history/detail for
  `checkpoints:read`, never in list rows, audit metadata, or logs.

Out of scope in this slice:

- React Checkpoint / Control UI (routes remain `IN_DEVELOPMENT`)
- Evidence, Gap, CAPA
- Same-period Review correction
