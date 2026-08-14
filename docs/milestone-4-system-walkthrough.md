# Milestone 4 system walkthrough (10–15 minutes)

Use synthetic `.test` identities only. Do not share passwords or access tokens
on screen. Hide Postman environment secrets while presenting.

## Prerequisites

1. Local stack running (`docker compose` / backend on port `8000`).
2. Database migrated and seeded.
3. Postman collection `Milestone-4-E2E` imported with local passwords set
   (uncommitted; never paste passwords/tokens into shared notes or screen
   recordings).
4. Approver (`user001@example.test`) temporarily granted `policies:approve` in
   the active Company (see `postman/README.md`). The Postman collection does
   **not** grant this automatically. A `403` on Approve usually means the
   permission is missing; re-login after granting.
5. Optional: pgAdmin connected to the same local database.

## Sequence

1. **Login (UI or Postman)** — `admin001@example.test`. Confirm active Company.
2. **Policy Register** — open `/compliance/policy-register`. Create or open a
   synthetic Policy. Show Version `1.0` DRAFT and Framework mapping.
3. **Submit** — submit the Version. Show SUBMITTED status.
4. **Approval** — as a second identity with `policies:approve`, approve the
   Version. Mention self-approval is blocked for the submitter.
5. **Control** — create a Control linked to the approved Policy Version. Open
   Control detail; show Policy linkage in mappings/traceability.
6. **Checkpoints** — use **Open Checkpoints**, create a Checkpoint under the
   Control. Show parent Control on Checkpoint detail.
7. **Review** — submit a PASS Review for a unique period. Show Latest Review and
   history refresh. Mention append-only and duplicate-period rejection.
8. **Traceability** — open Checkpoint and Control/Policy traceability panels.
9. **Audit** — open entity audit history; confirm observation text is not shown
   in audit metadata.
10. **Postman (optional)** — run folders 00→07 quickly to show envelopes and
    captured IDs (`baseUrl` `http://localhost:8000/api/v1`).
11. **pgAdmin (optional)** — run selected SELECT queries from
    `docs/milestone-4-pgadmin-queries.sql` for the Policy, Control, Checkpoint and
    Review just created.

## Talking points

- Frontend permission buttons are UX; backend enforces authorization.
- Company switch must clear prior-Company records from the UI.
- Evidence-required Policy approval is intentionally fail-closed until Evidence
  exists.
- Playwright uses deterministic mocked APIs; in-memory actor/permission switches
  are UI-flow simulation only, not auth or PostgreSQL authority. This walkthrough
  and backend PostgreSQL integration tests are the real-stack proof.
- Evidence, Gap, CAPA, GenRAC, RLS and production hosting are not in this sample.

## After the sample

- Clear Postman tokens.
- Optionally run folder 09 archives on synthetic records only.
- Do not leave temporary `policies:approve` grants on shared environments
  without recording why they were added.
