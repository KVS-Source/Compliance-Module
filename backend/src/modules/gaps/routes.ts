import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import type { GapService } from "./service.js";
import {
  assignGapOwnerSchema,
  closeGapSchema,
  createGapSchema,
  gapEvidenceParamsSchema,
  gapIdParamsSchema,
  gapListSchema,
  linkGapEvidenceSchema,
  reopenGapSchema,
  updateGapSchema,
  type GapListQuery,
} from "./validators.js";

const auditContext = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export const gapRoutes = (service: GapService) => {
  const router = Router();

  router.get(
    "/",
    permit("gaps:read"),
    validate(gapListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.list(
        req.auth!.tenantId,
        req.query as unknown as GapListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.get(
    "/:gapId",
    permit("gaps:read"),
    validate(gapIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(res, await service.get(req.auth!.tenantId, String(req.params.gapId))),
    ),
  );

  router.post(
    "/",
    permit("gaps:write"),
    validate(createGapSchema),
    asyncHandler(async (req: Request, res: Response) =>
      created(
        res,
        await service.create(
          req.auth!.tenantId,
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.patch(
    "/:gapId",
    permit("gaps:write"),
    validate(gapIdParamsSchema, "params"),
    validate(updateGapSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.update(
          req.auth!.tenantId,
          String(req.params.gapId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.patch(
    "/:gapId/owner",
    permit("gaps:write"),
    validate(gapIdParamsSchema, "params"),
    validate(assignGapOwnerSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.assignOwner(
          req.auth!.tenantId,
          String(req.params.gapId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  // Closure carries its own permission: writing a gap and signing one off are
  // different authorities.
  router.post(
    "/:gapId/close",
    permit("gaps:close"),
    validate(gapIdParamsSchema, "params"),
    validate(closeGapSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.close(
          req.auth!.tenantId,
          String(req.params.gapId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:gapId/reopen",
    permit("gaps:close"),
    validate(gapIdParamsSchema, "params"),
    validate(reopenGapSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.reopen(
          req.auth!.tenantId,
          String(req.params.gapId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:gapId/evidence",
    permit("gaps:write"),
    validate(gapIdParamsSchema, "params"),
    validate(linkGapEvidenceSchema),
    asyncHandler(async (req: Request, res: Response) =>
      created(
        res,
        await service.linkEvidence(
          req.auth!.tenantId,
          String(req.params.gapId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.delete(
    "/:gapId/evidence/:evidenceId",
    permit("gaps:write"),
    validate(gapEvidenceParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.unlinkEvidence(
          req.auth!.tenantId,
          String(req.params.gapId),
          String(req.params.evidenceId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  return router;
};
