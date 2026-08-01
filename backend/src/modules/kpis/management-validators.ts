import { z } from "zod";
import { Prisma } from "@prisma/client";
import { paginationSchema } from "../../common/responses/pagination.js";

export const kpiIdParamsSchema = z.object({ id: z.string().uuid() });

const recordStatusSchema = z.enum(["ACTIVE", "DISABLED", "INVITED", "LOCKED"]);

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

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, "Date must be valid");

const measuredDecimalSchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,14}(?:\.\d{1,4})?$/, "Value must fit Decimal(18,4)");

const thresholdDecimalSchema = z
  .string()
  .trim()
  .regex(/^\d{1,4}(?:\.\d{1,2})?$/, "Threshold must fit Decimal(6,2)");

const nullableUuidSchema = z.string().uuid().nullable().optional();
const nullableTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .nullable()
  .optional();
const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value), "Currency must be ISO 4217")
  .nullable()
  .optional();

const configurationFields = {
  kpiDefinitionId: z.string().uuid(),
  orgUnitId: nullableUuidSchema,
  orgLocationId: nullableUuidSchema,
  productService: nullableTextSchema,
  departmentId: nullableUuidSchema,
  ownerId: z.string().uuid(),
  approverId: nullableUuidSchema,
  enabled: z.boolean().default(true),
  currency: currencySchema,
  reviewFrequency: frequencySchema,
  amberThresholdPct: thresholdDecimalSchema.nullable().optional(),
  redThresholdPct: thresholdDecimalSchema.nullable().optional(),
  requiresEvidence: z.boolean().default(false),
  requiresApproval: z.boolean().default(true),
  effectiveFrom: dateSchema,
  effectiveTo: dateSchema.nullable().optional(),
  status: recordStatusSchema.default("ACTIVE"),
};

const refineConfigurationDates = <
  T extends {
    effectiveFrom?: string | undefined;
    effectiveTo?: string | null | undefined;
  },
>(
  value: T,
  context: z.RefinementCtx,
) => {
  if (
    value.effectiveFrom !== undefined &&
    value.effectiveTo != null &&
    value.effectiveTo < value.effectiveFrom
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "Effective-to date must not precede effective-from date",
    });
  }
};

/** Evidence-required configurations must require human approval (Slice 5D). */
export const refineEvidenceRequiresApproval = <
  T extends {
    requiresEvidence?: boolean | undefined;
    requiresApproval?: boolean | undefined;
  },
>(
  value: T,
  context: z.RefinementCtx,
) => {
  if (value.requiresEvidence === true && value.requiresApproval === false) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requiresApproval"],
      message:
        "Evidence-required KPI configurations must require approval",
    });
  }
};

export const createKpiConfigurationSchema = z
  .object(configurationFields)
  .superRefine(refineConfigurationDates)
  .superRefine(refineEvidenceRequiresApproval);

export const updateKpiConfigurationSchema = z
  .object({
    ...configurationFields,
    kpiDefinitionId: configurationFields.kpiDefinitionId.optional(),
    ownerId: configurationFields.ownerId.optional(),
    reviewFrequency: configurationFields.reviewFrequency.optional(),
    enabled: z.boolean().optional(),
    requiresEvidence: z.boolean().optional(),
    requiresApproval: z.boolean().optional(),
    effectiveFrom: dateSchema.optional(),
    status: recordStatusSchema.optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  })
  .superRefine(refineConfigurationDates);

const targetFields = {
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Code must be alphanumeric"),
  kpiConfigurationId: z.string().uuid(),
  period: z.string().trim().min(1).max(64),
  periodStart: dateSchema,
  periodEnd: dateSchema,
  targetValue: measuredDecimalSchema,
  minValue: measuredDecimalSchema.nullable().optional(),
  maxValue: measuredDecimalSchema.nullable().optional(),
  effectiveFrom: dateSchema,
  effectiveTo: dateSchema.nullable().optional(),
  status: recordStatusSchema.default("ACTIVE"),
};

const refineTargetValues = <
  T extends {
    periodStart?: string | undefined;
    periodEnd?: string | undefined;
    effectiveFrom?: string | undefined;
    effectiveTo?: string | null | undefined;
    minValue?: string | null | undefined;
    maxValue?: string | null | undefined;
  },
>(
  value: T,
  context: z.RefinementCtx,
) => {
  if (
    value.periodStart !== undefined &&
    value.periodEnd !== undefined &&
    value.periodEnd < value.periodStart
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["periodEnd"],
      message: "Period end must not precede period start",
    });
  }
  if (
    value.effectiveFrom !== undefined &&
    value.effectiveTo != null &&
    value.effectiveTo < value.effectiveFrom
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "Effective-to date must not precede effective-from date",
    });
  }
  if (
    value.minValue != null &&
    value.maxValue != null &&
    new Prisma.Decimal(value.maxValue).lessThan(value.minValue)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxValue"],
      message: "Maximum value must not be below minimum value",
    });
  }
};

export const createKpiTargetSchema = z
  .object(targetFields)
  .superRefine(refineTargetValues);

export const updateKpiTargetSchema = z
  .object({
    code: targetFields.code.optional(),
    period: targetFields.period.optional(),
    periodStart: targetFields.periodStart.optional(),
    periodEnd: targetFields.periodEnd.optional(),
    targetValue: targetFields.targetValue.optional(),
    minValue: targetFields.minValue,
    maxValue: targetFields.maxValue,
    effectiveFrom: targetFields.effectiveFrom.optional(),
    effectiveTo: targetFields.effectiveTo,
    status: recordStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  })
  .superRefine(refineTargetValues);

export const versionKpiTargetSchema = z
  .object({
    code: targetFields.code,
    period: targetFields.period.optional(),
    periodStart: targetFields.periodStart.optional(),
    periodEnd: targetFields.periodEnd.optional(),
    targetValue: targetFields.targetValue.optional(),
    minValue: targetFields.minValue,
    maxValue: targetFields.maxValue,
    effectiveFrom: targetFields.effectiveFrom.optional(),
    effectiveTo: targetFields.effectiveTo,
    status: recordStatusSchema.optional(),
  })
  .superRefine(refineTargetValues);

export const rejectKpiTargetSchema = z.object({
  reason: z.string().trim().min(1).max(2_000),
});

export const kpiConfigurationListSchema = paginationSchema.extend({
  kpiDefinitionId: z.string().uuid().optional(),
  status: recordStatusSchema.optional(),
  enabled: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const kpiTargetListSchema = paginationSchema.extend({
  kpiConfigurationId: z.string().uuid().optional(),
  approvalStatus: z
    .enum(["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED"])
    .optional(),
  status: recordStatusSchema.optional(),
});

export type CreateKpiConfigurationBody = z.infer<
  typeof createKpiConfigurationSchema
>;
export type UpdateKpiConfigurationBody = z.infer<
  typeof updateKpiConfigurationSchema
>;
export type CreateKpiTargetBody = z.infer<typeof createKpiTargetSchema>;
export type UpdateKpiTargetBody = z.infer<typeof updateKpiTargetSchema>;
export type VersionKpiTargetBody = z.infer<typeof versionKpiTargetSchema>;
export type KpiConfigurationListQuery = z.infer<
  typeof kpiConfigurationListSchema
>;
export type KpiTargetListQuery = z.infer<typeof kpiTargetListSchema>;
