# Postman collections

Synthetic `.test` identities only. Never commit real passwords, tokens, client
names, employee data, production URLs, or database credentials.

## Milestone 4 end-to-end demonstration

Primary demonstration assets:

| File | Purpose |
| --- | --- |
| `Milestone-4-E2E.postman_collection.json` | Full Policy → Control → Checkpoint → Review flow |
| `Milestone-4-E2E.postman_environment.json` | Local placeholders (`baseUrl`, emails, empty secrets) |

Module-scoped collections remain available for deeper drills:

- `Policy-API.postman_collection.json`
- `Control-API.postman_collection.json`
- `Checkpoint-API.postman_collection.json`

## Import

1. Open Postman.
2. Import the collection and matching environment from this folder.
3. Select **GenBioCa Milestone 4 E2E (local)**.
4. Confirm `baseUrl` is `http://localhost:8000/api/v1` (Docker Compose default).

## Safe credential setup

Set locally only (never commit):

- `adminPassword` — seed admin password for `admin001@example.test`
- `approverPassword` — seed password for `user001@example.test`

Password and token variables are marked `secret` in the environment file.
Credentials stay in your local Postman environment; do not commit filled values
and do not expose passwords or tokens while screen-sharing.

### Approver permission prerequisite

`user001@example.test` (Company User) must have `policies:approve` in the active
Company before **Approve Version** succeeds.

- This collection does **not** grant permissions automatically.
- Seed defaults do **not** give Company User `policies:approve`.
- A `403` on Approve usually means the approver is missing `policies:approve`
  (after login), not a broken request body.
- Grant the permission locally for the demo (same temporary approach backend
  integration tests use). Do not change seed defaults in a shared commit for a
  one-off demo.
- Re-login the approver after granting so the JWT includes the permission.

After Docker rebuild or token expiry, re-run **Admin login** and **Approver
login**. Clear captured ID variables if you restart from folder 02.

## Folder order

Run folders in order:

| Folder | Purpose | Expected success |
| --- | --- | --- |
| 00 — Health and Authentication | `/health`, admin login | `200` |
| 01 — Framework Reference Data | capture Framework / Rule IDs | `200` |
| 02 — Policy | create / list / view / update | `201` then `200` |
| 03 — Policy Version and Approval | version, frameworks, submit, self-approval negative, approve | `201`/`200`; self-approve `403` |
| 04 — Control | create / list / view / update / traceability / audit | `201`/`200` |
| 05 — Checkpoint | create / list / view / update | `201`/`200` |
| 06 — Checkpoint Review | PASS, latest, history, duplicate `409`, FAIL | `201`/`200`/`409` |
| 07 — Traceability and Audit | Checkpoint / Control / Policy | `200` |
| 08 — Permission and Error Demonstration | `401` / `403` / `400` / `404` / `409` | negative statuses |
| 09 — Optional Cleanup or Archive | terminal archive actions | optional; keep off happy path |

Variables (`policyId`, `versionId`, `controlId`, `checkpointId`, `reviewId`,
tokens) are captured automatically by test scripts on success.

## Review body allowlist

Review create scripts assert the body contains only:

- `reviewPeriod`
- `reviewDate`
- `outcome`
- `observation`
- `recommendation`
- `nextReviewDate`

They also assert absence of `tenantId`, `reviewerId`, `actorId`, `comments`,
`checkpointId` in the body, and client-generated timestamps.

Do not log tokens, passwords, observations, recommendations, or full request
bodies in console scripts or screen shares. Hide the Postman environment panel
when demonstrating.

## Reset variables

Clear: `accessToken`, `approverToken`, `frameworkId`, `frameworkRuleId`,
`policyId`, `versionId`, `controlId`, `checkpointId`, `reviewId`. Keep
`reviewPeriod` (default `2026-07`) or choose a fresh period after a prior demo
in the same database.

## Postman vs pgAdmin

- **Postman** exercises the real local HTTP API and response envelopes.
- **pgAdmin** confirms stored rows with read-only SQL
  (`docs/milestone-4-pgadmin-demo.sql`).
- **Playwright** uses deterministic mocked browser APIs; in-memory actor
  switches simulate UI flows only and are not auth/PostgreSQL authority.
- Backend PostgreSQL integration tests remain the automated permissions, auth
  and database authority.

## Short client demo flow

1. Login (folder 00).
2. Create or retrieve Policy (folder 02).
3. Show submit, self-approval denial, and approve (folder 03).
4. Create Control linked to the approved Version (folder 04).
5. Create Checkpoint (folder 05).
6. Submit Review (folder 06).
7. Show Latest Review and history.
8. Show traceability (folder 07).
9. Show audit events (folder 07).
10. Open pgAdmin and confirm selected stored rows with the read-only SQL guide.
