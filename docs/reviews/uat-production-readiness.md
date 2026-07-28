# UAT production-readiness boundary

The `release/client-uat-demo` branch is intended for controlled UAT review. It
is not production-ready and must not be described or deployed as such.

## Mandatory RBAC work before production

`COMPANY_ADMIN` currently receives the wildcard permission `"*"` from the
development, test, and UAT demo seeds. This is an **UAT-only accepted
limitation**. Backend permission middleware recognizes that wildcard, while no
public role-management API currently permits clients to create arbitrary
wildcard roles.

The next RBAC milestone must replace `"*"` with an enumerated permission set,
migrate existing assignments safely, and preserve negative authorization and
tenant-isolation coverage. Production readiness remains blocked until that work
is reviewed and verified.

## Demo data boundary

The demo seed is an explicit operator command for isolated non-production
databases. Application startup, Docker startup, migrations, and deployment do
not invoke it. Production execution is unconditionally prohibited.

## Browser-test boundary

Playwright tests exercise the React application with browser-intercepted API
responses. PostgreSQL and Express behavior is verified separately through the
isolated backend integration suite; there is not yet a browser-to-database
end-to-end suite.
