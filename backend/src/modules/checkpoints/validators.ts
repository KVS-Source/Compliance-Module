import { z } from "zod";
import { paginationSchema } from "../../common/responses/pagination.js";

export const CHECKPOINT_SEARCH_MAX_LENGTH = 100;
export const CHECKPOINT_TITLE_MAX_LENGTH = 300;
export const CHECKPOINT_DESCRIPTION_MAX_LENGTH = 4_000;
export const CHECKPOINT_EXPECTED_RESULT_MAX_LENGTH = 5_000;
export const CHECKPOINT_OBSERVATION_MAX_LENGTH = 10_000;
export const CHECKPOINT_RECOMMENDATION_MAX_LENGTH = 5_000;
export const CHECKPOINT_REVIEW_PERIOD_MAX_LENGTH = 48;

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

const outcomeSchema = z.enum(["PASS", "PARTIAL", "FAIL", "NOT_APPLICABLE"]);

const booleanQuerySchema = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .transform((value) => value === true || value === "true")
  .optional();

export const checkpointIdParamsSchema = z
  .object({ checkpointId: z.string().uuid() })
  .strict();

export const checkpointListSchema = paginationSchema
  .extend({
    q: z
      .string()
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        const trimmed = value.trim();
        return trimmed.length === 0 ? undefined : trimmed;
      })
      .pipe(z.string().max(CHECKPOINT_SEARCH_MAX_LENGTH).optional()),
    code: z.string().trim().min(1).max(64).optional(),
    title: z.string().trim().min(1).max(CHECKPOINT_TITLE_MAX_LENGTH).optional(),
    lifecycleStatus: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
    controlId: z.string().uuid().optional(),
    controlLifecycleStatus: z
      .enum(["ACTIVE", "INACTIVE", "ARCHIVED"])
      .optional(),
    ownerId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    verificationFrequency: frequencySchema.optional(),
    latestOutcome: outcomeSchema.optional(),
    hasReviews: booleanQuerySchema,
    evidenceRequired: booleanQuerySchema,
    dueFrom: dateSchema.optional(),
    dueTo: dateSchema.optional(),
    reviewPeriod: z
      .string()
      .trim()
      .min(1)
      .max(CHECKPOINT_REVIEW_PERIOD_MAX_LENGTH)
      .optional(),
    frameworkId: z.string().uuid().optional(),
    policyId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.dueFrom !== undefined &&
      value.dueTo !== undefined &&
      value.dueTo < value.dueFrom
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueTo"],
        message: "dueTo must not precede dueFrom",
      });
    }
  });

export const createCheckpointSchema = z
  .object({
    controlId: z.string().uuid(),
    title: z.string().trim().min(1).max(CHECKPOINT_TITLE_MAX_LENGTH),
    description: optionalNullableText(CHECKPOINT_DESCRIPTION_MAX_LENGTH),
    verificationFrequency: frequencySchema,
    ownerId: optionalNullableUuid,
    departmentId: optionalNullableUuid,
    expectedResult: z
      .string()
      .trim()
      .min(1)
      .max(CHECKPOINT_EXPECTED_RESULT_MAX_LENGTH),
    evidenceRequired: z.boolean().optional().default(false),
    initialReviewDate: dateSchema.nullable().optional(),
  })
  .strict();

export const updateCheckpointSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(CHECKPOINT_TITLE_MAX_LENGTH)
      .optional(),
    description: optionalNullableText(CHECKPOINT_DESCRIPTION_MAX_LENGTH),
    verificationFrequency: frequencySchema.optional(),
    ownerId: optionalNullableUuid,
    departmentId: optionalNullableUuid,
    expectedResult: z
      .string()
      .trim()
      .min(1)
      .max(CHECKPOINT_EXPECTED_RESULT_MAX_LENGTH)
      .optional(),
    evidenceRequired: z.boolean().optional(),
    initialReviewDate: dateSchema.nullable().optional(),
    nextReviewDate: dateSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

/**
 * Review body. reviewPeriod formats by verificationFrequency:
 * DAILY YYYY-MM-DD; WEEKLY YYYY-Www; MONTHLY YYYY-MM; QUARTERLY YYYY-Qn;
 * HALF_YEARLY YYYY-Hn; ANNUAL YYYY; CONTINUOUS/PER_EVENT YYYY-MM-DD#TOKEN;
 * ONE_TIME ONE-TIME.
 */
export const createCheckpointReviewSchema = z
  .object({
    reviewPeriod: z
      .string()
      .trim()
      .min(1)
      .max(CHECKPOINT_REVIEW_PERIOD_MAX_LENGTH),
    reviewDate: dateSchema,
    outcome: outcomeSchema,
    observation: optionalNullableText(CHECKPOINT_OBSERVATION_MAX_LENGTH),
    recommendation: optionalNullableText(CHECKPOINT_RECOMMENDATION_MAX_LENGTH),
    nextReviewDate: dateSchema.nullable().optional(),
  })
  .strict();

export const emptyBodySchema = z.object({}).strict();

export const checkpointAuditListSchema = paginationSchema.strict();

export const checkpointReviewListSchema = paginationSchema.strict();

export type CheckpointListQuery = z.infer<typeof checkpointListSchema>;
export type CreateCheckpointBody = z.infer<typeof createCheckpointSchema>;
export type UpdateCheckpointBody = z.infer<typeof updateCheckpointSchema>;
export type CreateCheckpointReviewBody = z.infer<
  typeof createCheckpointReviewSchema
>;
export type CheckpointAuditListQuery = z.infer<
  typeof checkpointAuditListSchema
>;
export type CheckpointReviewListQuery = z.infer<
  typeof checkpointReviewListSchema
>;
