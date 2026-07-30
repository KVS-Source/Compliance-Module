# Controls

Operational Control register, lifecycle, and mapping APIs for Milestone 4
Slice 3.

Permissions:

- `controls:read` — list, detail, traceability, audit-event history
- `controls:write` — create, update, activate, deactivate, archive, mapping PUTs

Notes:

- Control codes are server-allocated (`CTL-001` pattern) with counter heal
  before `GovernanceCodeRepository.allocateControlCode`.
- Mutations lock the Control row (`FOR UPDATE`).
- Mapping replacement is soft (`isActive`); hard deletes are never used.
- Policy Version mappings require currently `APPROVED` Versions; one active
  mapping per Control and stable Policy.
- Framework removal is refused while active RuleControl rows depend on it.
- Archive is refused while any Checkpoint on the Control is `ACTIVE`
  (`CONTROL_HAS_ACTIVE_CHECKPOINTS`).
- Same-state lifecycle POSTs return `409 CONTROL_INVALID_STATE`.

Out of scope in this slice:

- Checkpoint APIs
- React Control / Checkpoint UI (routes remain `IN_DEVELOPMENT`)
- Evidence, Gap, CAPA
