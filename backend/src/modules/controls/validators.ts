import { z } from "zod";
import { paginationSchema } from "../../common/responses/pagination.js";
import { listOrderFields } from "../../common/list-order.js";

export const CONTROL_SEARCH_MAX_LENGTH = 100;
export const CONTROL_TITLE_MAX_LENGTH = 300;
export const CONTROL_DESCRIPTION_MAX_LENGTH = 4_000;
export const CONTROL_OBJECTIVE_MAX_LENGTH = 5_000;
export const CONTROL_NOTES_MAX_LENGTH = 5_000;
export const CONTROL_VERIFICATION_MAX_LENGTH = 5_000;

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

const implementationStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "PARTIALLY_IMPLEMENTED",
  "IMPLEMENTED",
  "NOT_APPLICABLE",
]);

const controlTypeSchema = z.enum([
  "PREVENTIVE",
  "DETECTIVE",
  "CORRECTIVE",
  "DIRECTIVE",
]);

const frequencySchema = z.enum([
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "ANNUAL",
  "CONTINUOUS",
  "PER_EVENT",
  "ONE_TIME",
]);

const booleanQuerySchema = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .transform((value) => value === true || value === "true")
  .optional();

/**
 * Aligns with controls_review_dates_valid:
 * nextReviewDate > lastReviewDate when both are set.
 * When either date field appears in a PATCH/create payload, ordering is checked
 * against the resulting pair (null pairs allowed).
 */
const refineReviewDates = <
  T extends {
    lastReviewDate?: string | null | undefined;
    nextReviewDate?: string | null | undefined;
  },
>(
  value: T,
  context: z.RefinementCtx,
) => {
  const last = value.lastReviewDate;
  const next = value.nextReviewDate;
  if (last == null || next == null) return;
  if (typeof last === "string" && typeof next === "string" && next <= last) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nextReviewDate"],
      message: "nextReviewDate must be later than lastReviewDate",
    });
  }
};

export const controlIdParamsSchema = z
  .object({ controlId: z.string().uuid() })
  .strict();

export const controlListSchema = paginationSchema
  .extend({
    q: z
      .string()
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        const trimmed = value.trim();
        return trimmed.length === 0 ? undefined : trimmed;
      })
      .pipe(z.string().max(CONTROL_SEARCH_MAX_LENGTH).optional()),
    code: z.string().trim().min(1).max(64).optional(),
    title: z.string().trim().min(1).max(CONTROL_TITLE_MAX_LENGTH).optional(),
    implementationStatus: implementationStatusSchema.optional(),
    lifecycleStatus: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
    ownerId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    controlType: controlTypeSchema.optional(),
    frequency: frequencySchema.optional(),
    policyId: z.string().uuid().optional(),
    policyVersionId: z.string().uuid().optional(),
    frameworkId: z.string().uuid().optional(),
    frameworkRuleId: z.string().uuid().optional(),
    requiresEvidence: booleanQuerySchema,
    reviewDueFrom: dateSchema.optional(),
    reviewDueTo: dateSchema.optional(),
    ...listOrderFields([
      "code",
      "title",
      "lifecycleStatus",
      "implementationStatus",
      "nextReviewDate",
      "createdAt",
    ] as const).shape,
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

export const createControlSchema = z
  .object({
    title: z.string().trim().min(1).max(CONTROL_TITLE_MAX_LENGTH),
    description: optionalNullableText(CONTROL_DESCRIPTION_MAX_LENGTH),
    objective: z.string().trim().min(1).max(CONTROL_OBJECTIVE_MAX_LENGTH),
    ownerId: optionalNullableUuid,
    departmentId: optionalNullableUuid,
    implementationStatus: implementationStatusSchema,
    implementationNotes: optionalNullableText(CONTROL_NOTES_MAX_LENGTH),
    controlType: controlTypeSchema,
    frequency: frequencySchema,
    verificationMethod: z
      .string()
      .trim()
      .min(1)
      .max(CONTROL_VERIFICATION_MAX_LENGTH),
    requiresEvidence: z.boolean().optional().default(false),
    lastReviewDate: dateSchema.nullable().optional(),
    nextReviewDate: dateSchema.nullable().optional(),
    policyVersionIds: z.array(z.string().uuid()).max(100).optional(),
    frameworkIds: z.array(z.string().uuid()).max(100).optional(),
    frameworkRuleIds: z.array(z.string().uuid()).max(100).optional(),
  })
  .strict()
  .superRefine(refineReviewDates);

export const updateControlSchema = z
  .object({
    title: z.string().trim().min(1).max(CONTROL_TITLE_MAX_LENGTH).optional(),
    description: optionalNullableText(CONTROL_DESCRIPTION_MAX_LENGTH),
    objective: z
      .string()
      .trim()
      .min(1)
      .max(CONTROL_OBJECTIVE_MAX_LENGTH)
      .optional(),
    ownerId: optionalNullableUuid,
    departmentId: optionalNullableUuid,
    implementationStatus: implementationStatusSchema.optional(),
    implementationNotes: optionalNullableText(CONTROL_NOTES_MAX_LENGTH),
    controlType: controlTypeSchema.optional(),
    frequency: frequencySchema.optional(),
    verificationMethod: z
      .string()
      .trim()
      .min(1)
      .max(CONTROL_VERIFICATION_MAX_LENGTH)
      .optional(),
    requiresEvidence: z.boolean().optional(),
    lastReviewDate: dateSchema.nullable().optional(),
    nextReviewDate: dateSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  })
  .superRefine(refineReviewDates);

export const replaceControlPolicyVersionsSchema = z
  .object({
    policyVersionIds: z.array(z.string().uuid()).max(100),
  })
  .strict();

export const replaceControlFrameworksSchema = z
  .object({
    frameworkIds: z.array(z.string().uuid()).max(100),
  })
  .strict();

export const replaceControlFrameworkRulesSchema = z
  .object({
    frameworkRuleIds: z.array(z.string().uuid()).max(100),
  })
  .strict();

export const emptyBodySchema = z.object({}).strict();

export const controlAuditListSchema = paginationSchema.strict();

export type ControlListQuery = z.infer<typeof controlListSchema>;
export type CreateControlBody = z.infer<typeof createControlSchema>;
export type UpdateControlBody = z.infer<typeof updateControlSchema>;
export type ReplaceControlPolicyVersionsBody = z.infer<
  typeof replaceControlPolicyVersionsSchema
>;
export type ReplaceControlFrameworksBody = z.infer<
  typeof replaceControlFrameworksSchema
>;
export type ReplaceControlFrameworkRulesBody = z.infer<
  typeof replaceControlFrameworkRulesSchema
>;
export type ControlAuditListQuery = z.infer<typeof controlAuditListSchema>;
