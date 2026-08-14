import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import type { CapaService } from "./service.js";
import {
  assignCapaOwnerSchema,
  capaEvidenceParamsSchema,
  capaIdParamsSchema,
  capaListSchema,
  closeCapaSchema,
  createCapaSchema,
  linkCapaEvidenceSchema,
  reopenCapaSchema,
  updateCapaSchema,
  type CapaListQuery,
} from "./validators.js";

const auditContext = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export const capaRoutes = (service: CapaService) => {
  const router = Router();

  router.get(
    "/",
    permit("capa:read"),
    validate(capaListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.list(
        req.auth!.tenantId,
        req.query as unknown as CapaListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.get(
    "/:capaId",
    permit("capa:read"),
    validate(capaIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(res, await service.get(req.auth!.tenantId, String(req.params.capaId))),
    ),
  );

  router.post(
    "/",
    permit("capa:write"),
    validate(createCapaSchema),
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
    "/:capaId",
    permit("capa:write"),
    validate(capaIdParamsSchema, "params"),
    validate(updateCapaSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.update(
          req.auth!.tenantId,
          String(req.params.capaId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.patch(
    "/:capaId/owner",
    permit("capa:write"),
    validate(capaIdParamsSchema, "params"),
    validate(assignCapaOwnerSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.assignOwner(
          req.auth!.tenantId,
          String(req.params.capaId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:capaId/close",
    permit("capa:close"),
    validate(capaIdParamsSchema, "params"),
    validate(closeCapaSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.close(
          req.auth!.tenantId,
          String(req.params.capaId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:capaId/reopen",
    permit("capa:close"),
    validate(capaIdParamsSchema, "params"),
    validate(reopenCapaSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.reopen(
          req.auth!.tenantId,
          String(req.params.capaId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:capaId/evidence",
    permit("capa:write"),
    validate(capaIdParamsSchema, "params"),
    validate(linkCapaEvidenceSchema),
    asyncHandler(async (req: Request, res: Response) =>
      created(
        res,
        await service.linkEvidence(
          req.auth!.tenantId,
          String(req.params.capaId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.delete(
    "/:capaId/evidence/:evidenceId",
    permit("capa:write"),
    validate(capaEvidenceParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.unlinkEvidence(
          req.auth!.tenantId,
          String(req.params.capaId),
          String(req.params.evidenceId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  return router;
};
