import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { ok } from "../../common/responses/envelope.js";
import type { RiskService } from "./service.js";
import {
  riskIdParamsSchema,
  riskListSchema,
  type RiskListQuery,
} from "./validators.js";

export const riskRoutes = (service: RiskService) => {
  const router = Router();
  router.get(
    "/",
    permit("risk:read"),
    validate(riskListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.list(
        req.auth!.tenantId,
        req.query as unknown as RiskListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );
  router.get(
    "/:id",
    permit("risk:read"),
    validate(riskIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(res, await service.get(req.auth!.tenantId, String(req.params.id))),
    ),
  );
  return router;
};
