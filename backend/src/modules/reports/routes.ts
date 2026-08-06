import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { forbidden, notFound } from "../../common/errors/app-error.js";
import { ok } from "../../common/responses/envelope.js";
import { exportFilename } from "../exports/csv.js";
import {
  REPORT_CATALOGUE,
  isReportKey,
  type ReportFilters,
  type ReportService,
} from "./service.js";

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
 * Report filters. Company scope is never a parameter: it is read from the
 * authenticated token, so a caller cannot ask for another Company's rows.
 */
const reportQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    frameworkId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    status: z.string().trim().min(1).max(48).optional(),
    severity: z.string().trim().min(1).max(48).optional(),
    priority: z.string().trim().min(1).max(48).optional(),
    period: z.string().trim().min(1).max(48).optional(),
    registerCode: z.string().trim().min(1).max(64).optional(),
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

const reportParamsSchema = z
  .object({ reportKey: z.string().trim().min(1).max(64) })
  .strict();

const toFilters = (query: z.infer<typeof reportQuerySchema>): ReportFilters => ({
  ...(query.from ? { from: new Date(`${query.from}T00:00:00.000Z`) } : {}),
  ...(query.to ? { to: new Date(`${query.to}T23:59:59.999Z`) } : {}),
  ...(query.frameworkId ? { frameworkId: query.frameworkId } : {}),
  ...(query.departmentId ? { departmentId: query.departmentId } : {}),
  ...(query.status ? { status: query.status } : {}),
  ...(query.severity ? { severity: query.severity } : {}),
  ...(query.priority ? { priority: query.priority } : {}),
  ...(query.period ? { period: query.period } : {}),
  ...(query.registerCode ? { registerCode: query.registerCode } : {}),
});

const held = (permissions: readonly string[], permission: string) =>
  permissions.includes("*") || permissions.includes(permission);

/**
 * A report carries the permissions of every module it reads, not a single
 * blanket `reports:read`. Aggregating rows a caller may not list would be a
 * way around the register permissions, so each one is checked here.
 */
const assertReportPermitted = (
  reportKey: string,
  permissions: readonly string[],
) => {
  const definition = REPORT_CATALOGUE.find(
    (report) => report.key === reportKey,
  );
  if (!definition) throw notFound("Report");
  for (const permission of definition.permissions) {
    if (!held(permissions, permission)) {
      throw forbidden(`Missing permission: ${permission}`);
    }
  }
  return definition;
};

export const reportRoutes = (service: ReportService) => {
  const router = Router();

  /** The catalogue, filtered to what this caller may actually run. */
  router.get(
    "/",
    permit("dashboard:read"),
    asyncHandler(async (req: Request, res: Response) => {
      const permissions = req.auth!.permissions;
      return ok(
        res,
        service.catalogue().map((report) => ({
          ...report,
          available: report.permissions.every((permission) =>
            held(permissions, permission),
          ),
        })),
      );
    }),
  );

  router.get(
    "/:reportKey",
    permit("dashboard:read"),
    validate(reportParamsSchema, "params"),
    validate(reportQuerySchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const reportKey = String(req.params.reportKey);
      assertReportPermitted(reportKey, req.auth!.permissions);
      if (!isReportKey(reportKey)) throw notFound("Report");
      return ok(
        res,
        await service.run(
          reportKey,
          req.auth!.tenantId,
          toFilters(req.query as z.infer<typeof reportQuerySchema>),
        ),
      );
    }),
  );

  /**
   * CSV for a report. `exports:read` is required in addition to the report's
   * own module permissions, so export can be withheld from a role that may
   * still read the report on screen.
   */
  router.get(
    "/:reportKey/export.csv",
    permit("dashboard:read"),
    permit("exports:read"),
    validate(reportParamsSchema, "params"),
    validate(reportQuerySchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const reportKey = String(req.params.reportKey);
      assertReportPermitted(reportKey, req.auth!.permissions);
      if (!isReportKey(reportKey)) throw notFound("Report");
      const body = await service.csv(
        reportKey,
        req.auth!.tenantId,
        toFilters(req.query as z.infer<typeof reportQuerySchema>),
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exportFilename(`report-${reportKey}`)}"`,
      );
      // Without nosniff a browser may render the CSV inline, which turns a
      // text file into a stored-XSS vector on the API origin.
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(body);
    }),
  );

  return router;
};
