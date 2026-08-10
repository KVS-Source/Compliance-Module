# Customer experience review

Baseline date: 2026-08-08

**Status note (2026-08-10).** Several findings below shipped after this review
and must not be re-quoted as open gaps:

| Finding in this review | Status after |
| --- | --- |
| No column sorting | Shipped (`6989c1e`) |
| Filters do not survive in the URL | Shipped (`6989c1e`) |
| No “my work” view | Shipped (`6989c1e`) |
| Evidence expiry never surfaced | Shipped (`6989c1e`) |
| Framework compliance reads as empty (duplicate frameworks) | Fixed (`413a4c5`) |
| Role assignment / onboarding | Shipped (`b8a5f94`) |
| Operational registers write / manual risk create | Shipped (`14eeeaf`) |
| Grid KPI actual entry | Shipped (`a1f37d9`) |
| Bulk actions (Gap Register) | Shipped (`70989f2`) |

Still accurate as open product work: CAPA/Risk bulk extension, bulk user import,
session management, privilege access review, record comments, stronger whole-row
overdue cues, report scheduling/PDF, and the enterprise items in the
[completion plan](./completion-plan.md).

A walkthrough of the shipped pages from the position of a GRC buyer and a daily
user, against the `DEMO-UAT` company with its full data set. Findings are
grouped by how many pages they affect, because the cross-cutting items are worth
more than any single screen.

Everything here was observed in the running application, not inferred.

## What already works

Worth stating before the gaps. The registers are consistent: every one has
search, meaningful filters, CSV export, a create control and a detail view.
Status vocabularies are real domain vocabularies (`OBSERVATION`, `MINOR`, `OFI`,
`MAJOR`, `CRITICAL`; `PREVENTIVE` / `DETECTIVE`). The Reports centre states its
own filter count and export format per report. The dashboard names its data
source and generation time. Pages that cannot show something say why rather than
rendering an empty box.

That baseline is better than most compliance products at this stage.

## Cross-cutting gaps

These affect nearly every register, so fixing them once improves the whole
product.

### 1. No column sorting

No table header in the registers is sortable. Verified on the Gap Register:
seven headers, none carrying a sort control or `aria-sort`.

A user managing 100 gaps cannot ask "which is closest to its due date" or "show
me the highest severity first" without exporting to a spreadsheet. This is the
single most common thing a person does with a register.

### 2. No bulk selection or bulk actions

No register offers row checkboxes. Verified on the Gap Register: zero
checkboxes in the table.

Real remediation work is bulk work — reassign eleven gaps to a new owner after
someone leaves, extend due dates after a delayed audit, close a batch of
verified CAPAs. Today each is opened and edited one at a time.

### 3. Filters do not survive in the URL

Filtering the Gap Register to `OPEN` narrowed eight rows to three, and the
address stayed `/compliance/gaps` with no query string.

The consequence is that a filtered view cannot be bookmarked, shared in an
email, or linked from a meeting agenda. "Send me the list of overdue critical
gaps" cannot be answered with a link. This is already recorded for the Policy,
Control and Checkpoint registers in
[known limitations](../known-limitations.md); it applies more widely.

### 4. There is no "my work" view

The dashboard Action Queue is company-wide: 6 open gaps, 3 evidence awaiting
review, 2 overdue CAPAs — for everyone. A department owner signing in cannot see
_their_ outstanding items without filtering each register by their own name.

Every other GRC product opens on "what is assigned to me and what is late". This
is the largest single daily-use gap in the product.

### 5. No inline editing

Each row offers one action: view. Changing an owner or a due date means opening
the record. For a register maintained weekly, that is a lot of navigation.

### 6. No record-level collaboration

There is no comment thread, no @mention and no activity feed on a gap, CAPA or
risk. Remediation is a conversation between an owner, a reviewer and an auditor,
and today that conversation happens in email, outside the audit trail — which
undermines the reason for having an audit trail.

## Page-specific findings

### Dashboard — framework compliance reads as empty

Every framework in the widget shows `0 mapped controls` and `No mapped Control`,
including ISO 27001 with 116 rules.

The controls **are** mapped, but to duplicate framework records. The database
holds both `DEMO-FRM-002 / ISO 27001` (seeded, 2 mapped controls) and
`ISO 27001 / ISO 27001 2022` (workbook-imported, 0 mapped). The widget lists the
imported set, so a headline GRC view reads as entirely unmapped.

This is a data-integrity issue, not a rendering one, and it is the most
damaging thing on the most-viewed page. Frameworks are global rather than
tenant-scoped, so the duplicates are visible everywhere frameworks are listed —
the Control Register framework filter shows both sets side by side.

Also missing here: a period selector, any trend beyond the two periods present,
and an evidence-expiry tile (see below).

### KPI Actual Entry — one record at a time

The page submits a single actual: choose configuration, choose period, enter
value, submit.

A department owner reporting twenty KPIs each month repeats this twenty times,
with no worklist of what is due, no grid entry, no paste from spreadsheet and no
partial save. This is the highest-frequency screen in the product and the most
laborious. A "KPIs due this period, by me" grid would change the daily
experience more than any other single change.

### Audit Trail — buried in authentication noise

The default view is dominated by `AUTH_LOGIN` rows. There is a source filter and
an action filter, but no quick way to say "business events only", and no
grouping by record.

An auditor asking "what happened to DEMO-GAP-004" must already know to filter by
entity. Record-level history surfaced on each record's own detail page would
serve that better than a global log.

### Evidence Library — expiry is captured but never surfaced

Every record carries an `EXPIRES` date. Nothing acts on it: no dashboard tile,
no filter for expiring soon, no warning as the date approaches. The dashboard
tracks Policies Due for Review but not evidence about to lapse, which is the
same class of problem and arguably more urgent.

Also, file content downloads rather than previewing; inline preview is recorded
as deferred.

### Gap and CAPA registers

Well-built, but the gap-to-CAPA relationship is not visible from either list.
The natural question — "which CAPA is fixing this gap?" — needs the detail view.
Neither list flags an overdue row visually; there is an `Overdue only` filter,
but a row past its date looks like any other.

### Users and Role & Access

No bulk user import, which matters when onboarding a client with sixty staff.
No visible session management — an administrator cannot see or terminate active
sessions, only disable the account. Role & Access is read-only by design.

### Reports

Ten solid reports, honestly described. No scheduling, no subscriptions, no PDF,
and no way to save a filter combination as a named view — so a monthly board
pack is rebuilt by hand each month.

## What a customer will ask for first

Ordered by daily impact rather than build cost.

| Priority | Item                         | Why                                         |
| -------- | ---------------------------- | ------------------------------------------- |
| 1        | "My work" view               | Every user, every day, first screen         |
| 2        | Fix duplicate frameworks     | Most-viewed widget currently reads as empty |
| 3        | Column sorting               | Most common register interaction            |
| 4        | Bulk actions                 | Remediation is bulk work                    |
| 5        | Bulk / grid KPI actual entry | Highest-frequency data entry                |
| 6        | URL-synced filters           | Sharing a view is a daily need              |
| 7        | Evidence expiry alerting     | Data already captured, unused               |
| 8        | Record comments              | Moves conversation into the audit trail     |

Items 3, 6 and 7 are small. Item 2 is a data decision — whether the seeded
`DEMO-FRM-*` frameworks should exist at all now that the workbook supplies real
ones. Items 1, 4, 5 and 8 are genuine features.

None of these is a defect. The workflows underneath are correct and the audit
trail is sound; what is missing is the layer that makes correct workflows
comfortable to live in eight hours a day.
