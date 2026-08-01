# Evidence UI (Milestone 5 Slice 5.6A)

Operational React pages for Evidence Library, creation, detail, lifecycle and
human review against the merged Evidence REST APIs.

## LIVE routes

| Route | Page | Permission |
|-------|------|------------|
| `/evidence` | Evidence Library | `evidence:read` |
| `/evidence/new` | Create Evidence | `evidence:write` |
| `/evidence/review` | Evidence Review Queue | `evidence:review` |
| `/evidence/:evidenceId` | Evidence Detail | `evidence:read` |

Compatibility redirects (replace navigation):

- `/evidence/register` → `/evidence/new`
- `/evidence/upload` → `/evidence/new`
- `/evidence/approved` → `/evidence?lifecycleStatus=APPROVED`
- `/evidence/rejected` → `/evidence?lifecycleStatus=REJECTED`

Download requires both `evidence:read` and `evidence:download`.

## Lifecycle

Backend enum: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `ARCHIVED`.

The UI displays **Pending review** for `SUBMITTED` only. There is no
`PENDING_REVIEW` API value.

## Create and upload sequence

1. Enter metadata on `/evidence/new`.
2. `POST /evidence` creates a DRAFT record.
3. Multipart upload to `POST /evidence/:id/file` on that exact ID.
4. Navigate to detail on success.
5. Submit for review is a separate explicit action on the detail page.

If metadata succeeds but upload fails, the DRAFT is preserved and **Retry
upload** reuses the same Evidence ID — no second record is created.

## Authenticated download

`GET /evidence/:id/file` streams a Blob through the session Authorization
header. Filenames come from `Content-Disposition` with sanitisation. Object
URLs are revoked immediately after the download is handed off. Tokens never
appear in URLs.

## Maker-checker

Reviewers who created, uploaded or submitted the Evidence receive a proactive
hint. The backend enforces `EVIDENCE_SELF_REVIEW_FORBIDDEN`; the hint is not a
security guarantee.

## REJECTED and superseding

Rejected Evidence has no resubmit transition. Metadata may be edited where the
backend allows, and **Create superseding Evidence** navigates to `/evidence/new`
with the rejected record pre-selected when safe.

## Evidence Detail sections (5.6A)

1. Overview
2. File
3. Lifecycle
4. Review decisions (append-only)
5. Audit events (safe metadata only)

No Control, Checkpoint or KPI Actual link sections exist in this slice.

## Explicit 5.6A exclusions (deferred to 5.6B+)

- Control / Checkpoint / KPI Actual Evidence link UI
- Create Evidence from KPI Actual
- Policy / Checkpoint / KPI gate-error UX changes
- Placeholder link tabs or disabled link buttons

## Tests

Playwright suite: `frontend/tests/evidence-workflow.e2e.ts`

```bash
cd frontend
npm run test:e2e -- tests/evidence-workflow.e2e.ts
```

Tests mock `**/api/v1/**` in the browser. They are not browser-to-database
end-to-end tests.

## Authority boundary

The backend validates lifecycle, permissions, file rules, maker-checker and
tenant scope. The UI maps errors safely and never renders storage keys, server
paths or content hashes.
