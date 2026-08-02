# Evidence API Postman guide

Authoritative Postman workflow for Milestone 5 Evidence APIs. Uses synthetic
`.test` identities only. The collection creates Evidence, Control, and Checkpoint
records dynamically — no seed changes are required.

## Prerequisites

1. Local backend running against a migrated PostgreSQL database.
2. Import:
   - `postman/Evidence-API.postman_collection.json`
   - `postman/Evidence-API.postman_environment.json`
3. Set local-only environment values (never commit them):
   - `adminPassword` — seed admin password for `admin001@example.test`
   - `reviewerPassword` — seed password for `user001@example.test`
4. Confirm `baseUrl` matches your backend (`http://localhost:4000/api/v1` for
   direct Node; `http://localhost:8000/api/v1` when fronted by Docker Compose).

## Multipart file fixture

Step **4. Upload file** uses the repository fixture:

`frontend/tests/fixtures/sample-evidence.txt`

In Postman, select that file for the `file` form field. The environment variable
`evidenceFixturePath` documents the relative path from the `postman/` folder.
Adjust locally if your checkout layout differs.

Allowed types are code-controlled (PDF, plain text, common images, etc.). Max
size is 10 MiB. Do not upload real employee, client or production documents.

## Reviewer permission prerequisite

`user001@example.test` must have `evidence:review` before approve/reject steps.
Seed defaults give Company User `evidence:read` only. Grant `evidence:review`
locally for the demo (same temporary approach integration tests use). Re-login
the reviewer after granting so the JWT includes the permission.

Maker-checker: the same user who created/uploaded/submitted Evidence cannot
approve or reject it. Steps use separate admin (create/upload/submit) and
reviewer (approve) identities.

## Recommended order

| Step | Request | Expected |
| --- | --- | --- |
| 1 | Admin login | `200`; captures `accessToken` |
| 2 | Create Evidence | `201`; DRAFT; captures `evidenceId` and server `EVD-*` code |
| 3 | View Evidence detail | `200`; `hasFile: false` |
| 4 | Upload file (multipart `file`) | `200`; `hasFile: true`; no `storageKey` in response |
| 5 | Submit Evidence | `200`; `SUBMITTED` |
| 6 | Reviewer login | `200`; captures `reviewerToken` |
| 7 | Review queue | `200`; includes submitted row |
| 8 | Approve Evidence | `200`; `APPROVED` |
| 9 | Create Control (link target) | `201`; captures `controlId` |
| 10 | Create Checkpoint | `201`; captures `checkpointId` |
| 11 | Link Control (expect fail — not DRAFT) | `409` or domain error |
| 12 | Create second DRAFT Evidence | `201`; new `evidenceId` |
| 13 | Link Control on DRAFT | `201` or `200` idempotent |
| 14 | Link Checkpoint on DRAFT | `201` or `200` |
| 15 | List Control links | `200` |
| 16 | List Checkpoint links | `200` |
| 17 | Download file (`evidence:download`) | `200`; binary body |
| 18 | Audit events | `200`; safe metadata only |

Steps 11–14 demonstrate DRAFT-only link mutability and ACTIVE target rules.
For a Checkpoint Evidence gate demo, create a Checkpoint with
`evidenceRequired: true`, link approved Evidence, then submit a Review via the
Checkpoint collection or UI.

## Response safety

- Responses must not expose `storageKey`, raw password hashes, or refresh tokens.
- Error envelopes use safe codes (`EVIDENCE_REQUIRED`, `VALIDATION_ERROR`, etc.).
- Evidence gates return HTTP **409** `EVIDENCE_REQUIRED`, not `501`.

## Reset variables

Clear: `accessToken`, `reviewerToken`, `evidenceId`, `controlId`, `checkpointId`.
Keep `baseUrl` and fixture path. Re-run from step 1 after database reset.

## Related collections

- `Checkpoint-API.postman_collection.json` — Checkpoint Review and Evidence gate
- `Policy-API.postman_collection.json` — Policy Version Evidence gate (409)
- `Milestone-4-E2E.postman_collection.json` — Policy → Control → Checkpoint flow

Do not use `GenBioCa-GRC.postman_collection.json` for Evidence; its legacy
`/evidence/upload` path is not the active API (`POST /evidence` then
`POST /evidence/:id/file`).
