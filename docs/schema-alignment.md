# Schema alignment

The active schema is aligned across:

- models and enums in `backend/prisma/schema.prisma` including Evidence foundation
  and typed Control/Checkpoint/KPI-Actual link tables;
- ordered immutable migration directories in `backend/prisma/migrations/`
  (Slice 5D adds `evidence_kpi_actual_links`);
- active Prisma repositories and services for Evidence metadata, links, gates,
  and file APIs.

The full field-level result is
[database/database-dictionary.md](./database/database-dictionary.md).

Key authority decisions:

- persistence uses `tenant`; product language uses Company;
- global catalogues are Framework, FrameworkRule, KpiDefinition and Permission;
- tenant-owned operational records carry `tenant_id`;
- `kpi_targets` is the active target authority;
- `kpi_goals` is read-only compatibility data;
- KPI approvals, Policy approvals, Checkpoint reviews, risk reviews, risk
  treatments, Evidence review decisions and audit events are append-only;
- Evidence metadata foundation (Milestone 5 Slice 1) exists with typed Control
  and Checkpoint link tables; file upload, link APIs and approve/reject HTTP
  mutations are deferred;
- no Gap, CAPA, Import, Task, Notification, Report or GenRAC model exists.

PostgreSQL RLS is not implemented. Tenant isolation currently combines
authenticated context, active membership revalidation, repository predicates,
composite tenant FKs, constraints and triggers.
