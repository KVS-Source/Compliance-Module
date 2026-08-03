# Backup, restore, release and rollback

## Encrypted backup

`ops/backup.sh` captures a PostgreSQL custom dump and the complete private
Evidence directory, records SHA-256 checksums, bundles them, and writes an
AES-256-CBC/PBKDF2 encrypted file plus outer checksum. Required environment:
`DATABASE_URL`, absolute `EVIDENCE_STORAGE_PATH`, absolute `BACKUP_PATH`, and
`BACKUP_ENCRYPTION_PASSWORD_FILE`. Keep the password file mode 0600 and outside
Git. The script prints only the final backup path.

For a server without compatible PostgreSQL/OpenSSL tools, build the reviewed
utility image with `docker build -f deploy/Dockerfile.ops -t genbioca-ops .`.
Mount the private Evidence volume read-only, the protected backup destination,
and a mode-0600 password file; attach only to the private database network.

Retain daily backups for the client-approved period, at least one weekly copy
in a separate encrypted failure domain, and a monthly restore drill. Deletion
must be ticketed and reviewed; the scripts do not silently prune backups.

## Disposable restore drill

Create a new database whose name contains `restore` or `drill` and an empty
absolute Evidence directory. Run `ops/restore-drill.sh` with `BACKUP_FILE`,
`BACKUP_ENCRYPTION_PASSWORD_FILE`, `RESTORE_DATABASE_URL`, and
`RESTORE_EVIDENCE_PATH`. The script verifies outer and inner checksums, restores
database and Evidence, and prints post-restore counts for tenants, KPIs, Gaps,
CAPAs, registers, Evidence and imports.

Never point the drill at UAT or production. Record backup filename, UTC time,
checksum, PostgreSQL version, restore duration/result and source-versus-restore
counts. Start the reviewed backend on the restored database and require both
health and readiness. Remove the disposable targets only after exact names are
reconfirmed.

## Release sequence

1. Approve a maintenance/read-only window and client communication.
2. Verify hostname, certificate, secrets, volumes, capacity and log collection.
3. Create and independently verify a database-plus-Evidence backup.
4. Pull the reviewed immutable tag (`v1.0.0-client-release` convention).
5. Validate the protected environment file with a one-shot backend start.
6. Build the production images from the tag.
7. Run `prisma migrate deploy` once through the migration container.
8. Start backend, frontend and proxy; wait for readiness.
9. Run the production smoke test and inspect redacted request logs.
10. Open approved client access and monitor authentication, 5xx, latency,
    storage and database capacity.

## Rollback decision

- **Application rollback:** redeploy the prior reviewed image tag when database
  changes are backward compatible. Do not rebuild an old tag.
- **Configuration rollback:** restore the prior protected version from the
  secret/config system, restart services and rerun readiness/smoke.
- **Database restore:** use only for data corruption or an explicitly approved
  incompatible migration recovery. Stop writes, preserve the failed state,
  restore into a new database first, verify it, then perform a controlled
  cutover. Never improvise a destructive reverse migration or use reset.

Any rollback involving database or Evidence state needs incident authority and
must preserve matching recovery points for both stores.
