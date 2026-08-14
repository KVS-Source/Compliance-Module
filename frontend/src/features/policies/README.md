# Policy UI (Milestone 4 Slice 5)

Operational React pages for Policy Register and Policy detail workflows against
the merged Policy REST APIs.

## LIVE routes

- `/compliance/policy-register` — register, filters, create Policy
- `/compliance/policies/:policyId` — detail, Versions, Framework mappings,
  decisions, traceability, audit

Both require `policies:read`. Write/submit/approve actions use
`policies:write`, `policies:submit` and `policies:approve` for visibility only;
the backend remains authoritative.

## Still IN_DEVELOPMENT

- `/compliance/policy-versions` (standalone navigation page)

## Behaviour notes

- Policy content, purpose, scope and change summary render as plain text with
  `white-space: pre-wrap`. No HTML/Markdown rendering.
- `latestVersion` is the highest-sequence Version. `currentApprovedVersion` is
  set only when an APPROVED Version is current. They are never conflated.
- Filters stay in React state (no URL query sync in this slice).
- Evidence-required Versions show proactive and error UX for HTTP 409
  `EVIDENCE_REQUIRED` (configured reasons). Link approved Evidence from the
  Evidence detail page while DRAFT.
- Playwright suites under `frontend/tests/policy-*.e2e.ts` use mocked HTTP only.
  Backend PostgreSQL integration tests remain the database authority.
