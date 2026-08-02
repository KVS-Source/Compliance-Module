# Milestone 5 Evidence demo and release readiness (DRAFT)

Baseline: Milestone 5 Slice 5.7 hardening. This guide is for human review before
production promotion. Follow links in order; do not skip status vocabulary or
known limitations.

## 1. Read first (DRAFT authority order)

1. [Current status and V1 scope](./status/current-status-and-v1-scope.md)
2. [Known limitations](./known-limitations.md)
3. [API endpoint inventory](./api_endpoints.md)
4. [Security baseline](./security/security-baseline.md)
5. [Coverage matrix](./testing/coverage-matrix.md)

## 2. What Milestone 5 delivers

- Evidence metadata CRUD with server-allocated `EVD-*` codes
- Local file upload/download/submit (10 MiB, allowlisted types)
- DRAFT-only Control/Checkpoint/KpiActual link APIs
- Evidence review queue with maker-checker approve/reject
- React Evidence Library, Create, Detail, Review, and link panels (Slices 5.6A/B)
- Checkpoint Evidence gate (409 `EVIDENCE_REQUIRED`)
- Policy Version Evidence gate (409 with configured reasons)
- KPI actual Evidence gate (409 `EVIDENCE_KPI_LINK_REQUIRED` / coverage reasons)

Evidence gates return HTTP **409**, not **501**.

## 3. Automated verification (local)

From repository root:

```bash
npm run verify:static
npm run test:unit
npm run test:integration
npm run test:e2e
```

Backend integration uses isolated PostgreSQL with all **14** migrations.
Playwright suites use mocked browser APIs only.

## 4. Postman demonstration

Import and run in order:

1. `postman/Evidence-API.postman_collection.json` (authoritative Milestone 5)
2. `postman/Evidence-API.postman_environment.json`

See [Evidence API Postman guide](./postman/evidence-api-guide.md) for:

- purpose-specific Evidence IDs (`approvedEvidenceId`, `draftEvidenceId`,
  `rejectedEvidenceId`, `archivableEvidenceId`, KPI/Policy coverage IDs)
- DRAFT-link-first lifecycle and maker-checker separation
- Policy / Checkpoint / KPI gate failure and success sequences
- manual KPI Actual prerequisites (`kpiNoLinkActualId`,
  `kpiIneligibleActualId`, `kpiSuccessActualId`)
- rerun behaviour and retained local records

For Policy → Control → Checkpoint → Review, use
`postman/Milestone-4-E2E.postman_collection.json`.

**Do not** use legacy `GenBioCa-GRC.postman_collection.json` Evidence upload;
active API is `POST /evidence` then `POST /evidence/:id/file`.

Multipart fixture: `frontend/tests/fixtures/sample-evidence.txt`

## 5. Human real-stack walkthrough (required)

Automated Playwright is not browser-to-PostgreSQL E2E. Before release candidate
sign-off, manually verify:

1. Login and Company selection
2. Evidence Library list and create with file upload
3. Submit and approve Evidence (separate reviewer identity)
4. Link Evidence to Control/Checkpoint while DRAFT
5. Checkpoint with `evidenceRequired=true` — Review blocked until qualifying
   approved link exists (409 in API; banner in UI)
6. Policy Version with `requiresEvidence=true` — approve blocked with 409
7. KPI actual with `requiresEvidence=true` — approval blocked with 409

Use pgAdmin read-only SQL from existing Milestone 4 guides where helpful.

## 6. Release blockers (unchanged)

See [Known limitations](./known-limitations.md) production blockers:

- Wildcard `COMPANY_ADMIN` permission
- No PostgreSQL RLS
- No production AWS/networking/observability
- GitHub branch protection evidence incomplete
- No automated real-stack browser suite

## 7. Explicitly out of scope

Malware scanning, S3 object storage, inline preview, reverse Control/Checkpoint
Evidence list APIs, notifications, Gap/CAPA/Import/Tasks/Reports, GenRAC live
sync, and seed changes for demo convenience.

## 8. Security checks (document pre-existing)

When CI or local tooling is available:

- `gitleaks` (workflow uses `ghcr.io/gitleaks/gitleaks:v8.30.1`)
- `semgrep` (workflow uses `semgrep/semgrep`)
- `npm audit` in `backend/` and `frontend/` (report only; no dependency upgrades
  in this slice)

Record any findings as pre-existing unless a failing test proves a new defect.
