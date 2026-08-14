import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { ok } from "../../common/responses/envelope.js";
import { exportFilename } from "../exports/csv.js";
import type { AuditTrailService } from "./service.js";
import {
  auditIdParamsSchema,
  auditListSchema,
  type AuditListQuery,
} from "./validators.js";

export const auditRoutes = (service: AuditTrailService) => {
  const router = Router();

  router.get(
    "/",
    permit("audit:read"),
    validate(auditListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.list(
        req.auth!.tenantId,
        req.query as unknown as AuditListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.get(
    "/export.csv",
    permit("audit:read"),
    permit("exports:read"),
    validate(auditListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const body = await service.exportCsv(
        req.auth!.tenantId,
        req.query as unknown as AuditListQuery,
      );
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exportFilename("audit-trail")}"`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(body);
    }),
  );

  router.get(
    "/:eventId",
    permit("audit:read"),
    validate(auditIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.get(req.auth!.tenantId, String(req.params.eventId)),
      ),
    ),
  );

  return router;
};
