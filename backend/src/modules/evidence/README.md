# Evidence

Milestone 5 Slice 1 delivers the **Evidence metadata and backend foundation**.

## Implemented

- Tenant-owned `evidence` rows with server-allocated `EVD-###` codes
- Lifecycle: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `ARCHIVED`
- Typed join tables for Control and Checkpoint links (schema only)
- Append-only `evidence_review_decisions` (schema + DB trigger; no HTTP)
- Permissions: `evidence:read`, `evidence:write`, `evidence:review`, `evidence:download`
- Metadata APIs under `/api/v1/evidence`
- Fail-closed submit: `EVIDENCE_FILE_REQUIRED` until a file is uploaded (Slice 5.2)
- Archive-only terminal path (no hard delete)
- Immutable replacement via `supersedesEvidenceId` on create

## Not implemented in Slice 5.1

- Multipart file upload / secure download
- MIME sniffing, malware scanning, signed URLs, preview
- Approve / reject HTTP routes
- Control / Checkpoint link mutation APIs
- Frontend LIVE Evidence routes (remain `IN_DEVELOPMENT`)
- KPI, Policy or Checkpoint Evidence gate replacement (still fail-closed stubs)

## Permissions

| Code | Use in this slice |
| --- | --- |
| `evidence:read` | List, detail, audit history |
| `evidence:write` | Create, patch eligible metadata, submit, archive |
| `evidence:review` | Catalogue only (routes deferred) |
| `evidence:download` | Catalogue only (routes deferred) |

## Reserved file columns

Nullable columns exist for Slice 5.2 (`storageKey`, `contentSha256`, `byteSize`, …).
Slice 5.1 APIs never accept or populate them and never return `storageKey`.
