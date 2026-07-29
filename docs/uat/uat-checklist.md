# Controlled UAT checklist

This checklist is for a non-production, synthetic-data environment. Completion
does not establish production or AWS readiness.

## Entry criteria

- [ ] Approved UAT change/owner and test window recorded.
- [ ] Branch/commit under test recorded.
- [ ] Database name independently confirmed as non-production.
- [ ] All nine Prisma migrations applied with `prisma migrate deploy`.
- [ ] Only synthetic identities and `.test` email addresses are present.
- [ ] Demo seed run explicitly with a temporary password and then rerun with
      identical baseline entity counts.
- [ ] Backend `/api/v1/health` and `/api/v1/ready` return success.
- [ ] Required CI checks pass on the pull request.
- [ ] Tester understands that automated Playwright intercepts API responses and
      is not browser-to-PostgreSQL E2E.

## Real-stack walkthrough

Record PASS/FAIL, tester, timestamp and evidence reference for each item. Do
not place access tokens, cookies, passwords or private row data in evidence.

### Authentication and tenancy

- [ ] Sign in with a synthetic active user.
- [ ] Confirm disabled/invalid credentials do not reveal account existence.
- [ ] Confirm available companies and active company are correct.
- [ ] Switch to another authorised company and confirm visible data changes.
- [ ] Attempt an unauthorised company switch and confirm refusal.
- [ ] Sign out; confirm the session cannot be refreshed.

### Organisation and catalogues

- [ ] List/create/update a department in the active company.
- [ ] List/create/update a location and organisation unit.
- [ ] Confirm duplicate company-scoped codes are rejected.
- [ ] Confirm cross-company identifiers cannot be read or linked.
- [ ] View frameworks, framework rules and KPI definitions.

### KPI configuration and target

- [ ] Create or update a tenant-scoped KPI configuration.
- [ ] Reject owner/approver relationships from another company.
- [ ] Create, submit and approve a target using different users.
- [ ] Confirm self-approval is refused.
- [ ] Confirm an approved target cannot be edited or deleted.
- [ ] Create a new target version and verify supersession.
- [ ] Confirm KPI Targets, not compatibility KPI Goals, drive the workflow.

### KPI actual and approval

- [ ] Submit an actual against the approved target.
- [ ] Verify server-generated code, variance, percentage, target-met and RAG.
- [ ] Confirm evidence-required validation where configured.
- [ ] Approve or reject with the configured approver.
- [ ] Confirm raw refresh tokens, password hashes and token hashes never appear
      in JSON responses.
- [ ] Confirm approval history is append-only.

### Automatic risk and risk workflow

- [ ] Submit a synthetic actual that breaches the threshold.
- [ ] Confirm exactly one active automatic risk is created.
- [ ] Review the risk and verify residual score calculation.
- [ ] Add a treatment; complete it by appending a superseding row.
- [ ] Confirm reviews and treatments cannot be edited or deleted.
- [ ] Close and reopen the risk under the active business rules.
- [ ] Confirm cross-company risk actions are refused.

### Dashboard and navigation truthfulness

- [ ] Confirm dashboard metrics match direct database/API counts.
- [ ] Exercise all 16 protected LIVE route patterns.
- [ ] Confirm 29 visible unfinished routes show **In Development**, not fake
      operational pages.
- [ ] Confirm the GenRAC route shows **Awaiting Integration** and makes no
      connectivity claim.
- [ ] Confirm 22 compatibility routes remain hidden from navigation/search.
- [ ] Confirm dormant prototype components are not routed.

## Database and security observations

- [ ] `audit_events` rejects UPDATE and DELETE.
- [ ] Approved KPI targets reject prohibited mutation/deletion.
- [ ] KPI approval, risk review and risk treatment histories reject UPDATE and
      DELETE.
- [ ] Cross-tenant composite relationships are rejected.
- [ ] No generated uploads, dumps, logs or secrets are present in Git.
- [ ] Known debt is acknowledged: no PostgreSQL RLS and
      `COMPANY_ADMIN` still has UAT-only wildcard permission `"*"`.

## Exit criteria

- [ ] Findings are severity-rated with reproducible steps and synthetic IDs.
- [ ] Any HIGH or CRITICAL finding blocks release classification.
- [ ] Required fixes have a separate reviewed change and real-stack retest.
- [ ] Test sessions are logged out/revoked.
- [ ] Temporary credentials are rotated or destroyed.
- [ ] Disposable databases/uploads/evidence are removed according to policy.
- [ ] Final classification states either UAT-ready, not UAT-ready, or blocked;
      it never says production-ready without a separate production assessment.

## Current baseline

The real-stack UAT completed before Milestone 0 passed after PR #19
remediation. Automated Playwright remains intercepted. A human real-stack
browser walkthrough remains required for each release candidate.
