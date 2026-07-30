# Schema alignment

The active schema is aligned across:

- 33 models and 16 enums in `backend/prisma/schema.prisma`;
- ten immutable migration directories in `backend/prisma/migrations/`;
- 33 application tables, 51 application triggers, 204 constraints and 163
  application indexes observed in a freshly migrated disposable PostgreSQL
  catalogue (164 `public` indexes including the `_prisma_migrations`
  primary-key index);
- active Prisma repositories and services.

The full field-level result is
[database/database-dictionary.md](./database/database-dictionary.md).

Key authority decisions:

- persistence uses `tenant`; product language uses Company;
- global catalogues are Framework, FrameworkRule, KpiDefinition and Permission;
- tenant-owned operational records carry `tenant_id`;
- `kpi_targets` is the active target authority;
- `kpi_goals` is read-only compatibility data;
- KPI approvals, Policy approvals, Checkpoint reviews, risk reviews, risk
  treatments and audit events are append-only;
- Policy, Policy Version, Control and Checkpoint persistence exists as the
  Milestone 4 Slice 1 foundation, but has no API or live frontend route yet;
- no Evidence, Gap, CAPA, Import, Task, Notification, Report or GenRAC model
  exists.

PostgreSQL RLS is not implemented. Tenant isolation currently combines
authenticated context, active membership revalidation, repository predicates,
composite tenant FKs, constraints and triggers.
