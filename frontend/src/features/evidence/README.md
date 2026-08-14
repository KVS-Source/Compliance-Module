# Evidence UI (Milestone 5 Slice 5.6A + 5.6B)

Operational React pages for Evidence Library, creation, detail, lifecycle,
human review, **Control / Checkpoint / KPI Actual link management**, and
gate-aware integration with Policy, Checkpoint and KPI approval flows.

## LIVE routes

| Route | Page | Permission |
|-------|------|------------|
| `/evidence` | Evidence Library | `evidence:read` |
| `/evidence/new` | Create Evidence | `evidence:write` |
| `/evidence/review` | Evidence Review Queue | `evidence:review` |
| `/evidence/:evidenceId` | Evidence Detail | `evidence:read` |

Create from KPI Actual:

`/evidence/new?returnTo=<internal-path>&linkKpiActualId=<uuid>`

- `returnTo` must be an internal path (`/…` only). Protocol-relative (`//`),
  absolute URLs and external hosts are rejected.
- After metadata + upload, the UI asks explicitly whether to link — never silent
  link, never auto-submit. Link failure keeps the Evidence in DRAFT.

Compatibility redirects (replace navigation):

- `/evidence/register` → `/evidence/new`
- `/evidence/upload` → `/evidence/new`
- `/evidence/approved` → `/evidence?lifecycleStatus=APPROVED`
- `/evidence/rejected` → `/evidence?lifecycleStatus=REJECTED`

Download requires both `evidence:read` and `evidence:download`.

## Evidence Detail sections

1. Overview
2. File
3. Lifecycle
4. **Linked Controls** (`GET/POST/unlink …/controls`)
5. **Linked Checkpoints** (`GET/POST/unlink …/checkpoints`)
6. **Linked KPI Actuals** (`GET/POST/unlink …/kpi-actuals`)
7. Review decisions (append-only)
8. Audit events (safe metadata only)

Link mutations require `evidence:write` and **DRAFT** Evidence. Pickers search
ACTIVE Controls / Checkpoints; KPI actual picker excludes APPROVED actuals. No
raw UUID entry. Unlink uses confirmation.

There are **no** reverse Evidence panels on Control or Checkpoint detail pages
(by design).

## KPI Actual Evidence panel

Surfaces on KPI Actual entry (after submit) and KPI approval decision modals.

- `GET /kpi-actuals/:id/evidence-links`
- **Create Evidence for this actual** when `evidence:write` and actual is not
  APPROVED

## Gate-aware error UX (409 `EVIDENCE_REQUIRED`)

Inspect `error.details.reason` (not top-level code alone):

| Domain | Reasons |
|--------|---------|
| Policy | `EVIDENCE_GATE_NOT_CONFIGURED`, `EVIDENCE_CONTROL_COVERAGE_INCOMPLETE`, `EVIDENCE_CHECKPOINT_COVERAGE_INCOMPLETE`, `EVIDENCE_COVERAGE_INCOMPLETE` |
| Checkpoint review | `EVIDENCE_COVERAGE_INCOMPLETE` |
| KPI actual approval | `EVIDENCE_KPI_LINK_REQUIRED`, `EVIDENCE_KPI_COVERAGE_INCOMPLETE` |

Proactive/live `501 EVIDENCE_GATE_NOT_IMPLEMENTED` copy was removed from Policy,
Checkpoint and KPI approval paths.

## Lifecycle

Backend enum: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `ARCHIVED`.

The UI displays **Pending review** for `SUBMITTED` only.

## Create and upload sequence

1. Enter metadata on `/evidence/new`.
2. `POST /evidence` creates a DRAFT record.
3. Multipart upload to `POST /evidence/:id/file` on that exact ID.
4. Navigate to detail (or validated `returnTo`) on success.
5. Optional KPI link confirmation when `linkKpiActualId` is present.
6. Submit for review is a separate explicit action on the detail page.

## Tests

Playwright suites:

- `frontend/tests/evidence-workflow.e2e.ts` (5.6A lifecycle)
- `frontend/tests/evidence-links-gates.e2e.ts` (5.6B links + gates)

```bash
cd frontend
npm run test:e2e -- tests/evidence-links-gates.e2e.ts
```

Tests mock `**/api/v1/**` in the browser. They are not browser-to-database
end-to-end tests.

## Explicit exclusions (unchanged)

- Backend / Prisma / migration changes from this slice
- Client-side gate satisfaction claims
- Control / Checkpoint reverse link panels

## Authority boundary

The backend validates lifecycle, permissions, file rules, maker-checker, link
eligibility and tenant scope. The UI maps errors safely and never renders
storage keys, server paths or content hashes.
