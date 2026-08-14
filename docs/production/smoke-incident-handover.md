# Production smoke, incident response and client handover

## Non-destructive smoke

Run `npm run smoke:production --prefix backend` with a dedicated read-capable
smoke user, `SMOKE_BASE_URL`, `SMOKE_USER_EMAIL`, mode-0600
`SMOKE_USER_PASSWORD_FILE`, a known foreign-tenant detail path in
`SMOKE_CROSS_TENANT_RESOURCE_PATH`, and an approved Evidence download path in
`SMOKE_EVIDENCE_DOWNLOAD_PATH`. The script checks health/readiness, login and
Company context, 31% compliance, 91 KPIs, Framework/Policy/Evidence/Risk/Gap/
CAPA/Import lists, CSV, unauthenticated denial, foreign-tenant denial and the
authenticated Evidence download contract. Local HTTP requires the explicit
`ALLOW_LOCAL_PRODUCTION_SMOKE=true`; client release must use HTTPS.

The release operator additionally records:

- database and Evidence file persistence after backend/container recreation;
- encrypted backup filename/checksum and successful disposable restore;
- request IDs in access logs and absence of password/token/cookie markers;
- UI login, navigation, safe error states, logout and expired-session return to
  login through the real stack;
- NGINX workbook upload limit (`NGINX_CLIENT_MAX_BODY_SIZE` default **21m**) and
  JSON **413** `UPLOAD_TOO_LARGE` for oversized bodies (never an HTML error page);
- Evidence upload ceilings remaining independently enforced at 10 MiB.

Do not perform mutating workflow checks against live client records. Use the
already verified integration suite or a separately approved disposable tenant.

## Incident response

1. Restrict client access and record UTC detection time and affected hostname.
2. Preserve application/proxy logs, database activity and backup metadata;
   never copy secrets or Evidence content into chat/tickets.
3. Classify authentication, tenant isolation, data integrity, availability,
   Evidence exposure or infrastructure failure.
4. Rotate the affected secret and revoke sessions when credentials may be
   exposed. Changing the refresh hash secret invalidates outstanding refresh
   sessions and requires users to sign in again.
5. Select application/configuration rollback or verified database-plus-Evidence
   recovery; obtain incident authority before state changes.
6. Validate readiness, cross-tenant denial and smoke checks before reopening.
7. Notify the client through the approved channel and document root cause,
   recovery point, lost/changed data, corrective actions and follow-up owner.

## Operational handover checklist

- approved HTTPS URL, support contact and access window;
- named users, least-privilege roles and one-time-password delivery/rotation;
- company/workbook import report and verified totals;
- Evidence storage rules, allowed types/size and unavailable imported files;
- backup owner, frequency, retention, recovery authority and latest restore test;
- monitoring/incident contacts and maintenance-window process;
- accepted limitations below and confirmation that this is controlled internal
  release, not public SaaS or GenRAC-connected service.

## Accepted limitations

- PostgreSQL RLS is absent; application tenant enforcement and private database
  access are compensating controls.
- Evidence uses a persistent encrypted host/server volume fallback. S3,
  malware scanning, content-disarm and signed URLs are not implemented.
- At-rest volume encryption depends on the approved host/cloud disk control;
  the application does not implement its own Evidence encryption layer.
- Users change their own password from the account menu; the change is an
  immediate rotation that revokes every session for that user. An administrator
  can still set a password directly. Neither path can be *forced*: the schema
  has no must-change-password flag, so first-login and periodic rotation remain
  operator-driven by procedure rather than enforced by the application.
- Real-stack browser smoke is human-operated; Playwright uses intercepted APIs.
- GenRAC connectivity, public SaaS readiness, autoscaling, managed observability
  and a tested production RPO/RTO are not claimed.
- GitHub branch protection evidence remains an independent governance item.
- The non-blocking frontend bundle-size warning and documented dependency
  advisories remain subject to their existing risk records.
