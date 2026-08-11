# Handover — start here

Baseline date: 2026-08-10. Active development stopped on this date.

This is the entry point. Everything else is linked from here.

## What this is

A multi-tenant GRC platform: Express and PostgreSQL behind a React client.
Policies, controls, checkpoints, evidence with approval gates, KPI targets and
actuals with an approval workflow, risks raised automatically from KPI misses,
gaps, CAPAs, operational registers, workbook import, ten reports and an
append-only audit trail.

It runs. It is not deployed.

## Read in this order

| Document                                                                   | Answers                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------- |
| [gap-register.md](./gap-register.md)                                       | What is specified but not built, and what each needs |
| [current-status-and-v1-scope.md](../status/current-status-and-v1-scope.md) | What is shipped, module by module                    |
| [known-limitations.md](../known-limitations.md)                            | Constraints that must not be hidden from a client    |
| [completion-plan.md](../status/completion-plan.md)                         | **Forward roadmap** — closed Phase 1–2, V1.1 / V1.5 / V2 |
| [module-status.md](./module-status.md)                                     | Client-readable “what can the user do” matrix        |
| [client-walkthrough-script.md](../status/client-walkthrough-script.md)                   | A rehearsed 15-minute walkthrough                  |
| [customer-experience-review.md](../status/customer-experience-review.md)   | UX findings (partially superseded — see completion plan) |
| [setup.md](../setup.md)                                                    | Environment and first run                            |

## Running it

Two PostgreSQL containers, an API on 8000, a client on 5173.

```
docker compose up -d postgres
docker compose --profile test up -d postgres_test
npm run dev --prefix backend
npm run dev --prefix frontend
```

Seeding requires the password at runtime; it is deliberately not stored in the
repository. The sample data in this environment was seeded with
`DemoSeed!2026Local`:

```
NODE_ENV=development SAMPLE_SEED_PASSWORD='DemoSeed!2026Local' npm run seed:sample --prefix backend
NODE_ENV=development SAMPLE_SEED_PASSWORD='DemoSeed!2026Local' npm run seed:uat:genbioca --prefix backend
```

Re-seeding with a different password changes every account's password.

## The two Companies

**GENBIOCA** — the client's imported workbook. 13 departments, 13 frameworks,
340 framework rules, 92 KPI definitions, 91 configurations, 32 risks, 18
policies, 20 evidence records, 10 gaps, 10 CAPAs and 9 operational registers
holding 106 records. No sample-data labelling anywhere.

Sign in as `uat-admin@genbioca.test` (Rajesh Menon).

**SAMPLE-CO**, shown as _GenBioCa Operations_ — a complete synthetic showcase
covering every module, including the Controls, Checkpoints and Evidence chain
that GENBIOCA lacks. Fourteen invented personas on `.test` addresses.

Sign in as `aarav.deshmukh@example.test` (Aarav Deshmukh, administrator).

A user belongs to one Company. Aarav cannot see GENBIOCA and Rajesh cannot see
the sample Company; showing both needs two sign-ins.

## Verification

```
npm run typecheck
npm run lint
npm run test:unit        --prefix backend    # 336
npm run test:integration --prefix backend    # 354, needs postgres_test
npm run test:e2e         --prefix frontend   # 596, starts its own dev server
npm run guard:routes     --prefix frontend
```

All green at this baseline.

## Traps that cost time

Recorded because each one wasted hours and none is obvious.

**The integration suite accumulates state.** Fixture users and role permissions
persist between runs. Two accumulation bugs were fixed — a login-lockout counter
that eventually locked the shared administrator, and role permissions that were
only ever added, never pruned. If the suite fails on assertions that look
unrelated to your change, rebuild the disposable database rather than debugging
the test:

```
docker compose --profile test exec -T postgres_test \
  psql -U postgres -d genbioca_compliance_test -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

**Stylesheet order decides who wins.** `tokens.css → global.css →
components.css → prototype.css → react-adapter.css`, all imported in
`src/main.tsx`. A correct rule in `components.css` loses to `prototype.css`
because that file loads later. Raise specificity or fix the source rule; do not
add a sixth stylesheet.

**Governance data cannot be deleted.** Database triggers make `rule_controls`,
`risk_reviews`, `kpi_approvals`, `checkpoint_reviews` and audit events
append-only. Retire records by status instead. A migration that assumes it can
delete them will fail at runtime, not at review.

**Workbook checkpoints are framework rules.** The workbook's
`06_Framework_Checkpoints` is a published clause catalogue and imports to
`framework_rules`. The application's `checkpoints` entity is a Company's own
testing schedule and is not in the workbook. Empty Controls and Checkpoints in
GENBIOCA are expected, not a failed import.

**Measuring layout in the browser.** A block element spans the full width of its
parent even when padded, so measuring its bounding box reports zero inset and
lies. Measure rendered text with a `Range`. Also check `:hover` state before
concluding a card has a resting shadow.

**The preview tooling cannot start a server from `~/Downloads`.** macOS refuses
the spawned process access to its working directory, so `npm` fails with
`EPERM: uv_cwd` before reading its arguments. Start dev servers from a terminal
and point the browser at the port. Moving the repository out of `~/Downloads`
resolves it permanently.

## What changed on the final day

| Commit    | Change                                                    |
| --------- | --------------------------------------------------------- |
| `914cd50` | Gap register against both source specifications           |
| `312a6e0` | Chart card insets, workspace rename, Login redesign       |
| `80c8a3c` | Create a Company from the UI                              |
| `ed99666` | Design system applied across remaining pages              |
| `97987e1` | Dashboard redesign, frozen RAG colours, working Quick Add |
| `0e382cd` | Test fixture prunes undeclared role permissions           |
| `413a4c5` | Sample data no longer leaks into client frameworks          |

## If work resumes

[completion-plan.md](../status/completion-plan.md) has the sequence. The three
items with the clearest business consequence:

1. **Erasure** — offboarding works, but personal data cannot be redacted while
   preserving audit history. DPDPA and GDPR are both in this client's framework
   list, so a data subject request is foreseeable.
2. **The CRM module** — `customer_master`, `company_customers` and `deals` are
   in the signed data dictionary and are not built. The prototype has no design
   for them either, so the data model must be agreed first.
3. **Row-level security** — tenant isolation is enforced in application code
   today. A missed repository predicate is a cross-tenant read with no database
   backstop, and it is the control an assessor will ask about.
