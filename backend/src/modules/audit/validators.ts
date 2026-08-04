import { z } from "zod";
import { paginationSchema } from "../../common/responses/pagination.js";

const dateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime());

export const auditListSchema = paginationSchema
  .extend({
    from: dateTimeSchema.optional(),
    to: dateTimeSchema.optional(),
    userId: z.string().uuid().optional(),
    entityType: z.string().trim().min(1).max(120).optional(),
    action: z.string().trim().min(1).max(120).optional(),
    entityId: z.string().trim().min(1).max(120).optional(),
    source: z
      .enum(["SYSTEM", "USER", "IMPORT", "EXTERNAL_SYNC"])
      .optional(),
    q: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim() ?? "";
        return trimmed.length === 0 ? undefined : trimmed;
      })
      .pipe(z.string().max(100).optional()),
  })
  .strict();

export const auditIdParamsSchema = z
  .object({ eventId: z.string().uuid() })
  .strict();

export type AuditListQuery = z.infer<typeof auditListSchema>;
