# API Endpoint Handoff Guide

Base URL for local development: `http://127.0.0.1:8000`

Except for login and health, send `Authorization: Bearer <access_token>`. UUIDs below are illustrative.

## Permission terminology

- **Public:** no JWT required.
- **Authenticated tenant user:** valid JWT; all data is filtered by the JWT `client_id`.
- **Tenant superuser:** authenticated user with `is_superuser = true`.
- **Platform administrator:** authenticated user with `is_platform_admin = true`.

Role/permission tables and codes are ready for fine-grained RBAC. A basic `require_permission("<code>")` dependency is now available (see `app/api/deps.py`): tenant superusers and platform administrators implicitly hold every permission, and other users must have the code assigned through one of their roles. It is currently enforced on the administration routes (roles and permissions). The table below states the permission actually enforced by the code today.

## Health

| Method | Endpoint | Request body | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/health` | None | `{"status":"ok","service":"GenBioCa GRC API"}` | Public | Not audited |

## Authentication

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/login` | `{"client_slug":"genbioca","email":"admin@genbioca.local","password":"ChangeMe-Admin-2026!"}` | `{"access_token":"eyJ...","token_type":"bearer"}` | Public | `login` on success; `login_failed` when the tenant user is identifiable |

## Clients

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/clients/me` | None | `{"id":"<client_uuid>","name":"GenBioCa","slug":"genbioca","status":"active","settings":{}}` | Authenticated tenant user | Not audited |
| GET | `/api/v1/clients` | None | `[{"id":"<client_uuid>","name":"GenBioCa","slug":"genbioca","status":"active"}]` | Platform administrator | Not audited |
| POST | `/api/v1/clients` | `{"name":"Example Client","slug":"example-client","contact_email":"admin@example.com"}` | `{"id":"<client_uuid>","name":"Example Client","slug":"example-client","status":"active"}` | Platform administrator | `create` on `client` |
| POST | `/api/v1/clients/{client_id}/admin` | `{"email":"admin@example.com","password":"long-demo-password","full_name":"Client Admin","is_superuser":true}` | `{"id":"<user_uuid>","client_id":"<client_uuid>","email":"admin@example.com","is_superuser":true}` | Platform administrator | `create_client_admin` on `user` |

## Users

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/users/me` | None | `{"id":"<user_uuid>","email":"admin@genbioca.local","full_name":"GenBioCa Administrator","is_superuser":true}` | Authenticated tenant user | Not audited |
| GET | `/api/v1/users?offset=0&limit=50` | None | `[{"id":"<user_uuid>","email":"kpi.owner@genbioca.local","status":"active"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/users` | `{"email":"reviewer@genbioca.local","password":"long-demo-password","full_name":"Reviewer","is_superuser":false}` | `{"id":"<user_uuid>","client_id":"<client_uuid>","email":"reviewer@genbioca.local","status":"active"}` | Tenant superuser | `create` on `user` |
| PATCH | `/api/v1/users/{user_id}` | `{"full_name":"Senior Reviewer","is_active":true}` | `{"id":"<user_uuid>","full_name":"Senior Reviewer","is_active":true}` | Tenant superuser | `update` on `user`, including field changes |

## Frameworks

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/frameworks` | None | `[{"id":"<framework_uuid>","code":"ISO_27001","name":"ISO 27001","version":"2022","status":"active","is_active":true}]` | Authenticated tenant user | Not audited |

`include_out_of_scope=true` may be used for historical administration. Default responses include only the nine current active frameworks.

## KPIs

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/kpis` | None | `[{"id":"<kpi_uuid>","kpi_code":"KPI-CMP-001","name":"Compliance action closure rate","use_in_scope":true,"enabled":true}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/kpis` | `{"kpi_code":"KPI-QMS-002","name":"Internal audit completion","unit":"%","frequency":"monthly","use_in_scope":true,"enabled":true}` | `{"id":"<kpi_uuid>","client_id":"<client_uuid>","kpi_code":"KPI-QMS-002","status":"active"}` | Authenticated tenant user | `create` on `kpi` |
| GET | `/api/v1/kpis/{kpi_id}` | None | `{"id":"<kpi_uuid>","kpi_code":"KPI-CMP-001","enabled":true,"status":"active"}` | Authenticated tenant user | Not audited |
| PATCH | `/api/v1/kpis/{kpi_id}` | `{"use_in_scope":false}` | `{"id":"<kpi_uuid>","use_in_scope":false,"enabled":false}` | Authenticated tenant user | `update` on `kpi`, including automatic disablement |

All KPI queries are client-scoped. `kpi_code` is unique inside the client.

## KPI framework mappings

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/kpis/{kpi_id}/framework-mappings` | None | `[{"id":"<mapping_uuid>","kpi_id":"<kpi_uuid>","framework_id":"<framework_uuid>","control_id":"<control_uuid>","status":"active"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/kpis/{kpi_id}/framework-mappings` | `{"kpi_id":"<kpi_uuid>","framework_id":"<framework_uuid>","control_id":"<control_uuid>"}` | `{"id":"<mapping_uuid>","client_id":"<client_uuid>","status":"active"}` | Authenticated tenant user | `create` on `kpi_framework_mapping` |

Only current allowlisted frameworks can be mapped. If supplied, the control must belong to the framework.

## KPI targets

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/kpi-targets?kpi_id={kpi_id}` | None | `[{"id":"<target_uuid>","kpi_id":"<kpi_uuid>","period_start":"2026-07-01","period_end":"2026-07-31","target_value":"95.0000"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/kpi-targets` | `{"kpi_id":"<kpi_uuid>","period_start":"2026-08-01","period_end":"2026-08-31","target_value":95,"warning_threshold":90,"critical_threshold":85}` | `{"id":"<target_uuid>","client_id":"<client_uuid>","target_value":"95.0000","status":"active"}` | Authenticated tenant user | `create` on `kpi_target` |
| PATCH | `/api/v1/kpi-targets/{target_id}` | `{"target_value":96}` | `{"id":"<target_uuid>","target_value":"96.0000"}` | Authenticated tenant user | `update` on `kpi_target` |

Targets can only be created for an enabled, in-scope KPI.

## KPI actuals

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/kpi-actuals?kpi_id={kpi_id}` | None | `[{"id":"<actual_uuid>","target_value":"95.0000","actual_value":"96.0000","variance":"1.0000","rag_status":"green","approval_status":"approved"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/kpi-actuals` | `{"kpi_id":"<kpi_uuid>","kpi_target_id":"<target_uuid>","period_start":"2026-08-01","period_end":"2026-08-31","target_value":95,"actual_value":93,"rag_status":"amber","evidence_required":true}` | `{"id":"<actual_uuid>","variance":"-2.0000","approval_status":"pending","status":"open"}` | Authenticated tenant user | `submit` on `kpi_actual` |
| PATCH | `/api/v1/kpi-actuals/{actual_id}` | `{"approval_status":"approved"}` | `{"id":"<actual_uuid>","approval_status":"approved","approved_by":"<user_uuid>","approved_at":"2026-07-06T10:00:00Z"}` | Authenticated tenant user | `approve`, `approval_decision`, `close`, or `update` according to transition |

Approval, completion, or closure requires approved evidence linked with `entity_type = kpi_actual`.

## Policies and policy register

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/policies` | None | `[{"id":"<policy_uuid>","policy_code":"POL-ISMS-001","title":"Information Security Policy","status":"draft"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/policies` | `{"policy_code":"POL-QMS-002","title":"Document Control Policy","use_in_scope":true}` | `{"id":"<policy_uuid>","client_id":"<client_uuid>","policy_code":"POL-QMS-002","status":"draft"}` | Authenticated tenant user | `create` on `policy` |
| GET | `/api/v1/policy-register` | None | `[{"id":"<register_uuid>","policy_id":"<policy_uuid>","version":"1.0","approval_status":"pending","review_status":"pending"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/policy-register` | `{"policy_id":"<policy_uuid>","version":"1.0","effective_date":"2026-07-01","next_review_date":"2026-10-01"}` | `{"id":"<register_uuid>","approval_status":"pending","review_status":"pending","status":"draft"}` | Authenticated tenant user | `create` on `policy_register` |
| PATCH | `/api/v1/policy-register/{register_id}` | `{"status":"approved"}` | `{"id":"<register_uuid>","status":"approved","approval_status":"approved","approved_by":"<user_uuid>"}` | Authenticated tenant user | `approval_or_review_decision` or `update` |

Approved evidence linked with `entity_type = policy_register` is required before approved, reviewed, or closed status.

## Evidence

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/evidence` | None | `[{"id":"<evidence_uuid>","original_filename":"proof.pdf","approval_status":"pending","status":"active"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/evidence/upload` | Multipart fields: `file=@proof.pdf`, optional `description=Monthly proof` | `{"id":"<evidence_uuid>","original_filename":"proof.pdf","storage_provider":"local","approval_status":"pending"}` | Authenticated tenant user | `upload` on `evidence_document` |
| GET | `/api/v1/evidence/links?entity_type=kpi_actual&entity_id={actual_id}` | None | `[{"id":"<link_uuid>","evidence_document_id":"<evidence_uuid>","entity_type":"kpi_actual","entity_id":"<actual_uuid>"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/evidence/links` | `{"evidence_document_id":"<evidence_uuid>","entity_type":"kpi_actual","entity_id":"<actual_uuid>","link_type":"supporting"}` | `{"id":"<link_uuid>","client_id":"<client_uuid>","status":"active"}` | Authenticated tenant user | `link` on `evidence_link` |
| PATCH | `/api/v1/evidence/{evidence_id}` | `{"approval_status":"approved"}` | `{"id":"<evidence_uuid>","approval_status":"approved","approved_by":"<user_uuid>"}` | Authenticated tenant user | `approve`, `approval_decision`, or `update` |

## Gaps

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/gaps?status_filter=open` | None | `[{"id":"<gap_uuid>","title":"Evidence retention period not documented","severity":"medium","status":"open"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/gaps` | `{"framework_id":"<framework_uuid>","control_id":"<control_uuid>","checkpoint_id":"<checkpoint_uuid>","title":"Missing evidence","description":"Evidence was not retained.","severity":"medium","due_date":"2026-08-01"}` | `{"id":"<gap_uuid>","client_id":"<client_uuid>","status":"open"}` | Authenticated tenant user | `create` on `gap` |
| PATCH | `/api/v1/gaps/{gap_id}` | `{"status":"closed"}` | `{"id":"<gap_uuid>","status":"closed","closed_at":"2026-07-06T10:00:00Z"}` | Authenticated tenant user | `close` or `update` |

Closing requires approved evidence linked with `entity_type = gap`.

## CAPA

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/capa?status_filter=open` | None | `[{"id":"<capa_uuid>","title":"Define evidence retention schedule","capa_type":"corrective","status":"open"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/capa` | `{"gap_id":"<gap_uuid>","capa_type":"corrective","title":"Define retention schedule","root_cause":"Ownership unclear","action_plan":"Draft and approve schedule","due_date":"2026-08-15"}` | `{"id":"<capa_uuid>","client_id":"<client_uuid>","status":"open"}` | Authenticated tenant user | `create` on `capa` |
| PATCH | `/api/v1/capa/{capa_id}` | `{"status":"completed","effectiveness_review":"Effective"}` | `{"id":"<capa_uuid>","status":"completed","completed_at":"2026-07-06T10:00:00Z"}` | Authenticated tenant user | `complete` or `update` |

Completion or closure requires approved evidence linked with `entity_type = capa`.

## Dashboard

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/dashboard/summary` | None | `{"total_kpis":3,"active_kpis":3,"pending_evidence":0,"approved_evidence":1,"open_gaps":1,"open_capa":1,"overdue_capa":1,"policies_pending_review":2,"active_frameworks_count":9}` | Authenticated tenant user | Not audited |

Every dashboard query filters on the JWT client. `active_frameworks_count` is based on distinct active framework mappings for that client's enabled, in-scope KPIs and the nine-code allowlist.

## Roles

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/roles` | None | `[{"id":"<role_uuid>","client_id":"<client_uuid>","name":"Compliance Manager","status":"active"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/roles` | `{"name":"Auditor","description":"Read-only reviewer"}` | `{"id":"<role_uuid>","client_id":"<client_uuid>","name":"Auditor","status":"active"}` | `admin.manage` (superuser/platform admin bypass) | `create` on `role` |
| GET | `/api/v1/roles/{role_id}` | None | `{"id":"<role_uuid>","name":"Auditor","status":"active"}` | Authenticated tenant user | Not audited |
| PATCH | `/api/v1/roles/{role_id}` | `{"description":"Updated","status":"active"}` | `{"id":"<role_uuid>","description":"Updated","status":"active"}` | `admin.manage` | `update` on `role`, including field changes |

Roles are always tenant-scoped; a user can only see or modify roles for their own client.

## Permissions

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/permissions` | None | `[{"id":"<permission_uuid>","code":"kpi.view","name":"View KPIs","status":"active"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/permissions` | `{"code":"report.export","name":"Export reports"}` | `{"id":"<permission_uuid>","code":"report.export","status":"active"}` | `admin.manage` | `create` on `permission` |
| GET | `/api/v1/roles/{role_id}/permissions` | None | `[{"id":"<permission_uuid>","code":"kpi.view","name":"View KPIs"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/roles/{role_id}/permissions` | `{"permission_id":"<permission_uuid>"}` | `{"id":"<assignment_uuid>","role_id":"<role_uuid>","permission_id":"<permission_uuid>"}` | `admin.manage` | `assign_permission` on `role_permission` |
| DELETE | `/api/v1/roles/{role_id}/permissions/{permission_id}` | None | `204 No Content` | `admin.manage` | `remove_permission` on `role_permission` |

Permissions are a global catalog. The role in the path must belong to the caller's client. Seeded base codes: `kpi.view`, `kpi.edit`, `kpi.approve`, `evidence.view`, `evidence.upload`, `evidence.approve`, `policy.view`, `policy.edit`, `policy.approve`, `capa.view`, `capa.edit`, `capa.close`, `dashboard.view`, `admin.manage`.

## Departments

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/departments?status_filter=active` | None | `[{"id":"<department_uuid>","code":"CMP","name":"Compliance","status":"active"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/departments` | `{"code":"QMS","name":"Quality Management","parent_department_id":null}` | `{"id":"<department_uuid>","client_id":"<client_uuid>","code":"QMS","status":"active"}` | Authenticated tenant user | `create` on `department` |
| GET | `/api/v1/departments/{department_id}` | None | `{"id":"<department_uuid>","code":"QMS","name":"Quality Management","status":"active"}` | Authenticated tenant user | Not audited |
| PATCH | `/api/v1/departments/{department_id}` | `{"name":"Quality","status":"active"}` | `{"id":"<department_uuid>","name":"Quality","status":"active"}` | Authenticated tenant user | `update` on `department` |

`code` is unique per client. A parent department (if given) must belong to the same client, or the request returns 404.

## Employees

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/employees?department_id={department_id}` | None | `[{"id":"<employee_uuid>","employee_code":"GB-001","full_name":"Alice","status":"active","exit_reason":null}]` | Authenticated tenant user (`exit_reason` masked for non-HR) | Not audited |
| POST | `/api/v1/employees` | `{"employee_code":"GB-010","full_name":"New Hire","email":"hire@example.com","department_id":"<department_uuid>","designation":"Analyst","employment_type":"full_time","joining_date":"2026-07-01"}` | `{"id":"<employee_uuid>","client_id":"<client_uuid>","employee_code":"GB-010","status":"active"}` | Tenant superuser / platform admin (HR access) | `create` on `employee` |
| GET | `/api/v1/employees/{employee_id}` | None | `{"id":"<employee_uuid>","employee_code":"GB-010","full_name":"New Hire","exit_reason":null}` | Authenticated tenant user (`exit_reason` masked for non-HR) | Not audited |
| PATCH | `/api/v1/employees/{employee_id}` | `{"status":"exited","exit_date":"2026-07-05","exit_reason":"Resigned"}` | `{"id":"<employee_uuid>","status":"exited","exit_date":"2026-07-05","exit_reason":"Resigned"}` | Tenant superuser / platform admin (HR access) | `update` on `employee` |

`exit_reason` is sensitive HR data: only HR-authorized readers (tenant superuser or platform admin) receive its value; for everyone else it is returned as `null`. Only HR-authorized users can create or update employees. Fine-grained HR-role support is a planned enhancement (see the TODO in `app/api/deps.py`).

## Controls

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/controls?framework_id={framework_id}` | None | `[{"id":"<control_uuid>","framework_id":"<framework_uuid>","control_code":"DEMO-001","title":"Demo control","status":"active"}]` | Authenticated tenant user | Not audited |
| GET | `/api/v1/controls/{control_id}` | None | `{"id":"<control_uuid>","control_code":"DEMO-001","title":"Demo control","status":"active"}` | Authenticated tenant user | Not audited |
| POST | `/api/v1/controls` | `{"framework_id":"<framework_uuid>","control_code":"CTL-002","title":"Access review"}` | `{"id":"<control_uuid>","framework_id":"<framework_uuid>","control_code":"CTL-002","status":"active"}` | Platform administrator | `create` on `control` |
| PATCH | `/api/v1/controls/{control_id}` | `{"title":"Access review (annual)"}` | `{"id":"<control_uuid>","title":"Access review (annual)","status":"active"}` | Platform administrator | `update` on `control` |

Controls are a global framework catalog. Reads exclude out-of-scope frameworks unless `include_out_of_scope=true`. Create/update require the target framework to be one of the nine active frameworks (removed frameworks return 409).

## Checkpoints

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/checkpoints?control_id={control_id}` | None | `[{"id":"<checkpoint_uuid>","framework_id":"<framework_uuid>","control_id":"<control_uuid>","checkpoint_code":"DEMO-CP-001","evidence_required":true,"status":"active"}]` | Authenticated tenant user | Not audited |
| GET | `/api/v1/checkpoints/{checkpoint_id}` | None | `{"id":"<checkpoint_uuid>","checkpoint_code":"DEMO-CP-001","status":"active"}` | Authenticated tenant user | Not audited |
| POST | `/api/v1/checkpoints` | `{"framework_id":"<framework_uuid>","control_id":"<control_uuid>","checkpoint_code":"CP-010","title":"Collect evidence","evidence_required":true}` | `{"id":"<checkpoint_uuid>","checkpoint_code":"CP-010","status":"active"}` | Platform administrator | `create` on `checkpoint` |
| PATCH | `/api/v1/checkpoints/{checkpoint_id}` | `{"guidance":"Attach the signed record"}` | `{"id":"<checkpoint_uuid>","guidance":"Attach the signed record","status":"active"}` | Platform administrator | `update` on `checkpoint` |

Reads exclude out-of-scope frameworks unless `include_out_of_scope=true`. Create/update require an active framework, and the control must belong to that framework.

## Risks

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/risks?status_filter=open` | None | `[{"id":"<risk_uuid>","risk_code":"RSK-001","title":"Incomplete evidence","inherent_score":12,"risk_level":"high","status":"open"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/risks` | `{"risk_code":"RSK-002","title":"Vendor outage","description":"Critical vendor may be unavailable","department_id":"<department_uuid>","likelihood":3,"impact":4,"treatment":"Add fallback vendor","due_date":"2026-09-01"}` | `{"id":"<risk_uuid>","client_id":"<client_uuid>","inherent_score":12,"risk_level":"high","status":"open"}` | Authenticated tenant user | `create` on `risk` |
| GET | `/api/v1/risks/{risk_id}` | None | `{"id":"<risk_uuid>","risk_code":"RSK-002","inherent_score":12,"risk_level":"high"}` | Authenticated tenant user | Not audited |
| PATCH | `/api/v1/risks/{risk_id}` | `{"impact":5,"status":"open"}` | `{"id":"<risk_uuid>","inherent_score":15,"risk_level":"critical"}` | Authenticated tenant user | `close` or `update` on `risk` |

`inherent_score` is `likelihood * impact` and is recalculated on update. `risk_level` is derived from the score (1-4 low, 5-9 medium, 10-14 high, 15-25 critical). `treatment` holds the mitigation plan. Setting `status = closed` stamps `closed_at`.

## Lookups

| Method | Endpoint | Request body example | Response example | Required permission | Audit behavior |
|---|---|---|---|---|---|
| GET | `/api/v1/lookups?category=severity` | None | `[{"id":"<lookup_uuid>","client_id":null,"category":"severity","code":"low","label":"Low"}]` | Authenticated tenant user | Not audited |
| POST | `/api/v1/lookups` | `{"category":"priority","code":"high","label":"High","sort_order":10}` | `{"id":"<lookup_uuid>","client_id":"<client_uuid>","category":"priority","code":"high","status":"active"}` | Tenant superuser | `create` on `lookup` |
| GET | `/api/v1/lookups/{lookup_id}` | None | `{"id":"<lookup_uuid>","category":"priority","code":"high","label":"High"}` | Authenticated tenant user | Not audited |
| PATCH | `/api/v1/lookups/{lookup_id}` | `{"label":"High priority","sort_order":5}` | `{"id":"<lookup_uuid>","label":"High priority","sort_order":5}` | Tenant superuser | `update` on `lookup` |

Lists return global lookups (`client_id` is null) plus the caller's own lookups. Created lookups are always tenant-scoped (the `client_id` comes from the JWT). Global lookups are read-only through the tenant routes.
