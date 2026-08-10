# Completion plan — commercial roadmap

Baseline date: 2026-08-10

## Purpose

[Current status and V1 scope](./current-status-and-v1-scope.md) records what is
shipped at the module level. [Known limitations](../known-limitations.md)
records constraints that must not be hidden from a client.
[Gap register](../handover/gap-register.md) records specification versus
implementation (workbook, data dictionary, erasure, infrastructure).

This document is the **forward roadmap**: what has closed since the 2026-08-08
operable-to-usable plan, and what remains in three commercial tiers. Use it when
handing the repository to the next owner so finished work is not re-listed as
blocking.

### Commercial framing

| Tier | Meaning | Client line |
| --- | --- | --- |
| **Compliance engine** | Governed workflows, evidence gates, audit trail, KPI→risk, gap/CAPA, import, reports | Largely there |
| **Daily software** | Personal queues, register ergonomics, bulk work, easy data entry, light collaboration | Remaining focus of V1.1 |
| **Enterprise product** | SSO/MFA, email, PDF/scheduling, object storage, privacy erasure, RLS, deep integrations | V1.5–V2 |

Phase numbering from the earlier plan is preserved only as **history** under
[Closed work](#closed-work-phases-1--2). New work is sequenced as **V1.1 / V1.5 /
V2**.

---

## Closed work (Phases 1–2)

These items were the day-one and “connect the backend” blockers. They shipped
and were verified in-browser. Do not re-open them as gaps unless a regression is
found.

| Item | Commit | What shipped |
| --- | --- | --- |
| Role assignment API + UI | `b8a5f94` | `GET/PUT /access/users/:id/roles`, five production profiles only, `roles:assign`, self-escalation guard, audit event, integration + Playwright coverage. Admin can onboard a colleague end to end in the browser. |
| Demo wildcard retirement (aligned) | `b8a5f94` | Demo roles aligned toward explicit production profile permissions so demo and production no longer diverge on `*`. |
| Operational Registers write UI | `14eeeaf` | Create/edit against existing `registers:write` APIs; “Add record” works in the product UI. |
| Manual risk create | `14eeeaf` | `POST /risks` + Risk Register create; continues the shared risk code sequence; source distinguished from KPI-linked automation. |
| Register column sorting | `6989c1e` | Server-side allowlisted `orderBy` / `order`, `aria-sort` on headers. |
| URL-synced filters | `6989c1e` | Register filter and sort state in the query string (e.g. `?orderBy=status&order=asc`). |
| My Work personal queue | `6989c1e` | `/my-work` — five permission-gated sections, overdue first. |
| Evidence expiry surfacing | `6989c1e` | Dashboard tile plus library filter (`expiringSoon` / related query params). |
| Framework catalogue de-dupe | `413a4c5` | Demo seed no longer pollutes global frameworks with synthetic clauses; compliance percentages report real mapped numbers. |
| Create Company from UI | `80c8a3c` | `POST /tenants` + UI; caller becomes administrator of the new empty Company; `tenants:write`. |

**Exit criterion for Phase 1 (met).** A Company Administrator can create a user,
assign a sanctioned role, and that user signs in to a correctly scoped
workspace without shell, seed, or direct database access.

**Not a gap — intentional product choice.** Self-service “forgot password”
email reset is **not** planned as a hole. Login routes recovery to an
administrator-set password, with copy that explains why a reset cannot be
issued from an unverified email. Admins can set passwords today. Email-based
reset is a future product decision, not an incomplete feature.

In-app work-queue signalling improved with My Work and Topbar links; a full
**notifications** model and **email transport** remain open (see V1.5).

---

## V1.1 — Make daily work comfortable

Near-term product work. None of this blocks reading the compliance engine; all
of it changes how many hours a department owner spends fighting the UI.

Cross-reference: several of these were called out in
[customer-experience review](./customer-experience-review.md) (2026-08-08). That
review still describes pre-`6989c1e` register UX in places; treat **this plan**
as status authority for sorting, URL filters, My Work, and evidence expiry.

### Must-have remaining (former P1)

| Item | Why | Notes |
| --- | --- | --- |
| **Bulk selection and bulk actions** on registers | Remediation is bulk work: reassign owners, extend due dates, batch-close verified CAPAs | Gaps, CAPAs, risks, evidence first; server must enforce the same gates as single-record actions |
| **Grid / worklist KPI actual entry** | Highest-frequency screen is still one config → one period → one value | “Due this period, by me” grid; optional paste-from-spreadsheet; partial save |

### Strong V1.1 additions

| Item | Why | Notes |
| --- | --- | --- |
| **Bulk user import** | Onboarding ~60 staff one-by-one is a sales objection | CSV template + validation + role column limited to production profile codes |
| **Session management UI** | Admin cannot list or revoke another user’s refresh sessions | Complements disable-user; audit every revocation |
| **Privilege access review report** | Auditor question: who holds `roles:assign`, who can approve | Small report on data already in roles, permissions, memberships |
| **Record comments** (gap / CAPA / risk / evidence) | Moves remediation conversation into the audit trail | Append-only comments; no silent edit of history |
| **Overdue visual cues** on list rows | Filter exists; past-due rows still look normal | Pure presentation + sort defaults |
| **Saved named views** | “Overdue critical gaps” as a bookmarkable named filter | Builds on URL-synced filters |

### Explicitly deferred from V1.1

Email delivery, PDF/scheduling, S3, malware scan, SSO/MFA, Tasks module, CRM,
free-form role design, GenRAC live REST/DB — see V1.5 / V2 and
[known limitations](../known-limitations.md).

**V1.1 exit criterion.** A department owner can clear a week of KPI actuals
without one-by-one forms, and a compliance manager can reassign or advance a
batch of gaps/CAPAs without opening each detail page.

---

## V1.5 — Operational maturity

Makes the product runnable without constant ops workarounds. Aligns with
[gap register §4](../handover/gap-register.md#4-other-known-gaps) and production
limitations.

| Item | Why | Related |
| --- | --- | --- |
| **In-app notifications** model + optional email transport | Approvals and overdue CAPAs are time-sensitive | Gap register: no external delivery; Settings must not claim email until true |
| **Report scheduling, subscriptions, PDF / board pack** | Monthly pack rebuilt by hand today | Known limitations; ten reports already run on demand + CSV |
| **Object storage (S3)** + signed download URLs | Local volume is deadline fallback, not multi-host production | Known limitations storage section |
| **Malware scanning** on evidence upload | Evidence is the trust root for gates | Known limitations |
| **Inline file preview** (PDF/image) | Download-only friction for reviewers | Known limitations |
| **Browser-to-PostgreSQL E2E** (no API mocks) | Playwright proves UI against intercepts; human real-stack is still required | Limitation 3; Phase 3 of the old plan |
| **Production bring-up** | TLS, DNS, secrets, log destination, alerting, disk encryption, RPO/RTO drill | Limitations 4–5; external inputs |
| **GitHub branch protection evidence** | Workflow file alone is not protection | Limitation 6 |
| **Delegation / out-of-office approver routing** | Approvals block when the only approver is away | Builds on existing approval workflows |
| **As-of snapshot reports** | Audit asks “what did compliance look like on date D?” | Extends reports centre |

**V1.5 exit criterion.** A release candidate can be proven on a real stack with
automated critical-path E2E, evidence can live on object storage with scan
hooks, and board packs can be produced without a spreadsheet rebuild.

---

## V2 — Enterprise complete

Larger product and assurance programmes. Matches
[gap register](../handover/gap-register.md) open specification items and
assessor expectations.

### Privacy, security, assurance

| Item | Why | Related |
| --- | --- | --- |
| **Pseudonymisation / right to erasure** | DPDPA/GDPR in framework list; offboarding ≠ erasure | [Gap register §3](../handover/gap-register.md#3-data-removal-and-the-right-to-erasure) |
| **PostgreSQL RLS** | Defence in depth; missed predicate has no DB backstop | Limitation 2; old Phase 4 |
| **SSO (SAML/OIDC) + MFA / step-up for approvals** | Enterprise identity baseline | Not started |
| **Configurable master data tables** | Frequencies, evidence types, report definitions are code enums today | [Gap register §2](../handover/gap-register.md#2-data-dictionary--32-of-46-tables-implemented) |

### Product modules

| Item | Why | Related |
| --- | --- | --- |
| **Tasks** module | Assigned work with due dates linked to gap/CAPA/risk/audit | Deferred route `/tasks`; no production Task model |
| **CRM** (`customer_master`, `company_customers`, `deals`) | In signed data dictionary; prototype had titles only | [Gap register §2](../handover/gap-register.md#2-data-dictionary--32-of-46-tables-implemented) |
| **Live GenRAC** REST/database adapters | CSV adapter only until client access | Known limitations; GenRAC page honesty rules |
| **`evidence_versions`, `kpi_mappings`, `company_frameworks`** | Dictionary tables not modeled as first-class product | Gap register missing tables |
| **Policy version obsoletion / INACTIVE transitions** | Lifecycle completeness | Known limitations |
| **Same-period Checkpoint review correction** | Mistaken review is stuck for that period | Known limitations |
| **SIEM / ticketing integrations**, webhooks | CAPA and incident hand-off | Not started |
| **Custom role design** (beyond five profiles) | Only if the client requires it; profile catalogue is intentional authority today | Role & Access remains profile-bound |

**V2 exit criterion.** An external assessor can be shown RLS, a designed erasure
path, enterprise identity, and either live GenRAC or a written interface
decision; dictionary modules the client bought are either built or formally
descoped.

---

## Sequencing summary

| Tier | Effort (order of magnitude) | Blocks | Recommendation |
| --- | --- | --- | --- |
| Closed (Phase 1–2) | Done | Was day-one operation | Do not re-plan as open |
| **V1.1** | Days–2 weeks | Daily usability | Next product work |
| **V1.5** | Weeks | Ops comfort, release confidence, board packs | Before or with first serious production host |
| **V2** | Project-sized | Audit posture, privacy, sold modules | Own programmes; do not mix into V1.1 PRs |
| Production bring-up | External | Go-live | Parallel; needs infrastructure input |

---

## Deliberately scoped decisions (not accidental holes)

Documented so successors do not “fix” intentional design:

- **Administrator-controlled password recovery** — implemented; email self-reset is optional future work.
- **Five production access profiles** as permission authority — assignment is mutable; free-form permission editing is not V1.
- **KPI-linked risk invariants** — automatic risk creation rules remain; manual risks use a distinct source.
- **Append-only audit events** — no update/delete APIs; erasure is pseudonymisation of personal fields, not history deletion.
- **GenRAC honesty** — do not claim live REST/DB until configured and approved.
- Report scheduling, PDF, S3, malware scan, Tasks, Policy obsoletion, same-period checkpoint correction — deferred product decisions in
  [known limitations](../known-limitations.md), not incomplete stubs pretending to work.

---

## Document map

| Document | Role |
| --- | --- |
| This file | Forward roadmap (V1.1 / V1.5 / V2) and closed Phase 1–2 log |
| [gap-register.md](../handover/gap-register.md) | Spec vs implementation (workbook, dictionary, erasure) |
| [current-status-and-v1-scope.md](./current-status-and-v1-scope.md) | What is LIVE today |
| [module-status.md](../handover/module-status.md) | Client-readable capability matrix |
| [known-limitations.md](../known-limitations.md) | Constraints that must stay visible |
| [customer-experience-review.md](./customer-experience-review.md) | UX findings (partially superseded by `6989c1e`) |
| [START-HERE.md](../handover/START-HERE.md) | Handover entry point |
