# Architecture decisions

## AD-001 React frontend with preserved prototype reference

The production frontend is React/TypeScript with React Router, reusable components, domain service adapters and authentication/Company contexts. The approved vanilla artifact is preserved unchanged at `docs/prototype/GenBioCa-Compliance-Platform.html` and can be served at `/prototype/GenBioCa-Compliance-Platform.html` for comparison. Its CSS tokens, route names, navigation, terminology and workflow rules remain the migration baseline.

## AD-002 Same-origin API and token handling

The frontend and `/api/v1` share one origin. JWT access tokens are short-lived and memory-only. Rotating opaque refresh tokens are hashed in PostgreSQL and delivered only through a `Secure` (when configured), HTTP-only, `SameSite=Strict` cookie. Rotation tracks token families; reuse revokes the family. API mode never stores tokens or authoritative business data in local/session storage.

## AD-003 Company context is a verified claim

The access token carries one active Company UUID. Login chooses an active membership. Company switching validates `user_companies` and account/Company status, revokes the replaced refresh token and issues a new context. Protected resource requests revalidate that the claimed user, membership and Company remain active before tenant-scoped repositories run. Persistence uses “tenant”; frontend-facing DTOs use “Company.”

## AD-004 Shared master provider boundary

Shared catalogue/organisation reads use `SharedMasterProvider`. The local implementation uses PostgreSQL/Prisma. This keeps future external shared-master sources possible without allowing business services to query shared tables directly.

## AD-005 Milestone boundary

Auth, Company/membership/access, users, organisation masters,
frameworks/rules, KPI configurations/targets/actuals/approvals, Risk workflow,
refresh sessions, dashboard and audit writes are persisted and operational.
Policy, Policy Version, Control and Checkpoint persistence exists as the
Milestone 4 Slice 1 database foundation, but its routes remain truthful status
pages with no API or operational UI. Evidence, Gap, CAPA, Import, Task,
Notification and Report routes also remain truthful status pages and do not
create authoritative-looking browser-local records.

## AD-006 KPI target authority and traceability

`kpi_definitions` is catalogue data; `kpi_targets` is the authoritative active
target interface. `kpi_goals` remains read-only compatibility data. The
accepted ribbon remains **Policy → Framework → Rule → Evidence → Control → KPI
→ Target vs Actual → Risk**. KPI risk `MAJOR`/`MINOR` and enterprise risk
`LOW`/`MEDIUM`/`HIGH`/`CRITICAL` are separate dimensions.

## AD-007 Audit and evidence isolation

Active auth, user, organisation, KPI and Risk workflows write audit events. A
database trigger rejects audit UPDATE and DELETE. Future evidence services must
validate Company identity across evidence, linked record, reviewer and storage
metadata; files cannot be linked across Companies. Future audit query/export
must always use verified Company context.

## AD-008 File storage seam

`FileStorageProvider` defines put/get/delete. Local disk is the development
adapter. Unknown providers fail clearly and selecting recognised but
unimplemented S3 fails configuration closed. No bucket, SDK client or cloud
credential is configured. Malware scanning, signed URLs, encryption/key
policy, retention and object-level Company isolation remain future work.

## AD-013 Evidence metadata foundation (Milestone 5 Slice 1)

Evidence is tenant-owned metadata with lifecycle
`DRAFT | SUBMITTED | APPROVED | REJECTED | ARCHIVED`. Typed join tables link
Evidence to Control and Checkpoint (many-to-many); polymorphic entity-type
strings are rejected. Replacement creates a new Evidence row with
`supersedesEvidenceId` rather than a mutable file-version table. Review
decisions are append-only at the database. File columns are reserved but
unused; submit fails closed with `EVIDENCE_FILE_REQUIRED` until upload lands.
KPI/Policy Evidence gates remain unchanged fail-closed stubs in this slice.

## AD-014 Evidence local file storage (Milestone 5 Slice 2)

Evidence files use the local `FileStorageProvider` for development/UAT only.
Server-generated keys use `{tenantId}/evidence/{evidenceId}/{objectUuid}`.
Upload streams through busboy with a 10 MiB cap and a code-controlled type
allowlist; SHA-256 is computed from actual bytes and unique per tenant when
non-null. Downloads require `evidence:read` and `evidence:download` and are
attachment-only. S3, malware scanning, signed URLs and inline preview remain
deferred. KPI/Policy Evidence gates remain fail-closed stubs.

## AD-015 Evidence links immutable after submit (Milestone 5 Slice 3)

Evidence↔Control and Evidence↔Checkpoint links use the Slice 5.1 join tables
with soft `isActive` state and one unique row per tenant/evidence/target pair.
Link and unlink mutations are allowed only while Evidence is `DRAFT`. After
submission, the linked Control and Checkpoint context is part of the review
history and must not change silently; existing links remain readable for every
lifecycle. New and reactivated links require an `ACTIVE` Control or Checkpoint.
Re-link reactivates the same inactive row and preserves original
`createdById`/`createdAt`. History is carried by soft state plus Evidence-scoped
audit events (`EVIDENCE_CONTROL_LINKED` / `UNLINKED`,
`EVIDENCE_CHECKPOINT_LINKED` / `UNLINKED`). Linking never submits or approves
Evidence, never changes Control/Checkpoint lifecycle or reviews, and never
satisfies Policy/KPI/Checkpoint Evidence gates. Reverse Control/Checkpoint
Evidence list endpoints and frontend linking UI remain deferred.

## AD-016 Evidence approval and rejection (Milestone 5 Slice 4)

Only `SUBMITTED` Evidence may be approved or rejected. Review is atomic:
tenant-scoped Evidence `FOR UPDATE`, maker-checker checks, append-only
`evidence_review_decisions` insert, Evidence lifecycle update
(`reviewedById` / `reviewedAt`), and audit in one transaction. Self-review is
forbidden when the actor is the creator, uploader, or submitter; administrators
and wildcards do not bypass this rule. Rejection requires a reason (2–2000
characters); approval may include an optional comment stored on the decision
row. Free-text reasons/comments are excluded from audit metadata. Concurrent
reviews serialize on the Evidence row so exactly one terminal decision wins.
Rejected Evidence is not re-opened: correction uses a superseding DRAFT.
Approval does not satisfy Policy/KPI Evidence gates (deferred). Frontend review
UI and notifications remain unavailable.

## AD-017 Checkpoint Evidence gate (Milestone 5 Slice 5A+B)

A shared eligibility engine evaluates whether Evidence may satisfy an Evidence
gate. For Checkpoint reviews with `evidenceRequired=true`, evaluation runs
inside the existing review transaction after Control and Checkpoint row locks
and before the Review insert. Qualifying Evidence must be same-tenant,
`APPROVED`, actively linked to that Checkpoint, file-metadata complete
(`hasEvidenceFile`), with `issueDate` null or ≤ evaluation UTC date, `expiresAt`
null or ≥ evaluation UTC date, and not superseded by a successor in
`APPROVED` or `ARCHIVED`. DRAFT/SUBMITTED/REJECTED successors do not invalidate
prior Evidence. Object-storage existence is not checked.

When coverage is required, the gate selects one qualifying Evidence id with
deterministic ordering (`ORDER BY e.id`), `LIMIT 1`, and acquires
`SELECT … FOR SHARE OF e` on that Evidence row in the same statement as
eligibility evaluation. The share lock is held until the parent Checkpoint
review transaction commits or rolls back, so concurrent Evidence archive
(`FOR UPDATE` / lifecycle `UPDATE` on that row) waits and cannot invalidate the
selected Evidence before the Review and parent audit commit. Only one
Evidence row is locked; active links are not table-locked (and link mutation
is already unavailable while Evidence is `APPROVED`). No broad Evidence or
link-table locks and no object-storage I/O occur. Isolation remains the
default Prisma/PostgreSQL transaction level (not SERIALIZABLE).

The gate writes no audit; parent `CHECKPOINT_REVIEWED` audit occurs only after
success. Failure is HTTP 409 `EVIDENCE_REQUIRED` with safe reason
`EVIDENCE_COVERAGE_INCOMPLETE`. No extra permission beyond `checkpoints:review`.
KPI gates remain fail-closed `501 EVIDENCE_GATE_NOT_IMPLEMENTED` until a typed
KPI–Evidence relationship lands.

## AD-018 Policy Version Evidence gate (Milestone 5 Slice 5.5C)

Policy approval uses **`PolicyVersion.requiresEvidence`** only. When false,
approval is unchanged. When true, `EvidenceGateService.assertPolicyVersionApprovalSatisfied`
runs inside the existing approve transaction after Policy and Version locks and
before supersession/APPROVED writes.

**Mappings (M1):** Active `ControlPolicyVersion` rows may target **SUBMITTED**
or **APPROVED** versions only. Evaluation uses active mappings for the **exact**
version under approval (no previous-version, parent-Policy, or tenant-wide
fallback). Mapping **replacement** uses global lock order
**Policy → Policy Version → Control → CPV mutation** (deterministic Policy and
Version ID order). Policy **approval** uses
**Policy → Version → CPV/targets → Evidence**. Submit, reject, version edit and
framework replacement also use **Policy → Version** (join-lock parent Policy by
`versionId`, then lock Version). Lifecycle and mapping paths therefore serialize
on Policy without Version↔Policy AB–BA.

**Independent obligations (Decision D):**

- Each actively mapped non-ARCHIVED Control with `requiresEvidence=true` needs
  qualifying Control-linked Evidence.
- Each ACTIVE Checkpoint under those Controls with `evidenceRequired=true`
  needs qualifying Checkpoint-linked Evidence.
- Control-linked and Checkpoint-linked Evidence never substitute for each other.

**Empty configuration:** zero required Controls and zero required Checkpoints
with the flag true → HTTP 409 `EVIDENCE_REQUIRED` /
`EVIDENCE_GATE_NOT_CONFIGURED`. Incomplete coverage uses
`EVIDENCE_CONTROL_COVERAGE_INCOMPLETE`,
`EVIDENCE_CHECKPOINT_COVERAGE_INCOMPLETE`, or `EVIDENCE_COVERAGE_INCOMPLETE`.

Eligibility reuses Slice 5.5A rules (APPROVED, file metadata, UTC dates,
supersession, active exact-target links). Selected Evidence rows are locked
with `FOR SHARE` until parent commit. No object-storage I/O; no separate gate
audit; no new permission beyond `policies:approve`.

**CHECK migration (Option A):**
`policy_versions_submission_fields_consistent` no longer requires
`AND NOT requires_evidence` for APPROVED/SUPERSEDED/OBSOLETE. Other lifecycle
and self-approval invariants remain.

## AD-009 Errors, logging and environment

Zod validates environment and request inputs. Safe response envelopes hide stack traces and Prisma details. Pino emits structured logs with auth/cookie/password redaction. Helmet includes a React-compatible Content Security Policy: scripts and API connections are same-origin; Google font styles/fonts are explicitly allowed; objects and external framing are blocked. The legacy prototype is reference-only and receives an isolated compatibility CSP so its approved inline behavior remains available for visual comparison; it does not define the production CSP architecture.

## AD-010 Deployment

Docker Compose can run PostgreSQL and the app. Migrations and seeds are explicit
operator commands; application or container startup never applies them
automatically. This is development/reference infrastructure, not a
production-readiness claim.

## AD-011 CORS stays absent while the deployment is same-origin

No CORS middleware is installed, and this is a decision rather than an omission. Express serves the built frontend and `/api/v1` from one origin (AD-002), so browsers never issue cross-origin requests and any permissive `Access-Control-Allow-Origin` would only widen the attack surface. The refresh cookie depends on this: it is `SameSite=Strict` and scoped to `path=/api/v1/auth`, so a cross-origin frontend would silently fail to refresh rather than fail loudly.

Splitting the frontend onto its own origin therefore requires four coordinated changes, not one: an explicit origin allowlist with `credentials: true`, `SameSite=None; Secure` on the refresh cookie, a cookie path that still reaches the auth routes, and a CSP `connect-src` that names the API origin. Until all four are decided together, same-origin remains the supported topology.

## AD-012 Request throttling and proxy-aware client identity

Per-account lockout (five failures, fifteen minutes) stops repeated guesses against one account but does nothing about one source spraying a common password across many accounts, so `express-rate-limit` adds per-IP ceilings: strict on the credential-accepting routes (`/auth/login`, `/auth/tenant-context`), looser on `/auth/refresh` because the frontend refreshes on every load and token expiry, and a broad ceiling for the rest of `/api/v1`. Liveness and readiness probes are mounted ahead of the limiter so orchestrator polling cannot exhaust the budget. Refusals use the standard error envelope with `AUTH_RATE_LIMITED` or `RATE_LIMITED`.

Limits key on `req.ip`, which Express derives from `trust proxy`, so that setting is now `TRUST_PROXY` rather than a hardcoded hop count. A value larger than the real proxy chain lets clients forge `X-Forwarded-For` and mint a fresh bucket per request; a value smaller collapses every client behind the proxy onto one bucket. The default is `false` (direct exposure, as in Docker Compose), production rejects the permissive `true`, and production also rejects `RATE_LIMIT_DISABLED=true`, which exists only so the integration suite can sign in more often than a human would.
