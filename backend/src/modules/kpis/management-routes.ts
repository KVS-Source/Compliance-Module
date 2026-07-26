import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import {
  kpiConfigurationDto,
  kpiTargetDto,
  type KpiManagementService,
} from "./management-service.js";
import {
  createKpiConfigurationSchema,
  createKpiTargetSchema,
  kpiConfigurationListSchema,
  kpiIdParamsSchema,
  kpiTargetListSchema,
  rejectKpiTargetSchema,
  updateKpiConfigurationSchema,
  updateKpiTargetSchema,
  versionKpiTargetSchema,
  type KpiConfigurationListQuery,
  type KpiTargetListQuery,
} from "./management-validators.js";

const auditContext = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

class KpiConfigurationController {
  constructor(private readonly service: KpiManagementService) {}

  list = async (req: Request, res: Response) => {
    const result = await this.service.listConfigurations(
      req.auth!.tenantId,
      req.query as unknown as KpiConfigurationListQuery,
    );
    return ok(res, result.data, result.meta);
  };

  get = async (req: Request, res: Response) =>
    ok(
      res,
      kpiConfigurationDto(
        await this.service.getConfiguration(
          req.auth!.tenantId,
          String(req.params.id),
        ),
      ),
    );

  create = async (req: Request, res: Response) =>
    created(
      res,
      await this.service.createConfiguration(
        req.auth!.tenantId,
        req.auth!.userId,
        req.body,
        auditContext(req),
      ),
    );

  update = async (req: Request, res: Response) =>
    ok(
      res,
      await this.service.updateConfiguration(
        req.auth!.tenantId,
        String(req.params.id),
        req.auth!.userId,
        req.body,
        auditContext(req),
      ),
    );

  delete = async (req: Request, res: Response) =>
    ok(
      res,
      await this.service.deleteConfiguration(
        req.auth!.tenantId,
        String(req.params.id),
        req.auth!.userId,
        auditContext(req),
      ),
    );
}

class KpiTargetController {
  constructor(private readonly service: KpiManagementService) {}

  list = async (req: Request, res: Response) => {
    const result = await this.service.listTargets(
      req.auth!.tenantId,
      req.query as unknown as KpiTargetListQuery,
    );
    return ok(res, result.data, result.meta);
  };

  get = async (req: Request, res: Response) =>
    ok(
      res,
      kpiTargetDto(
        await this.service.getTarget(req.auth!.tenantId, String(req.params.id)),
      ),
    );

  create = async (req: Request, res: Response) =>
    created(
      res,
      await this.service.createTarget(
        req.auth!.tenantId,
        req.auth!.userId,
        req.body,
        auditContext(req),
      ),
    );

  update = async (req: Request, res: Response) =>
    ok(
      res,
      await this.service.updateTarget(
        req.auth!.tenantId,
        String(req.params.id),
        req.auth!.userId,
        req.body,
        auditContext(req),
      ),
    );

  delete = async (req: Request, res: Response) =>
    ok(
      res,
      await this.service.deleteTarget(
        req.auth!.tenantId,
        String(req.params.id),
        req.auth!.userId,
        auditContext(req),
      ),
    );

  submit = async (req: Request, res: Response) =>
    ok(
      res,
      await this.service.submitTarget(
        req.auth!.tenantId,
        String(req.params.id),
        req.auth!.userId,
        auditContext(req),
      ),
    );

  approve = async (req: Request, res: Response) =>
    ok(
      res,
      await this.service.approveTarget(
        req.auth!.tenantId,
        String(req.params.id),
        req.auth!.userId,
        auditContext(req),
      ),
    );

  reject = async (req: Request, res: Response) =>
    ok(
      res,
      await this.service.rejectTarget(
        req.auth!.tenantId,
        String(req.params.id),
        req.auth!.userId,
        req.body.reason,
        auditContext(req),
      ),
    );

  version = async (req: Request, res: Response) =>
    created(
      res,
      await this.service.versionTarget(
        req.auth!.tenantId,
        String(req.params.id),
        req.auth!.userId,
        req.body,
        auditContext(req),
      ),
    );
}

export const kpiConfigurationRoutes = (service: KpiManagementService) => {
  const router = Router();
  const controller = new KpiConfigurationController(service);
  router.get(
    "/",
    permit("kpis:read"),
    validate(kpiConfigurationListSchema, "query"),
    asyncHandler(controller.list),
  );
  router.get(
    "/:id",
    permit("kpis:read"),
    validate(kpiIdParamsSchema, "params"),
    asyncHandler(controller.get),
  );
  router.post(
    "/",
    permit("kpi-config:write"),
    validate(createKpiConfigurationSchema),
    asyncHandler(controller.create),
  );
  router.patch(
    "/:id",
    permit("kpi-config:write"),
    validate(kpiIdParamsSchema, "params"),
    validate(updateKpiConfigurationSchema),
    asyncHandler(controller.update),
  );
  router.delete(
    "/:id",
    permit("kpi-config:write"),
    validate(kpiIdParamsSchema, "params"),
    asyncHandler(controller.delete),
  );
  return router;
};

export const kpiTargetRoutes = (service: KpiManagementService) => {
  const router = Router();
  const controller = new KpiTargetController(service);
  router.get(
    "/",
    permit("kpis:read"),
    validate(kpiTargetListSchema, "query"),
    asyncHandler(controller.list),
  );
  router.get(
    "/:id",
    permit("kpis:read"),
    validate(kpiIdParamsSchema, "params"),
    asyncHandler(controller.get),
  );
  router.post(
    "/",
    permit("kpi-target:write"),
    validate(createKpiTargetSchema),
    asyncHandler(controller.create),
  );
  router.patch(
    "/:id",
    permit("kpi-target:write"),
    validate(kpiIdParamsSchema, "params"),
    validate(updateKpiTargetSchema),
    asyncHandler(controller.update),
  );
  router.delete(
    "/:id",
    permit("kpi-target:write"),
    validate(kpiIdParamsSchema, "params"),
    asyncHandler(controller.delete),
  );
  router.post(
    "/:id/submit",
    permit("kpi-target:write"),
    validate(kpiIdParamsSchema, "params"),
    asyncHandler(controller.submit),
  );
  router.post(
    "/:id/approve",
    permit("kpi-target:approve"),
    validate(kpiIdParamsSchema, "params"),
    asyncHandler(controller.approve),
  );
  router.post(
    "/:id/reject",
    permit("kpi-target:approve"),
    validate(kpiIdParamsSchema, "params"),
    validate(rejectKpiTargetSchema),
    asyncHandler(controller.reject),
  );
  router.post(
    "/:id/versions",
    permit("kpi-target:write"),
    validate(kpiIdParamsSchema, "params"),
    validate(versionKpiTargetSchema),
    asyncHandler(controller.version),
  );
  return router;
};
