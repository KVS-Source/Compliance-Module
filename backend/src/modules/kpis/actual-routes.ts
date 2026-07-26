import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import type { KpiActualService } from "./actual-service.js";
import {
  approveKpiActualSchema,
  createKpiActualSchema,
  kpiActualIdParamsSchema,
  rejectKpiActualSchema,
  resubmitKpiActualSchema,
} from "./actual-validators.js";

const auditContext = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export const kpiActualRoutes = (service: KpiActualService) => {
  const router = Router();
  router.post(
    "/",
    permit("kpi-actual:write"),
    validate(createKpiActualSchema),
    asyncHandler(async (req: Request, res: Response) =>
      created(
        res,
        await service.submitActual(
          req.auth!.tenantId,
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );
  router.post(
    "/:id/approve",
    permit("kpi-actual:approve"),
    validate(kpiActualIdParamsSchema, "params"),
    validate(approveKpiActualSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.approveActual(
          req.auth!.tenantId,
          String(req.params.id),
          req.auth!.userId,
          req.body.comments ?? null,
          auditContext(req),
        ),
      ),
    ),
  );
  router.post(
    "/:id/reject",
    permit("kpi-actual:approve"),
    validate(kpiActualIdParamsSchema, "params"),
    validate(rejectKpiActualSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.rejectActual(
          req.auth!.tenantId,
          String(req.params.id),
          req.auth!.userId,
          req.body.reason,
          auditContext(req),
        ),
      ),
    ),
  );
  router.post(
    "/:id/resubmit",
    permit("kpi-actual:write"),
    validate(kpiActualIdParamsSchema, "params"),
    validate(resubmitKpiActualSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.resubmitActual(
          req.auth!.tenantId,
          String(req.params.id),
          req.auth!.userId,
          req.body.comments ?? null,
          auditContext(req),
        ),
      ),
    ),
  );
  return router;
};
