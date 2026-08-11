# Evidence API Postman guide (Milestone 5)

Authoritative HTTP walkthrough for Milestone 5 Evidence lifecycle, typed
links, and Evidence gates. Synthetic `.test` identities only.

## Authoritative assets

| Path | Role |
| --- | --- |
| `postman/Evidence-API.postman_collection.json` | Authoritative collection |
| `postman/Evidence-API.postman_environment.json` | Local environment template |

Do **not** use `postman/GenBioCa-GRC.postman_collection.json` for Evidence. Its
legacy `/evidence/upload` path is not the active API. Active flow:

1. `POST /evidence`
2. `POST /evidence/:id/file` (multipart field `file`)

## Import and base URL

1. Import the collection and environment from `postman/`.
2. Select **GenBioCa Evidence API (local)**.
3. Set `baseUrl`:
   - Direct Node: `http://localhost:4000/api/v1`
   - Docker Compose: `http://localhost:8000/api/v1`
4. Set local-only secrets (never commit):
   - `adminPassword` for `admin001@example.test`
   - `reviewerPassword` for `user001@example.test`

Generated IDs and tokens start empty in the template. A1 clears generated
scenario IDs on each writer login so reruns replace them predictably. Manual
KPI Actual IDs are retained across reruns until you clear them.

## Synthetic users and maker-checker

| Variable | Default | Role |
| --- | --- | --- |
| `adminEmail` | `admin001@example.test` | Writer: create, upload, submit, link |
| `reviewerEmail` | `user001@example.test` | Independent reviewer: approve/reject |

The same user who creates/submits Evidence cannot approve or reject it.

### Local permission grants (not seed changes)

Grant only in the local database for samples:

- `evidence:review` — required for approve/reject and review queue
- `policies:approve` — Policy Version approve steps
- `kpi-actual:approve` — KPI Actual approve steps

Re-login the reviewer after granting so the JWT includes the permission.

## Multipart fixture

Upload steps use:

`frontend/tests/fixtures/sample-evidence.txt`

In Postman, either:

- set the collection working directory so `{{evidenceFixturePath}}` resolves, or
- manually choose that file for each `file` form field.

Do not upload real employee, client, or production documents.

## Purpose-specific Evidence ID variables

| Variable | Owner folder | Purpose |
| --- | --- | --- |
| `approvedEvidenceId` | B | File-backed path: metadata, upload, submit, approve, **download**, audit, review-decisions |
| `draftEvidenceId` | E → F | DRAFT link/unlink samples and Checkpoint gate success path |
| `rejectedEvidenceId` | C | Separate reject + review-decision history |
| `archivableEvidenceId` | D | Separate DRAFT archive path |
| `policyCoverageEvidenceId` | G | Qualifying Evidence for Policy gate success |
| `ineligibleKpiEvidenceId` | H | DRAFT / no-file Evidence for KPI ineligible-link failure |
| `kpiSuccessEvidenceId` | H | Qualifying Evidence for KPI success (linked while DRAFT) |

**Safety rules**

- Later requests never overwrite `approvedEvidenceId` with a second DRAFT.
- Download always uses `approvedEvidenceId` (known file-backed record).
- Scripts assign IDs only after a successful response and validate the ID string.
- Failed responses do not write `undefined` into environment variables.
- Rejection and approval use separate Evidence records.

## Folder order

Run folders **A → H** in order when demonstrating the full Milestone 5 surface.

| Folder | Purpose | Expected |
| --- | --- | --- |
| A | Admin + reviewer login; clear generated IDs | `200` |
| B | Approved file-backed lifecycle, download, decisions, audit | `201`/`200` |
| C | Reject path on separate Evidence | `201`/`200` |
| D | Archive separate DRAFT Evidence | `201`/`200` |
| E | Control/Checkpoint link, unlink, relink; post-APPROVED mutation fails | `200`/`201`; mutation `4xx` not `501` |
| F | Checkpoint gate failure then success | `409` then `200`/`201` |
| G | Policy gate failure then configured success | `409` then `200` |
| H | KPI no-link, ineligible-link, success (**manual Actual IDs**) | `409` / `409` / `200` |

### B — Approved file-backed flow

1. Create → `approvedEvidenceId` (DRAFT, `hasFile: false`)
2. Metadata PATCH while DRAFT
3. Upload multipart → `hasFile: true`; no `storageKey` / `contentSha256`
4. Detail, submit, review queue, approve (reviewer)
5. Download binary (does **not** parse JSON)
6. Review decisions (APPROVED present)
7. Audit events (no storage secrets)

### C — Reject

Separate Evidence: create → upload → submit → reject with `reason` → review
decisions show REJECTED.

### D — Archive

Separate DRAFT Evidence → `POST .../archive` → ARCHIVED.

### E — Typed links (DRAFT-first)

1. Create `draftEvidenceId` (does not clobber `approvedEvidenceId`)
2. Create Control and Checkpoint (`evidenceRequired: true`)
3. Link Control (path-only, empty body) → list → unlink → list → relink
4. Link Checkpoint → unlink → relink (retained for folder F)
5. Mutation on APPROVED Evidence fails (`409`/`400`/`422`, never `501`)

No `tenantId` in bodies. No polymorphic target payload.

### F — Checkpoint gate

Lifecycle-valid sequence:

1. Upload + link already done for `draftEvidenceId` / `gateCheckpointId`
2. Review while Evidence not APPROVED → **409** `EVIDENCE_REQUIRED` /
   `details.reason = EVIDENCE_COVERAGE_INCOMPLETE`
3. Submit + approve Evidence (reviewer)
4. Review succeeds (different `reviewPeriod`)

### G — Policy gate

1. Create Policy `requiresEvidence: true` → submit version
2. Approve fails → **409** `EVIDENCE_REQUIRED` with a supported reason
   (`EVIDENCE_GATE_NOT_CONFIGURED` when no required targets are mapped)
3. Create Control with `requiresEvidence: true` and
   `policyVersionIds: [policyVersionId]`
4. Create `policyCoverageEvidenceId`, link Control while DRAFT, upload, submit,
   approve
5. Policy Version approve succeeds on the **same** `policyVersionId`

Reviewer must hold `policies:approve`.

### H — KPI gate (manual prerequisites)

**Manual** environment values (empty in the template):

| Variable | Requirement |
| --- | --- |
| `kpiNoLinkActualId` | PENDING/SUBMITTED Actual; config `requiresEvidence=true`; **no** active Evidence links |
| `kpiIneligibleActualId` | Separate Actual; config `requiresEvidence=true` |
| `kpiSuccessActualId` | Separate Actual; config `requiresEvidence=true`; same exact reporting period as the linked target |

H0 optionally lists Actuals and fills empty slots only. Prefer three distinct
Actuals so failure scenarios do not poison success.

| Step | Assertion |
| --- | --- |
| H1 no-link | 409 / `EVIDENCE_KPI_LINK_REQUIRED` |
| H2–H5 ineligible | Link DRAFT Evidence (no file) → 409 / `EVIDENCE_KPI_COVERAGE_INCOMPLETE`; link remains |
| H6–H14 success | Link while DRAFT → reverse-list → unlink/relink → submit/approve Evidence → approve Actual |
| H14 | Actual `approvalStatus=APPROVED` and exact `kpiSuccessActualId` |

Reviewer needs `kpi-actual:approve`. Gate failures must not be expected as
`501`. Risk side-effects are covered by backend integration tests; this
collection does not mutate production Risk rules.

## Assertions

JSON requests assert, where applicable:

- exact HTTP status
- Content-Type before `pm.response.json()`
- success/error envelope
- ID present before environment write
- lifecycle / gate reason
- absence of `storageKey` and `contentSha256`

Download asserts non-empty binary/file body and does not parse as JSON.

## Rerun behaviour

- A1 replaces tokens and clears generated Evidence/Control/Policy IDs
- Manual KPI Actual IDs are kept until you clear them
- Each create uses `runSuffix` for unique titles
- No destructive database cleanup requests
- Records created remain in the local database (retained-record behaviour)

## Accepted local/UAT limitations

- KPI Actual fixtures are **manual** when seed data has no suitable
  `requiresEvidence` Actuals
- Reviewer permissions are not granted by the collection
- Multipart file selection may require Postman working-directory setup
- Newman is optional and not installed by this repository
- Playwright suites remain mocked browser flows; this collection hits the real
  local HTTP API

## Response safety

Responses must not expose `storageKey`, raw hashes, refresh tokens, or
filesystem paths. Evidence gates return HTTP **409** `EVIDENCE_REQUIRED`, never
**501**.

## Related

- `docs/evidence-walkthrough-and-release-readiness.md` — sample and release readiness
- `postman/Checkpoint-API.postman_collection.json` — Checkpoint-only drills
- `postman/Policy-API.postman_collection.json` — Policy-only drills
- `postman/Milestone-4-E2E.postman_collection.json` — Policy → Control → Checkpoint
