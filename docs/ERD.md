# Entity relationship overview

```mermaid
erDiagram
  CLIENT ||--o{ USER : owns
  CLIENT ||--o{ DEPARTMENT : owns
  USER }o--o{ ROLE : user_roles
  ROLE }o--o{ PERMISSION : role_permissions
  CLIENT ||--o{ KPI : owns
  KPI ||--o{ KPI_TARGET : configures
  KPI ||--o{ KPI_ACTUAL : records
  KPI ||--o{ RISK : exposes
  KPI_TARGET ||--o{ RISK : triggers
  KPI_ACTUAL ||--o{ RISK : creates
  FRAMEWORK ||--o{ CONTROL : contains
  CONTROL ||--o{ CHECKPOINT : contains
  KPI ||--o{ KPI_FRAMEWORK_MAPPING : maps
  FRAMEWORK ||--o{ KPI_FRAMEWORK_MAPPING : governs
  CLIENT ||--o{ EVIDENCE_DOCUMENT : owns
  EVIDENCE_DOCUMENT ||--o{ EVIDENCE_LINK : supports
  CLIENT ||--o{ POLICY_REGISTER : tracks
  CLIENT ||--o{ GAP : identifies
  GAP ||--o{ CAPA : remediates
  CLIENT ||--o{ RISK : assesses
  CLIENT ||--o{ AUDIT_TRAIL : records
```

`EVIDENCE_LINK` targets KPI actuals, policy register entries, CAPA, gaps, checkpoints, risks, and future proof-bearing modules through a validated polymorphic reference.

The risk register classifies KPI-linked risks as major or minor. Frequency and unit of measure remain mastered on KPI so every target, actual, risk, and dashboard uses the same definition.
