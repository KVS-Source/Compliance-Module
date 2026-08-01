# Evidence

Milestone 5 Slice 5A+B adds a shared Evidence eligibility engine and a real
Checkpoint Evidence gate. Policy and KPI gates remain fail-closed stubs.

## Implemented

- Tenant-owned Evidence with lifecycle DRAFT → SUBMITTED → APPROVED/REJECTED → ARCHIVED
- Local file upload/download, Control/Checkpoint soft links, approve/reject review
- **Evidence gate eligibility** (`eligibility.ts` + `evidence-gate-service.ts`)
- **Checkpoint review gate** when `evidenceRequired=true`:
  - requires ≥1 actively linked, APPROVED, file-backed, non-expired Evidence
  - not superseded by APPROVED/ARCHIVED successor
  - evaluated inside the review transaction after Control/Checkpoint locks
  - locks **one** qualifying Evidence row with `FOR SHARE` until parent commit
    so concurrent archive cannot race past the gate
  - HTTP **409** `EVIDENCE_REQUIRED` with safe reason `EVIDENCE_COVERAGE_INCOMPLETE`

## Qualifying Evidence (Checkpoint gate)

Same tenant · `lifecycleStatus=APPROVED` · active `EvidenceCheckpointLink` ·
complete file metadata (`hasEvidenceFile`) · issueDate null or ≤ today (UTC) ·
expiresAt null or ≥ today (UTC) · no APPROVED/ARCHIVED superseding successor.

Object-storage existence is **not** checked during gate evaluation. The gate
locks a single qualifying Evidence row (`FOR SHARE`); it does not lock the full
Evidence or link tables. Active Checkpoint links cannot be unlinked while
Evidence is `APPROVED`.

## Permissions

| Code | Use |
| --- | --- |
| `evidence:read` | List, detail, links, audit, review history |
| `evidence:write` | Create, patch, upload, submit, archive, links |
| `evidence:review` | Review queue, approve, reject |
| `evidence:download` | File download |

Checkpoint review still uses `checkpoints:review` only (no extra `evidence:read`).

## Policy Version gate (Slice 5.5C)

`assertPolicyVersionApprovalSatisfied` evaluates exact-version active
ControlPolicyVersion mappings when `requiresEvidence=true`:

- Control.requiresEvidence → Control-linked qualifying Evidence
- Checkpoint.evidenceRequired → Checkpoint-linked qualifying Evidence
- Independent obligations; empty required set → `EVIDENCE_GATE_NOT_CONFIGURED`
- Multi-target `FOR SHARE` locks; no public preview endpoint

## Explicitly deferred

- KPI Evidence satisfaction (still `501` via boolean `assertSatisfied(true)`)
- Control-level standalone gate API
- Frontend LIVE Evidence UI
- Reverse Evidence lookup APIs
- S3 / malware / RLS / production deployment

`storageKey` is never returned in API responses.
