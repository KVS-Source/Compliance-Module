import argon2 from "argon2";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  asyncHandler,
  authenticate,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { AppError, notFound } from "../../common/errors/app-error.js";
import { created, ok, pageMeta } from "../../common/responses/envelope.js";
import {
  paginationSchema,
  type Pagination,
} from "../../common/responses/pagination.js";
import type { SharedMasterProvider } from "../../providers/shared-master/provider.js";
import type { UsersRepository } from "./repository.js";

const paramsSchema = z.object({ id: z.string().uuid() });

const statusSchema = z.enum(["ACTIVE", "DISABLED", "INVITED", "LOCKED"]);

const createUserSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Code must be alphanumeric"),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254).toLowerCase(),
  phone: z.string().trim().max(64).nullable().optional(),
  password: z.string().min(8).max(256),
  status: statusSchema.default("ACTIVE"),
  departmentId: z.string().uuid().nullable().optional(),
});

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(254).toLowerCase().optional(),
    phone: z.string().trim().max(64).nullable().optional(),
    password: z.string().min(8).max(256).optional(),
    status: statusSchema.optional(),
    departmentId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

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

const detailDto = (user: {
  id: string;
  code: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  lastLoginAt: Date | null;
  memberships: Array<{ department: { name: string } | null }>;
  roles: Array<{
    status: string;
    role: { id: string; code: string; name: string };
  }>;
}) => ({
  ...dto({
    ...user,
    departmentName: user.memberships[0]?.department?.name ?? null,
    roleNames: user.roles.map((assignment) => assignment.role.name),
  }),
  roles: user.roles.map((assignment) => ({
    id: assignment.role.id,
    code: assignment.role.code,
    name: assignment.role.name,
    status: assignment.status,
  })),
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
    return detailDto(user);
  }

  async create(
    tenantId: string,
    actorUserId: string,
    body: z.infer<typeof createUserSchema>,
    context: { ip?: string; userAgent?: string },
  ) {
    if (body.departmentId) {
      const department = await this.repository.findDepartmentInTenant(
        body.departmentId,
        tenantId,
      );
      if (!department) {
        throw new AppError(
          400,
          "RELATED_RECORD_INVALID",
          "Department does not belong to this Company",
        );
      }
    }

    const passwordHash = await argon2.hash(body.password, {
      type: argon2.argon2id,
    });
    const user = await this.repository.createInTenant(
      tenantId,
      actorUserId,
      {
        code: body.code,
        fullName: body.name,
        email: body.email,
        phone: body.phone ?? null,
        passwordHash,
        status: body.status,
        departmentId: body.departmentId ?? null,
        defaultTenantId: tenantId,
      },
      context,
    );
    return detailDto(user);
  }

  async update(
    id: string,
    tenantId: string,
    actorUserId: string,
    body: z.infer<typeof updateUserSchema>,
    context: { ip?: string; userAgent?: string },
  ) {
    if (body.departmentId) {
      const department = await this.repository.findDepartmentInTenant(
        body.departmentId,
        tenantId,
      );
      if (!department) {
        throw new AppError(
          400,
          "RELATED_RECORD_INVALID",
          "Department does not belong to this Company",
        );
      }
    }

    const passwordHash =
      body.password === undefined
        ? undefined
        : await argon2.hash(body.password, { type: argon2.argon2id });

    const user = await this.repository.updateInTenant(
      id,
      tenantId,
      actorUserId,
      {
        ...(body.name !== undefined ? { fullName: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(passwordHash !== undefined ? { passwordHash } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.departmentId !== undefined
          ? { departmentId: body.departmentId }
          : {}),
      },
      context,
    );
    if (!user) throw notFound("User not found");
    return detailDto(user);
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

  create = async (req: Request, res: Response) => {
    const userAgent = req.get("user-agent");
    const createdUser = await this.service.create(
      req.auth!.tenantId,
      req.auth!.userId,
      req.body,
      {
        ...(req.ip ? { ip: req.ip } : {}),
        ...(userAgent ? { userAgent } : {}),
      },
    );
    return created(res, createdUser);
  };

  update = async (req: Request, res: Response) => {
    const userAgent = req.get("user-agent");
    const updated = await this.service.update(
      String(req.params.id),
      req.auth!.tenantId,
      req.auth!.userId,
      req.body,
      {
        ...(req.ip ? { ip: req.ip } : {}),
        ...(userAgent ? { userAgent } : {}),
      },
    );
    return ok(res, updated);
  };
}

export const usersRoutes = (
  provider: SharedMasterProvider,
  repository: UsersRepository,
) => {
  const router = Router();
  const controller = new UsersController(
    new UsersService(provider, repository),
  );
  router.use(authenticate);
  router.get(
    "/",
    permit("users:read"),
    validate(paginationSchema, "query"),
    asyncHandler(controller.list),
  );
  router.get(
    "/:id",
    permit("users:read"),
    validate(paramsSchema, "params"),
    asyncHandler(controller.get),
  );
  router.post(
    "/",
    permit("users:write"),
    validate(createUserSchema),
    asyncHandler(controller.create),
  );
  router.patch(
    "/:id",
    permit("users:write"),
    validate(paramsSchema, "params"),
    validate(updateUserSchema),
    asyncHandler(controller.update),
  );
  return router;
};
