# Installation and operations

## First start

Follow the root README. Run the active `frontend/` and `backend/` applications;
legacy and prototype assets are retained references only. Generated local
environment files are private and must not be committed or distributed.

`npm run setup:local` produces matching Compose and API credentials. When using
an existing database, obtain its approved connection settings instead; changing
an environment file does not change a PostgreSQL role password.

For a local evaluation, explicitly run the synthetic sample seed. For approved
GenBioCa records, initialize the workbook workspace and preview/commit the
privately supplied workbook. Workbook upload does not provision user accounts or
upload evidence file bytes. Derived dashboard sheets are recalculated from the
database, not imported as fixed numbers.

## Operational account initialization

Never seed an operational database. The existing command is named
`client:initialize` for compatibility; it provisions one approved account and
explicit fixed permissions, not sample business data.

Configure the backend production environment with approved database and hosting
settings, independent strong JWT/refresh secrets, secure cookies, exact allowed
origins, trusted-proxy settings and the chosen evidence provider. Keep prototype
routes and API documentation disabled in a hosted operational installation.
Apply the migrations before initializing an account.

Prepare a password file outside the repository, readable only by its owner
(Unix mode 0600). Do not put the password on a command line or in shell history.
Supply these operator variables privately:

| Variable | Value |
| --- | --- |
| `CLIENT_COMPANY_CODE` | Approved company code |
| `CLIENT_COMPANY_NAME` | Approved company name |
| `CLIENT_USER_CODE` | Unique user code |
| `CLIENT_USER_NAME` | Approved account holder |
| `CLIENT_USER_EMAIL` | Approved sign-in address |
| `CLIENT_USER_ROLE` | One fixed role code below |
| `CLIENT_USER_PASSWORD_FILE` | Protected external password-file path |
| `CLIENT_USER_PHONE` | Optional approved phone |

With those variables and `NODE_ENV=production` configured, run:

```bash
npm run prisma:migrate --prefix backend
npm run client:initialize --prefix backend
```

Supported role codes are `CLIENT_COMPANY_ADMINISTRATOR`, `COMPLIANCE_MANAGER`,
`DEPARTMENT_OWNER`, `REVIEWER_APPROVER` and `MANAGEMENT_VIEWER`. Retain those code
identifiers for compatibility. Provision a different authorized reviewer for
maker-checker approvals; a submitter cannot approve their own record. Remove the
temporary password file under the organisation's secure handling procedure.

First sign-in: select the correct company, change the initial password, verify
permissions, then import approved records and inspect the import report. Do not
activate or invent accounts using workbook staff details without authorization.

## Data and private handoff

The source archive contains no working database or evidence uploads. Transfer
approved workbook inputs, evidence files, database backup and deployment secrets
separately through a secure channel. Preserve the database-to-storage association:
metadata without its stored file cannot satisfy an evidence gate.

Repeated workbook imports use checksum/idempotency safeguards. A replay returns
the stored report and does not perform another write. Review preview errors,
skipped rows and report counts before selecting an intentional new import key.

The selected company governs all reads and writes. A 0% or empty dashboard in a
different company does not prove imported records are missing. Working-location
preferences are display preferences; they are not data filters. Device location
requires an explicit browser permission and is neither stored nor transmitted.

## Recovery and backup

Password recovery is administrator-managed; automated reset email delivery is not
implemented. Administrators manage accounts and sessions through Users. Users
can change their own password through the account menu.

If a user forgets their sign-in email, an authorized Company Administrator can
find it in Users. To reset a password, edit that account and set a new password.
Saving a password revokes that user's refresh tokens across all Companies in the
same transaction as the password change and audit event. Saving other profile
fields without a password does not revoke sessions. Existing access tokens can
remain usable until their short expiry; this is not an immediate access-token
kill switch. The user should sign in with the new password and then choose their
own password from the account menu. A temporary login lockout still needs to
expire, and the account must be ACTIVE.

The Sessions panel's manual revoke actions apply only to the selected Company.
Self-service password change revokes refresh tokens across all Companies.

If no Company Administrator can sign in, an authorized operator must use
[Operational account initialization](#operational-account-initialization) to
create a new administrator with a unique user code and email in the existing
Company. Confirm the existing Company code before provisioning. Use the
operator's approved provisioning connection, not the restricted application
login: initialization maintains the fixed permission catalogue. Never reset,
reseed or delete the database to recover access.

Keep at least two individually assigned Company Administrator accounts, with
credentials in the organization's approved password manager. Verify sign-in
against the intended environment before a handover or presentation. Historical
UAT credentials are not proof that an account exists in that database, and must
not be included in shared handover documents.

Follow [backup and restore](../operations/backup-and-restore.md). Back up both
PostgreSQL and the evidence store, encrypt retained copies and regularly restore
to an empty disposable target. Compare source migration checksums, catalogues and
row counts, then require application readiness. Never restore over a shared
database or delete a populated Docker volume as troubleshooting.

The Compose verification project uses project-scoped test volumes. Integration
tests reset their configured test database; use a separate database and role,
never an operational connection. API `/health` and `/ready` serve distinct
process/database checks.

## Before operational release

Complete browser and real-stack walkthroughs; independently verify repository
protection and required CI contexts. Configure TLS, DNS, provider access,
monitoring/alerts, storage permissions, backup retention/PITR and rollback
ownership. Test real GenRAC, S3/scanner and email services only after their
approved implementations and credentials are available. Local checks do not
establish those external services or production readiness.
