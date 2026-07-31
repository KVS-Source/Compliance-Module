# Checkpoint UI (Milestone 4 Slice 7)

Operational React pages for Checkpoint Register, detail, lifecycle and Review
workflows against the merged Checkpoint REST APIs.

## LIVE routes

- `/compliance/checkpoints` — register, focused filters, create Checkpoint
- `/compliance/checkpoints/:checkpointId` — detail, edit, lifecycle, Submit
  Review, latest Review, Review history, traceability, audit

Both require `checkpoints:read`. Write/lifecycle actions use
`checkpoints:write` and Review submission uses `checkpoints:review` for
visibility only; the backend remains authoritative.

## Behaviour notes

- Create requires Control, title, verificationFrequency and expectedResult.
  Optional description, ownerId, departmentId, evidenceRequired and
  initialReviewDate. ARCHIVED Controls are excluded from the selector; INACTIVE
  Controls are allowed.
- Edit updates scalars only. Control linkage is locked.
  `verificationFrequency` and `initialReviewDate` freeze after the first Review.
  `nextReviewDate` remains editable on PATCH.
- Submit Review is available on detail only (not Register). Reviews require an
  ACTIVE Checkpoint. PARTIAL/FAIL require observation (≥2 characters).
  NOT_APPLICABLE does not require observation. No auto-suggested review period.
- Latest Review uses `GET …/latest-review` as the authority (`null` = empty).
- Observation and recommendation are visible on latest Review and history for
  readers; they never appear on Register rows, audit metadata, toasts or URLs.
- ACTIVE Checkpoint under INACTIVE Control is allowed (informational warning).
- Control detail Checkpoint summary keeps counts and, when `checkpoints:read`
  is present, links to `/compliance/checkpoints` without controlId query or
  `location.state`.
- Filters stay in React state (no URL query sync in this slice).
- Playwright suites under `frontend/tests/checkpoint-*.e2e.ts` use mocked HTTP
  only. Backend PostgreSQL integration tests remain the database authority.

## Out of scope

- Evidence, Gap, CAPA, reports, notifications, GenRAC
- Same-period Review correction
- Nested Control Checkpoint routes
