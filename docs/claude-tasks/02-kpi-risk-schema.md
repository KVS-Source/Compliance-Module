# Task 02 — KPI and Risk Schema

Status: reviewed specification. Implement in vertical slices, one at a time.
Follow `/CONTRIBUTING.md`. Branch from `main` **after** `release/milestone-2` is
merged.

Source of truth for vocabularies: the client workbook (`27_Lookups`,
`14_KPI_Master`, `15_KPI_Config_Targets`, `16_KPI_Actuals_Entry`,
`18_Risk_Register`). Values below are transcribed from it — do not invent others.

**No real data.** The workbook contains real staff names. Seeds and tests use
anonymised values only (`User 001`, `Company 001`, `.test` emails).

---

## 1. Scope

In scope: KPI configuration, targets, actuals, calculation, approval, and
KPI-triggered risk with review and treatment.

Explicitly OUT of scope for this task — do not create these tables:
Policy, PolicyVersion, Control, Checkpoint, Rule, Evidence*, Gap, Capa,
Notification, Task, Upload*, Report*, **KpiMapping**.

`KpiMapping` (the Policy → Framework → Rule → Evidence → Control → KPI ribbon)
cannot be built yet: Policy, Rule, Control and Evidence Requirement do not exist.
It follows the policy/control and evidence domains.

Existing models to reuse, not duplicate: `Tenant`, `User`, `OrgDepartment`,
`OrgLocation`, `OrgUnit`, `Framework`, `FrameworkRule`, `KpiDefinition`,
`AuditEvent`.

`KpiGoal` is a legacy model. Do not convert, migrate, rename, drop, or otherwise
change its model, table, rows, seed behaviour, or read API in this task.
`KpiTarget` is the new target model and coexists with `KpiGoal`. A later task
will retire `KpiGoal`.

---

## 2. Enums (exact values from the workbook)

```prisma
enum KpiDirection {          // 14_KPI_Master column E
  HIGHER_IS_BETTER
  LOWER_IS_BETTER
  TARGET_EXACT
  INFORMATIONAL
}

enum KpiFrequency {          // 27_Lookups → Frequency
  DAILY
  WEEKLY
  MONTHLY
  QUARTERLY
  HALF_YEARLY
  ANNUAL
  CONTINUOUS
  PER_EVENT
  ONE_TIME
}

enum RagStatus { GREEN AMBER RED }

enum KpiRiskClass { MAJOR MINOR }

enum GeneralRiskLevel { LOW MEDIUM HIGH CRITICAL }

enum ApprovalDecision {
  APPROVED
  REJECTED
  RESUBMITTED
}

enum SubmissionStatus {
  DRAFT
  SUBMITTED
  PENDING_APPROVAL
  APPROVED
  REJECTED
}

enum RiskStatus {
  OPEN
  UNDER_REVIEW
  TREATED
  CLOSED
  ARCHIVED
}

enum RiskTreatmentStrategy { AVOID MITIGATE TRANSFER ACCEPT }
```

`KpiDefinition.direction`, `.frequency` and `.unit` are currently free-text
`String`. Migrate `direction` and `frequency` to these enums with a
non-destructive data migration. Match existing values case-insensitively after
trimming. The complete authoritative mapping is:

Direction:

- `Higher is Better` → `HIGHER_IS_BETTER`
- `Lower is Better` → `LOWER_IS_BETTER`
- `Target Exact` → `TARGET_EXACT`
- `Informational` → `INFORMATIONAL`

Frequency:

- `Daily` → `DAILY`
- `Weekly` → `WEEKLY`
- `Monthly` → `MONTHLY`
- `Quarterly` → `QUARTERLY`
- `Half-Yearly` → `HALF_YEARLY`
- `Annual` → `ANNUAL`
- `Continuous` → `CONTINUOUS`
- `Per-Event` → `PER_EVENT`
- `One-Time` → `ONE_TIME`

Canonical enum-form strings already present in the database map to themselves.
The migration must abort before changing columns if any trimmed,
case-insensitive value is unmapped. It must preserve every existing
`KpiDefinition` row and identifier.

Leave `unit` as a string — the workbook has heterogeneous units (%, Count,
Ratio, Hours, Days, Rating, `₹ Cr / $`).

**Currency:** because at least one selected KPI (F-001 Total Revenue) is monetary
with `₹ Cr / $`, add a nullable `currency String?` (ISO 4217) to
`KpiConfiguration`. Do not encode currency inside `unit`.

---

## 3. Models

All tenant-owned tables carry `tenantId`, `@@unique([tenantId, code])` where a
business code exists, `createdBy`/`updatedBy` (FK to User, explicit relation
names), `createdAt`/`updatedAt` as `@db.Timestamptz(6)`, and `deletedAt` for
soft delete. All monetary/measured values use `Decimal @db.Decimal(18,4)`.

### 3.1 KpiConfiguration

How a shared `KpiDefinition` operates inside one company.

- `tenantId`, `kpiDefinitionId`
- Scope dimensions (from `15_KPI_Config_Targets`): `orgUnitId?` (Business Unit),
  `orgLocationId?`, `productService String?`, `departmentId?`
- `ownerId` (User), `approverId?` (User)
- `enabled Boolean @default(true)`
- `currency String?`
- `reviewFrequency KpiFrequency`
- Threshold overrides, **nullable** — null means inherit company default:
  `amberThresholdPct Decimal? @db.Decimal(6,2)`
  `redThresholdPct   Decimal? @db.Decimal(6,2)`
- `requiresEvidence Boolean @default(false)` — the future evidence gate flag
- `requiresApproval Boolean @default(true)`
- `effectiveFrom`, `effectiveTo?`, `status RecordStatus`

Constraints: `effectiveTo IS NULL OR effectiveTo >= effectiveFrom`.
Unique: one active configuration per
`(tenantId, kpiDefinitionId, orgUnitId, orgLocationId, productService,
departmentId)` where `deletedAt IS NULL`.

Implement this as a raw PostgreSQL partial unique index using
`NULLS NOT DISTINCT`; a normal unique index is not sufficient for nullable scope
dimensions.

Company defaults for thresholds live on `Tenant`:
`defaultAmberThresholdPct` (default `0.00`) and `defaultRedThresholdPct`
(default `10.00`). Documented meaning in §4.

### 3.2 KpiTarget

- `tenantId`, `kpiConfigurationId`, `code`
- `period String` (e.g. `FY26-27 Q1`), `periodStart`, `periodEnd` (both dates)
- `targetValue Decimal @db.Decimal(18,4)`
- `minValue Decimal?`, `maxValue Decimal?` (for `TARGET_EXACT` tolerance bands)
- `approvalStatus SubmissionStatus`
- `submittedById?`, `submittedAt?` — nullable while draft and required by the
  service when transitioning to `SUBMITTED`
- `approvedById?`, `approvedAt?`, `rejectionReason?`
- `version Int @default(1)`, `supersededById?` (self-relation)
- `effectiveFrom`, `effectiveTo?`, `status RecordStatus`

`status` is the record lifecycle. `approvalStatus` is the workflow lifecycle.
They are separate and both are always present.

**An approved target is immutable.** A change creates a new version and sets
`supersededById` on the old one. Never update `targetValue` in place.

Unique: `(tenantId, kpiConfigurationId, period, version)`.
Check: `targetValue` present; `maxValue IS NULL OR minValue IS NULL OR maxValue >= minValue`.

Target workflow rules:

- `requiresApproval = false`: submit transitions the target directly to
  `APPROVED`.
- Self-approval is forbidden: the submitter must not be the approving actor.
  Return 403.
- If `KpiConfiguration.approverId` is set, only that user may approve.
- If no approver is set, any user in the tenant holding `kpi-target:approve` may
  approve.
- A rejected target may be patched. Re-submit returns the same version to
  `PENDING_APPROVAL`.
- An approved target may never be patched. Changes create a new version.

### 3.3 KpiActual

- `tenantId`, `code`, `kpiConfigurationId`, `kpiTargetId`
- `period`, `periodStart`, `periodEnd`
- **`targetValueSnapshot Decimal @db.Decimal(18,4)`** — copied from the approved
  target at submission time. Required. Historical actuals must always show the
  target in force when submitted, even if the target is later re-versioned.
- `actualValue Decimal @db.Decimal(18,4)`
- `variance Decimal`, `variancePercentage Decimal?` (null when target is zero)
- `ragStatus RagStatus?` (null for `INFORMATIONAL`)
- `targetMet Boolean`
- `approvalStatus SubmissionStatus`, `submittedById`, `submittedAt`,
  `approvedById?`, `approvedAt?`, `rejectionReason?`
- `evidenceStatus String?` — placeholder for the future gate; no FK yet
- `comments String?`

Unique: `(tenantId, kpiConfigurationId, period)` where `deletedAt IS NULL`.

**Supersedes the Slice B resolution that accepted a caller-supplied `code`.**
KPI actual codes are now server-generated, mirroring the Slice D risk-code
sequence exactly:

- `Tenant.nextKpiActualNumber` (default `1`) is the per-Company counter.
- Inside the submission transaction the server increments that counter, formats
  `ACT-001`, `ACT-002`, and so on (numeric part padded to at least three digits
  and expands after `ACT-999`), and stores the result. Codes may repeat across
  tenants.
- Callers must not supply `code`. Zod `.strict()` rejects it with
  `VALIDATION_ERROR` (HTTP 400).
- A duplicate active actual for the same `(tenant, configuration, period)`
  returns `KPI_ACTUAL_PERIOD_EXISTS` (HTTP 409).
- A collision on the generated code unique index is a server fault and returns
  `KPI_ACTUAL_CODE_COLLISION` (HTTP 500), never a client 409.
- Historical caller-supplied codes are not rewritten. The migration advances
  each Company's counter above any existing `ACT-<number>` code so the next
  allocation cannot collide.

### 3.4 KpiApproval

Full history — never collapse into a single status column.

- `tenantId`, `kpiActualId`, `reviewerId?`, `decision ApprovalDecision`,
  `comments?`, `decidedAt @db.Timestamptz(6)`
- `reviewerId` is null only for a system-generated automatic approval. Do not
  seed a fake system user; that would fabricate an actor in an append-only
  compliance record.
- `ApprovalDecision` contains only `APPROVED`, `REJECTED`, and `RESUBMITTED` in
  Slice C. `CLARIFICATION_REQUESTED` belongs to the later slice that defines its
  transition, endpoint, and tests.

`KpiApproval` is append-only event data, like `AuditEvent`, and is an explicit
exception to the generic mutable tenant-model fields at the start of §3. It has
no `updatedAt`, `updatedById`, `deletedAt`, or soft-delete lifecycle.
`decidedAt` is the event timestamp. PostgreSQL must reject updates and deletes.

Actual workflow rules:

- New actuals enter `PENDING_APPROVAL` when `requiresApproval=true`.
- When `requiresApproval=false`, submission runs the actual evidence gate and
  transitions directly to `APPROVED`. `approvedAt` equals the submission time,
  `approvedById` is null, and an automatic `APPROVED` history event is written
  with `reviewerId=null`.
- Self-approval is forbidden.
- If the configuration names an approver who did not submit the actual, only
  that user may approve or reject, and that user must hold
  `kpi-actual:approve`.
- If the configured approver submitted the actual, the configured-approver
  restriction falls back to any other user in the tenant holding
  `kpi-actual:approve`. The approval audit records that the fallback was used.
- If no approver is configured, any other user in the tenant holding
  `kpi-actual:approve` may approve or reject.
- `POST /api/v1/kpi-actuals/:id/resubmit` is status-only in Slice C. Only the
  original submitter holding `kpi-actual:write` may resubmit. It accepts
  optional comments and does not change measured values, calculation results,
  evidence status, target snapshot, or linked risk.
- Resubmission returns an actual to `PENDING_APPROVAL`, or runs the evidence
  gate and transitions directly to `APPROVED` when approval is no longer
  required. The latter writes both `RESUBMITTED` and automatic `APPROVED`
  history events.
- Correcting a measured value requires its own reviewed actual-versioning
  design. Slice C must not improvise in-place correction or versioning.
- Existing Slice B/D `SUBMITTED` rows are not backfilled or automatically
  approved. Approve and reject accept both legacy `SUBMITTED` and new
  `PENDING_APPROVAL` rows so every historical decision remains explicit.
- Approval, rejection, and resubmission use the configuration policy current at
  decision time. Snapshotting approver and evidence policy at submission is a
  possible future refinement, not part of Slice C.

### 3.5 Risk

Supports both KPI-triggered and manually raised enterprise risk.

- `tenantId`, `code`, `title`, `description?`, `category?`
- Source, explicit FKs (no polymorphic `sourceType`/`sourceId`):
  `kpiActualId?`, `kpiConfigurationId?`, `kpiTargetId?`
- `inherentLikelihood Int`, `inherentImpact Int`, `inherentScore Int`
- `residualLikelihood Int?`, `residualImpact Int?`, `residualScore Int?`
- **`kpiRiskClass KpiRiskClass?`** and **`generalLevel GeneralRiskLevel?`** —
  separate fields, never merged
- `ownerId?`, `treatmentStrategy RiskTreatmentStrategy?`, `reviewDate?`
- `status RiskStatus`, `closedAt?`, `closureReason?`

Slice D automatic KPI risks use these reviewed rules:

- The server allocates `code` from a transaction-safe, tenant-scoped sequence:
  `RSK-001`, `RSK-002`, and so on. The numeric part is padded to at least three
  digits and expands after `RSK-999`. Codes may repeat across tenants.
- The caller supplies no Risk fields through `POST /api/v1/kpi-actuals`.
  `title` and `description` are derived deterministically from authoritative
  linked records. The title is
  `KPI target missed: <kpiCode> <kpiName> (<period>)`; the description records
  that the risk was automatically raised and includes the target snapshot,
  actual value, variance and RAG result used to raise it.
- All three source FKs are nullable as a group. They must either all be null
  (for a future manually raised risk) or all be non-null and mutually
  consistent. An automatic KPI risk always sets `kpiActualId`,
  `kpiConfigurationId` and `kpiTargetId`.
- The calculated class supplies reviewed starting assessment values:
  `MAJOR` starts at likelihood `4` and impact `4`; `MINOR` starts at likelihood
  `3` and impact `3`. These are starting points for later reviewed
  reassessment, not a merger of KPI class and enterprise risk level.
- `inherentScore` is computed by the risk-creation service. `generalLevel` is
  independently derived from that score using the bands in §4.

Checks (raw SQL):

```sql
CHECK (inherent_likelihood BETWEEN 1 AND 5)
CHECK (inherent_impact     BETWEEN 1 AND 5)
CHECK (inherent_score = inherent_likelihood * inherent_impact)
CHECK (residual_likelihood IS NULL OR residual_likelihood BETWEEN 1 AND 5)
CHECK (residual_impact     IS NULL OR residual_impact     BETWEEN 1 AND 5)
CHECK (
  (kpi_actual_id IS NULL
    AND kpi_configuration_id IS NULL
    AND kpi_target_id IS NULL)
  OR
  (kpi_actual_id IS NOT NULL
    AND kpi_configuration_id IS NOT NULL
    AND kpi_target_id IS NOT NULL)
)
```

`inherentScore` = likelihood × impact, computed in the service (not a generated
column), independently enforced by the database equality check, and asserted in
tests.

**No duplicate active risk per actual** — partial unique index:

```sql
CREATE UNIQUE INDEX risks_one_active_per_kpi_actual
  ON risks (tenant_id, kpi_actual_id)
  WHERE kpi_actual_id IS NOT NULL
    AND status NOT IN ('CLOSED', 'ARCHIVED')
    AND deleted_at IS NULL;
```

### 3.6 RiskReview

`tenantId`, `riskId`, `reviewerId`, `comments`, `reviewedAt`,
`likelihoodAtReview?`, `impactAtReview?`

### 3.7 RiskTreatment

`tenantId`, `riskId`, `strategy`, `plan`, `ownerId`, `dueDate?`,
`completedAt?`, `status`, `effectivenessNotes?`

---

## 4. Calculation rules

One service, `KpiPerformanceService.calculate()`. No thresholds or direction
logic anywhere else in the codebase.

Input: `direction`, `targetValue`, `actualValue`, `minValue?`, `maxValue?`,
`amberThresholdPct`, `redThresholdPct`.

Returns: `{ targetMet, variance, variancePercentage, ragStatus,
recommendedRiskClass, riskRequired }`.

```
variance            = actual - target
variancePercentage  = target === 0 ? null : ((actual - target) / |target|) * 100
```

Target met:

- `HIGHER_IS_BETTER` → `actual >= target`
- `LOWER_IS_BETTER`  → `actual <= target`
- `TARGET_EXACT`     → within [`minValue`, `maxValue`] when both set, else `actual === target`
- `INFORMATIONAL`    → always `true`

Shortfall percentage (how far the wrong way, always non-negative):

- `HIGHER_IS_BETTER` → `max(0, (target - actual) / |target| * 100)`
- `LOWER_IS_BETTER`  → `max(0, (actual - target) / |target| * 100)`
- `TARGET_EXACT`     → distance outside the band ÷ |target| × 100
- Target zero → shortfall is `0` if met, else treat as `redThresholdPct + 1`
  (forces RED without dividing by zero). Document this.

RAG:

- met → `GREEN`
- shortfall ≤ `amberThresholdPct` → `GREEN`
- shortfall ≤ `redThresholdPct` → `AMBER`
- otherwise → `RED`

Defaults: amber `0%`, red `10%`. So: met = green; missed by ≤10% = amber;
missed by >10% = red.

Risk:

- `INFORMATIONAL` → `ragStatus = null`, `riskRequired = false`, always
- `GREEN` → `riskRequired = false`
- `AMBER` → `riskRequired = true`, `recommendedRiskClass = MINOR`
- `RED`   → `riskRequired = true`, `recommendedRiskClass = MAJOR`

When Slice D creates an automatic risk, the reviewed starting assessments and
enterprise levels are:

| KPI risk class | Likelihood | Impact | Inherent score | General level |
|---|---:|---:|---:|---|
| `MINOR` | 3 | 3 | 9 | `MEDIUM` |
| `MAJOR` | 4 | 4 | 16 | `HIGH` |

The complete `GeneralRiskLevel` score bands, including later reviewed
reassessments, are:

- score `>= 20` → `CRITICAL`
- score `15–19` → `HIGH`
- score `8–14` → `MEDIUM`
- score `< 8` → `LOW`

**Target met means no Risk row exists.** A missed target that evaluates to
AMBER or RED creates exactly one linked Major or Minor KPI risk in Slice D. A
miss within the configured amber tolerance evaluates GREEN and creates no risk.
With the default `amberThresholdPct = 0`, any miss is at least AMBER, so the
default behaviour is unchanged. Never create a risk record meaning "No Risk".

Slice D is create-only. It does not recalculate or update an existing linked
risk. Slice C leaves the linked risk untouched when an actual is approved,
rejected, or resubmitted. The miss was observed at submission; only Slice E may
close a risk through an explicit human decision. Slice C workflow audits record
the linked risk identifier and current status without emitting a risk lifecycle
event. Any later recalculation or update belongs to Slice E and must be an
explicit, audited operation.

---

## 5. Submission transaction

`POST /api/v1/kpi-actuals` runs in one `$transaction`:

1. Validate tenant access from JWT context (never from the body)
2. Load configuration; assert `enabled` and belongs to tenant
3. Load the **approved** target for the period; 404 `KPI_TARGET_NOT_FOUND` if absent
4. Assert no existing actual for `(tenant, configuration, period)`;
   409 `KPI_ACTUAL_PERIOD_EXISTS` if one is present
5. Snapshot `targetValueSnapshot` from that target
6. `KpiPerformanceService.calculate()`
7. Allocate the next tenant-scoped actual code (`ACT-001`…) from
   `Tenant.nextKpiActualNumber` and insert `KpiActual`. The request contains no
   `code` field.
8. If `riskRequired`: create the linked `Risk`, relying on the partial unique
   index to prevent duplicates. The server allocates the tenant-scoped risk
   code, derives title and description, sets all three KPI source FKs, applies
   the reviewed class starting likelihood/impact, computes `inherentScore`, and
   derives `generalLevel` from the score bands in §4. The request contains no
   Risk fields.
9. Write an `AuditEvent` (`KPI_ACTUAL_SUBMITTED`, and `RISK_CREATED` if raised)
10. Commit

Any failure rolls the whole thing back — no orphan actual without its risk, and
no risk without its actual.

Slice B implements steps 1–7 and 9–10 only and does not create risks. When Slice
D adds step 8, automatic risk creation applies only to new submissions. Existing
Slice B actuals are not backfilled: retroactively generating Risk Register
entries would create unreviewed compliance records. Any future reconciliation
must be an explicit, audited, human-triggered operation, never a migration.

Risk creation is an inseparable server-side consequence of an authorised KPI
actual submission. It is governed by `kpi-actual:write`; the submitter does not
also need `risk:write`.

Before Slice C implements actual rejection or resubmission, it must record an
explicit decision for any already-linked risk and define the corresponding
audit events. Slice D must not silently delete, close, archive, or rewrite a risk
when an actual changes workflow state.

Slice C resolves that decision as follows: approval, rejection and resubmission
never mutate the linked Risk. They write `KPI_ACTUAL_APPROVED`,
`KPI_ACTUAL_REJECTED`, or `KPI_ACTUAL_RESUBMITTED` audit events with the linked
risk ID and current status when a risk exists. No second risk is created and the
tenant risk sequence is not advanced.

---

## 6. Permissions

Seed and enforce via existing `permit()`:
`kpi-config:write`, `kpi-target:write`, `kpi-target:approve`,
`kpi-actual:write`, `kpi-actual:approve`, `risk:read`, `risk:write`,
`risk:treat`, `risk:close`.

Slice D exposes only tenant-scoped read routes:

- `GET /api/v1/risks`
- `GET /api/v1/risks/:id`

Both require `risk:read`. Slice D has no Risk create, update, delete, treatment
or close route. Automatic creation occurs only inside
`POST /api/v1/kpi-actuals` and requires only `kpi-actual:write`.
`risk:write` is reserved for a later explicit/manual risk workflow;
`risk:treat` and `risk:close` belong to Slice E.

Slice C adds `kpi-actual:approve` explicitly to `COMPANY_ADMIN` and excludes it
from `COMPANY_USER`. Approve and reject require `kpi-actual:approve`;
resubmission requires `kpi-actual:write`.

Exclude all from `COMPANY_USER` by default. For Slice A, add
`kpi-config:write`, `kpi-target:write`, and `kpi-target:approve` explicitly to
`COMPANY_ADMIN`, even though the current development/test seed also grants that
role the existing `*` wildcard.

The existing `COMPANY_ADMIN` wildcard is out of scope for Slice A. Do not remove
or expand it in this task. Record it under `docs/reviews/` as known technical
debt requiring a separate permission migration.

---

## 7. Evidence gate (stub only)

Evidence does not exist yet. The evidence gate applies to KPI **actual**
approval, not target approval.

- `KpiConfiguration.requiresEvidence` is created in Slice A for future use.
- Slice A does not enforce `requiresEvidence` anywhere.
- Target submission and approval must never return
  `EVIDENCE_GATE_NOT_IMPLEMENTED`.
- The `EvidenceGateService` seam and 501 behaviour belong to the later actual
  approval slice.
- Seeds set `requiresEvidence = false`.

Slice C implements `EvidenceGateService.assertSatisfied()`. It returns `true`
when `requiresEvidence=false` and throws
`EVIDENCE_GATE_NOT_IMPLEMENTED` with HTTP 501 when
`requiresEvidence=true`. Manual approval always invokes it. Automatic approval
also invokes it inside the submission or resubmission transaction; a 501 rolls
back the actual, risk, risk-code allocation, approval history, and audits.
Target submission and approval remain outside this gate.

---

## 8. Slices — implement one at a time, one branch each

- **A. Configuration + targets** — enums, `KpiConfiguration`, `KpiTarget`,
  tenant defaults, migrations, CRUD APIs, versioning, approval of targets
- **B. Actual submission** — `KpiActual`, `KpiPerformanceService`, the
  transaction (without risk), RAG computation
- **C. Approval workflow** — `KpiApproval`, approve/reject endpoints, evidence
  gate stub
- **D. Automatic risk creation** — `Risk`, tenant risk-code allocation,
  read-only risk API, partial unique index, CHECK constraints, wire the
  create-only step 8 of the transaction
- **E. Risk review and treatment** — `RiskReview`, `RiskTreatment`, endpoints

Each slice: Prisma models → migration → validators → service → repository →
routes → permissions → audit events → unit tests → integration tests →
tenant-isolation negative tests → local full suite → stop for review.

Slice A is backend-only. Keep `/kpi/configuration` as a labelled prototype,
update OpenAPI, and do not mark the route migrated.

---

## 9. Tests (required per slice)

Calculation service, table-driven across all four directions:

- higher-is-better met / missed by 5% (amber) / missed by 20% (red)
- lower-is-better met / missed
- target-exact inside band / outside band
- informational → null RAG, never risk
- target zero → no divide-by-zero, documented behaviour
- custom per-config thresholds override tenant defaults

Workflow:

- submission without an approved target → 404
- duplicate actual for the same period → 409 `KPI_ACTUAL_PERIOD_EXISTS`
- target met → no Risk row created
- target missed (amber) → one MINOR risk starting at 3 × 3 = 9 / MEDIUM;
  (red) → one MAJOR risk starting at 4 × 4 = 16 / HIGH
- generated actual codes are sequential within a tenant, begin at `ACT-001`,
  and may repeat across tenants; concurrent submissions never collide
- generated risk codes are sequential within a tenant, begin at `RSK-001`, and
  may repeat across tenants
- the actual-submission body rejects caller-supplied `code` and risk fields
- duplicate actual submission returns 409 and leaves exactly one linked risk;
  a direct second active risk for the same actual is rejected by the partial
  unique index
- a forced actual-code unique-index collision returns 500
  `KPI_ACTUAL_CODE_COLLISION`, not a period 409
- transaction rollback leaves no partial writes
- approved target cannot be mutated; a change creates a new version
- `targetValueSnapshot` survives re-versioning of the target

Isolation (mandatory):

- Company 001 cannot read, update or approve Company 002 KPI configs, targets,
  actuals or risks
- codes may repeat across tenants
- risk raised in Company 001 is invisible to Company 002
- the read-only Risk API returns only the authenticated tenant's rows and
  cross-tenant risk detail lookup returns 404

Constraints:

- likelihood/impact outside 1–5 rejected at the database level
- inherent score unequal to likelihood × impact is rejected at the database
  level
- partially populated KPI source FKs are rejected; automatic risk source FKs
  must identify one coherent tenant/configuration/target/actual chain
- audit events written for submission, approval, and risk creation

Slice A tests cover only the applicable configuration and target behaviour.
Calculation, actual, risk, and evidence-gate tests belong to their later slices.

---

## 10. Out of bounds

Do not: touch `main`, push, merge or deploy; reset any database; rewrite existing
migrations; create the out-of-scope tables in §1; use polymorphic
`sourceType`/`sourceId`; put threshold or direction logic outside
`KpiPerformanceService`; use real names from the workbook.
