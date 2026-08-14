import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import type { CheckpointService } from "./service.js";
import {
  checkpointAuditListSchema,
  checkpointIdParamsSchema,
  checkpointListSchema,
  checkpointReviewListSchema,
  createCheckpointReviewSchema,
  createCheckpointSchema,
  emptyBodySchema,
  updateCheckpointSchema,
  type CheckpointAuditListQuery,
  type CheckpointListQuery,
  type CheckpointReviewListQuery,
} from "./validators.js";

const auditContext = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export const checkpointRoutes = (service: CheckpointService) => {
  const router = Router();

  router.get(
    "/",
    permit("checkpoints:read"),
    validate(checkpointListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.list(
        req.auth!.tenantId,
        req.query as unknown as CheckpointListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.post(
    "/",
    permit("checkpoints:write"),
    validate(createCheckpointSchema),
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

  router.get(
    "/:checkpointId",
    permit("checkpoints:read"),
    validate(checkpointIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.get(
          req.auth!.tenantId,
          String(req.params.checkpointId),
        ),
      ),
    ),
  );

  router.patch(
    "/:checkpointId",
    permit("checkpoints:write"),
    validate(checkpointIdParamsSchema, "params"),
    validate(updateCheckpointSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.update(
          req.auth!.tenantId,
          String(req.params.checkpointId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:checkpointId/activate",
    permit("checkpoints:write"),
    validate(checkpointIdParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.activate(
          req.auth!.tenantId,
          String(req.params.checkpointId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:checkpointId/deactivate",
    permit("checkpoints:write"),
    validate(checkpointIdParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.deactivate(
          req.auth!.tenantId,
          String(req.params.checkpointId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:checkpointId/archive",
    permit("checkpoints:write"),
    validate(checkpointIdParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.archive(
          req.auth!.tenantId,
          String(req.params.checkpointId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  router.get(
    "/:checkpointId/reviews",
    permit("checkpoints:read"),
    validate(checkpointIdParamsSchema, "params"),
    validate(checkpointReviewListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.listReviews(
        req.auth!.tenantId,
        String(req.params.checkpointId),
        req.query as unknown as CheckpointReviewListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.post(
    "/:checkpointId/reviews",
    permit("checkpoints:review"),
    validate(checkpointIdParamsSchema, "params"),
    validate(createCheckpointReviewSchema),
    asyncHandler(async (req: Request, res: Response) =>
      created(
        res,
        await service.createReview(
          req.auth!.tenantId,
          String(req.params.checkpointId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.get(
    "/:checkpointId/latest-review",
    permit("checkpoints:read"),
    validate(checkpointIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.getLatestReview(
          req.auth!.tenantId,
          String(req.params.checkpointId),
        ),
      ),
    ),
  );

  router.get(
    "/:checkpointId/traceability",
    permit("checkpoints:read"),
    validate(checkpointIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.traceability(
          req.auth!.tenantId,
          String(req.params.checkpointId),
        ),
      ),
    ),
  );

  router.get(
    "/:checkpointId/audit-events",
    permit("checkpoints:read"),
    validate(checkpointIdParamsSchema, "params"),
    validate(checkpointAuditListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.listAuditEvents(
        req.auth!.tenantId,
        String(req.params.checkpointId),
        req.query as unknown as CheckpointAuditListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  return router;
};
