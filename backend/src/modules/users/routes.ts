import { Router, type Request, type Response } from "express";
import { z } from "zod";
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
import type { UsersRepository } from "./repository.js";

const paramsSchema = z.object({ id: z.string().uuid() });
const dto = (user: {
  id: string;
  code: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  lastLoginAt: Date | null;
  departmentName?: string | null;
  roleNames?: string[];
}) => ({
  id: user.id,
  code: user.code,
  name: user.fullName,
  email: user.email,
  phone: user.phone,
  department: user.departmentName ?? null,
  roles: user.roleNames ?? [],
  status: user.status,
  lastLogin: user.lastLoginAt,
});

export class UsersService {
  constructor(
    private readonly provider: SharedMasterProvider,
    private readonly repository: UsersRepository,
  ) {}

  async list(tenantId: string, pagination: Pagination) {
    const result = await this.provider.listUsers(tenantId, pagination);
    return {
      data: result.items.map(dto),
      meta: pageMeta(pagination.page, pagination.pageSize, result.total),
    };
  }

  async get(id: string, tenantId: string) {
    const user = await this.repository.findInCompany(id, tenantId);
    if (!user) throw notFound("User not found");
    const roleNames = user.roles.map((assignment) => assignment.role.name);
    return {
      ...dto({
        ...user,
        departmentName: user.memberships[0]?.department?.name ?? null,
        roleNames,
      }),
      roles: user.roles.map((assignment) => ({
        id: assignment.role.id,
        code: assignment.role.code,
        name: assignment.role.name,
        status: assignment.status,
      })),
    };
  }
}

export class UsersController {
  constructor(private readonly service: UsersService) {}
  list = async (req: Request, res: Response) => {
    const result = await this.service.list(
      req.auth!.tenantId,
      req.query as unknown as Pagination,
    );
    return ok(res, result.data, result.meta);
  };
  get = async (req: Request, res: Response) =>
    ok(res, await this.service.get(String(req.params.id), req.auth!.tenantId));
}

export const usersRoutes = (
  provider: SharedMasterProvider,
  repository: UsersRepository,
) => {
  const router = Router();
  const controller = new UsersController(
    new UsersService(provider, repository),
  );
  router.use(authenticate, permit("users:read"));
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
  return router;
};
