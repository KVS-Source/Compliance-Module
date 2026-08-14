import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import type { RiskService } from "./service.js";
import {
  assignRiskOwnerSchema,
  closeRiskSchema,
  completeRiskTreatmentSchema,
  createManualRiskSchema,
  createRiskReviewSchema,
  createRiskTreatmentSchema,
  reopenRiskSchema,
  riskIdParamsSchema,
  riskListSchema,
  riskTreatmentParamsSchema,
  type RiskListQuery,
} from "./validators.js";

const auditContext = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

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
  router.post(
    "/",
    permit("risk:write"),
    validate(createManualRiskSchema),
    asyncHandler(async (req: Request, res: Response) =>
      created(
        res,
        await service.createManual(
          req.auth!.tenantId,
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );
  router.get(
    "/:id",
    permit("risk:read"),
    validate(riskIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(res, await service.get(req.auth!.tenantId, String(req.params.id))),
    ),
  );
  router.post(
    "/:id/reviews",
    permit("risk:treat"),
    validate(riskIdParamsSchema, "params"),
    validate(createRiskReviewSchema),
    asyncHandler(async (req: Request, res: Response) =>
      created(
        res,
        await service.recordReview(
          req.auth!.tenantId,
          String(req.params.id),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );
  router.post(
    "/:id/treatments",
    permit("risk:treat"),
    validate(riskIdParamsSchema, "params"),
    validate(createRiskTreatmentSchema),
    asyncHandler(async (req: Request, res: Response) =>
      created(
        res,
        await service.recordTreatment(
          req.auth!.tenantId,
          String(req.params.id),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );
  router.post(
    "/:id/treatments/:treatmentId/complete",
    permit("risk:treat"),
    validate(riskTreatmentParamsSchema, "params"),
    validate(completeRiskTreatmentSchema),
    asyncHandler(async (req: Request, res: Response) =>
      created(
        res,
        await service.completeTreatment(
          req.auth!.tenantId,
          String(req.params.id),
          String(req.params.treatmentId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );
  router.patch(
    "/:id/owner",
    permit("risk:treat"),
    validate(riskIdParamsSchema, "params"),
    validate(assignRiskOwnerSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.assignOwner(
          req.auth!.tenantId,
          String(req.params.id),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );
  router.post(
    "/:id/close",
    permit("risk:close"),
    validate(riskIdParamsSchema, "params"),
    validate(closeRiskSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.closeRisk(
          req.auth!.tenantId,
          String(req.params.id),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );
  router.post(
    "/:id/reopen",
    permit("risk:close"),
    validate(riskIdParamsSchema, "params"),
    validate(reopenRiskSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.reopenRisk(
          req.auth!.tenantId,
          String(req.params.id),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );
  return router;
};
