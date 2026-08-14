import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { created, ok } from "../../common/responses/envelope.js";
import type { RegisterService } from "./service.js";
import {
  createRegisterRecordSchema,
  registerCodeParamsSchema,
  registerRecordListSchema,
  registerRecordParamsSchema,
  registerTypeListSchema,
  updateRegisterRecordSchema,
  type RegisterRecordListQuery,
  type RegisterTypeListQuery,
} from "./validators.js";

const auditContext = (req: Request) => {
  const userAgent = req.get("user-agent");
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
};

export const registerRoutes = (service: RegisterService) => {
  const router = Router();

  router.get(
    "/",
    permit("registers:read"),
    validate(registerTypeListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.listTypes(
        req.auth!.tenantId,
        req.query as unknown as RegisterTypeListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.get(
    "/:registerCode/records",
    permit("registers:read"),
    validate(registerCodeParamsSchema, "params"),
    validate(registerRecordListSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.listRecords(
        req.auth!.tenantId,
        String(req.params.registerCode),
        req.query as unknown as RegisterRecordListQuery,
      );
      return ok(res, result.data, result.meta);
    }),
  );

  router.get(
    "/:registerCode/records/:recordId",
    permit("registers:read"),
    validate(registerRecordParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.getRecord(
          req.auth!.tenantId,
          String(req.params.registerCode),
          String(req.params.recordId),
        ),
      ),
    ),
  );

  router.post(
    "/:registerCode/records",
    permit("registers:write"),
    validate(registerCodeParamsSchema, "params"),
    validate(createRegisterRecordSchema),
    asyncHandler(async (req: Request, res: Response) =>
      created(
        res,
        await service.createRecord(
          req.auth!.tenantId,
          String(req.params.registerCode),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  router.patch(
    "/:registerCode/records/:recordId",
    permit("registers:write"),
    validate(registerRecordParamsSchema, "params"),
    validate(updateRegisterRecordSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.updateRecord(
          req.auth!.tenantId,
          String(req.params.registerCode),
          String(req.params.recordId),
          req.auth!.userId,
          req.body,
          auditContext(req),
        ),
      ),
    ),
  );

  return router;
};
