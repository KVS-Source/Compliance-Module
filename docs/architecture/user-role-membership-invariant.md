# User-role membership invariant

An active tenant-scoped `UserRole` requires an active `UserCompany` membership for the same user and tenant.

The active application enforces this in two places:

1. `RoleAssignmentService` validates the active membership and role tenant before writing.
2. Migration `20260724200000_user_role_membership_invariant` adds a PostgreSQL trigger that rejects invalid active assignments.

The migration does not modify or delete existing records. It stops with a generic error if inconsistent active assignments already exist.

Before applying the migration to an existing environment, an authorised database administrator should perform a read-only review:

```sql
SELECT ur.id
FROM user_roles AS ur
LEFT JOIN user_companies AS uc
  ON uc.user_id = ur.user_id
  AND uc.tenant_id = ur.tenant_id
  AND uc.status = 'ACTIVE'
WHERE ur.status = 'ACTIVE'
  AND uc.id IS NULL;
```

If rows are returned, the owning Company administrator must decide whether to create/restore the membership or disable the role assignment. No automatic cleanup is provided.
