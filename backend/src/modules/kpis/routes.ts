import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  authenticate,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { ok, pageMeta } from "../../common/responses/envelope.js";
import {
  paginationSchema,
  type Pagination,
} from "../../common/responses/pagination.js";
import type { SharedMasterProvider } from "../../providers/shared-master/provider.js";

export class KpisService {
  constructor(private readonly provider: SharedMasterProvider) {}
  async definitions(pagination: Pagination) {
    const result = await this.provider.listKpiDefinitions(pagination);
    return {
      data: result.items,
      meta: pageMeta(pagination.page, pagination.pageSize, result.total),
    };
  }
  async goals(tenantId: string, pagination: Pagination) {
    const result = await this.provider.listKpiGoals(tenantId, pagination);
    return {
      data: result.items.map(({ tenantId: internalTenantId, ...goal }) => {
        void internalTenantId;
        return goal;
      }),
      meta: pageMeta(pagination.page, pagination.pageSize, result.total),
    };
  }
}

export const kpiDefinitionRoutes = (provider: SharedMasterProvider) => {
  const router = Router();
  const service = new KpisService(provider);
  router.get(
    "/",
    authenticate,
    permit("kpis:read"),
    validate(paginationSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.definitions(
        req.query as unknown as Pagination,
      );
      return ok(res, result.data, result.meta);
    }),
  );
  return router;
};

export const kpiGoalRoutes = (provider: SharedMasterProvider) => {
  const router = Router();
  const service = new KpisService(provider);
  router.get(
    "/",
    authenticate,
    permit("kpis:read"),
    validate(paginationSchema, "query"),
    asyncHandler(async (req: Request, res: Response) => {
      const result = await service.goals(
        req.auth!.tenantId,
        req.query as unknown as Pagination,
      );
      return ok(res, result.data, result.meta);
    }),
  );
  return router;
};
