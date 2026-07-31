# Checkpoint API Postman guide

This guide demonstrates the Milestone 4 Slice 4 Checkpoint APIs with synthetic
data only.

## Prerequisites

1. Local backend running against a migrated and seeded PostgreSQL database.
2. Import:
   - `postman/Checkpoint-API.postman_collection.json`
   - `postman/Checkpoint-API.postman_environment.json`
3. Set local-only environment values (never commit them):
   - `password` (for `admin001@example.test`)
   - `readOnlyPassword` (for `user001@example.test`)

Synthetic emails already in the environment:

- `admin001@example.test`
- `user001@example.test`

## Recommended order

1. Admin login — stores `accessToken`
2. Create eligible Control — stores `controlId`
3. Create Checkpoint — stores `checkpointId`
4. List / view / update Checkpoint
5. Deactivate then activate
6. Create first Review — stores `reviewId`
7. View latest Review and Review history
8. Create a later Review and confirm latest Review changed
9. Duplicate-period Review — expect `409 CHECKPOINT_REVIEW_DUPLICATE`
10. Traceability and audit events
11. Read-only login and permission-denied create — expect `403`
12. Cross-tenant or unknown Checkpoint ID — expect safe `404`
13. Archive Checkpoint, then PATCH/Review rejection — expect `409`
14. ACTIVE Checkpoint blocks Control archive — expect
    `409 CONTROL_HAS_ACTIVE_CHECKPOINTS`

## Notes

- Checkpoint codes are server-allocated (`CHK-###`)
- Same-state activate/deactivate/archive returns `409 CHECKPOINT_INVALID_STATE`
- Reviewer is always the authenticated actor
- `verificationFrequency` and `initialReviewDate` freeze after the first Review
- Review period formats follow `verificationFrequency` (MONTHLY → `YYYY-MM`,
  QUARTERLY → `YYYY-Qn`, WEEKLY → `YYYY-Www`, DAILY → `YYYY-MM-DD`,
  HALF_YEARLY → `YYYY-Hn`, ANNUAL → `YYYY`, CONTINUOUS/PER_EVENT →
  `YYYY-MM-DD#TOKEN`, ONE_TIME → `ONE-TIME`)
- Observation / recommendation appear in Review history and detail, not in list
  rows or audit metadata
- React Checkpoint UI, Evidence, Gap and CAPA are out of scope for this
  collection
