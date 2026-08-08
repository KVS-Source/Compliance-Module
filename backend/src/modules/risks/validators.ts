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

const assessmentValue = z.coerce.number().int().min(1).max(5);

const requiredText = (maximum: number) =>
  z.string().trim().min(1).max(maximum);

/**
 * Manual risks have no KPI linkage. Code and general level are deliberately
 * absent: the server allocates the shared RSK sequence and derives the score.
 */
export const createManualRiskSchema = z
  .object({
    title: requiredText(300),
    description: requiredText(5_000),
    category: requiredText(200),
    inherentLikelihood: assessmentValue,
    inherentImpact: assessmentValue,
    ownerId: z.string().uuid().nullable().optional(),
  })
  .strict();

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, "Date must be valid");

/**
 * A revised assessment needs both dimensions or neither: a likelihood without
 * an impact yields no score, and the database enforces the same rule.
 */
export const createRiskReviewSchema = z
  .object({
    comments: requiredText(2_000),
    likelihoodAtReview: assessmentValue.nullable().optional(),
    impactAtReview: assessmentValue.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasLikelihood = value.likelihoodAtReview != null;
    const hasImpact = value.impactAtReview != null;
    if (hasLikelihood !== hasImpact) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasLikelihood ? "impactAtReview" : "likelihoodAtReview"],
        message:
          "Provide both a revised likelihood and impact, or neither",
      });
    }
  });

export const createRiskTreatmentSchema = z
  .object({
    strategy: z.enum(["AVOID", "MITIGATE", "TRANSFER", "ACCEPT"]),
    plan: requiredText(4_000),
    ownerId: z.string().uuid().nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
    status: z.enum(["PLANNED", "IN_PROGRESS", "CANCELLED"]).default("PLANNED"),
  })
  .strict();

/**
 * Completion inserts a new COMPLETED row superseding the original rather than
 * editing it, so the ledger stays append-only.
 */
export const completeRiskTreatmentSchema = z
  .object({
    effectivenessNotes: z.string().trim().min(1).max(4_000).optional(),
  })
  .strict()
  .default({});

export const assignRiskOwnerSchema = z
  .object({ ownerId: z.string().uuid().nullable() })
  .strict();

export const closeRiskSchema = z
  .object({ reason: requiredText(2_000) })
  .strict();

export const reopenRiskSchema = z
  .object({ reason: requiredText(2_000) })
  .strict();

export const riskTreatmentParamsSchema = z.object({
  id: z.string().uuid(),
  treatmentId: z.string().uuid(),
});

export type CreateRiskReviewBody = z.infer<typeof createRiskReviewSchema>;
export type CreateManualRiskBody = z.infer<typeof createManualRiskSchema>;
export type CreateRiskTreatmentBody = z.infer<typeof createRiskTreatmentSchema>;
export type CompleteRiskTreatmentBody = z.infer<
  typeof completeRiskTreatmentSchema
>;
export type AssignRiskOwnerBody = z.infer<typeof assignRiskOwnerSchema>;
export type CloseRiskBody = z.infer<typeof closeRiskSchema>;
export type ReopenRiskBody = z.infer<typeof reopenRiskSchema>;
