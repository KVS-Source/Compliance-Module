-- KPI actual codes are allocated by the server from a per-Company counter,
-- mirroring the Slice D risk-code sequence in "tenants"."next_risk_number".
ALTER TABLE "tenants"
  ADD COLUMN "next_kpi_actual_number" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "tenants_next_kpi_actual_number_positive"
    CHECK ("next_kpi_actual_number" >= 1);

-- Existing actuals kept their caller-supplied codes and are not rewritten.
-- Start each Company above any code already using the generated ACT-<number>
-- form so the first allocation cannot collide with a historical record.
UPDATE "tenants" AS t
SET "next_kpi_actual_number" = (highest."max_number" + 1)::integer
FROM (
  SELECT
    "tenant_id",
    MAX((substring("code" FROM '^ACT-([0-9]+)$'))::numeric) AS "max_number"
  FROM "kpi_actuals"
  WHERE "code" ~ '^ACT-[0-9]+$'
  GROUP BY "tenant_id"
) AS highest
WHERE t."id" = highest."tenant_id"
  AND highest."max_number" + 1 > t."next_kpi_actual_number"
  AND highest."max_number" + 1 <= 2147483647;
