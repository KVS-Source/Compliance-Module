# GenRAC → GenBioCa data mapping

## Source dictionary

- Authoritative client dictionary filename: `GRC_Data_Dictionary.xlsx`
- SHA-256:
  `208e3806d5d66d7e690280b1d0d86025c08a95444ac053ad11e316a3598c8358`
- Catalogue size (from the authoritative dictionary): **3 sheets**, **46 tables**,
  **408 columns**, **34 key relationships**, **8 domains**
- Prefer the filename + checksum above over any absolute workstation path. The
  workbook itself is **not** copied into Git; operators hold the client-supplied
  file outside the repository and verify the SHA-256 before mapping work.
- Mapping below follows the dictionary catalogue, repository documentation,
  operational ownership boundaries, and the GenBioCa Prisma schema rather than
  guessed table names.

## First-sync entities (GenRAC / shared source may own)

| Source concept | GenBioCa handling | Classification |
| --- | --- | --- |
| Customer master | External record map only until a dedicated Customer model is approved | Missing but required for later sync |
| Company–customer mapping | External record map (`COMPANY_CUSTOMER_MAP`) | Missing but required for later sync |
| Deals | External record map (`DEAL`) | Missing but required for later sync |
| Shared framework catalogue | Prefer link to existing `Framework` when codes match; otherwise map only | Partially represented |
| Shared regulatory rules | Prefer link to existing `FrameworkRule` when codes match; otherwise map only | Partially represented |
| Organisation / reference masters | Prefer existing `OrgDepartment` / `OrgLocation` / `OrgUnit` | Partially represented |

## GenBioCa remains authoritative (never overwritten by GenRAC)

- Local roles and permissions
- Policy lifecycle and versions
- Controls and checkpoints
- KPI configurations, targets, actuals and approvals
- Evidence and evidence links
- Risks, Gaps, CAPAs
- Audit events and import batches
- Operational register **transaction** content once locally governed

## Required external IDs

Every synced GenRAC row must carry:

- `sourceEntityType`
- `externalRecordId`
- optional `sourceUpdatedAt`
- `syncHash` of normalised payload

Stored in `external_record_maps` with composite uniqueness
`(tenantId, connectionId, sourceEntityType, externalRecordId)`.

## Conflict rules

1. If a map points at a GenBioCa-authoritative local type, sync marks **CONFLICT**
   and does not mutate the local compliance row.
2. Identical `syncHash` → **SKIP**.
3. Deactivated maps (`DEACTIVATED`) are never revived by a silent overwrite.

## Deletion / deactivation

- GenRAC deletions soft-deactivate the external map (`deactivatedAt`).
- Local GenBioCa compliance transactions are never deleted by sync.

## Fields never overwritten by GenRAC

Any field on Policy, Control, Checkpoint, KPI*, Evidence, Risk, Gap, CAPA,
ImportBatch or AuditEvent rows.

## Connector configuration still required

- CSV adapter: filename under `LOCAL_UPLOAD_DIR/.genrac` (basename only; path
  traversal and absolute paths are rejected before the connection is marked
  CONFIGURED; the file must already exist under that root)
- REST adapter: base URL + secret env refs (configuration-ready only)
- PostgreSQL read-only adapter: not enabled without reviewed access

## Credentials / access still required

- Live GenRAC REST credentials
- Network allow-list / VPN as dictated by the client
- Operator verification of `GRC_Data_Dictionary.xlsx` against the published
  SHA-256 before extending first-sync mappings beyond the approved entity set

## Deferred from initial sync

- Full customer analytics
- Deal win/loss reporting surfaces
- Bi-directional write-back to GenRAC
- Automatic shared-master provisioning of authenticated GenBioCa users
