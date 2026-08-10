import { z } from "zod";
import { listOrderFields } from "../../common/list-order.js";
import { paginationSchema } from "../../common/responses/pagination.js";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, "Date must be valid");

export const taskStatusSchema = z.enum([
  "TODO",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);
export const taskLinkTypeSchema = z.enum(["GAP", "CAPA", "RISK", "AUDIT"]);

export const taskListSchema = paginationSchema
  .extend({
    q: z.string().trim().max(100).optional(),
    status: taskStatusSchema.optional(),
    ownerId: z.string().uuid().optional(),
    linkedEntityType: taskLinkTypeSchema.optional(),
    overdue: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((value) => value === true || value === "true")
      .optional(),
    ...listOrderFields([
      "title",
      "status",
      "dueDate",
      "createdAt",
    ] as const).shape,
  })
  .strict();

export const taskIdParamsSchema = z
  .object({ taskId: z.string().uuid() })
  .strict();

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(5_000).nullable().optional(),
    status: taskStatusSchema.optional(),
    dueDate: dateSchema.nullable().optional(),
    ownerId: z.string().uuid().nullable().optional(),
    linkedEntityType: taskLinkTypeSchema,
    linkedEntityId: z.string().uuid(),
  })
  .strict();

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().min(1).max(5_000).nullable().optional(),
    status: taskStatusSchema.optional(),
    dueDate: dateSchema.nullable().optional(),
    ownerId: z.string().uuid().nullable().optional(),
    linkedEntityType: taskLinkTypeSchema.optional(),
    linkedEntityId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export type TaskListQuery = z.infer<typeof taskListSchema>;
export type CreateTaskBody = z.infer<typeof createTaskSchema>;
export type UpdateTaskBody = z.infer<typeof updateTaskSchema>;
