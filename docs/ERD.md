# Active entity relationship overview

This diagram reflects all 33 Prisma models. It intentionally excludes Evidence,
Gap, CAPA, Import, Task, Notification and Report models because they are not
implemented. Policy, Control and Checkpoint persistence is present, although
its APIs and live frontend workflows are deferred beyond Milestone 4 Slice 1.

```mermaid
erDiagram
  Tenant ||--o{ UserCompany : memberships
  User ||--o{ UserCompany : belongs_to
  Tenant o|--o{ User : default_for
  Tenant ||--o{ Role : owns
  User ||--o{ UserRole : assigned
  Role ||--o{ UserRole : grants
  Role ||--o{ RolePermission : contains
  Permission ||--o{ RolePermission : grants

  Tenant ||--o{ OrgDepartment : owns
  Tenant ||--o{ OrgLocation : owns
  Tenant ||--o{ OrgUnit : owns
  OrgDepartment o|--o{ UserCompany : classifies

  Framework ||--o{ FrameworkRule : contains
  Tenant ||--o{ Policy : owns
  Policy ||--o{ PolicyVersion : versions
  PolicyVersion ||--o{ PolicyFramework : maps
  Framework ||--o{ PolicyFramework : classifies
  PolicyVersion ||--o{ PolicyApproval : decisions

  Tenant ||--o{ Control : owns
  Control ||--o{ ControlPolicyVersion : maps
  PolicyVersion ||--o{ ControlPolicyVersion : governs
  Control ||--o{ ControlFramework : maps
  Framework ||--o{ ControlFramework : classifies
  ControlFramework ||--o{ RuleControl : enables
  FrameworkRule ||--o{ RuleControl : specifies
  Control ||--o{ Checkpoint : verifies
  Checkpoint ||--o{ CheckpointReview : reviews

  KpiDefinition ||--o{ KpiGoal : compatibility
  Tenant ||--o{ KpiGoal : owns

  KpiDefinition ||--o{ KpiConfiguration : configures
  Tenant ||--o{ KpiConfiguration : owns
  OrgDepartment o|--o{ KpiConfiguration : scopes
  OrgLocation o|--o{ KpiConfiguration : scopes
  OrgUnit o|--o{ KpiConfiguration : scopes

  KpiConfiguration ||--o{ KpiTarget : versions
  Tenant ||--o{ KpiTarget : owns
  KpiConfiguration ||--o{ KpiActual : records
  KpiTarget ||--o{ KpiActual : measured_against
  KpiActual ||--o{ KpiApproval : decisions

  KpiActual o|--o{ Risk : triggers
  KpiConfiguration o|--o{ Risk : traces
  KpiTarget o|--o{ Risk : traces
  Tenant ||--o{ Risk : owns
  Risk ||--o{ RiskReview : reviewed_by
  Risk ||--o{ RiskTreatment : treated_by
  RiskTreatment o|--o{ RiskTreatment : supersedes

  User ||--o{ RefreshToken : sessions
  Tenant ||--o{ RefreshToken : scopes
  Tenant ||--o{ AuditEvent : records
  User o|--o{ AuditEvent : acts
```

`KpiTarget` is authoritative. `KpiGoal` is compatibility data. Composite tenant
foreign keys, checks and triggers are detailed in
[constraints-and-triggers.md](./database/constraints-and-triggers.md).
