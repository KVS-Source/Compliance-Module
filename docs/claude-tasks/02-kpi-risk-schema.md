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
  CLARIFICATION_REQUESTED
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

Slice B accepts a caller-supplied, tenant-unique `code`, consistent with the
other entities. A later slice may replace this with automatic code generation
because actuals are periodic and high-volume, but no numbering policy is
invented in Slice B.

### 3.4 KpiApproval

Full history — never collapse into a single status column.

- `tenantId`, `kpiActualId`, `reviewerId`, `decision ApprovalDecision`,
  `comments?`, `decidedAt`

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

Checks (raw SQL):

```sql
CHECK (inherent_likelihood BETWEEN 1 AND 5)
CHECK (inherent_impact     BETWEEN 1 AND 5)
CHECK (residual_likelihood IS NULL OR residual_likelihood BETWEEN 1 AND 5)
CHECK (residual_impact     IS NULL OR residual_impact     BETWEEN 1 AND 5)
```

`inherentScore` = likelihood × impact, computed in the service (not a generated
column) and asserted in tests.

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

**Target met means no Risk row exists.** A missed target that evaluates to
AMBER or RED creates or updates exactly one linked Major or Minor KPI risk. A
miss within the configured amber tolerance evaluates GREEN and creates no risk.
With the default `amberThresholdPct = 0`, any miss is at least AMBER, so the
default behaviour is unchanged. Never create a risk record meaning "No Risk".

---

## 5. Submission transaction

`POST /api/v1/kpi-actuals` runs in one `$transaction`:

1. Validate tenant access from JWT context (never from the body)
2. Load configuration; assert `enabled` and belongs to tenant
3. Load the **approved** target for the period; 404 `KPI_TARGET_NOT_FOUND` if absent
4. Assert no existing actual for `(tenant, configuration, period)`
5. Snapshot `targetValueSnapshot` from that target
6. `KpiPerformanceService.calculate()`
7. Insert `KpiActual`
8. If `riskRequired`: create or update the linked `Risk`, relying on the partial
   unique index to prevent duplicates. Set `kpiRiskClass` from the recommendation;
   leave `generalLevel` null unless separately assessed
9. Write an `AuditEvent` (`KPI_ACTUAL_SUBMITTED`, and `RISK_CREATED` if raised)
10. Commit

Any failure rolls the whole thing back — no orphan actual without its risk, and
no risk without its actual.

Slice B implements steps 1–7 and 9–10 only and does not create risks. When Slice
D adds step 8, automatic risk creation applies only to new submissions. Existing
Slice B actuals are not backfilled: retroactively generating Risk Register
entries would create unreviewed compliance records. Any future reconciliation
must be an explicit, audited, human-triggered operation, never a migration.

---

## 6. Permissions

Seed and enforce via existing `permit()`:
`kpi-config:write`, `kpi-target:write`, `kpi-target:approve`,
`kpi-actual:write`, `kpi-actual:approve`, `risk:read`, `risk:write`,
`risk:treat`, `risk:close`.

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

---

## 8. Slices — implement one at a time, one branch each

- **A. Configuration + targets** — enums, `KpiConfiguration`, `KpiTarget`,
  tenant defaults, migrations, CRUD APIs, versioning, approval of targets
- **B. Actual submission** — `KpiActual`, `KpiPerformanceService`, the
  transaction (without risk), RAG computation
- **C. Approval workflow** — `KpiApproval`, approve/reject endpoints, evidence
  gate stub
- **D. Automatic risk creation** — `Risk`, partial unique index, CHECK
  constraints, wire step 8 of the transaction
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
- duplicate actual for the same period → 409
- target met → no Risk row created
- target missed (amber) → one MINOR risk; (red) → one MAJOR risk
- second submission cannot create a second active risk (partial index holds)
- transaction rollback leaves no partial writes
- approved target cannot be mutated; a change creates a new version
- `targetValueSnapshot` survives re-versioning of the target

Isolation (mandatory):

- Company 001 cannot read, update or approve Company 002 KPI configs, targets,
  actuals or risks
- codes may repeat across tenants
- risk raised in Company 001 is invisible to Company 002

Constraints:

- likelihood/impact outside 1–5 rejected at the database level
- audit events written for submission, approval, and risk creation

Slice A tests cover only the applicable configuration and target behaviour.
Calculation, actual, risk, and evidence-gate tests belong to their later slices.

---

## 10. Out of bounds

Do not: touch `main`, push, merge or deploy; reset any database; rewrite existing
migrations; create the out-of-scope tables in §1; use polymorphic
`sourceType`/`sourceId`; put threshold or direction logic outside
`KpiPerformanceService`; use real names from the workbook.
