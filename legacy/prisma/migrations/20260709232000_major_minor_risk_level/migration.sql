UPDATE "risks"
SET "risk_level" = CASE
  WHEN "classification" = 'major' THEN 'major'
  ELSE 'minor'
END
WHERE "risk_level" IN ('low', 'medium', 'high', 'critical');

ALTER TABLE "risks"
ALTER COLUMN "risk_level" SET DEFAULT 'minor';
