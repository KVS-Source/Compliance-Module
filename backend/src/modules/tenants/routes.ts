import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  authenticate,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { pageMeta, ok } from "../../common/responses/envelope.js";
import {
  paginationSchema,
  type Pagination,
} from "../../common/responses/pagination.js";
import type { SharedMasterProvider } from "../../providers/shared-master/provider.js";

export class TenantsService {
  constructor(private readonly provider: SharedMasterProvider) {}
  async list(userId: string, pagination: Pagination) {
    const result = await this.provider.listTenants(userId, pagination);
    return {
      data: result.items.map((company) => ({
        id: company.id,
        code: company.code,
        name: company.name,
        industry: company.industry,
        country: company.country,
        status: company.status,
        created: company.createdAt,
      })),
      meta: pageMeta(pagination.page, pagination.pageSize, result.total),
    };
  }
}

export class TenantsController {
  constructor(private readonly service: TenantsService) {}
  list = async (req: Request, res: Response) => {
    const result = await this.service.list(
      req.auth!.userId,
      req.query as unknown as Pagination,
    );
    return ok(res, result.data, result.meta);
  };
}

export const tenantsRoutes = (provider: SharedMasterProvider) => {
  const router = Router();
  const controller = new TenantsController(new TenantsService(provider));
  router.get(
    "/",
    authenticate,
    permit("tenants:read"),
    validate(paginationSchema, "query"),
    asyncHandler(controller.list),
  );
  return router;
};
