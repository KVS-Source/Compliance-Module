# Production architecture, environment and deployment

## Supported release shape

This release supports controlled internal client use through the deadline
fallback architecture in `docker-compose.production.yml`:

`client → TLS reverse proxy → static React frontend / Express API → PostgreSQL`

The proxy is the only public component. PostgreSQL is on an internal Docker
network with no host port. The backend is not published to the host. Evidence
content is stored on the private `production_evidence` volume and is available
only through authenticated API downloads. Database and Evidence volumes survive
container recreation. This is not a public multi-tenant SaaS architecture.

## Inputs held outside Git

Copy `.env.production.example` to a protected file outside the repository and
replace every placeholder. The human operator must supply:

- approved production hostname and matching HTTPS CORS origin;
- PostgreSQL database name, user and password;
- independently generated access-token and refresh-token secrets;
- approved JWT issuer and token lifetimes;
- exact reverse-proxy hop count;
- host path containing `tls.crt` and `tls.key`;
- encrypted backup destination and backup password file;
- approved client company and user details;
- authoritative workbook path outside Git.

The backend refuses production startup for absent or placeholder secrets,
identical access/refresh secrets, missing database/CORS/domain/storage values,
localhost frontend URLs, insecure cookies, permissive proxy trust, disabled
rate limits/readiness, debug/silent logging, API docs or prototype routes.

## DNS and certificates

Create an A/AAAA record for the approved hostname pointing to the controlled
server. Obtain a certificate from the client's approved CA or ACME process and
place only the certificate chain and private key on the server as `tls.crt` and
`tls.key` with restricted permissions. Never copy keys into Git or an image.
The production proxy redirects HTTP to HTTPS, permits TLS 1.2/1.3, sends HSTS
and other browser security headers, routes `/api/` to the backend, and provides
SPA fallback through the static frontend container.

An IP-only HTTP deployment may use `deploy/nginx/local-smoke.conf.template`
only for a temporary controlled validation. It is not final production.

## Deployment

Run from a reviewed release tag such as `v1.0.0-client-release`:

```sh
docker compose --env-file <protected-env-file> \
  -f docker-compose.production.yml --profile tools build
docker compose --env-file <protected-env-file> \
  -f docker-compose.production.yml --profile tools run --rm migrate
docker compose --env-file <protected-env-file> \
  -f docker-compose.production.yml up -d backend frontend proxy
docker compose --env-file <protected-env-file> \
  -f docker-compose.production.yml ps
```

Do not run `migrate dev`, reset, a development seed or the sample seed. Inspect
`/api/v1/health` and `/api/v1/ready` through HTTPS before allowing client
access. Readiness verifies PostgreSQL, a write/read/delete Evidence-volume
probe, and that no active production user is assigned a wildcard role.

## Runtime controls

- The backend image runs as UID/GID 10001 and starts only after PostgreSQL and
  the Evidence volume are ready.
- Prisma uses configurable bounded connection, pool and connect timeouts.
- CORS reflects only exact configured HTTPS origins and never `*`.
- Request bodies and Evidence uploads have independent size ceilings.
- Browser workbook imports are capped at 20 MiB in the API. NGINX
  `client_max_body_size` defaults to **21m** (`NGINX_CLIENT_MAX_BODY_SIZE`) so
  multipart framing still fits under the proxy; oversized uploads receive a
  JSON **413** envelope with code `UPLOAD_TOO_LARGE` (not an HTML error page).
- Abandoned browser import previews under `.import-tmp` expire after
  `IMPORT_PREVIEW_TTL_HOURS` (default 24) and are swept on startup and on a
  periodic timer.
- API, login, refresh and Evidence upload rate limits remain enabled.
- Request logs are structured JSON with request IDs, response duration and
  token/cookie/password redaction.
- API documentation, prototype routes, Vite and API mocks are absent from the
  production runtime.
- `SIGTERM`/`SIGINT` stop accepting requests, clear the import-temp sweeper, and
  disconnect Prisma within the configured shutdown deadline.

Docker JSON logs may be shipped by the approved host logging driver to
CloudWatch or the client's collector. Log shipping, alert destinations and
retention must be selected before opening access.

## Tenant isolation and PostgreSQL

Tenant context comes only from the signed access token. Active membership is
rechecked on every protected request, repositories scope tenant-owned queries,
cross-tenant relationships have database constraints/triggers, and integration
tests cover negative isolation. The client never receives database access.

PostgreSQL RLS is not implemented. The compensating controls above, the private
database network and restricted operator access are mandatory until reviewed
RLS can be added without breaking the application.
