import { z } from "zod";
import { paginationSchema } from "../../common/responses/pagination.js";

export const notificationListSchema = paginationSchema
  .extend({
    unread: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((value) => value === true || value === "true")
      .optional(),
  })
  .strict();

export const notificationIdParamsSchema = z
  .object({ notificationId: z.string().uuid() })
  .strict();

export const markNotificationReadSchema = z.object({}).strict();

export type NotificationListQuery = z.infer<typeof notificationListSchema>;
