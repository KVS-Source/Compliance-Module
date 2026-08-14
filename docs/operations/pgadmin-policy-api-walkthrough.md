# pgAdmin Policy API walkthrough

Use this flow after calling Policy APIs from Postman. pgAdmin is inspection only.
Do not create, alter or delete schema objects or business rows through pgAdmin.

## Steps

1. In Postman, create a Policy and note:
   - HTTP method and URL
   - status code
   - response `data.code` and `data.id`
2. Open pgAdmin and connect to the local application database.
3. Run tenant-filtered inspection SQL using placeholders only:

```sql
-- Replace :tenant_id and :policy_id with values from the authenticated session.
SELECT id, code, title, lifecycle_status, current_approved_version_id, archived_at
FROM policies
WHERE tenant_id = :tenant_id
  AND id = :policy_id;

SELECT id, sequence, version_major, version_minor, status,
       requires_evidence, submitted_by_id, approved_by_id, superseded_by_id
FROM policy_versions
WHERE tenant_id = :tenant_id
  AND policy_id = :policy_id
ORDER BY sequence;

SELECT id, framework_id, is_active
FROM policy_frameworks
WHERE tenant_id = :tenant_id
  AND policy_id = :policy_id;

SELECT id, decision, decided_at, acted_by_id,
       CASE WHEN comments IS NULL THEN NULL ELSE '[redacted]' END AS comments_present
FROM policy_approvals
WHERE tenant_id = :tenant_id
  AND policy_id = :policy_id
ORDER BY decided_at;

SELECT action, entity_type, entity_id, metadata, created_at
FROM audit_events
WHERE tenant_id = :tenant_id
  AND entity_type IN ('POLICY', 'POLICY_VERSION')
  AND (
    entity_id = :policy_id
    OR entity_id IN (
      SELECT id FROM policy_versions
      WHERE tenant_id = :tenant_id AND policy_id = :policy_id
    )
  )
ORDER BY created_at DESC, id DESC;
```

4. Confirm:
   - semantic version numbers match the API response
   - `current_approved_version_id` matches the approved Version after approval
   - rejection comments exist on `policy_approvals` only
   - audit metadata contains codes/status transitions, not Policy body text
5. Close the session without editing rows.

## Reminders

- Prisma migrations remain the schema authority
- Never paste real client identifiers into shared screenshots
- Use synthetic `.test` users only
