# KPI Slice A permission technical debt

The development and test seed currently grants `COMPANY_ADMIN` the legacy `*`
permission. Slice A leaves that wildcard unchanged because removing it requires
a separate, reviewed permission migration across every existing capability.

Slice A still creates and assigns these explicit permissions to
`COMPANY_ADMIN`:

- `kpi-config:write`
- `kpi-target:write`
- `kpi-target:approve`

`COMPANY_USER` receives none of them by default. A later permission-hardening
task must replace the wildcard with a complete explicit permission set, migrate
existing role assignments safely, and update tests that currently exercise the
wildcard path.
