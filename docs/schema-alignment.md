# Schema alignment

The active schema is aligned across:

- 23 models and 11 enums in `backend/prisma/schema.prisma`;
- nine immutable migration directories in `backend/prisma/migrations/`;
- 23 application tables, 15 application triggers, 118 constraints and 98
  indexes observed in a freshly migrated disposable PostgreSQL catalogue;
- active Prisma repositories and services.

The full field-level result is
[database/database-dictionary.md](./database/database-dictionary.md).

Key authority decisions:

- persistence uses `tenant`; product language uses Company;
- global catalogues are Framework, FrameworkRule, KpiDefinition and Permission;
- tenant-owned operational records carry `tenant_id`;
- `kpi_targets` is the active target authority;
- `kpi_goals` is read-only compatibility data;
- KPI approvals, risk reviews, risk treatments and audit events are append-only;
- no Policy, Control, Evidence, Gap, CAPA, Import, Task, Notification, Report or
  GenRAC model exists.

PostgreSQL RLS is not implemented. Tenant isolation currently combines
authenticated context, active membership revalidation, repository predicates,
composite tenant FKs, constraints and triggers.
