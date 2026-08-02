import { z } from "zod";
import { paginationSchema } from "../../common/responses/pagination.js";

export const CAPA_TITLE_MAX_LENGTH = 300;
export const CAPA_TEXT_MAX_LENGTH = 5_000;
export const CAPA_SEARCH_MAX_LENGTH = 100;

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

export const capaPrioritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);

export const capaStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "PENDING_VERIFICATION",
  "CLOSED",
  "CANCELLED",
]);

const completionPercentageSchema = z.coerce.number().int().min(0).max(100);

export const capaIdParamsSchema = z
  .object({ capaId: z.string().uuid() })
  .strict();

export const capaEvidenceParamsSchema = z
  .object({ capaId: z.string().uuid(), evidenceId: z.string().uuid() })
  .strict();

export const capaListSchema = paginationSchema
  .extend({
    q: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim() ?? "";
        return trimmed.length === 0 ? undefined : trimmed;
      })
      .pipe(z.string().max(CAPA_SEARCH_MAX_LENGTH).optional()),
    code: z.string().trim().min(1).max(64).optional(),
    priority: capaPrioritySchema.optional(),
    status: capaStatusSchema.optional(),
    gapId: z.string().uuid().optional(),
    ownerId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    frameworkId: z.string().uuid().optional(),
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

/** Company scope always comes from the token; no schema accepts `companyId`. */
export const createCapaSchema = z
  .object({
    title: z.string().trim().min(1).max(CAPA_TITLE_MAX_LENGTH),
    description: optionalNullableText(CAPA_TEXT_MAX_LENGTH),
    gapId: optionalNullableUuid,
    priority: capaPrioritySchema,
    source: optionalNullableText(200),
    sourceRef: optionalNullableText(200),
    frameworkId: optionalNullableUuid,
    rootCause: optionalNullableText(CAPA_TEXT_MAX_LENGTH),
    correctiveAction: optionalNullableText(CAPA_TEXT_MAX_LENGTH),
    preventiveAction: optionalNullableText(CAPA_TEXT_MAX_LENGTH),
    ownerId: optionalNullableUuid,
    departmentId: optionalNullableUuid,
    raisedOn: dateSchema.nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
    completionPercentage: completionPercentageSchema.optional(),
  })
  .strict();

export const updateCapaSchema = z
  .object({
    title: z.string().trim().min(1).max(CAPA_TITLE_MAX_LENGTH).optional(),
    description: optionalNullableText(CAPA_TEXT_MAX_LENGTH),
    gapId: optionalNullableUuid,
    priority: capaPrioritySchema.optional(),
    status: capaStatusSchema.optional(),
    source: optionalNullableText(200),
    sourceRef: optionalNullableText(200),
    frameworkId: optionalNullableUuid,
    rootCause: optionalNullableText(CAPA_TEXT_MAX_LENGTH),
    correctiveAction: optionalNullableText(CAPA_TEXT_MAX_LENGTH),
    preventiveAction: optionalNullableText(CAPA_TEXT_MAX_LENGTH),
    departmentId: optionalNullableUuid,
    raisedOn: dateSchema.nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
    completionPercentage: completionPercentageSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  })
  .refine((value) => value.status !== "CLOSED", {
    path: ["status"],
    message: "Use POST /capas/:capaId/close to close a CAPA",
  });

export const assignCapaOwnerSchema = z
  .object({ ownerId: z.string().uuid().nullable() })
  .strict();

export const closeCapaSchema = z
  .object({ closureNote: z.string().trim().min(1).max(CAPA_TEXT_MAX_LENGTH) })
  .strict();

export const reopenCapaSchema = z
  .object({ reason: optionalNullableText(CAPA_TEXT_MAX_LENGTH) })
  .strict();

export const linkCapaEvidenceSchema = z
  .object({
    evidenceId: z.string().uuid(),
    linkReason: optionalNullableText(1_000),
  })
  .strict();

export type CapaListQuery = z.infer<typeof capaListSchema>;
export type CreateCapaBody = z.infer<typeof createCapaSchema>;
export type UpdateCapaBody = z.infer<typeof updateCapaSchema>;
export type AssignCapaOwnerBody = z.infer<typeof assignCapaOwnerSchema>;
export type CloseCapaBody = z.infer<typeof closeCapaSchema>;
export type ReopenCapaBody = z.infer<typeof reopenCapaSchema>;
export type LinkCapaEvidenceBody = z.infer<typeof linkCapaEvidenceSchema>;
