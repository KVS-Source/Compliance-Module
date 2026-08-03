import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { ok } from "../../common/responses/envelope.js";
import type { DashboardSummaryService } from "./summary-service.js";
import {
  dashboardSummarySchema,
  type DashboardSummaryQuery,
} from "./validators.js";

export const dashboardRoutes = (service: DashboardSummaryService) => {
  const router = Router();
  router.get(
    "/summary",
    permit("dashboard:read"),
    validate(dashboardSummarySchema, "query"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.summary(
          req.auth!.tenantId,
          req.auth!.permissions,
          req.query as unknown as DashboardSummaryQuery,
        ),
      ),
    ),
  );
  return router;
};
