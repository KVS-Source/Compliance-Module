# pgAdmin demo — Checkpoint API

Use this walkthrough after running the Checkpoint Postman collection against a
local seeded database. Synthetic `.test` identities and codes only.

Do not edit rows or schema in pgAdmin during the demo. The REST API and database
triggers are the authority.

## 1. Send a Postman request

1. Import `postman/Checkpoint-API.postman_collection.json` and the matching
   environment.
2. Run **Create Checkpoint** (or a later Review / lifecycle step).
3. Note the HTTP method, path (for example `POST /api/v1/checkpoints`), status
   (for example `201`), and JSON response.
4. Copy `data.id` and `data.code` from the response.

## 2. Open pgAdmin

Connect to the same local PostgreSQL database the backend uses. Filter every
query by the active Company `tenant_id` (or join through `tenants.code`, for
example `COM-001`).

## 3. Inspect Checkpoint register rows

```sql
SELECT id, code, title, control_id, lifecycle_status, verification_frequency,
       evidence_required, initial_review_date, next_review_date,
       latest_review_id, last_reviewed_at, archived_at, created_at
FROM checkpoints
WHERE tenant_id = '<company-tenant-uuid>'
ORDER BY code;
```

Confirm the new Checkpoint code, lifecycle (`ACTIVE` / `INACTIVE` / `ARCHIVED`),
frequency and parent `control_id` match the API response.

## 4. Inspect Review history (append-only)

```sql
SELECT id, checkpoint_id, review_period, review_date, reviewer_id, outcome,
       next_review_date, submitted_at
FROM checkpoint_reviews
WHERE tenant_id = '<company-tenant-uuid>'
  AND checkpoint_id = '<checkpoint-uuid>'
ORDER BY submitted_at DESC, id DESC;
```

After duplicate-period attempts, only one row exists per
`(tenant_id, checkpoint_id, review_period)`. Observation and recommendation
text are readable here for local demo inspection, but they must never appear in
audit metadata or API list rows.

## 5. Verify latest-review summary

```sql
SELECT c.code, c.latest_review_id, c.last_reviewed_at, c.next_review_date,
       r.review_period, r.outcome, r.submitted_at
FROM checkpoints AS c
LEFT JOIN checkpoint_reviews AS r
  ON r.tenant_id = c.tenant_id
 AND r.checkpoint_id = c.id
 AND r.id = c.latest_review_id
WHERE c.tenant_id = '<company-tenant-uuid>'
  AND c.id = '<checkpoint-uuid>';
```

`latest_review_id` is maintained by `sync_checkpoint_latest_review`
(`submitted_at`, then UUID text). Compare with
`GET /checkpoints/:checkpointId/latest-review`.

## 6. Inspect parent Control and mappings

```sql
SELECT id, code, title, lifecycle_status, archived_at
FROM controls
WHERE tenant_id = '<company-tenant-uuid>'
  AND id = '<control-uuid>';

SELECT id, control_id, policy_id, policy_version_id, is_active
FROM control_policy_versions
WHERE tenant_id = '<company-tenant-uuid>'
  AND control_id = '<control-uuid>'
ORDER BY created_at;

SELECT id, control_id, framework_id, is_active
FROM control_frameworks
WHERE tenant_id = '<company-tenant-uuid>'
  AND control_id = '<control-uuid>'
ORDER BY created_at;

SELECT id, control_id, framework_id, framework_rule_id, is_active
FROM rule_controls
WHERE tenant_id = '<company-tenant-uuid>'
  AND control_id = '<control-uuid>'
ORDER BY created_at;
```

## 7. Inspect audit events

```sql
SELECT id, action, entity_type, entity_id, metadata, created_at
FROM audit_events
WHERE tenant_id = '<company-tenant-uuid>'
  AND entity_type = 'CHECKPOINT'
  AND entity_id = '<checkpoint-uuid>'
ORDER BY created_at DESC, id DESC;
```

Expect actions such as `CHECKPOINT_CREATED`, `CHECKPOINT_UPDATED`,
`CHECKPOINT_ACTIVATED`, `CHECKPOINT_DEACTIVATED`, `CHECKPOINT_ARCHIVED` and
`CHECKPOINT_REVIEWED`. Metadata contains codes, IDs, periods and outcomes only —
not observation, recommendation, description or expectedResult free text.

## 8. Verify ACTIVE Checkpoint blocks Control archive

```sql
SELECT code, lifecycle_status
FROM checkpoints
WHERE tenant_id = '<company-tenant-uuid>'
  AND control_id = '<control-uuid>';
```

If any Checkpoint is `ACTIVE`, `POST /controls/:id/archive` returns
`409 CONTROL_HAS_ACTIVE_CHECKPOINTS`.

## 9. Warnings

- Do not manually UPDATE or DELETE Checkpoints, Reviews, Controls, mappings or
  audit events.
- Do not change schema objects; Prisma migrations remain the authority.
- Use placeholders and synthetic `.test` data only.
