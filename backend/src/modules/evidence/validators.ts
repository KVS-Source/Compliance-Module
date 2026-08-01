import { z } from "zod";
import { paginationSchema } from "../../common/responses/pagination.js";

export const EVIDENCE_TITLE_MAX_LENGTH = 300;
export const EVIDENCE_DESCRIPTION_MAX_LENGTH = 5_000;
export const EVIDENCE_SEARCH_MAX_LENGTH = 100;

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

const lifecycleStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
]);

const refineIssueExpiry = <
  T extends {
    issueDate?: string | null | undefined;
    expiresAt?: string | null | undefined;
  },
>(
  value: T,
  context: z.RefinementCtx,
) => {
  const issue = value.issueDate;
  const expires = value.expiresAt;
  if (issue == null || expires == null) return;
  if (
    typeof issue === "string" &&
    typeof expires === "string" &&
    expires < issue
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expiresAt"],
      message: "expiresAt must not be before issueDate",
    });
  }
};

export const evidenceIdParamsSchema = z
  .object({ evidenceId: z.string().uuid() })
  .strict();

export const evidenceControlLinkParamsSchema = z
  .object({
    evidenceId: z.string().uuid(),
    controlId: z.string().uuid(),
  })
  .strict();

export const evidenceCheckpointLinkParamsSchema = z
  .object({
    evidenceId: z.string().uuid(),
    checkpointId: z.string().uuid(),
  })
  .strict();

export const evidenceLinkListSchema = paginationSchema.strict();

export const evidenceListSchema = paginationSchema
  .extend({
    q: z
      .string()
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        const trimmed = value.trim();
        return trimmed.length === 0 ? undefined : trimmed;
      })
      .pipe(z.string().max(EVIDENCE_SEARCH_MAX_LENGTH).optional()),
    lifecycleStatus: lifecycleStatusSchema.optional(),
    ownerId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    expiresBefore: dateSchema.optional(),
    expiresAfter: dateSchema.optional(),
  })
  .strict();

export const createEvidenceSchema = z
  .object({
    title: z.string().trim().min(2).max(EVIDENCE_TITLE_MAX_LENGTH),
    description: optionalNullableText(EVIDENCE_DESCRIPTION_MAX_LENGTH),
    ownerId: optionalNullableUuid,
    departmentId: optionalNullableUuid,
    issueDate: dateSchema.nullable().optional(),
    expiresAt: dateSchema.nullable().optional(),
    supersedesEvidenceId: optionalNullableUuid,
  })
  .strict()
  .superRefine(refineIssueExpiry);

export const updateEvidenceSchema = z
  .object({
    title: z.string().trim().min(2).max(EVIDENCE_TITLE_MAX_LENGTH).optional(),
    description: optionalNullableText(EVIDENCE_DESCRIPTION_MAX_LENGTH),
    ownerId: optionalNullableUuid,
    departmentId: optionalNullableUuid,
    issueDate: dateSchema.nullable().optional(),
    expiresAt: dateSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field is required",
      });
    }
    refineIssueExpiry(value, context);
  });

export const emptyBodySchema = z.object({}).strict();

export const evidenceAuditListSchema = paginationSchema.strict();

export type EvidenceListQuery = z.infer<typeof evidenceListSchema>;
export type CreateEvidenceBody = z.infer<typeof createEvidenceSchema>;
export type UpdateEvidenceBody = z.infer<typeof updateEvidenceSchema>;
export type EvidenceAuditListQuery = z.infer<typeof evidenceAuditListSchema>;
export type EvidenceLinkListQuery = z.infer<typeof evidenceLinkListSchema>;
