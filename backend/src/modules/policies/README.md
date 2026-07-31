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

Out of scope / deferred:

- Policy Version obsoletion endpoint
- Policy INACTIVE transitions
- Evidence fulfilment (approval fails closed with `EVIDENCE_GATE_NOT_IMPLEMENTED`)

Frontend status (Milestone 4 Slice 5):

- React Policy Register (`/compliance/policy-register`) and Policy detail
  (`/compliance/policies/:policyId`) are LIVE after verification
- Standalone Policy Versions navigation (`/compliance/policy-versions`) remains
  `IN_DEVELOPMENT`
- React Control and Checkpoint UI remain `IN_DEVELOPMENT`
