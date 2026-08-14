# pgAdmin sample — Control API

Use this walkthrough after running the Control Postman collection against a
local seeded database. Synthetic `.test` identities and codes only.

Do not edit rows or schema in pgAdmin during the sample. The REST API and database
triggers are the authority.

## 1. Send a Postman request

1. Import `postman/Control-API.postman_collection.json` and the matching
   environment.
2. Run **Create Control** (or a later step such as mapping or archive).
3. Note the HTTP method, path (for example `POST /api/v1/controls`), status
   (for example `201`), and JSON response.
4. Copy `data.id` and `data.code` from the response.

## 2. Open pgAdmin

Connect to the same local PostgreSQL database the backend uses. Filter every
query by the active Company `tenant_id` (or join through `tenants.code`, for
example `COM-001`).

## 3. Inspect Control register rows

```sql
SELECT id, code, title, lifecycle_status, implementation_status,
       control_type, frequency, archived_at, created_at
FROM controls
WHERE tenant_id = '<company-tenant-uuid>'
ORDER BY code;
```

Confirm the new Control code, lifecycle (`ACTIVE` / `INACTIVE` / `ARCHIVED`),
and implementation status match the API response.

## 4. Inspect mapping history

```sql
-- Policy Version mappings (active and historical)
SELECT id, control_id, policy_id, policy_version_id, is_active, created_at
FROM control_policy_versions
WHERE tenant_id = '<company-tenant-uuid>'
  AND control_id = '<control-uuid>'
ORDER BY created_at;

-- Framework mappings
SELECT id, control_id, framework_id, is_active, created_at
FROM control_frameworks
WHERE tenant_id = '<company-tenant-uuid>'
  AND control_id = '<control-uuid>'
ORDER BY created_at;

-- Framework Rule mappings
SELECT id, control_id, framework_id, framework_rule_id, is_active, created_at
FROM rule_controls
WHERE tenant_id = '<company-tenant-uuid>'
  AND control_id = '<control-uuid>'
ORDER BY created_at;
```

After a replacement PUT, previous rows remain with `is_active = false`. Active
rows show the current mapping set.

## 5. Inspect audit events

```sql
SELECT id, action, entity_type, entity_id, metadata, created_at
FROM audit_events
WHERE tenant_id = '<company-tenant-uuid>'
  AND entity_type = 'CONTROL'
  AND entity_id = '<control-uuid>'
ORDER BY created_at DESC, id DESC;
```

Expect actions such as `CONTROL_CREATED`, `CONTROL_UPDATED`,
`CONTROL_MAPPINGS_CHANGED`, `CONTROL_ACTIVATED`, `CONTROL_DEACTIVATED`, and
`CONTROL_ARCHIVED`. Metadata contains safe field names and mapping IDs only —
not free-text objectives or notes.

## 6. Inspect Checkpoints for archive protection

```sql
SELECT id, code, control_id, lifecycle_status, title
FROM checkpoints
WHERE tenant_id = '<company-tenant-uuid>'
  AND control_id = '<control-uuid>';
```

If any Checkpoint is `ACTIVE`, `POST /controls/:id/archive` returns
`409 CONTROL_HAS_ACTIVE_CHECKPOINTS`. Seeded Companies may already include a
synthetic Control (for example `SMP-CTL-001` / `CTL-001`) with an ACTIVE
Checkpoint — use that ID in the Postman `controlWithActiveCheckpointId`
placeholder for the optional rejection sample.

## 7. Warnings

- Do not manually UPDATE or DELETE Controls, mappings, Checkpoints or audit
  rows for sample “fixes”.
- Do not change migrations or constraints from pgAdmin.
- Cross-tenant IDs must not appear when you filter by the active Company.
