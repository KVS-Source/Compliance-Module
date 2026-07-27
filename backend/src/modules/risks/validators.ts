import { z } from "zod";
import { paginationSchema } from "../../common/responses/pagination.js";

export const RISK_SEARCH_MAX_LENGTH = 100;

export const ACTIVE_RISK_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "TREATED",
] as const;

export const CLOSED_RISK_STATUSES = ["CLOSED", "ARCHIVED"] as const;

export const riskIdParamsSchema = z.object({ id: z.string().uuid() });

/**
 * List query for GET /risks.
 *
 * Precedence when both `status` and `lifecycle` are supplied:
 * the specific `status` wins and `lifecycle` is ignored for status filtering.
 * `lifecycle` alone maps to:
 * - active → OPEN | UNDER_REVIEW | TREATED
 * - closed → CLOSED | ARCHIVED
 * - all → no status constraint
 * Omitting both preserves prior behaviour (all non-deleted statuses).
 */
export const riskListSchema = paginationSchema.extend({
  status: z
    .enum(["OPEN", "UNDER_REVIEW", "TREATED", "CLOSED", "ARCHIVED"])
    .optional(),
  lifecycle: z.enum(["active", "closed", "all"]).optional(),
  kpiRiskClass: z.enum(["MAJOR", "MINOR"]).optional(),
  generalLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  q: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    })
    .pipe(z.string().max(RISK_SEARCH_MAX_LENGTH).optional()),
});

export type RiskListQuery = z.infer<typeof riskListSchema>;
