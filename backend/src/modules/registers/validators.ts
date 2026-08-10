import { z } from "zod";
import { paginationSchema } from "../../common/responses/pagination.js";
import { listOrderFields } from "../../common/list-order.js";

export const REGISTER_TITLE_MAX_LENGTH = 300;
export const REGISTER_CODE_MAX_LENGTH = 64;
/** Bounds the free-form payload so a register record cannot become a blob. */
export const REGISTER_PAYLOAD_MAX_FIELDS = 60;
export const REGISTER_PAYLOAD_VALUE_MAX_LENGTH = 2_000;

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

/**
 * Register payloads are label/value pairs taken from the source sheet. Values
 * are constrained to strings so a register can never smuggle a nested
 * structure past validation into JSONB.
 */
const payloadSchema = z
  .record(
    z.string().max(200),
    z.string().max(REGISTER_PAYLOAD_VALUE_MAX_LENGTH),
  )
  .refine(
    (value) => Object.keys(value).length <= REGISTER_PAYLOAD_MAX_FIELDS,
    `A register record accepts at most ${REGISTER_PAYLOAD_MAX_FIELDS} fields`,
  );

export const registerCodeParamsSchema = z
  .object({
    registerCode: z.string().trim().min(1).max(REGISTER_CODE_MAX_LENGTH),
  })
  .strict();

export const registerRecordParamsSchema = z
  .object({
    registerCode: z.string().trim().min(1).max(REGISTER_CODE_MAX_LENGTH),
    recordId: z.string().uuid(),
  })
  .strict();

export const registerTypeListSchema = paginationSchema
  .extend({
    active: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((value) => value === true || value === "true")
      .optional(),
  })
  .strict();

export const registerRecordListSchema = paginationSchema
  .extend({
    q: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim() ?? "";
        return trimmed.length === 0 ? undefined : trimmed;
      })
      .pipe(z.string().max(100).optional()),
    status: z.string().trim().min(1).max(120).optional(),
    ownerId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    overdue: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .transform((value) => value === true || value === "true")
      .optional(),
    dueFrom: dateSchema.optional(),
    dueTo: dateSchema.optional(),
    ...listOrderFields([
      "businessRecordCode",
      "title",
      "status",
      "dueDate",
      "recordDate",
      "createdAt",
    ] as const).shape,
  })
  .strict();

export const createRegisterRecordSchema = z
  .object({
    businessRecordCode: z.string().trim().min(1).max(REGISTER_CODE_MAX_LENGTH),
    title: z.string().trim().min(1).max(REGISTER_TITLE_MAX_LENGTH),
    status: z.string().trim().min(1).max(120).nullable().optional(),
    ownerId: optionalNullableUuid,
    departmentId: optionalNullableUuid,
    recordDate: dateSchema.nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
    payload: payloadSchema.optional(),
  })
  .strict();

export const updateRegisterRecordSchema = z
  .object({
    title: z.string().trim().min(1).max(REGISTER_TITLE_MAX_LENGTH).optional(),
    status: z.string().trim().min(1).max(120).nullable().optional(),
    ownerId: optionalNullableUuid,
    departmentId: optionalNullableUuid,
    recordDate: dateSchema.nullable().optional(),
    dueDate: dateSchema.nullable().optional(),
    payload: payloadSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export type RegisterTypeListQuery = z.infer<typeof registerTypeListSchema>;
export type RegisterRecordListQuery = z.infer<typeof registerRecordListSchema>;
export type CreateRegisterRecordBody = z.infer<
  typeof createRegisterRecordSchema
>;
export type UpdateRegisterRecordBody = z.infer<
  typeof updateRegisterRecordSchema
>;
