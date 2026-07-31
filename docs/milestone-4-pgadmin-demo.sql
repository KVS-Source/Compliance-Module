-- Milestone 4 pgAdmin demonstration queries
-- SELECT-only. Synthetic data. No passwords, connection strings, or real client data.
-- Replace :tenant_id with the active Company UUID (tenants.id for COM-001, etc.).
-- Prisma table and column names only.

-- Proves: governance tables exist and are queryable for the active Company.
SELECT 'policies' AS entity, COUNT(*) AS row_count
FROM policies
WHERE tenant_id = :tenant_id
UNION ALL
SELECT 'policy_versions', COUNT(*)
FROM policy_versions
WHERE tenant_id = :tenant_id
UNION ALL
SELECT 'controls', COUNT(*)
FROM controls
WHERE tenant_id = :tenant_id
UNION ALL
SELECT 'checkpoints', COUNT(*)
FROM checkpoints
WHERE tenant_id = :tenant_id
UNION ALL
SELECT 'checkpoint_reviews', COUNT(*)
FROM checkpoint_reviews
WHERE tenant_id = :tenant_id
UNION ALL
SELECT 'audit_events', COUNT(*)
FROM audit_events
WHERE tenant_id = :tenant_id;

-- Proves: recent synthetic Policies and current approved Version pointer.
SELECT
  p.id,
  p.code,
  p.title,
  p.lifecycle_status,
  p.current_approved_version_id,
  p.created_at,
  p.updated_at
FROM policies AS p
WHERE p.tenant_id = :tenant_id
ORDER BY p.created_at DESC
LIMIT 20;

-- Proves: Policy Version lifecycle statuses and actor attribution columns.
SELECT
  pv.id,
  pv.policy_id,
  pv.sequence,
  pv.version_major,
  pv.version_minor,
  pv.status,
  pv.requires_evidence,
  pv.submitted_by_id,
  pv.submitted_at,
  pv.approved_by_id,
  pv.approved_at,
  pv.created_at
FROM policy_versions AS pv
WHERE pv.tenant_id = :tenant_id
ORDER BY pv.created_at DESC
LIMIT 20;

-- Proves: Policy ↔ Framework mappings use policy_frameworks.
SELECT
  pf.id,
  pf.policy_id,
  pf.policy_version_id,
  pf.framework_id,
  pf.is_active,
  f.code AS framework_code,
  f.name AS framework_name,
  f.version AS framework_version
FROM policy_frameworks AS pf
JOIN frameworks AS f ON f.id = pf.framework_id
WHERE pf.tenant_id = :tenant_id
ORDER BY pf.created_at DESC
LIMIT 20;

-- Proves: recent Controls and lifecycle / implementation fields.
SELECT
  c.id,
  c.code,
  c.title,
  c.lifecycle_status,
  c.implementation_status,
  c.control_type,
  c.frequency,
  c.requires_evidence,
  c.archived_at,
  c.created_at
FROM controls AS c
WHERE c.tenant_id = :tenant_id
ORDER BY c.created_at DESC
LIMIT 20;

-- Proves: Control ↔ approved Policy Version mappings.
SELECT
  cpv.id,
  cpv.control_id,
  cpv.policy_id,
  cpv.policy_version_id,
  cpv.is_active,
  p.code AS policy_code,
  pv.version_major,
  pv.version_minor,
  pv.status AS policy_version_status
FROM control_policy_versions AS cpv
JOIN policies AS p
  ON p.tenant_id = cpv.tenant_id
 AND p.id = cpv.policy_id
JOIN policy_versions AS pv
  ON pv.tenant_id = cpv.tenant_id
 AND pv.id = cpv.policy_version_id
WHERE cpv.tenant_id = :tenant_id
ORDER BY cpv.created_at DESC
LIMIT 20;

-- Proves: recent Checkpoints and parent Control linkage.
SELECT
  ck.id,
  ck.code,
  ck.title,
  ck.control_id,
  ck.lifecycle_status,
  ck.verification_frequency,
  ck.evidence_required,
  ck.initial_review_date,
  ck.next_review_date,
  ck.latest_review_id,
  ck.last_reviewed_at,
  ck.archived_at
FROM checkpoints AS ck
WHERE ck.tenant_id = :tenant_id
ORDER BY ck.created_at DESC
LIMIT 20;

-- Proves: append-only Reviews; one row per Checkpoint/review_period.
SELECT
  cr.id,
  cr.checkpoint_id,
  cr.review_period,
  cr.review_date,
  cr.reviewer_id,
  cr.outcome,
  cr.next_review_date,
  cr.submitted_at
FROM checkpoint_reviews AS cr
WHERE cr.tenant_id = :tenant_id
ORDER BY cr.submitted_at DESC, cr.id DESC
LIMIT 20;

-- Proves: latest_review_id matches the Review ledger (trigger-maintained).
SELECT
  ck.code,
  ck.latest_review_id,
  ck.last_reviewed_at,
  ck.next_review_date,
  cr.review_period,
  cr.outcome,
  cr.submitted_at
FROM checkpoints AS ck
LEFT JOIN checkpoint_reviews AS cr
  ON cr.tenant_id = ck.tenant_id
 AND cr.checkpoint_id = ck.id
 AND cr.id = ck.latest_review_id
WHERE ck.tenant_id = :tenant_id
ORDER BY ck.created_at DESC
LIMIT 20;

-- Proves: recent audit_events for M4 entities (metadata must not carry review prose).
SELECT
  ae.id,
  ae.action,
  ae.entity_type,
  ae.entity_id,
  ae.user_id,
  ae.metadata,
  ae.created_at
FROM audit_events AS ae
WHERE ae.tenant_id = :tenant_id
  AND ae.entity_type IN (
    'POLICY',
    'Policy',
    'CONTROL',
    'Control',
    'CHECKPOINT',
    'Checkpoint'
  )
ORDER BY ae.created_at DESC
LIMIT 50;

-- Optional: resolve tenant_id for COM-001 without hardcoding UUIDs in docs.
SELECT id, code, name
FROM tenants
WHERE code IN ('COM-001', 'COM-002', 'COM-003')
ORDER BY code;
