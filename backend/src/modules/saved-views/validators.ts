import { z } from "zod";

export const SAVED_VIEW_REGISTER_KEYS = [
  "GAPS",
  "CAPAS",
  "RISKS",
  "POLICIES",
  "CONTROLS",
  "CHECKPOINTS",
  "EVIDENCE",
  "KPI_ACTUALS",
  "KPI_TARGETS",
  "OPERATIONAL_REGISTERS",
  "TASKS",
] as const;

export const savedViewRegisterKeySchema = z.enum(SAVED_VIEW_REGISTER_KEYS);

const querySchema = z
  .record(
    z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/).max(50),
    z.string().max(500),
  )
  .superRefine((value, context) => {
    if (Object.keys(value).length > 20) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A saved view may contain at most 20 query fields",
      });
    }
  });

export const savedViewListSchema = z
  .object({ registerKey: savedViewRegisterKeySchema })
  .strict();

export const savedViewIdParamsSchema = z
  .object({ savedViewId: z.string().uuid() })
  .strict();

export const createSavedViewSchema = z
  .object({
    registerKey: savedViewRegisterKeySchema,
    name: z.string().trim().min(1).max(100),
    query: querySchema,
  })
  .strict();

export const updateSavedViewSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    query: querySchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export type SavedViewRegisterKey = z.infer<
  typeof savedViewRegisterKeySchema
>;
export type CreateSavedViewBody = z.infer<typeof createSavedViewSchema>;
export type UpdateSavedViewBody = z.infer<typeof updateSavedViewSchema>;
