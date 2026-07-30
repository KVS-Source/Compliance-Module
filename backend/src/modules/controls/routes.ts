import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import type { ControlService } from "./service.js";
import {
  controlAuditListSchema,
  controlIdParamsSchema,
  controlListSchema,
  createControlSchema,
  emptyBodySchema,
  replaceControlFrameworkRulesSchema,
  replaceControlFrameworksSchema,
  replaceControlPolicyVersionsSchema,
  updateControlSchema,
  type ControlAuditListQuery,
  type ControlListQuery,
} from "./validators.js";

const auditContext = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export const controlRoutes = (service: ControlService) => {
  const router = Router();

  router.get(
    "/",
    permit("controls:read"),
    validate(controlListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.list(
        req.auth!.tenantId,
        req.query as unknown as ControlListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.post(
    "/",
    permit("controls:write"),
    validate(createControlSchema),
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
    "/:controlId",
    permit("controls:read"),
    validate(controlIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.get(req.auth!.tenantId, String(req.params.controlId)),
      ),
    ),
  );

  router.patch(
    "/:controlId",
    permit("controls:write"),
    validate(controlIdParamsSchema, "params"),
    validate(updateControlSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.update(
          req.auth!.tenantId,
          String(req.params.controlId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:controlId/activate",
    permit("controls:write"),
    validate(controlIdParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.activate(
          req.auth!.tenantId,
          String(req.params.controlId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:controlId/deactivate",
    permit("controls:write"),
    validate(controlIdParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.deactivate(
          req.auth!.tenantId,
          String(req.params.controlId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:controlId/archive",
    permit("controls:write"),
    validate(controlIdParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.archive(
          req.auth!.tenantId,
          String(req.params.controlId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  router.put(
    "/:controlId/policy-versions",
    permit("controls:write"),
    validate(controlIdParamsSchema, "params"),
    validate(replaceControlPolicyVersionsSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.replacePolicyVersions(
          req.auth!.tenantId,
          String(req.params.controlId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.put(
    "/:controlId/frameworks",
    permit("controls:write"),
    validate(controlIdParamsSchema, "params"),
    validate(replaceControlFrameworksSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.replaceFrameworks(
          req.auth!.tenantId,
          String(req.params.controlId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.put(
    "/:controlId/framework-rules",
    permit("controls:write"),
    validate(controlIdParamsSchema, "params"),
    validate(replaceControlFrameworkRulesSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.replaceFrameworkRules(
          req.auth!.tenantId,
          String(req.params.controlId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.get(
    "/:controlId/traceability",
    permit("controls:read"),
    validate(controlIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.traceability(
          req.auth!.tenantId,
          String(req.params.controlId),
        ),
      ),
    ),
  );

  router.get(
    "/:controlId/audit-events",
    permit("controls:read"),
    validate(controlIdParamsSchema, "params"),
    validate(controlAuditListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.listAuditEvents(
        req.auth!.tenantId,
        String(req.params.controlId),
        req.query as unknown as ControlAuditListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  return router;
};
