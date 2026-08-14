# Control UI (Milestone 4 Slice 6)

Operational React pages for Control Register and Control detail workflows against
the merged Control REST APIs.

## LIVE routes

- `/compliance/controls` — register, filters, create Control
- `/compliance/controls/:controlId` — detail, lifecycle, Policy Version /
  Framework / Framework Rule mappings, Checkpoint counts, traceability, audit

Both require `controls:read`. Write and lifecycle actions use `controls:write`
for visibility only; the backend remains authoritative.

## Still IN_DEVELOPMENT

- `/compliance/policy-versions` (standalone navigation page)

## Behaviour notes

- Create may include optional initial Policy Version, Framework and Framework
  Rule mappings. Edit updates scalars only.
- Policy Version selectors use paginated `GET /policies` and each Policy’s
  `currentApprovedVersion` when it is `APPROVED` and the Policy is not
  `ARCHIVED`. Existing SUPERSEDED active mappings stay visible and are not
  silently retargeted.
- Framework Rule options are limited to Rules whose Framework is actively mapped
  to the Control. Frameworks are never auto-added from Rule selection.
- Checkpoint summary keeps counts and, when `checkpoints:read` is present, an
  Open Checkpoints link to `/compliance/checkpoints` (no controlId query or
  location.state). Count values are not individual Checkpoint links.
- Filters stay in React state (no URL query sync in this slice).
- Playwright suites under `frontend/tests/control-*.e2e.ts` use mocked HTTP only.
  Backend PostgreSQL integration tests remain the database authority.
