# Known limitations

These limitations remain after Milestone 0. They must not be hidden by UAT
language or status-page presentation.

## Production blockers

1. `COMPANY_ADMIN` still receives wildcard permission `"*"`. Replace it with a
   reviewed enumerated set and migrate existing assignments before production.
2. PostgreSQL RLS is not implemented. Tenant isolation currently depends on
   application context/predicates plus database FKs, constraints and triggers.
3. There is no automated browser-to-PostgreSQL E2E suite. Playwright intercepts
   APIs; human real-stack verification remains required.
4. AWS, production networking, managed PostgreSQL, secret management,
   observability, alerting, TLS termination, autoscaling and disaster-recovery
   infrastructure are not configured.
5. The local backup/restore drill proves mechanics on small synthetic data; it
   is not a production RPO/RTO or load/scale result.
6. The default branch is verified as `main`, but its protection/ruleset,
   required-review, required-check, conversation-resolution,
   force-push/deletion and administrator-bypass controls still require
   independent GitHub evidence before Milestone 0 may merge.

## Product limitations

- Policy, Control, Evidence, Gap, CAPA, Import, Tasks, Notifications, Reports,
  audit query/export and settings domains are not operational.
- Evidence-required KPI approval deliberately fails closed because the Evidence
  domain is not implemented.
- GenRAC has no live connection and awaits client access and interface review.
- `kpi_goals` remains legacy compatibility data. `kpi_targets` is authoritative.
- A non-blocking frontend bundle-size warning remains.

## Storage and operations

- `FILE_STORAGE_DRIVER=local` is development-only storage.
- S3 is recognised but unimplemented and is rejected during configuration.
- Malware scanning, signed download URLs, retention enforcement, encryption
  key policy and object-level tenant controls are not implemented.
- pgAdmin is administrative tooling only; Prisma migrations remain the schema
  authority.

## Governance and CI supply chain

PR #19 was merged with zero checks and remains a recorded governance exception.
The current workflow defines five checks, but a workflow file alone does not
prove branch protection. The default branch has been independently verified as
`main`; all protection/ruleset controls remain pending.

Current mutable references:

- `actions/checkout@v6`;
- `actions/setup-node@v6`;
- `ghcr.io/gitleaks/gitleaks:v8.30.1`;
- unqualified `semgrep/semgrep`.

Mutable tags can move to different code without a repository commit. Pinning
actions and containers by immutable digest/SHA should be a separate focused CI
supply-chain hardening task; Milestone 0 does not mix that dependency work into
the re-baseline.
