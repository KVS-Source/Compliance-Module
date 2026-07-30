import { z } from "zod";
import { paginationSchema } from "../../common/responses/pagination.js";

export const POLICY_SEARCH_MAX_LENGTH = 100;
export const POLICY_TITLE_MAX_LENGTH = 200;
export const POLICY_DESCRIPTION_MAX_LENGTH = 4_000;
export const POLICY_CONTENT_MAX_LENGTH = 100_000;
export const POLICY_TEXT_MAX_LENGTH = 20_000;
/** Aligns with policy_approvals_rejection_comments_required (2–2000). */
export const POLICY_COMMENT_MIN_LENGTH = 2;
export const POLICY_COMMENT_MAX_LENGTH = 2_000;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, "Date must be valid");

const optionalNullableUuid = z.string().uuid().nullable().optional();
const optionalNullableText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable().optional();

const approvalCommentsSchema = z
  .string()
  .trim()
  .min(POLICY_COMMENT_MIN_LENGTH)
  .max(POLICY_COMMENT_MAX_LENGTH);

/**
 * Aligns with DB CHECK policy_versions_dates_valid:
 * both null, or both set with reviewDate > effectiveDate.
 * When either date field appears in the payload, both must appear together.
 */
const refinePolicyDates = <
  T extends {
    effectiveDate?: string | null | undefined;
    reviewDate?: string | null | undefined;
  },
>(
  value: T,
  context: z.RefinementCtx,
) => {
  const hasEffective = value.effectiveDate !== undefined;
  const hasReview = value.reviewDate !== undefined;

  if (hasEffective !== hasReview) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasEffective ? ["reviewDate"] : ["effectiveDate"],
      message:
        "effectiveDate and reviewDate must both be provided or both omitted",
    });
    return;
  }

  if (!hasEffective && !hasReview) return;

  const effective = value.effectiveDate ?? null;
  const review = value.reviewDate ?? null;

  if ((effective == null) !== (review == null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reviewDate"],
      message: "effectiveDate and reviewDate must both be set or both be null",
    });
    return;
  }

  if (
    effective != null &&
    review != null &&
    review <= effective
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reviewDate"],
      message: "Review date must be later than effective date",
    });
  }
};

const versionContentFields = {
  content: z.string().trim().min(1).max(POLICY_CONTENT_MAX_LENGTH),
  purpose: optionalNullableText(POLICY_TEXT_MAX_LENGTH),
  scope: optionalNullableText(POLICY_TEXT_MAX_LENGTH),
  changeSummary: optionalNullableText(POLICY_TEXT_MAX_LENGTH),
  effectiveDate: dateSchema.nullable().optional(),
  reviewDate: dateSchema.nullable().optional(),
  requiresEvidence: z.boolean().optional(),
  requestedApproverId: optionalNullableUuid,
  frameworkIds: z.array(z.string().uuid()).max(100).optional(),
};

export const policyIdParamsSchema = z
  .object({ policyId: z.string().uuid() })
  .strict();

export const policyVersionParamsSchema = z
  .object({
    policyId: z.string().uuid(),
    versionId: z.string().uuid(),
  })
  .strict();

export const versionIdParamsSchema = z
  .object({ versionId: z.string().uuid() })
  .strict();

export const policyListSchema = paginationSchema
  .extend({
    q: z
      .string()
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        const trimmed = value.trim();
        return trimmed.length === 0 ? undefined : trimmed;
      })
      .pipe(z.string().max(POLICY_SEARCH_MAX_LENGTH).optional()),
    code: z.string().trim().min(1).max(64).optional(),
    title: z.string().trim().min(1).max(POLICY_TITLE_MAX_LENGTH).optional(),
    lifecycleStatus: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
    versionStatus: z
      .enum([
        "DRAFT",
        "SUBMITTED",
        "APPROVED",
        "REJECTED",
        "SUPERSEDED",
        "OBSOLETE",
      ])
      .optional(),
    ownerId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    frameworkId: z.string().uuid().optional(),
    reviewDueFrom: dateSchema.optional(),
    reviewDueTo: dateSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.reviewDueFrom !== undefined &&
      value.reviewDueTo !== undefined &&
      value.reviewDueTo < value.reviewDueFrom
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewDueTo"],
        message: "reviewDueTo must not precede reviewDueFrom",
      });
    }
  });

export const createPolicySchema = z
  .object({
    title: z.string().trim().min(1).max(POLICY_TITLE_MAX_LENGTH),
    description: optionalNullableText(POLICY_DESCRIPTION_MAX_LENGTH),
    ownerId: optionalNullableUuid,
    departmentId: optionalNullableUuid,
    ...versionContentFields,
    requiresEvidence: z.boolean().default(false),
  })
  .strict()
  .superRefine(refinePolicyDates);

export const updatePolicySchema = z
  .object({
    title: z.string().trim().min(1).max(POLICY_TITLE_MAX_LENGTH).optional(),
    description: optionalNullableText(POLICY_DESCRIPTION_MAX_LENGTH),
    ownerId: optionalNullableUuid,
    departmentId: optionalNullableUuid,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const createPolicyVersionSchema = z
  .object({
    bump: z.enum(["MAJOR", "MINOR"]),
    ...versionContentFields,
    requiresEvidence: z.boolean().default(false),
  })
  .strict()
  .superRefine(refinePolicyDates);

export const updatePolicyVersionSchema = z
  .object({
    content: z.string().trim().min(1).max(POLICY_CONTENT_MAX_LENGTH).optional(),
    purpose: optionalNullableText(POLICY_TEXT_MAX_LENGTH),
    scope: optionalNullableText(POLICY_TEXT_MAX_LENGTH),
    changeSummary: optionalNullableText(POLICY_TEXT_MAX_LENGTH),
    effectiveDate: dateSchema.nullable().optional(),
    reviewDate: dateSchema.nullable().optional(),
    requiresEvidence: z.boolean().optional(),
    requestedApproverId: optionalNullableUuid,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  })
  .superRefine(refinePolicyDates);

export const replacePolicyFrameworksSchema = z
  .object({
    frameworkIds: z.array(z.string().uuid()).max(100),
  })
  .strict();

export const emptyBodySchema = z.object({}).strict();

export const approvePolicyVersionSchema = z
  .object({
    comments: approvalCommentsSchema.optional(),
  })
  .strict();

export const rejectPolicyVersionSchema = z
  .object({
    comments: approvalCommentsSchema,
  })
  .strict();

export const policyAuditListSchema = paginationSchema.strict();

export type PolicyListQuery = z.infer<typeof policyListSchema>;
export type CreatePolicyBody = z.infer<typeof createPolicySchema>;
export type UpdatePolicyBody = z.infer<typeof updatePolicySchema>;
export type CreatePolicyVersionBody = z.infer<typeof createPolicyVersionSchema>;
export type UpdatePolicyVersionBody = z.infer<typeof updatePolicyVersionSchema>;
export type ReplacePolicyFrameworksBody = z.infer<
  typeof replacePolicyFrameworksSchema
>;
export type ApprovePolicyVersionBody = z.infer<
  typeof approvePolicyVersionSchema
>;
export type RejectPolicyVersionBody = z.infer<typeof rejectPolicyVersionSchema>;
export type PolicyAuditListQuery = z.infer<typeof policyAuditListSchema>;
