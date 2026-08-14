import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import type { PolicyService } from "./service.js";
import {
  approvePolicyVersionSchema,
  createPolicySchema,
  createPolicyVersionSchema,
  emptyBodySchema,
  policyAuditListSchema,
  policyIdParamsSchema,
  policyListSchema,
  policyVersionParamsSchema,
  rejectPolicyVersionSchema,
  replacePolicyFrameworksSchema,
  updatePolicySchema,
  updatePolicyVersionSchema,
  versionIdParamsSchema,
  type PolicyAuditListQuery,
  type PolicyListQuery,
} from "./validators.js";

const auditContext = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export const policyRoutes = (service: PolicyService) => {
  const router = Router();

  router.get(
    "/",
    permit("policies:read"),
    validate(policyListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.list(
        req.auth!.tenantId,
        req.query as unknown as PolicyListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.post(
    "/",
    permit("policies:write"),
    validate(createPolicySchema),
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
    "/:policyId",
    permit("policies:read"),
    validate(policyIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.get(req.auth!.tenantId, String(req.params.policyId)),
      ),
    ),
  );

  router.patch(
    "/:policyId",
    permit("policies:write"),
    validate(policyIdParamsSchema, "params"),
    validate(updatePolicySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.update(
          req.auth!.tenantId,
          String(req.params.policyId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:policyId/archive",
    permit("policies:write"),
    validate(policyIdParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.archive(
          req.auth!.tenantId,
          String(req.params.policyId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  router.get(
    "/:policyId/versions",
    permit("policies:read"),
    validate(policyIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.listVersions(
          req.auth!.tenantId,
          String(req.params.policyId),
        ),
      ),
    ),
  );

  router.post(
    "/:policyId/versions",
    permit("policies:write"),
    validate(policyIdParamsSchema, "params"),
    validate(createPolicyVersionSchema),
    asyncHandler(async (req: Request, res: Response) =>
      created(
        res,
        await service.createVersion(
          req.auth!.tenantId,
          String(req.params.policyId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.get(
    "/:policyId/versions/:versionId",
    permit("policies:read"),
    validate(policyVersionParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.getVersion(
          req.auth!.tenantId,
          String(req.params.policyId),
          String(req.params.versionId),
        ),
      ),
    ),
  );

  router.get(
    "/:policyId/traceability",
    permit("policies:read"),
    validate(policyIdParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.traceability(
          req.auth!.tenantId,
          String(req.params.policyId),
        ),
      ),
    ),
  );

  router.get(
    "/:policyId/audit-events",
    permit("policies:read"),
    validate(policyIdParamsSchema, "params"),
    validate(policyAuditListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.listAuditEvents(
        req.auth!.tenantId,
        String(req.params.policyId),
        req.query as unknown as PolicyAuditListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  return router;
};

export const policyVersionRoutes = (service: PolicyService) => {
  const router = Router();

  router.patch(
    "/:versionId",
    permit("policies:write"),
    validate(versionIdParamsSchema, "params"),
    validate(updatePolicyVersionSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.updateVersion(
          req.auth!.tenantId,
          String(req.params.versionId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.put(
    "/:versionId/frameworks",
    permit("policies:write"),
    validate(versionIdParamsSchema, "params"),
    validate(replacePolicyFrameworksSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.replaceFrameworks(
          req.auth!.tenantId,
          String(req.params.versionId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:versionId/submit",
    permit("policies:submit"),
    validate(versionIdParamsSchema, "params"),
    validate(emptyBodySchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.submit(
          req.auth!.tenantId,
          String(req.params.versionId),
          req.auth!.userId,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:versionId/approve",
    permit("policies:approve"),
    validate(versionIdParamsSchema, "params"),
    validate(approvePolicyVersionSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.approve(
          req.auth!.tenantId,
          String(req.params.versionId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.post(
    "/:versionId/reject",
    permit("policies:approve"),
    validate(versionIdParamsSchema, "params"),
    validate(rejectPolicyVersionSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.reject(
          req.auth!.tenantId,
          String(req.params.versionId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  return router;
};
