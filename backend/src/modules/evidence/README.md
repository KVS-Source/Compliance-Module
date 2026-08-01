# Evidence

Milestone 5 Slice 4 adds tenant-safe Evidence approval and rejection with
maker-checker self-review controls, an append-only decision ledger, a review
queue, and review history.

## Implemented

- Tenant-owned `evidence` rows with server-allocated `EVD-###` codes
- Lifecycle: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `ARCHIVED`
- Multipart upload and attachment download (local storage)
- Submit only when a file is present; archive terminal path (no hard delete)
- Control / Checkpoint soft links (mutable only while DRAFT)
- Review (only `SUBMITTED`):
  - `GET /api/v1/evidence/review-queue` (`evidence:review`)
  - `POST /api/v1/evidence/:evidenceId/approve` (`evidence:review`)
  - `POST /api/v1/evidence/:evidenceId/reject` (`evidence:review`)
  - `GET /api/v1/evidence/:evidenceId/review-decisions` (`evidence:read`)
- Detail includes `reviewedBy`, `reviewedAt`, and `latestReviewDecision`
- Append-only `evidence_review_decisions` (DB trigger + no update/delete APIs)

## Review rules

- Only `SUBMITTED` Evidence may be approved or rejected
- Maker-checker: reviewer must not be creator, uploader, or submitter
- Administrators / wildcards **cannot** bypass self-review
- Rejection `reason` required (2–2000 characters after trim)
- Approval `comment` optional (when present, 2–2000 characters)
- Free-text reason/comment is stored on the decision row only — not in audit metadata
- Rejected Evidence is not re-opened; correction uses a new superseding DRAFT
- Approval does **not** satisfy Policy/KPI Evidence gates (deferred)

## Permissions

| Code | Use |
| --- | --- |
| `evidence:read` | List, detail, link lists, audit, review history |
| `evidence:write` | Create, patch, upload, submit, archive, links |
| `evidence:review` | Review queue, approve, reject |
| `evidence:download` | File download (required with read) |

`storageKey` is never returned in API responses.

## Not implemented

- S3 / production object storage
- Malware scanning, signed URLs, inline preview
- Reverse Control/Checkpoint Evidence lookup endpoints
- Frontend LIVE Evidence routes (`IN_DEVELOPMENT`)
- KPI / Policy / Checkpoint Evidence gate satisfaction
- Notifications
- PostgreSQL RLS / production deployment
