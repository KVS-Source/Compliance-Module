import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import {
  asyncHandler,
  authenticate,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { notFound } from "../../common/errors/app-error.js";
import { ok, pageMeta } from "../../common/responses/envelope.js";
import {
  paginationSchema,
  type Pagination,
} from "../../common/responses/pagination.js";
import type { SharedMasterProvider } from "../../providers/shared-master/provider.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export class FrameworksRepository {
  constructor(private readonly db: PrismaClient) {}
  get(id: string) {
    return this.db.framework.findUnique({ where: { id } });
  }
}

export class FrameworksService {
  constructor(
    private readonly provider: SharedMasterProvider,
    private readonly repository: FrameworksRepository,
  ) {}
  async list(pagination: Pagination) {
    const result = await this.provider.listFrameworks(pagination);
    return {
      data: result.items,
      meta: pageMeta(pagination.page, pagination.pageSize, result.total),
    };
  }
  async get(id: string) {
    const framework = await this.repository.get(id);
    if (!framework) throw notFound("Framework not found");
    return framework;
  }
  async rules(id: string, pagination: Pagination) {
    await this.get(id);
    const result = await this.provider.getFrameworkRules(id, pagination);
    return {
      data: result.items,
      meta: pageMeta(pagination.page, pagination.pageSize, result.total),
    };
  }
}

export class FrameworksController {
  constructor(private readonly service: FrameworksService) {}
  list = async (req: Request, res: Response) => {
    const result = await this.service.list(req.query as unknown as Pagination);
    return ok(res, result.data, result.meta);
  };
  get = async (req: Request, res: Response) =>
    ok(res, await this.service.get(String(req.params.id)));
  rules = async (req: Request, res: Response) => {
    const result = await this.service.rules(
      String(req.params.id),
      req.query as unknown as Pagination,
    );
    return ok(res, result.data, result.meta);
  };
}

export const frameworksRoutes = (
  provider: SharedMasterProvider,
  repository: FrameworksRepository,
) => {
  const router = Router();
  const controller = new FrameworksController(
    new FrameworksService(provider, repository),
  );
  router.use(authenticate, permit("frameworks:read"));
  router.get(
    "/",
    validate(paginationSchema, "query"),
    asyncHandler(controller.list),
  );
  router.get(
    "/:id",
    validate(paramsSchema, "params"),
    asyncHandler(controller.get),
  );
  router.get(
    "/:id/rules",
    validate(paramsSchema, "params"),
    validate(paginationSchema, "query"),
    asyncHandler(controller.rules),
  );
  return router;
};
