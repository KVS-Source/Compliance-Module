# Security baseline

## Authentication and sessions

- Login accepts email/password over the same-origin API.
- Passwords are verified with Argon2 and password hashes never appear in DTOs.
- JWT access tokens are short-lived, issuer-bound, audience-bound and held only
  in frontend memory.
- `JWT_ISSUER` is required, trimmed and non-empty. Production placeholder
  issuers are rejected.
- `JWT_ACCESS_TTL` accepts only the validated duration subset supported by the
  signing library.
- Opaque refresh tokens are stored only as SHA-256 hashes in PostgreSQL.
- Refresh rotation is single-use; reuse revokes the token family.
- The refresh cookie is HTTP-only, `SameSite=Strict`, scoped to
  `/api/v1/auth`, and must be `Secure` in production.
- Logout clears the cookie even when a session is missing, expired or unknown.

## Tenant isolation

The bearer token supplies one active Company UUID. Every protected request
revalidates active user, tenant and `UserCompany` membership before a
tenant-owned repository runs. Request bodies do not establish tenant authority.

Tenant-owned queries include `tenantId`. Cross-tenant relationships are
defended again by composite foreign keys and membership triggers. Integration
coverage exercises negative read/write/relationship cases against real
PostgreSQL.

PostgreSQL RLS is not implemented. This layered application/database design is
the current UAT boundary, not a claim that database-native isolation is
complete.

## RBAC

Backend `permit()` is authoritative; frontend permission boundaries are user
experience only. Named permissions protect active reads, writes, approvals and
risk actions, including `policies:read`, `policies:write`, `policies:submit`,
`policies:approve`, `controls:read`, `controls:write`, `checkpoints:read`,
`checkpoints:write` and `checkpoints:review`.

`COMPANY_ADMIN` accepts wildcard `"*"`. This is UAT-only technical debt and a
production blocker. New roles must not copy the wildcard.

## Database integrity and audit

- `audit_events` rejects UPDATE and DELETE.
- `kpi_approvals`, `risk_reviews`, `risk_treatments` and `checkpoint_reviews`
  are append-only.
- Checkpoint Review observation/recommendation are never written to audit
  metadata or application logs.
- approved KPI targets reject deletion and prohibited mutation;
- self-approval constraints exist for KPI targets and actuals;
- active actor-membership triggers protect KPI and risk writes;
- composite tenant FKs prevent cross-tenant lineage;
- partial unique indexes prevent competing active workflow rows.

See [constraints-and-triggers.md](../database/constraints-and-triggers.md).

## HTTP and logging

- Helmet applies the active same-origin CSP and standard response headers.
- CORS is intentionally absent because the supported topology is same-origin.
- production rejects permissive `TRUST_PROXY=true`;
- authentication, refresh and general API paths are rate-limited; production
  cannot disable the limiter;
- request validation uses strict Zod schemas;
- Prisma/internal errors are translated to safe envelopes;
- structured logging redacts authorization, cookies, passwords, access tokens
  and refresh tokens, including response `Set-Cookie`.

## Environment and storage

- production rejects weak/placeholder JWT secrets, insecure cookies,
  permissive proxy trust and disabled rate limiting;
- seeds are explicit and production demo seeding is permanently prohibited;
- integration execution refuses the development or production database;
- local file storage is the only active provider;
- unknown storage names and recognised-but-unimplemented S3 selection fail
  closed during configuration.

## CI checks

The workflow currently defines these exact GitHub check names:

1. `Backend and isolated PostgreSQL`
2. `Frontend and Playwright`
3. `Architecture guards`
4. `Gitleaks`
5. `Semgrep SAST`

The workflow uses repository-scoped read-only contents permission. Gitleaks
scans Git history with redacted output. Semgrep scans active `frontend` and
`backend` TypeScript/Express/OWASP rules.

## Required GitHub governance

The workflow file does not prove enforcement. The default branch is verified as
`main`; protection/ruleset evidence remains pending and blocks merge. The
authoritative evidence table and collection requirements are maintained in
[governance-ci-hardening.md](../reviews/governance-ci-hardening.md).
