import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { created } from "../../common/responses/envelope.js";
import type { KpiActualService } from "./actual-service.js";
import { createKpiActualSchema } from "./actual-validators.js";

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
  return router;
};
