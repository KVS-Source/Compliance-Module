# Evidence

Milestone 5 Slice 3 adds tenant-safe Evidence linking to Controls and
Checkpoints. Links are mutable only while Evidence is `DRAFT` and become
immutable after submission. Soft `isActive` state plus audit events provide
history; re-link reactivates the same unique row.

## Implemented

- Tenant-owned `evidence` rows with server-allocated `EVD-###` codes
- Lifecycle: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `ARCHIVED`
- Multipart upload: `POST /api/v1/evidence/:evidenceId/file` (`evidence:write`)
- Attachment download: `GET /api/v1/evidence/:evidenceId/file` (`evidence:read` + `evidence:download`)
- Streaming local storage under `LOCAL_UPLOAD_DIR` (dev/UAT; Docker volume)
- SHA-256 from actual bytes; tenant partial unique index on `content_sha256`
- Submit succeeds only when a file is present
- Archive-only terminal path (no hard delete)
- Control links (DRAFT only):
  - `POST /api/v1/evidence/:evidenceId/controls/:controlId` (201 create / 200 re-link)
  - `POST /api/v1/evidence/:evidenceId/controls/:controlId/unlink`
  - `GET /api/v1/evidence/:evidenceId/controls` (active links, paginated)
- Checkpoint links (DRAFT only; independent of Control links):
  - `POST /api/v1/evidence/:evidenceId/checkpoints/:checkpointId`
  - `POST /api/v1/evidence/:evidenceId/checkpoints/:checkpointId/unlink`
  - `GET /api/v1/evidence/:evidenceId/checkpoints`
- Evidence detail counts: `activeControlLinkCount`, `activeCheckpointLinkCount`

## Link rules

- Link and unlink require Evidence `lifecycleStatus = DRAFT`
- SUBMITTED, APPROVED, REJECTED and ARCHIVED Evidence reject link mutations
- Existing active links remain readable in every Evidence lifecycle
- New and reactivated links require Control/Checkpoint `lifecycleStatus = ACTIVE`
- Unlink from DRAFT remains allowed if the target later becomes INACTIVE or ARCHIVED
- One row per tenant/evidence/target pair; unlink sets `isActive=false`; re-link reactivates
- `createdById` / `createdAt` retain first-link attribution
- Checkpoint links do **not** require an Evidence–Control link
- Linking does **not** submit, approve, change lifecycle, change file fields, or satisfy gates

## Limits (Slice 5.2 files)

- Max size: 10 MiB (`EVIDENCE_MAX_UPLOAD_BYTES`)
- Field name: `file`
- Allowlist: pdf, png, jpg/jpeg, docx, xlsx, csv, txt
- Duplicate hash within a tenant: `EVIDENCE_FILE_DUPLICATE` (no other record id)

## Not implemented

- S3 / production object storage
- Malware scanning, signed URLs, inline preview
- Approve / reject HTTP routes
- Reverse `GET /controls/:id/evidence` and `GET /checkpoints/:id/evidence`
- Policy / KPI Evidence links
- Frontend LIVE Evidence routes (`IN_DEVELOPMENT`)
- KPI / Policy / Checkpoint Evidence gate replacement
- Periodic orphan temp cleanup (abrupt process crash may leave `.tmp` files)

## Permissions

| Code | Use |
| --- | --- |
| `evidence:read` | List, detail, audit history, active Control/Checkpoint link lists |
| `evidence:write` | Create, patch, upload, submit, archive, link, unlink |
| `evidence:review` | Catalogue only (routes deferred) |
| `evidence:download` | File download (required with read) |

`storageKey` is never returned in API responses.
`linkReason` is not accepted or returned by the Slice 5.3 API.
