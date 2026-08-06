import { z } from "zod";
import { capaPrioritySchema, capaStatusSchema } from "../capa/validators.js";
import { gapSeveritySchema, gapStatusSchema } from "../gaps/validators.js";
import { REPORT_CATALOGUE, isReportKey } from "./service.js";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, "Date must be valid");

/** RiskStatus from prisma/schema.prisma — the only values a Risk filter may send. */
export const riskStatusSchema = z.enum([
  "OPEN",
  "UNDER_REVIEW",
  "TREATED",
  "CLOSED",
  "ARCHIVED",
]);

/** EvidenceLifecycleStatus from prisma/schema.prisma. */
export const evidenceLifecycleStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
]);

export const reportParamsSchema = z
  .object({ reportKey: z.string().trim().min(1).max(64) })
  .strict();

const statusSchemaFor = (reportKey: string) => {
  switch (reportKey) {
    case "evidence-status":
      return evidenceLifecycleStatusSchema;
    case "risks":
      return riskStatusSchema;
    case "gaps":
      return gapStatusSchema;
    case "capa-aging":
      return capaStatusSchema;
    default:
      return z.never();
  }
};

/**
 * Build the query schema for one report.
 *
 * Status, severity and priority are report-specific Prisma enums — free-form
 * strings must never reach a Prisma `where` clause, or an unsupported value
 * becomes a 500 instead of a structured 400.
 */
export const buildReportQuerySchema = (reportKey: string) => {
  const definition = isReportKey(reportKey)
    ? REPORT_CATALOGUE.find((report) => report.key === reportKey)
    : undefined;
  const allowed = new Set(definition?.filters ?? []);

  return z
    .object({
      from: dateSchema.optional(),
      to: dateSchema.optional(),
      frameworkId: allowed.has("frameworkId")
        ? z.string().uuid().optional()
        : z.undefined().optional(),
      departmentId: allowed.has("departmentId")
        ? z.string().uuid().optional()
        : z.undefined().optional(),
      status: allowed.has("status")
        ? statusSchemaFor(reportKey).optional()
        : z.undefined().optional(),
      severity: allowed.has("severity")
        ? gapSeveritySchema.optional()
        : z.undefined().optional(),
      priority: allowed.has("priority")
        ? capaPrioritySchema.optional()
        : z.undefined().optional(),
      period: allowed.has("period")
        ? z.string().trim().min(1).max(48).optional()
        : z.undefined().optional(),
      registerCode: allowed.has("registerCode")
        ? z.string().trim().min(1).max(64).optional()
        : z.undefined().optional(),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        value.from !== undefined &&
        value.to !== undefined &&
        value.to < value.from
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["to"],
          message: "to must not precede from",
        });
      }
    });
};

export type ReportQuery = z.infer<ReturnType<typeof buildReportQuerySchema>>;
