import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../../common/middleware/http.js";
import { ok } from "../../common/responses/envelope.js";
import type { DashboardService } from "./service.js";

export const dashboardRoutes = (service: DashboardService) => {
  const router = Router();
  router.get(
    "/summary",
    asyncHandler(async (req: Request, res: Response) =>
      ok(res, await service.summary(req.auth!.tenantId, req.auth!.permissions)),
    ),
  );
  return router;
};
