# Control API Postman guide

This guide demonstrates the Milestone 4 Slice 3 Control APIs with synthetic data
only.

## Prerequisites

1. Local backend running against a migrated and seeded PostgreSQL database.
2. Import:
   - `postman/Control-API.postman_collection.json`
   - `postman/Control-API.postman_environment.json`
3. Set local-only environment values (never commit them):
   - `password` (for `admin001@example.test`)
   - `readOnlyPassword` (for `user001@example.test`)
4. Ensure at least one Policy has a `currentApprovedVersion` (the governance seed
   creates a synthetic approved Policy per Company). Capture its Version ID into
   `policyVersionId` via step 4, or paste it manually.
5. Optional archive-rejection sample: copy the ID of a seeded Control that still
   has an ACTIVE Checkpoint (for example the synthetic `SMP-CTL-001` /
   `CTL-001` Control in a seeded Company) into
   `controlWithActiveCheckpointId`. Leave the placeholder empty until then.
   There is no Checkpoint API in this collection.

Synthetic emails already in the environment:

- `admin001@example.test`
- `user001@example.test`

## Recommended order

1. Admin login — stores `accessToken`
2. List frameworks — stores `frameworkId`
3. List framework rules — stores `frameworkRuleId`
4. List Policies — stores `policyId` / `policyVersionId` from an approved Version
5. Create Control — stores `controlId`
6. List / view / update Control
7. Deactivate then activate
8. Map an APPROVED Policy Version
9. Map Frameworks then Framework Rules
10. Traceability and audit events
11. Rule mapping without an active Framework — expect `400 CONTROL_MAPPING_INVALID`
    (clear Framework mappings first, or use a fresh Control)
12. Read-only login and permission-denied create — expect `403`
13. Cross-tenant or unknown Control ID — expect safe `404`
14. Optional seeded archive rejection — expect `409 CONTROL_HAS_ACTIVE_CHECKPOINTS`
15. Archive the eligible Control created in this run — empty body `{}`

## Notes

- Control codes are server-allocated (`CTL-###`)
- Same-state activate/deactivate/archive returns `409 CONTROL_INVALID_STATE`
- Policy Version mappings require currently `APPROVED` Versions
- Framework removal is refused while active Rule mappings remain
- Checkpoint APIs and React Control UI are out of scope for this collection
