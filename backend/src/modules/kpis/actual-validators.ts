import { z } from "zod";

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
