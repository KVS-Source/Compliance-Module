# Module status (client handover)

This table describes what a company user can do in the **client sidebar** today.
It matches the 44 protected live navigation modules shipped for client use.
Several Master Data entries are alternative sidebar routes into a screen listed
below (for example Master Data → Policies opens the Policy Register), so the
table describes screens rather than repeating a row per path.
Access still depends on the user’s assigned permissions.

| Module | What the user can do | What is not available in this release |
| --- | --- | --- |
| Dashboard | View a company-scoped overview of compliance activity (KPIs, risks, organisation and framework-related summary information), plus analytics: KPI trend, evidence status, framework compliance, risk heat map, CAPA aging, policies due for review and an action queue linking to the work behind each figure. | No editing or configuration from this screen. A section your permissions withhold reads as restricted rather than as 0, so an empty chart is never mistaken for good news. |
| Companies | Review the companies available to the signed-in user and switch context when membership allows. | Creating or editing companies is not offered in the product UI. |
| Users | List company users; create users; update name, contact details, status, department and set a new password for a user (when the user has write access). | Assigning or changing a user’s role is not available here; Role Access is a read-only screen. |
| Role Access | Review the roles available to the company and the permissions each one holds. | **Read-only.** Creating a role, or adding and removing permissions, is not available in the UI; production roles are provisioned during initialization. |
| Change Password | Change your own password from the account menu (top-right profile menu), available to every signed-in user regardless of role. Requires the current password; signs you out of every device on success. | Not reachable from the sidebar. There is no “forgot password” self-service reset — a user who cannot sign in needs an administrator to set a new password. |
| Departments | View, create and update company departments. | No bulk department import from this screen alone (imports are under Data Import). |
| Locations | View, create and update company operating locations. | Same as departments for bulk load. |
| Organisation Units | View, create and update organisation units. | Same as departments for bulk load. |
| Frameworks | Browse active compliance frameworks held in the system. | Creating or editing frameworks is not available in the UI (catalogue is maintained outside this screen). |
| Framework Rules | Choose a framework and review its rules. | Creating or editing rules is not available in the UI. |
| Policy Register | Maintain policies; create and edit versions; map frameworks; submit, approve or reject versions; archive; view traceability and policy audit history. | Standalone “Policy Versions” navigation page is deferred (version work lives inside the policy). Policy version obsoletion and some inactive transitions remain deferred. |
| Controls | Create and update controls; activate, deactivate or archive; map policy versions, frameworks and framework rules; view checkpoint counts, traceability and control audit history. | Reverse “all evidence for this control” browse APIs are not part of this release’s UI promise. |
| Checkpoints | Create and update checkpoints; lifecycle actions; submit reviews; view latest review, history, traceability and checkpoint audit history. | Correcting a review for the **same period** is not supported. |
| KPI Catalogue | Browse the KPI definitions available to configure, with their measurement details. | **Read-only.** Creating or editing a KPI definition is not available in the UI; definitions are shared master data. |
| KPI Analytics | Review KPI trend and performance charts for the company. | **Read-only.** Charts show only what the API returns; a section you lack permission for reads as restricted rather than as zero. |
| Frequency Master | Review the reporting frequencies used by KPI configurations and targets. | **Read-only.** |
| KPI Configuration | Create and update KPI configurations (scope, ownership, thresholds, evidence and approval requirements). | Configuration draws on the shared KPI catalogue, which is not editable here. |
| KPI Targets | Select a configuration and manage target versions (create, submit, approve, reject, new version). | Targets only apply once a configuration exists. |
| KPI Actual Entry | Record actual performance against an approved target; see calculated variance and RAG; automatic risk may be raised on a miss. | Entry is blocked without an approved target for the period. |
| KPI Approval | Review submitted actuals and approve, reject or allow resubmission according to configuration. | Only the configured approver may decide; evidence may be required before approval. |
| Risk Register | View risks (including those auto-raised from KPI misses); open detail; assign owner; record reviews and treatments; complete treatment; close or reopen. | Creating a free-form risk by hand is not available; risks come from KPI miss automation or data import. |
| Evidence Library | Search and open company evidence; edit draft metadata; upload or replace files; submit; link to controls, checkpoints and KPI actuals (while draft); archive; view history. | Rejected evidence cannot be resubmitted as the same record (create a superseding record). Malware scanning and cloud object storage are not offered. |
| Create Evidence | Register new evidence metadata and upload a validated file. | File types and size are limited by platform policy; S3 storage is not available. |
| Evidence Review | Work the review queue; approve or reject submitted evidence (with maker-checker rules). | Self-review of one’s own submission is blocked by the server. |
| Approved Evidence / Rejected Evidence | Review evidence that has been approved or rejected, separately from the review queue. | **Read-only** views of a decision already recorded; rejected evidence still cannot be resubmitted as the same record. |
| Framework Compliance | Review how the company maps against each framework in scope, including rule counts, mapped and implemented controls and open gaps. | **Read-only.** A framework with no mapped controls reports no percentage rather than 0%. |
| Gap Register | List and open gaps; create and edit; assign owner; link evidence; close or reopen (when rules allow). | Closure may be refused until linked CAPAs are resolved and qualifying evidence is present. |
| CAPA Register | List and open CAPAs; create and edit (including linkage to a gap); assign owner; link evidence; close or reopen. | Closure requires qualifying approved, file-backed evidence. |
| Audit Trail | Search company audit events; open detail; export CSV when export permission is granted. | Not every read-only browse action is audited; this is a history of governed writes and selected system events. |
| Operational Registers | Browse register types (for example training, incidents, vendors) and their records; export CSV when permitted. | Creating or editing register rows is **not** available in the UI in this release (records are loaded by import or other approved channels). |
| Data Import | Upload an approved Excel workbook or a supported CSV template; preview validation; commit into the company database; see duplicate/idempotent handling for repeated files. | Arbitrary free-form spreadsheets are not accepted—only approved workbook shapes and listed CSV templates. |
| Import History | Review past import batches, outcomes and row-level errors. | History is read-only; corrections are made by a new import or in the domain screens. |
| Reports | Open the reports catalogue and run any of **ten** reports with the filters each one supports: KPI target versus actual, KPI variance and achievement, Framework compliance, Evidence status and aging, Risks, Gaps, CAPA aging and overdue, Policy review schedule, Audit activity, and Operational Registers. Every report is listed, and one your permissions do not allow is shown as locked rather than hidden. Five have their own sidebar entry; the rest open from the catalogue. | **Read-only.** CSV export needs the separate export permission, so a role may be able to read a report on screen without being able to export it. Scheduled reports, subscriptions and PDF output are not available. |
| GenRAC Integration | View GenRAC connector status and sync history; when operations have configured a CSV adapter, run test connection, preview and sync. | Live GenRAC REST or database access is **not** available. The product does not claim live GenRAC connectivity when unconfigured. Browser self-service for placing GenRAC files is limited; operations configure the adapter. |

## Notes for handover

- Exact actions depend on the user’s role (for example read-only viewers cannot write or approve).
- Evidence-related approvals and some closures can return a clear “evidence required” result when coverage is incomplete.
- Changing your **own** password is self-service via the account menu. Setting a password for **another** user remains an administrator function on Users.
