# Risks

Slice D creates a KPI-linked risk automatically when KPI actual submission
calculates an AMBER or RED result. The actual, risk, tenant sequence increment,
`KPI_ACTUAL_SUBMITTED` audit and `RISK_CREATED` audit share one PostgreSQL
transaction. GREEN and INFORMATIONAL results create no risk.

## Automatic KPI risk constants

The constants are centralized in `service.ts`:

- `MAJOR`: inherent likelihood 4 and inherent impact 4
- `MINOR`: inherent likelihood 3 and inherent impact 3
- `CRITICAL`: inherent score 20 or greater
- `HIGH`: inherent score 15–19
- `MEDIUM`: inherent score 8–14
- `LOW`: inherent score below 8
- Risk code prefix: `RSK-`
- Minimum numeric code width: 3 digits

`inherentScore` is likelihood multiplied by impact. `kpiRiskClass` and
`generalLevel` remain separate fields. The generated code uses the next
tenant-local sequence value in `RSK-###` form. All KPI source identifiers come
from the submitted actual's authenticated tenant transaction. Automatically
created risks leave `ownerId` and `category` null until a later authorised
workflow assigns them.

## API and permissions

`GET /api/v1/risks` and `GET /api/v1/risks/:id` require `risk:read` and filter
by the authenticated tenant. Slice D adds no manual risk create, update, close,
review or treatment route. Automatic creation is an invariant of KPI actual
submission and is authorized by `kpi-actual:write`; it does not additionally
require `risk:write`.

Existing Slice B actuals are not backfilled. A future reconciliation must be
explicit, human-triggered and audited.
