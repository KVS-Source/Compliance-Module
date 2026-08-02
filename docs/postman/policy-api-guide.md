# Policy API Postman guide

This guide demonstrates the Milestone 4 Slice 2 Policy APIs with synthetic data
only.

## Prerequisites

1. Local backend running against a migrated and seeded PostgreSQL database.
2. Import:
   - `postman/Policy-API.postman_collection.json`
   - `postman/Policy-API.postman_environment.json`
3. Set local-only environment values (never commit them):
   - `adminPassword`
   - `approverPassword`
4. Ensure the approver identity has `policies:approve` in the active Company.
   Integration tests grant this to `COMPANY_USER` temporarily. For a local demo,
   grant the same permission to `user001@example.test` before step 12.

Synthetic emails already in the environment:

- `admin001@example.test`
- `user001@example.test`

## Recommended order

1. Admin login — stores `accessToken`
2. List frameworks — stores `frameworkId`
3. Create Policy — stores `policyId` and initial `versionId`
4. List / view / update Policy
5. Create a MINOR Version — stores `secondVersionId`
6. Replace Framework mappings
7. Submit Version
8. Self-approval — expect `403 POLICY_SELF_APPROVAL_FORBIDDEN`
9. Approver login — stores `approverToken`
10. Approve Version
11. Version history, traceability, audit events
12. Create another Version, submit, reject with comments, resubmit
13. Approver approves the resubmitted Version (clears SUBMITTED so archive is allowed)
14. Permission-denied create as approver — expect `403`
15. Cross-tenant or unknown Policy ID — expect safe `404`
16. Archive Policy — empty body `{}` (409 if any Version is still SUBMITTED)

## Response terminology

- `latestVersion` is the most recently created Version
- `currentApprovedVersion` is only the pointer from `Policy.currentApprovedVersionId`
- A new Policy has `currentApprovedVersion: null` and `latestVersion` `1.0` `DRAFT`

## Notes

- Rejection comments are stored only on `PolicyApproval.comments`
- Evidence-required Policy approval returns `409 EVIDENCE_REQUIRED` with safe
  configured reasons (not `501`).
- Policy Version obsoletion is deferred and not exposed
- Control and Checkpoint APIs are out of scope for this collection
