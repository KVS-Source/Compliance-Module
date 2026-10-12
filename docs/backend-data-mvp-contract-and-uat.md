# Backend/data MVP contract and GenBioCa UAT load

Contract freeze: **2 August 2026**  
Base path: `/api/v1`  
Code authority: the `*Dto` functions and route validators under
`backend/src/modules/`

This page freezes the additive backend contract delivered on
`feature/deadline-backend-data`. It covers Gaps, CAPAs, operational registers,
workbook-import reads and CLI reports, CSV exports, and the extended dashboard
summary. Existing Policy, Control, Checkpoint, KPI, Risk and Evidence contracts
remain additive and unchanged.

## Shared HTTP rules

- Business routes require a bearer token and an active Company context.
- Company scope is always `req.auth.tenantId`; no write DTO accepts
  `companyId` or `tenantId`.
- JSON success responses are `{ "success": true, "data": T }`. Paginated
  responses also include `meta: { page, pageSize, total, totalPages }`.
- JSON errors are
  `{ "success": false, "error": { "code", "message", "details"? } }`.
- UUIDs are strings. Date-only values are `YYYY-MM-DD`; timestamps are ISO-8601
  strings. Nullable fields are returned as `null`, not omitted, unless a type
  below explicitly marks a field optional.
- List defaults are `page=1` and `pageSize=20`; `pageSize` is capped at 100.
- Related Company records are validated server-side. A cross-Company reference
  is rejected without disclosing the foreign record.

Common nested DTOs:

```ts
type PersonSummary = { id: string; code: string; name: string };
type DepartmentSummary = { id: string; code: string; name: string };
type FrameworkSummary = {
  id: string;
  code: string;
  name: string;
  version: string;
};
type EvidenceLinkSummary = {
  linkId: string;
  id: string;
  code: string;
  title: string;
  lifecycleStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "ARCHIVED";
  file: { available: boolean; sourceReference: string | null };
  linkReason: string | null;
  linkedAt: string;
};
```

`file.available` is true only when the platform has a storage key. A workbook
path is retained as `sourceReference` and never presented as a held file.

## Gaps

Permissions: `gaps:read`, `gaps:write`, and the separate `gaps:close` authority.

Endpoints:

| Method   | Path                                | Result                                        |
| -------- | ----------------------------------- | --------------------------------------------- |
| `GET`    | `/gaps`                             | Paginated `GapDto[]`                          |
| `GET`    | `/gaps/:gapId`                      | `GapDto`                                      |
| `POST`   | `/gaps`                             | Creates `OPEN`; server allocates `GAP-nnn`    |
| `PATCH`  | `/gaps/:gapId`                      | Updates register fields/status except closure |
| `PATCH`  | `/gaps/:gapId/owner`                | Assigns or clears owner                       |
| `POST`   | `/gaps/:gapId/close`                | Closes with Evidence and CAPA gates           |
| `POST`   | `/gaps/:gapId/reopen`               | Reopens `CLOSED` to `IN_PROGRESS`             |
| `POST`   | `/gaps/:gapId/evidence`             | Adds/reactivates an Evidence link             |
| `DELETE` | `/gaps/:gapId/evidence/:evidenceId` | Soft-unlinks Evidence                         |

```ts
type GapSeverity = "CRITICAL" | "MAJOR" | "MINOR" | "OBSERVATION" | "OFI";
type GapStatus = "OPEN" | "IN_PROGRESS" | "CLOSED" | "CANCELLED";

type GapDto = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  severity: GapSeverity;
  status: GapStatus;
  source: string | null;
  clauseRef: string | null;
  recommendedAction: string | null;
  owner: PersonSummary | null;
  sourceOwnerRef: string | null;
  department: DepartmentSummary | null;
  framework: FrameworkSummary | null;
  frameworkRule: { id: string; code: string; title: string } | null;
  control: { id: string; code: string; title: string } | null;
  checkpoint: { id: string; code: string; title: string } | null;
  identifiedOn: string | null;
  dueDate: string | null;
  overdue: boolean;
  closedAt: string | null;
  closureNote: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  capas: Array<{
    id: string;
    code: string;
    title: string;
    status: CapaStatus;
    priority: CapaPriority;
    dueDate: string | null;
    completionPercentage: number;
  }>;
  evidence: EvidenceLinkSummary[];
  createdAt: string;
  updatedAt: string;
};
```

Create accepts `title`, required `severity`, and optional/nullable
`description`, `source`, `frameworkId`, `frameworkRuleId`, `controlId`,
`checkpointId`, `clauseRef`, `recommendedAction`, `ownerId`, `departmentId`,
`identifiedOn`, and `dueDate`. Update accepts the same mutable fields plus
`status`, but rejects `status=CLOSED`; use the close endpoint. Owner assignment
is `{ ownerId: string | null }`. Evidence linking is
`{ evidenceId: string; linkReason?: string | null }`.

List filters are `q`, `code`, `severity`, `status`, `ownerId`, `departmentId`,
`frameworkId`, `overdue`, `needsReview`, `dueFrom`, and `dueTo`.

Lifecycle:

- `OPEN → IN_PROGRESS | CLOSED | CANCELLED`
- `IN_PROGRESS → OPEN | CLOSED | CANCELLED`
- `CLOSED → IN_PROGRESS` through `/reopen`
- `CANCELLED → OPEN`

Closure requires `gaps:close`, a trimmed closure note of at least 10
characters, no linked CAPA outside `CLOSED`/`CANCELLED`, and at least one active
qualifying Evidence link. Qualifying Evidence is `APPROVED`, has stored-file
metadata, is effective and unexpired on the closure date, and has not been
superseded by approved/archived Evidence. Gate failures return 409
`EVIDENCE_REQUIRED` with reason `EVIDENCE_GAP_LINK_REQUIRED` or
`EVIDENCE_GAP_COVERAGE_INCOMPLETE`.

## CAPAs

Permissions: `capa:read`, `capa:write`, and `capa:close`.

Endpoints mirror Gaps at `/capas`, `/capas/:capaId`, `/owner`, `/close`,
`/reopen`, `/evidence`, and `/evidence/:evidenceId`.

```ts
type CapaPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type CapaStatus =
  "OPEN" | "IN_PROGRESS" | "PENDING_VERIFICATION" | "CLOSED" | "CANCELLED";

type CapaDto = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  priority: CapaPriority;
  status: CapaStatus;
  gap: {
    id: string;
    code: string;
    title: string;
    severity: GapSeverity;
    status: GapStatus;
  } | null;
  source: string | null;
  sourceRef: string | null;
  framework: FrameworkSummary | null;
  rootCause: string | null;
  correctiveAction: string | null;
  preventiveAction: string | null;
  owner: PersonSummary | null;
  sourceOwnerRef: string | null;
  department: DepartmentSummary | null;
  raisedOn: string | null;
  dueDate: string | null;
  overdue: boolean;
  completionPercentage: number;
  closedAt: string | null;
  closureNote: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  evidence: EvidenceLinkSummary[];
  createdAt: string;
  updatedAt: string;
};
```

Create requires `title` and `priority`; optional/nullable fields are
`description`, `gapId`, `source`, `sourceRef`, `frameworkId`, `rootCause`,
`correctiveAction`, `preventiveAction`, `ownerId`, `departmentId`, `raisedOn`,
`dueDate`, and integer `completionPercentage` from 0 to 100. Update accepts
those mutable fields plus `status`, but closure uses `/close`.

List filters are `q`, `code`, `priority`, `status`, `gapId`, `ownerId`,
`departmentId`, `frameworkId`, `overdue`, `needsReview`, `dueFrom`, and `dueTo`.

Lifecycle:

- `OPEN → IN_PROGRESS | PENDING_VERIFICATION | CLOSED | CANCELLED`
- `IN_PROGRESS → OPEN | PENDING_VERIFICATION | CLOSED | CANCELLED`
- `PENDING_VERIFICATION → IN_PROGRESS | CLOSED | CANCELLED`
- `CLOSED → IN_PROGRESS` through `/reopen`
- `CANCELLED → OPEN`

Closure requires `capa:close`, a closure note of at least 10 characters and one
qualifying approved Evidence link under the same eligibility rules as Gaps.
Closure sets completion to 100. Gate failures return 409 `EVIDENCE_REQUIRED`
with `EVIDENCE_CAPA_LINK_REQUIRED` or
`EVIDENCE_CAPA_COVERAGE_INCOMPLETE`.

## Operational registers

Permissions: `registers:read` and `registers:write`.

| Method  | Path                                                     | Result                          |
| ------- | -------------------------------------------------------- | ------------------------------- |
| `GET`   | `/operational-registers`                                 | Paginated `RegisterTypeDto[]`   |
| `GET`   | `/operational-registers/:registerCode/records`           | Paginated `RegisterRecordDto[]` |
| `GET`   | `/operational-registers/:registerCode/records/:recordId` | `RegisterRecordDto`             |
| `POST`  | `/operational-registers/:registerCode/records`           | Creates a record                |
| `PATCH` | `/operational-registers/:registerCode/records/:recordId` | Updates a record                |

```ts
type RegisterTypeDto = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sourceSheet: string | null;
  fields: unknown; // ordered JSON field configuration
  active: boolean;
  recordCount: number;
};

type RegisterRecordDto = {
  id: string;
  register: { id: string; code: string; name: string };
  businessRecordCode: string;
  title: string;
  status: string | null;
  owner: PersonSummary | null;
  sourceOwnerRef: string | null;
  department: DepartmentSummary | null;
  recordDate: string | null;
  dueDate: string | null;
  overdue: boolean;
  fields: Record<string, unknown>;
  source: {
    sheet: string | null;
    row: number | null;
    importBatchId: string | null;
  };
  createdAt: string;
  updatedAt: string;
};
```

Create body: required `businessRecordCode` and `title`; optional/nullable
`status`, `ownerId`, `departmentId`, `recordDate`, `dueDate`; optional `payload`.
Update omits the immutable business code. Payload accepts at most 60 flat
string values, each at most 2,000 characters. List filters are `q`, `status`,
`ownerId`, `departmentId`, `overdue`, `dueFrom`, and `dueTo`. Type list accepts
`active`.

## Workbook imports

The deadline delivery path is the CLI. HTTP is read-only and requires
`imports:read`; upload preview/commit routes are deliberately not frozen.

| Method | Path                        | Result                                                  |
| ------ | --------------------------- | ------------------------------------------------------- |
| `GET`  | `/imports`                  | Paginated import batch summaries, newest first          |
| `GET`  | `/imports/:importId`        | Import batch detail including persisted report          |
| `GET`  | `/imports/:importId/errors` | Paginated failed-row summaries; optional `sheet` filter |

```ts
type ImportStatus =
  "PREVIEWED" | "COMMITTING" | "COMPLETED" | "PARTIAL" | "FAILED";
type ImportActor = { id: string; code: string; fullName: string };
type ImportBatchDto = {
  id: string;
  originalFilename: string;
  fileChecksum: string;
  idempotencyKey?: string; // detail only
  status: ImportStatus;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  startedAt: string;
  completedAt: string | null;
  uploadedBy: ImportActor | null;
  report?: CommitReport; // detail only
};
type ImportErrorDto = {
  id: string;
  sheet: string;
  rowNumber: number;
  businessKey: string | null;
  validationErrors: Array<{ field: string; message: string }>;
  importResult: "FAILED";
};
```

The CLI preview report contains workbook `{ filename, checksum, byteSize,
sheetCount }`, per-sheet `{ key, sheetName, target, present, totalRows,
validRows, errorRows, flaggedRows, missingHeaders, reason? }`, `unmappedSheets`,
row issues `{ sheet, rowNumber, businessKey, field, message }`, and total row
counts. `CommitReport` adds `batchId`, `status`, `alreadyImported`, aggregate
`created/updated/unchanged/skipped/errors`, and per-sheet outcomes. Reports do
not print source row values.

Input is `.xlsx`, bounded to 20 MiB by the importer. Preview is pure. Commit
uses SHA-256 plus an idempotency key for identical-file replay and
Company-scoped business keys for revised-workbook upsert.

## CSV exports

All routes require `exports:read` plus the module read permission. They return
`text/csv; charset=utf-8` as an attachment, not a JSON envelope. Results are
Company-scoped, sorted deterministically and capped at 5,000 rows.

| Path                                               | Additional permission |
| -------------------------------------------------- | --------------------- |
| `/exports/gaps.csv`                                | `gaps:read`           |
| `/exports/capas.csv`                               | `capa:read`           |
| `/exports/kpi-actuals.csv`                         | `kpis:read`           |
| `/exports/risks.csv`                               | `risk:read`           |
| `/exports/evidence.csv`                            | `evidence:read`       |
| `/exports/operational-registers/:registerCode.csv` | `registers:read`      |

Filenames are `genbioca-<module>-YYYY-MM-DD.csv`. Fields use RFC 4180 quoting.
String values beginning with `=`, `+`, `-`, `@`, tab or carriage return are
prefixed with an apostrophe before export to prevent spreadsheet formula
injection. KPI export contains code, name, unit, direction, frequency, period,
target, actual, variance, variance percentage, RAG, target-met, department and
approval status. Register export appends the register's configured source
fields to its stable columns.

## Extended dashboard summary

`GET /dashboard/summary` accepts `departmentId`, `frameworkId`, `period`,
`from`, and `to`. Company scope is not a filter. `from` must not follow `to`.

The response extends rather than replaces the Milestone 1 keys:

```ts
type DashboardSummaryDto = {
  generatedAt: string;
  filters: {
    departmentId: string | null;
    frameworkId: string | null;
    period: string | null;
    from: string | null;
    to: string | null;
  };
  compliance: null | {
    overallPercentage: number;
    measuredKpis: number;
    kpisMeetingTarget: number;
  };
  kpis: null | {
    activeConfigurations: number;
    meetingTarget: number;
    amberActuals: number;
    redActuals: number;
    pendingApprovals: number;
    definitions: number;
    configured: number;
    enabled: number;
    measured: number;
    green: number;
    amber: number;
    red: number;
    pendingApproval: number;
  };
  risks: null | {
    openRisks: number;
    minorRisks: number;
    majorRisks: number;
    risksUnderTreatment: number;
    closedRisks: number;
    openMajor: number;
    openMinor: number;
    openEnterprise: number;
    openTotal: number;
    treated: number;
    closed: number;
  };
  organisation: null | {
    departments: number;
    locations: number;
    organisationUnits: number;
  };
  gaps: null | {
    open: number;
    overdue: number;
    closed: number;
    critical: number;
    major: number;
    needsReview: number;
  };
  capas: null | {
    open: number;
    overdue: number;
    closed: number;
    pendingVerification: number;
    needsReview: number;
  };
  evidence: null | {
    total: number;
    pendingReview: number;
    approved: number;
    expiringSoon: number;
    expired: number;
    withoutFile: number;
  };
  policies: null | {
    total: number;
    active: number;
    approvedVersions: number;
    draftVersions: number;
  };
  frameworks: null | {
    activeFrameworks: number;
    total: number;
    active: number;
    breakdown: Array<{
      id: string;
      code: string;
      name: string;
      version: string;
      status: string;
      scopeStatus: string;
      ruleCount: number;
    }>;
  };
  departments: null | Array<{
    id: string;
    code: string;
    name: string;
    openGaps: number;
    overdueGaps: number;
    openCapas: number;
    enabledKpis: number;
  }>;
  registers: null | Array<{ code: string; name: string; recordCount: number }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    at: string;
    actor: PersonSummary | null;
  }>;
  latestImport: null | {
    id: string;
    originalFilename: string;
    status: ImportStatus;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    startedAt: string;
    completedAt: string | null;
  };
};
```

Sections follow module read permissions and are `null` when restricted. Empty
permitted sections return zeros/empty arrays. `overallPercentage` is the
backend-calculated share of measured KPI actuals for enabled, active,
non-informational configurations that met target, rounded to one decimal.
Enabled configurations without an actual are unmeasured, not failed. Framework
`activeFrameworks`/`active` totals count `scopeStatus=Active – In Scope`, not
the shared-master lifecycle `status`. Workbook dashboard and formula-summary
cells are never the authority.

## Workbook selection and sheet inventory

Four candidate files were reviewed in a protected workbook directory:

| File                                                        | Modified (IST)      | Sheets |
| ----------------------------------------------------------- | ------------------- | ------ |
| `Updated2_GenBioCa_Compliance_Platform 22June2026 (2).xlsx` | 2026-07-01 16:02:27 | 30     |
| `Updated2_GenBioCa_Compliance_Platform 22June2026 (1).xlsx` | 2026-06-30 19:31:23 | 30     |
| `Updated2_GenBioCa_Compliance_Platform 22June2026.xlsx`     | 2026-06-30 19:31:12 | 30     |
| `GenBioCa_Compliance_Platform 22June2026.xlsx`              | 2026-06-26 16:43:33 | 28     |

The selected file is the newest Updated2 copy:

```text
/secure-data/approved-workbook.xlsx
```

Its SHA-256 is
`3d98a0dcb1f1bdf688f781783af41d946d8d2b0f46ee10ec32b04c38bcbc636e`.
The three Updated2 files share this 30-sheet inventory; the older original
omits `Export Summary` and `KPI_owner_form`:

```text
Export Summary, 00_Cover, 01_Navigation, 02_How_To_Use, 03_Company_Setup,
04_Users_Roles, 05_Frameworks_Master, 06_Framework_Checkpoints,
07_Cross_Framework_Map, 08_Evidence_Register, 09_Compliance_Dashboard,
10_Gap_Analysis, 11_CAPA_Register, 12_Audit_Schedule, 13_Audit_Findings,
14_KPI_Master, 15_KPI_Config_Targets, 16_KPI_Actuals_Entry,
17_KPI_Dashboard, 18_Risk_Register, 19_Training_Records,
20_Policy_Register, 21_Incidents_Breach, 22_Vendor_Compliance,
23_Privacy_Consent_DSR, 24_Review_Meetings, 25_Action_Items,
26_Audit_Trail, 27_Lookups, KPI_owner_form
```

The selected preview has 773 source rows and zero validation errors:

| Destination                 | Source rows |
| --------------------------- | ----------: |
| Company setup / departments |          13 |
| Framework master            |          12 |
| Framework checkpoints/rules |         339 |
| Policy register             |          18 |
| Evidence metadata           |          20 |
| KPI master                  |          91 |
| KPI configuration/targets   |          91 |
| KPI actuals                 |          31 |
| Enterprise Risk Register    |          12 |
| Gaps                        |          10 |
| CAPAs                       |          10 |
| Imported audit history      |          20 |
| Nine operational registers  |         106 |

Cover, navigation, instructions, users/roles, dashboards, lookups, export
summary and the blank KPI owner form are derived/non-source sheets. The
workbook dashboard formulas are not imported. The users sheet does not create
accounts. The dependency order is Company/departments → frameworks/rules →
policies/Evidence/KPIs → enterprise risks → KPI actuals → gaps/CAPAs → generic
registers → imported audit history.

## Repeatable GenBioCa UAT load

Prerequisites: run from `backend/`; point `DATABASE_URL` at the intended
isolated non-production UAT database; apply migrations; choose a temporary
password of at least 12 characters. The seed refuses production and never
prints the password.

```sh
cd backend
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate
NODE_ENV=development SAMPLE_SEED_PASSWORD='<runtime value>' npm run seed:uat:genbioca
npm run import:workbook:preview -- --file "/secure-data/approved-workbook.xlsx"
npm run import:workbook:commit -- --file "/secure-data/approved-workbook.xlsx" --tenant GENBIOCA --actor uat-admin@genbioca.test
npm run import:workbook:report -- --tenant GENBIOCA
```

Optional machine-readable preview/commit output uses `--json <safe-local-path>`.
Do not place reports containing customer identifiers in Git.

Synthetic logins, all using the runtime password:

| Email                          | Role                  |
| ------------------------------ | --------------------- |
| `uat-admin@genbioca.test`      | Company Administrator |
| `uat-compliance@genbioca.test` | Compliance Manager    |
| `uat-department@genbioca.test` | Department User       |

Clean-load acceptance totals are 773 preview-valid rows, 771 created, 2
skipped KPI actuals whose per-event periods cannot be derived, and zero errors.
The resulting data should include 91 KPI definitions, 9 Major and 11 Minor KPI
risks, 12 enterprise risks with no KPI risk class, 20 Evidence metadata records
with zero held files, 10 linked Gap/CAPA pairs, and 106 records across nine
operational registers.

The clean reference load was verified on 2 August 2026 in the dedicated local
database `genbioca_compliance_uat_20260802`. It produced one import batch with
the acceptance totals above, 12 frameworks, 339 framework rules, 13
departments, 91 KPI configurations, 53 approved period targets (24 enabled
base configurations plus derived actual-period targets), 29 committed actuals,
18 policies, 10 Gaps and 10 linked CAPAs. KPI RAG was 9 Green, 11 Amber and 9
Red. The dashboard returned 31% overall compliance (9 of 29 measured KPIs),
and every dashboard aggregate matched its direct database query. Duplicate KPI
codes, cross-Company links and Evidence records falsely claiming held files
were all zero.

Run the exact commit command again. It must return the original batch with
`alreadyImported=true`; domain counts must not increase. A revised workbook is
upserted by Company-scoped business key rather than duplicated.

## Sample flow

1. Sign in as the UAT administrator with the runtime password.
2. Open the database-backed dashboard summary and show KPI RAG, Major/Minor
   risks, gaps, CAPAs, Evidence-without-file and register counts.
3. List KPI actuals and show that target, actual, variance and RAG are backend
   values; a met KPI has no Risk, while an Amber/Red miss has one Major/Minor
   KPI Risk.
4. Open a Gap and its linked CAPA. Show owner, due date, lifecycle and the
   honest Evidence file state.
5. Attempt closure without qualifying Evidence and show the 409 gate. Upload,
   submit and independently approve real Evidence before the closure sample.
6. List one populated operational register and download its protected CSV.
7. Open the import batch/report and rerun commit to demonstrate idempotency.

## UAT boundary and deferred work

- CLI is the workbook delivery path. Multipart preview/commit endpoints are
  deferred; HTTP currently reads batch status/errors only.
- Evidence file SHA-256 is stored for uploaded files, but duplicate-file
  rejection is deferred.
- Employee status fields are deferred because the selected users sheet has no
  importable employee detail; workbook rows never become login accounts.
- Advanced register workflows, PDF/XLSX reports, GenRAC, Bedrock, S3, malware
  scanning, PostgreSQL RLS, notifications, report builder, performance/load
  testing and deployment are outside this deadline slice.
- Production must use HTTPS/TLS for HTTP and PostgreSQL connections and
  platform-managed encryption at rest for RDS/S3. Local UAT storage and the
  application-only tenant predicates are not production security controls.
