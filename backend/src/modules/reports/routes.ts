import { Router, type Request, type Response } from "express";
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
import {
  buildReportQuerySchema,
  reportParamsSchema,
  type ReportQuery,
} from "./validators.js";

const toFilters = (query: ReportQuery): ReportFilters => ({
  ...(query.from ? { from: new Date(`${query.from}T00:00:00.000Z`) } : {}),
  ...(query.to ? { to: new Date(`${query.to}T23:59:59.999Z`) } : {}),
  ...(query.asOf ? { asOf: new Date(`${query.asOf}T23:59:59.999Z`) } : {}),
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

/**
 * Query validation depends on the report key (Gap severity is not Risk
 * status). Params must be validated first so the key is available here.
 */
const validateReportQuery = (
  req: Request,
  _res: Response,
  next: (error?: unknown) => void,
) => {
  const reportKey = String(req.params.reportKey ?? "");
  const parsed = buildReportQuerySchema(reportKey).safeParse(req.query);
  if (!parsed.success) return next(parsed.error);
  Object.defineProperty(req, "query", {
    configurable: true,
    enumerable: true,
    value: parsed.data,
    writable: true,
  });
  return next();
};

export const reportRoutes = (service: ReportService) => {
  const router = Router();

  /**
   * Catalogue of every report. Each entry carries an `available` flag for the
   * caller's permissions; unavailable reports are still listed so the UI can
   * explain which permission is missing rather than hide the report.
   */
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
    validateReportQuery,
    asyncHandler(async (req: Request, res: Response) => {
      const reportKey = String(req.params.reportKey);
      assertReportPermitted(reportKey, req.auth!.permissions);
      if (!isReportKey(reportKey)) throw notFound("Report");
      return ok(
        res,
        await service.run(
          reportKey,
          req.auth!.tenantId,
          toFilters(req.query as ReportQuery),
        ),
      );
    }),
  );

  /**
   * CSV for a report. `exports:read` is required in addition to the report's
   * own module permissions, so export can be withheld from a role that may
   * still read the report on screen. Filter validation matches the on-screen
   * report exactly.
   */
  router.get(
    "/:reportKey/export.csv",
    permit("dashboard:read"),
    permit("exports:read"),
    validate(reportParamsSchema, "params"),
    validateReportQuery,
    asyncHandler(async (req: Request, res: Response) => {
      const reportKey = String(req.params.reportKey);
      assertReportPermitted(reportKey, req.auth!.permissions);
      if (!isReportKey(reportKey)) throw notFound("Report");
      const body = await service.csv(
        reportKey,
        req.auth!.tenantId,
        toFilters(req.query as ReportQuery),
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

  /**
   * PDF board pack. Same permission split as CSV: the report's module
   * permissions plus `exports:read`. CSV is not replaced.
   */
  router.get(
    "/:reportKey/export.pdf",
    permit("dashboard:read"),
    permit("exports:read"),
    validate(reportParamsSchema, "params"),
    validateReportQuery,
    asyncHandler(async (req: Request, res: Response) => {
      const reportKey = String(req.params.reportKey);
      assertReportPermitted(reportKey, req.auth!.permissions);
      if (!isReportKey(reportKey)) throw notFound("Report");
      const body = await service.pdf(
        reportKey,
        req.auth!.tenantId,
        toFilters(req.query as ReportQuery),
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exportFilename(`report-${reportKey}`).replace(/\.csv$/i, "")}.pdf"`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(body);
    }),
  );

  return router;
};
