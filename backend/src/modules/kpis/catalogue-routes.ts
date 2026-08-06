import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { ok } from "../../common/responses/envelope.js";
import type {
  KpiAnalyticsFilters,
  KpiCatalogueService,
} from "./catalogue-service.js";

/**
 * KPI Catalogue, Frequency Master and KPI Analytics.
 *
 * Company scope is never a query parameter: it comes from the authenticated
 * token, so a caller cannot ask for another Company's figures.
 */
const analyticsQuerySchema = z
  .object({
    frequency: z
      .enum([
        "DAILY",
        "WEEKLY",
        "MONTHLY",
        "QUARTERLY",
        "HALF_YEARLY",
        "ANNUAL",
        "CONTINUOUS",
        "PER_EVENT",
        "ONE_TIME",
      ])
      .optional(),
    ownerId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    period: z.string().trim().min(1).max(48).optional(),
  })
  .strict();

export const kpiCatalogueRoutes = (service: KpiCatalogueService) => {
  const router = Router();

  router.get(
    "/catalogue",
    permit("kpis:read"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(res, await service.catalogue(req.auth!.tenantId)),
    ),
  );

  router.get(
    "/frequencies",
    permit("kpis:read"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(res, await service.frequencies(req.auth!.tenantId)),
    ),
  );

  router.get(
    "/analytics",
    permit("kpis:read"),
    validate(analyticsQuerySchema, "query"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.analytics(
          req.auth!.tenantId,
          req.query as unknown as KpiAnalyticsFilters,
        ),
      ),
    ),
  );

  return router;
};
