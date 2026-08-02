import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, "Date must be valid");

/**
 * Dashboard filters. Company scope is never a filter: it comes from the
 * authenticated token, so there is no `companyId` here by design.
 */
export const dashboardSummarySchema = z
  .object({
    departmentId: z.string().uuid().optional(),
    frameworkId: z.string().uuid().optional(),
    /** Reporting period label, for example `FY26-27 Q1`. */
    period: z.string().trim().min(1).max(48).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
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

export type DashboardSummaryQuery = z.infer<typeof dashboardSummarySchema>;
