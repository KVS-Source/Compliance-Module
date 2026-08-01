# Evidence

Milestone 5 Slice 2 adds secure local file upload, SHA-256 duplicate protection,
authorized attachment download, and successful submission after upload.

## Implemented

- Tenant-owned `evidence` rows with server-allocated `EVD-###` codes
- Lifecycle: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `ARCHIVED`
- Multipart upload: `POST /api/v1/evidence/:evidenceId/file` (`evidence:write`)
- Attachment download: `GET /api/v1/evidence/:evidenceId/file` (`evidence:read` + `evidence:download`)
- Streaming local storage under `LOCAL_UPLOAD_DIR` (dev/UAT; Docker volume)
- SHA-256 from actual bytes; tenant partial unique index on `content_sha256`
- Submit succeeds only when a file is present
- Archive-only terminal path (no hard delete)
- Typed Control/Checkpoint link tables (schema only; no mutation APIs)

## Limits (Slice 5.2)

- Max size: 10 MiB (`EVIDENCE_MAX_UPLOAD_BYTES`)
- Field name: `file`
- Allowlist: pdf, png, jpg/jpeg, docx, xlsx, csv, txt
- Duplicate hash within a tenant: `EVIDENCE_FILE_DUPLICATE` (no other record id)

## Not implemented

- S3 / production object storage
- Malware scanning, signed URLs, inline preview
- Approve / reject HTTP routes
- Control / Checkpoint link mutation APIs
- Frontend LIVE Evidence routes (`IN_DEVELOPMENT`)
- KPI / Policy / Checkpoint Evidence gate replacement
- Periodic orphan temp cleanup (abrupt process crash may leave `.tmp` files)

## Permissions

| Code | Use |
| --- | --- |
| `evidence:read` | List, detail, audit history |
| `evidence:write` | Create, patch, upload, submit, archive |
| `evidence:review` | Catalogue only (routes deferred) |
| `evidence:download` | File download (required with read) |

`storageKey` is never returned in API responses.
