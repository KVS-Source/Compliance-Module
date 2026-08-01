import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { evidenceUploadRateLimiter } from "../../common/middleware/rate-limit.js";
import { created, ok } from "../../common/responses/envelope.js";
import type { EvidenceService } from "./service.js";
import {
  createEvidenceSchema,
  emptyBodySchema,
  evidenceAuditListSchema,
  evidenceCheckpointLinkParamsSchema,
  evidenceControlLinkParamsSchema,
  evidenceIdParamsSchema,
  evidenceLinkListSchema,
  evidenceListSchema,
  updateEvidenceSchema,
  type EvidenceAuditListQuery,
  type EvidenceLinkListQuery,
  type EvidenceListQuery,
} from "./validators.js";

const auditContext = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export const evidenceRoutes = (service: EvidenceService) => {
  const router = Router();

  router.get(
    "/",
    permit("evidence:read"),
    validate(evidenceListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.list(
        req.auth!.tenantId,
        req.query as unknown as EvidenceListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.post(
    "/",
    permit("evidence:write"),
    validate(createEvidenceSchema),
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
    "/:evidenceId",
    permit("evidence:read"),
    validate(evidenceIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.get(
          req.auth!.tenantId,
          String(req.params.evidenceId),
        ),
      ),
    ),
  );

  router.patch(
    "/:evidenceId",
    permit("evidence:write"),
    validate(evidenceIdParamsSchema, "params"),
    validate(updateEvidenceSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.update(
          req.auth!.tenantId,
          String(req.params.evidenceId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:evidenceId/file",
    permit("evidence:write"),
    evidenceUploadRateLimiter(),
    validate(evidenceIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.uploadFile(
          req.auth!.tenantId,
          String(req.params.evidenceId),
          req.auth!.userId,
          req,
          auditContext(req),
        ),
      ),
    ),
  );

  router.get(
    "/:evidenceId/file",
    permit("evidence:read"),
    permit("evidence:download"),
    validate(evidenceIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) => {
      await service.downloadFile(
        req.auth!.tenantId,
        String(req.params.evidenceId),
        req.auth!.userId,
        res,
        auditContext(req),
      );
    }),
  );

  router.post(
    "/:evidenceId/submit",
    permit("evidence:write"),
    validate(evidenceIdParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.submit(
          req.auth!.tenantId,
          String(req.params.evidenceId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:evidenceId/archive",
    permit("evidence:write"),
    validate(evidenceIdParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.archive(
          req.auth!.tenantId,
          String(req.params.evidenceId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  router.get(
    "/:evidenceId/controls",
    permit("evidence:read"),
    validate(evidenceIdParamsSchema, "params"),
    validate(evidenceLinkListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.listControlLinks(
        req.auth!.tenantId,
        String(req.params.evidenceId),
        req.query as unknown as EvidenceLinkListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.post(
    "/:evidenceId/controls/:controlId/unlink",
    permit("evidence:write"),
    validate(evidenceControlLinkParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.unlinkControl(
          req.auth!.tenantId,
          String(req.params.evidenceId),
          String(req.params.controlId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:evidenceId/controls/:controlId",
    permit("evidence:write"),
    validate(evidenceControlLinkParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.linkControl(
        req.auth!.tenantId,
        String(req.params.evidenceId),
        String(req.params.controlId),
        req.auth!.userId,
        auditContext(req),
      );
      if (result.created) return created(res, result.data);
      return ok(res, result.data);
    }),
  );

  router.get(
    "/:evidenceId/checkpoints",
    permit("evidence:read"),
    validate(evidenceIdParamsSchema, "params"),
    validate(evidenceLinkListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.listCheckpointLinks(
        req.auth!.tenantId,
        String(req.params.evidenceId),
        req.query as unknown as EvidenceLinkListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.post(
    "/:evidenceId/checkpoints/:checkpointId/unlink",
    permit("evidence:write"),
    validate(evidenceCheckpointLinkParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.unlinkCheckpoint(
          req.auth!.tenantId,
          String(req.params.evidenceId),
          String(req.params.checkpointId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:evidenceId/checkpoints/:checkpointId",
    permit("evidence:write"),
    validate(evidenceCheckpointLinkParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.linkCheckpoint(
        req.auth!.tenantId,
        String(req.params.evidenceId),
        String(req.params.checkpointId),
        req.auth!.userId,
        auditContext(req),
      );
      if (result.created) return created(res, result.data);
      return ok(res, result.data);
    }),
  );

  router.get(
    "/:evidenceId/audit-events",
    permit("evidence:read"),
    validate(evidenceIdParamsSchema, "params"),
    validate(evidenceAuditListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.listAuditEvents(
        req.auth!.tenantId,
        String(req.params.evidenceId),
        req.query as unknown as EvidenceAuditListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  return router;
};
