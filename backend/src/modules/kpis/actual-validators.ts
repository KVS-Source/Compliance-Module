import { z } from "zod";
import { paginationSchema } from "../../common/responses/pagination.js";

const measuredDecimalSchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,14}(?:\.\d{1,4})?$/, "Value must fit Decimal(18,4)");

const nullableBoundedText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable().optional();

const optionalComments = z.string().trim().min(1).max(2_000).optional();

/**
 * `code` is deliberately absent: the server allocates it from the Company
 * counter inside the submission transaction, so `.strict()` rejects a
 * caller-supplied code.
 */
export const createKpiActualSchema = z
  .object({
    kpiConfigurationId: z.string().uuid(),
    period: z.string().trim().min(1).max(64),
    actualValue: measuredDecimalSchema,
    evidenceStatus: nullableBoundedText(64),
    comments: nullableBoundedText(2_000),
  })
  .strict();

export type CreateKpiActualBody = z.infer<typeof createKpiActualSchema>;

export const kpiActualIdParamsSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export const approveKpiActualSchema = z
  .object({ comments: optionalComments })
  .strict()
  .default({});

export const rejectKpiActualSchema = z
  .object({
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const resubmitKpiActualSchema = z
  .object({ comments: optionalComments })
  .strict()
  .default({});

export type ApproveKpiActualBody = z.infer<typeof approveKpiActualSchema>;
export type RejectKpiActualBody = z.infer<typeof rejectKpiActualSchema>;
export type ResubmitKpiActualBody = z.infer<typeof resubmitKpiActualSchema>;

/**
 * List query for GET /kpi-actuals.
 *
 * `awaitingMyDecision` narrows to rows the authenticated user may actually
 * decide, mirroring `KpiActualService.assertDecisionActor`: pending status,
 * not submitted by the actor, and either no configured approver, the actor as
 * approver, or the fallback where the configured approver is the submitter.
 * It is evaluated server-side so the filter stays correct across pages.
 */
export const kpiActualListSchema = paginationSchema.extend({
  approvalStatus: z
    .enum(["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED"])
    .optional(),
  kpiConfigurationId: z.string().uuid().optional(),
  kpiDefinitionId: z.string().uuid().optional(),
  ragStatus: z.enum(["GREEN", "AMBER", "RED"]).optional(),
  awaitingMyDecision: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export type KpiActualListQuery = z.infer<typeof kpiActualListSchema>;
