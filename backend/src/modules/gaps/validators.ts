import { z } from "zod";
import { listOrderFields } from "../../common/list-order.js";
import { paginationSchema } from "../../common/responses/pagination.js";

export const GAP_TITLE_MAX_LENGTH = 300;
export const GAP_TEXT_MAX_LENGTH = 5_000;
export const GAP_SEARCH_MAX_LENGTH = 100;

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

export const gapSeveritySchema = z.enum([
  "CRITICAL",
  "MAJOR",
  "MINOR",
  "OBSERVATION",
  "OFI",
]);

export const gapStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "CLOSED",
  "CANCELLED",
]);

export const gapIdParamsSchema = z
  .object({ gapId: z.string().uuid() })
  .strict();

export const gapEvidenceParamsSchema = z
  .object({ gapId: z.string().uuid(), evidenceId: z.string().uuid() })
  .strict();

export const gapListSchema = paginationSchema
  .extend({
    q: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim() ?? "";
        return trimmed.length === 0 ? undefined : trimmed;
      })
      .pipe(z.string().max(GAP_SEARCH_MAX_LENGTH).optional()),
    code: z.string().trim().min(1).max(64).optional(),
    severity: gapSeveritySchema.optional(),
    status: gapStatusSchema.optional(),
    ownerId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    frameworkId: z.string().uuid().optional(),
    /** `true` restricts the list to gaps past their due date and still open. */
    overdue: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((value) => value === true || value === "true")
      .optional(),
    needsReview: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((value) => value === true || value === "true")
      .optional(),
    dueFrom: dateSchema.optional(),
    dueTo: dateSchema.optional(),
    ...listOrderFields([
      "code",
      "title",
      "status",
      "severity",
      "dueDate",
      "createdAt",
    ] as const).shape,
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

/**
 * `companyId` is deliberately absent from every write schema. Company scope is
 * derived from the authenticated token, never accepted from a request body.
 */
export const createGapSchema = z
  .object({
    title: z.string().trim().min(1).max(GAP_TITLE_MAX_LENGTH),
    description: optionalNullableText(GAP_TEXT_MAX_LENGTH),
    severity: gapSeveritySchema,
    source: optionalNullableText(200),
    frameworkId: optionalNullableUuid,
    frameworkRuleId: optionalNullableUuid,
    controlId: optionalNullableUuid,
    checkpointId: optionalNullableUuid,
    clauseRef: optionalNullableText(200),
    recommendedAction: optionalNullableText(GAP_TEXT_MAX_LENGTH),
    ownerId: optionalNullableUuid,
    departmentId: optionalNullableUuid,
    identifiedOn: dateSchema.nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
  })
  .strict();

export const updateGapSchema = z
  .object({
    title: z.string().trim().min(1).max(GAP_TITLE_MAX_LENGTH).optional(),
    description: optionalNullableText(GAP_TEXT_MAX_LENGTH),
    severity: gapSeveritySchema.optional(),
    status: gapStatusSchema.optional(),
    source: optionalNullableText(200),
    frameworkId: optionalNullableUuid,
    frameworkRuleId: optionalNullableUuid,
    controlId: optionalNullableUuid,
    checkpointId: optionalNullableUuid,
    clauseRef: optionalNullableText(200),
    recommendedAction: optionalNullableText(GAP_TEXT_MAX_LENGTH),
    departmentId: optionalNullableUuid,
    identifiedOn: dateSchema.nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  })
  .refine((value) => value.status !== "CLOSED", {
    path: ["status"],
    message: "Use POST /gaps/:gapId/close to close a gap",
  });

export const assignGapOwnerSchema = z
  .object({ ownerId: z.string().uuid().nullable() })
  .strict();

export const closeGapSchema = z
  .object({ closureNote: z.string().trim().min(1).max(GAP_TEXT_MAX_LENGTH) })
  .strict();

export const reopenGapSchema = z
  .object({ reason: optionalNullableText(GAP_TEXT_MAX_LENGTH) })
  .strict();

export const linkGapEvidenceSchema = z
  .object({
    evidenceId: z.string().uuid(),
    linkReason: optionalNullableText(1_000),
  })
  .strict();

export type GapListQuery = z.infer<typeof gapListSchema>;
export type CreateGapBody = z.infer<typeof createGapSchema>;
export type UpdateGapBody = z.infer<typeof updateGapSchema>;
export type AssignGapOwnerBody = z.infer<typeof assignGapOwnerSchema>;
export type CloseGapBody = z.infer<typeof closeGapSchema>;
export type ReopenGapBody = z.infer<typeof reopenGapSchema>;
export type LinkGapEvidenceBody = z.infer<typeof linkGapEvidenceSchema>;
