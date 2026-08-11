# UAT-only accepted limitation: wildcard administrator permission

The development, test, and UAT sample seeds currently grant `COMPANY_ADMIN` the
legacy `"*"` permission. This is an accepted UAT-only limitation and must not be
presented as production-ready. Removing it requires a separate, reviewed
permission migration across every existing capability.

No public role-management API currently creates roles or permissions; mutating
role-management APIs remain deferred. The wildcard can nevertheless be created
by the approved non-production seeds and is enforced by the backend permission
middleware when present in authenticated claims.

Slice A still creates and assigns these explicit permissions to
`COMPANY_ADMIN`:

- `kpi-config:write`
- `kpi-target:write`
- `kpi-target:approve`

`COMPANY_USER` receives none of them by default. The next RBAC milestone must
replace the wildcard with a complete enumerated permission set, migrate existing
role assignments safely, and update tests that currently exercise the wildcard
path. This removal is mandatory before the application can be considered
production-ready.
