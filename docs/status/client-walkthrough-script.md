# Client walkthrough script

Baseline date: 2026-08-08

Runs on the `SAMPLE-CO` company (GenBioCa Sample Organisation), which carries a
complete synthetic data set across every module. `GENBIOCA` holds the client's
imported workbook and is shown separately in step 7.

## Before the meeting

Start the stack and confirm it answers:

```
docker compose up -d postgres
npm run dev --prefix backend
npm run dev --prefix frontend
curl -s http://127.0.0.1:8000/api/v1/ready
```

Sign in at `http://127.0.0.1:5173` as **Aarav Deshmukh**
(`aarav.deshmukh@example.test`), Client Company Administrator.

Three things to tidy first, or be ready to explain:

- the account `USR-MANUAL-001 / manual-user@example.test` is a synthetic test row and does
  not follow the `.test` fixture convention;
- `SMP-USR-013 / Ritu Sharma` is `DISABLED` from an offboarding test — either
  re-enable her or use her deliberately in step 5;
- **every KPI actual is `APPROVED`.** The KPI Approval Centre is therefore
  empty. Do not open it cold; step 3 creates the pending item first.

## Run order, about fifteen minutes

### 1. Dashboard — the claim

Open the Dashboard. It states its own scope: "Live Company-scoped compliance,
KPI, Evidence and Risk analytics computed from PostgreSQL." Point at the tiles —
20% compliance, 10 measured KPIs, open risks, gaps, CAPAs. Say plainly that
every number is a query, not a fixture.

### 2. Risk Register — automatic and manual origin

Open Compliance → Risks. Show that most risks were **raised automatically** when
a KPI missed its target: each carries its source KPI, the actual, the variance
and the RAG. Then use **Add risk** to record one manually, the way a risk
surfaces in a review meeting. It receives the next code in the same `RSK-nnn`
sequence and its level is derived from likelihood × impact by the server, not
typed in by the user.

### 3. KPI lifecycle — the strongest sequence

KPI Management → Record KPI Actual. Submit a value that misses its target.

Two things happen that are worth pausing on:

- a risk is raised automatically and appears in the register;
- the actual enters the approval queue.

Now open KPI Approval, and approve it as the approver. This is the sequence to
spend time on — submission, automatic risk, segregation of approval, and an
immutable decision record.

### 4. Evidence gates — why approval can be refused

Evidence → Review. Three items are awaiting review. Approve one and reject one
with a reason.

Then show a checkpoint that requires evidence: approval is refused with
`EVIDENCE_REQUIRED` until qualifying approved evidence is linked. There is no
override. That is the control an auditor asks about.

### 5. Access control — onboarding and offboarding

Administration → Users. Create a user, assign one of the five sanctioned access
profiles, and show the new row. Note that roles are a fixed catalogue rather
than free-form permissions, so nobody can invent an access level.

Then set a user to `DISABLED` and state what happens: their session stops
working on the very next request, not when a token expires.

### 6. Audit trail — the record behind all of it

Audit & Operations → Audit Trail. Filter to the last few minutes and show the
events the walkthrough just produced. State that audit events, approval
history, checkpoint reviews and evidence decisions are **append-only in
PostgreSQL** — enforced by database triggers, not by application code.

Export to CSV to close the loop.

### 7. Their own data

**Sign out and sign in as Rajesh Menon (`uat-admin@genbioca.test`).** Aarav holds
membership in `SAMPLE-CO` only, so the company switcher will not offer `GENBIOCA`
— this step needs a different account, not a company switch. Have the second
session ready in another browser profile if you would rather not sign out
mid-walkthrough.

This company is their workbook, imported: 91 KPI configurations, 32 risks, 18
policies, 9 operational registers with 106 records, 10 gaps, 10 CAPAs.

Say directly that Controls and Checkpoints are empty in this company because the
workbook did not carry them, and that populating them is part of onboarding.
Volunteering this is far stronger than being asked.

## Questions to expect, and truthful answers

**"Is it live?"** It runs on a local stack today. Production needs a host, DNS,
a TLS certificate and a secret manager — the deployment assets exist under
`deploy/` and `ops/`.

**"Where are the customer and sales analytics?"** Not built. Customer Master,
Customer Analytics, Attribution and Deals Won/Lost were in the prototype and are
scheduled; they need customer and deal entities the platform does not yet model.

**"Does it email approvers?"** No. Work queues are in-app; there is no mail
transport yet. The Settings page states this rather than implying otherwise.

**"Can we schedule reports or export PDF?"** Reports run on demand and export
CSV. Scheduling, subscriptions and PDF are deferred.

**"How is one client's data kept from another's?"** Authenticated company
context, active membership revalidated on every request, repository predicates,
composite foreign keys and database triggers. PostgreSQL row-level security is
not yet enabled and is on the roadmap — say so; a security reviewer will ask.

**"Can we edit a role's permissions?"** Not in this release. Users are assigned
to one of five sanctioned profiles. Role administration is deferred deliberately
so that access levels cannot drift.

## What not to do

- Do not open KPI Approval before step 3 — it is empty.
- Do not reach for the company switcher to show `GENBIOCA`; Aarav cannot see it.
  Step 7 needs a separate sign-in as Rajesh Menon.
- Do not open Controls or Checkpoints while `GENBIOCA` is the active company.
- Do not claim feature completeness. The strength here is depth of the
  compliance workflow and an audit trail that cannot be edited; that story
  survives scrutiny, and a completeness claim does not.
