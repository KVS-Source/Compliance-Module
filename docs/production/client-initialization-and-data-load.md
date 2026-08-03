# Client initialization and production data load

## Approved roles

The operator initializer creates only explicit roles; it never assigns
`COMPANY_ADMIN` or permission `*`.

| Code | Display name | Intent |
| --- | --- | --- |
| `CLIENT_COMPANY_ADMINISTRATOR` | Client Company Administrator | Explicit administration and all current domain permissions |
| `COMPLIANCE_MANAGER` | Compliance Manager | Compliance workflows without user creation/update |
| `DEPARTMENT_OWNER` | Department Owner | Operational contribution without approval/admin rights |
| `REVIEWER_APPROVER` | Reviewer/Approver | Read, review, approval and closure actions |
| `MANAGEMENT_VIEWER` | Read-only Management Viewer | Read and export only |

Production token issuance filters wildcard permission even if legacy data
contains it. Readiness fails while any active production user has an active
wildcard role assignment. Resolve such assignments before access opens.

## Create the company and first user

Create a one-time password in a protected file (`chmod 600`). Supply the
populated production environment plus these process-only values:

```sh
CLIENT_COMPANY_CODE=<approved-code> \
CLIENT_COMPANY_NAME=<approved-name> \
CLIENT_USER_CODE=<approved-user-code> \
CLIENT_USER_NAME=<approved-name> \
CLIENT_USER_EMAIL=<approved-email> \
CLIENT_USER_ROLE=CLIENT_COMPANY_ADMINISTRATOR \
CLIENT_USER_PASSWORD_FILE=<absolute-mode-0600-file> \
npm run client:initialize --prefix backend
```

The command validates production configuration, hashes the password with
Argon2id, creates or locates the company, creates exactly one user, membership
and selected role, reconciles the role to its explicit permission set, and
writes `CLIENT_USER_INITIALIZED` to the append-only audit log. It refuses a
duplicate code/email and any `.test` address. It never prints the password.

The schema has no forced-password-change flag. Deliver the one-time password
through the client's approved secret channel, require an immediate operator-led
password rotation, securely remove the password file, and record completion in
the release ticket. Do not use the UAT/demo seed or credentials.

## Authoritative workbook sequence

Keep `Updated2_GenBioCa_Compliance_Platform 22June2026 (2).xlsx` outside Git.
Use the initialized user as the audited import actor.

```sh
npm run import:workbook:preview --prefix backend -- \
  --file "<external-workbook-path>" --json "<protected-preview-report>"

npm run import:workbook:commit --prefix backend -- \
  --file "<external-workbook-path>" --tenant <company-code> \
  --actor <approved-user-email> --json "<protected-commit-report>"

npm run import:workbook:commit --prefix backend -- \
  --file "<external-workbook-path>" --tenant <company-code> \
  --actor <approved-user-email>

npm run import:workbook:report --prefix backend -- --tenant <company-code>
```

Stop if preview/commit differs from the independently verified baseline: 91 KPI
definitions, 10 Gaps, 10 CAPAs, nine register types, 106 register records, 771
created, two skipped, zero errors, second commit `alreadyImported=true`, and
dashboard compliance 9/29 = 31%. Never force counts. Preserve reports in the
protected release record. Imported Evidence metadata does not create a physical
file and must remain visibly unavailable until an authorized upload exists.
