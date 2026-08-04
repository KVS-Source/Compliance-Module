# Known limitations

These limitations remain through Milestone 5 Slice 5.7. They must not be hidden
by UAT language or status-page presentation.

## Production release limitations

1. Legacy development/UAT data may still contain `COMPANY_ADMIN` with wildcard
   permission `"*"`. Production token issuance ignores wildcard permission,
   the production initializer uses five explicit roles, and readiness refuses
   any active wildcard assignment. Existing assignments must be replaced before
   production readiness can pass.
2. PostgreSQL RLS is not implemented. Tenant isolation currently depends on
   application context/predicates plus database FKs, constraints and triggers.
3. There is no automated browser-to-PostgreSQL E2E suite. Playwright intercepts
   APIs; human real-stack verification remains required.
4. A production Compose fallback and HTTPS reverse-proxy configuration exist,
   but the actual server, DNS, certificate, secret manager, log destination,
   alerting and host/disk encryption still require human infrastructure inputs.
5. The local backup/restore drill proves mechanics against the disposable
   production-style workbook load; it is not a production RPO/RTO,
   infrastructure-failure or load/scale result.
6. The default branch is verified as `main`, but its protection/ruleset,
   required-review, required-check, conversation-resolution,
   force-push/deletion and administrator-bypass controls still require
   independent GitHub evidence before Milestone 0 may merge.

## Product limitations

- Policy, Control and Checkpoint REST APIs are operational. React Policy
  Register/detail (Slice 5), React Control Register/detail (Slice 6) and React
  Checkpoint Register/detail (Slice 7), Gap/CAPA registers and details,
  Import Centre (browser XLSX/CSV preview+commit), Import History/detail,
  Audit Trail, Operational Registers UI, and GenRAC integration status
  (Not configured until credentials exist) are operational. Evidence metadata,
  local file upload/download/submit, DRAFT-only link APIs, approve/reject review,
  React Evidence routes (Library, Create, Detail, Review, link panels), and
  Evidence gates for Checkpoint, Policy Version and KPI actual approval are
  operational (Milestone 5). Tasks, Notifications, Reports, and tenant/settings
  polish remain deferred and hidden from production navigation. Same-period
  Checkpoint Review correction remains unsupported. Live GenRAC REST/database
  sync remains unavailable until the client provides approved access; the CSV
  adapter path is platform-ready under `LOCAL_UPLOAD_DIR/.genrac`.
- Policy Version obsoletion UI/endpoint and Policy `INACTIVE` transitions remain
  deferred. Policy, Control and Checkpoint register filters are React state only
  (no URL query sync). Control Checkpoint panels keep counts and, when
  `checkpoints:read` is present, an Open Checkpoints link to
  `/compliance/checkpoints` without controlId query or `location.state`.
- Checkpoint reviews with `evidenceRequired=true` require qualifying APPROVED
  Evidence linked to that Checkpoint (409 `EVIDENCE_REQUIRED` /
  `EVIDENCE_COVERAGE_INCOMPLETE`). Policy approval with `requiresEvidence=true`
  evaluates exact-version Control/Checkpoint Evidence coverage (409 with
  configured reasons; empty configuration →
  `EVIDENCE_GATE_NOT_CONFIGURED`). KPI actual approval with
  `requiresEvidence=true` requires at least one active qualifying
  Evidence↔KpiActual link (409 `EVIDENCE_REQUIRED` with
  `EVIDENCE_KPI_LINK_REQUIRED` or `EVIDENCE_KPI_COVERAGE_INCOMPLETE`). KPI
  actual Evidence attachment UI is available on the approval page (Slice 5.6).
  Configurations cannot combine `requiresEvidence=true` with
  `requiresApproval=false`. There is no approval override that skips those
  gates. Evidence file upload/download works for local storage only. Policy
  content/purpose/scope render as plain text only. Evidence links are mutable
  only while DRAFT. Evidence review is limited to SUBMITTED rows with
  creator/uploader/submitter self-review blocked.
- Playwright Policy, Control, Checkpoint and Evidence suites use mocked HTTP
  only. Backend PostgreSQL integration tests remain the database authority.
- Checkpoint reviews are append-only and unique per Checkpoint/review period. A
  mistaken review cannot currently be edited, deleted or replaced for that
  period; a formal correction/supersession mechanism is deferred.
- An `INACTIVE` Control may still retain an `ACTIVE` Checkpoint. Reciprocal
  enforcement covers only `ARCHIVED` Control versus `ACTIVE` Checkpoint; the
  database does not automatically deactivate or reactivate children or parents.
- GenRAC has no live connection and awaits client access and interface review.
- `kpi_goals` remains legacy compatibility data. `kpi_targets` is authoritative.
- A non-blocking frontend bundle-size warning remains.

## Storage and operations

- `FILE_STORAGE_DRIVER=local` is the approved deadline fallback, not production
  object storage. Production Compose mounts the private `production_evidence`
  volume; host/disk encryption, restricted access and the combined encrypted
  database-plus-Evidence backup procedure are mandatory compensating controls.
- S3 is recognised but unimplemented and is rejected during configuration.
- Evidence upload max is 10 MiB with a code-controlled type allowlist. Abrupt
  process termination may leave temporary files under `.tmp` (no periodic
  orphan scrubber in Slice 5.2).
- Malware scanning, signed download URLs, inline preview, retention enforcement,
  encryption key policy and cloud object-level tenant controls are not
  implemented.
- pgAdmin is administrative tooling only; Prisma migrations remain the schema
  authority.
- `prisma migrate diff` reports pre-existing name-only differences for several
  KPI/Risk foreign keys and indexes because the reviewed SQL names differ from
  Prisma's generated defaults. `prisma migrate status` is up to date; Milestone 4
  and Milestone 5 catalogues are reconciled in integration tests; no existing
  migration is rewritten to rename applied objects.

## Governance and CI supply chain

PR #19 was merged with zero checks and remains a recorded governance exception.
The current workflow defines five checks, but a workflow file alone does not
prove branch protection. The default branch has been independently verified as
`main`; all protection/ruleset controls remain pending. The authoritative
evidence status is
[governance-ci-hardening.md](./reviews/governance-ci-hardening.md).

Current mutable references:

- `actions/checkout@v6`;
- `actions/setup-node@v6`;
- `ghcr.io/gitleaks/gitleaks:v8.30.1`;
- unqualified `semgrep/semgrep`.

Mutable tags can move to different code without a repository commit. Pinning
actions and containers by immutable digest/SHA should be a separate focused CI
supply-chain hardening task; Milestone 0 does not mix that dependency work into
the re-baseline.
