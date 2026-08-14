import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  asyncHandler,
  authenticate,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { AppError, notFound } from "../../common/errors/app-error.js";
import {
  hashPassword,
  passwordSchema,
} from "../../common/security/password.js";
import { created, ok, pageMeta } from "../../common/responses/envelope.js";
import { listOrderFields } from "../../common/list-order.js";
import { paginationSchema } from "../../common/responses/pagination.js";
import { importUploadRateLimiter } from "../../common/middleware/rate-limit.js";
import type { SharedMasterProvider } from "../../providers/shared-master/provider.js";
import { exportFilename } from "../exports/csv.js";
import type { UsersRepository } from "./repository.js";
import type { UserImportService } from "./import-service.js";
import type { UserSessionService } from "./session-service.js";
import {
  MAX_USER_IMPORT_BYTES,
  MAX_USER_IMPORT_ROWS,
  USER_IMPORT_STATUSES,
  userImportTemplate,
  userImportTemplateBody,
} from "./import-template.js";

const paramsSchema = z.object({ id: z.string().uuid() });
const sessionParamsSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
});
const userListSchema = paginationSchema
  .extend({
    ...listOrderFields([
      "code",
      "fullName",
      "email",
      "status",
      "createdAt",
    ] as const).shape,
  })
  .strict();

type UserListQuery = z.infer<typeof userListSchema>;

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
  password: passwordSchema,
  status: statusSchema.default("ACTIVE"),
  departmentId: z.string().uuid().nullable().optional(),
});

const importPreviewSchema = z
  .object({
    csv: z.string().min(1).max(MAX_USER_IMPORT_BYTES),
  })
  .strict();

const importCommitSchema = z
  .object({
    /**
     * Supplied by the administrator with the request, never carried in the
     * uploaded file and never returned. Same strength rule as every other
     * password the platform stores.
     */
    initialPassword: passwordSchema,
    rows: z
      .array(
        z
          .object({
            line: z.number().int().min(1).max(MAX_USER_IMPORT_ROWS).optional(),
            code: z.string().trim().min(1).max(64),
            name: z.string().trim().min(1).max(200),
            email: z.string().trim().min(1).max(254),
            phone: z.string().trim().max(64).nullable().optional(),
            departmentId: z.string().uuid().nullable().optional(),
            roleCode: z.string().trim().max(64).nullable().optional(),
            status: z.enum(USER_IMPORT_STATUSES).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_USER_IMPORT_ROWS),
  })
  .strict();

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(254).toLowerCase().optional(),
    phone: z.string().trim().max(64).nullable().optional(),
    password: passwordSchema.optional(),
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

  async list(tenantId: string, query: UserListQuery) {
    const result = await this.provider.listUsers(tenantId, {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.orderBy ? { orderBy: query.orderBy } : {}),
      ...(query.order ? { order: query.order } : {}),
    });
    return {
      data: result.items.map(dto),
      meta: pageMeta(query.page, query.pageSize, result.total),
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

    const passwordHash = await hashPassword(body.password);
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
        : await hashPassword(body.password);

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
  constructor(
    private readonly service: UsersService,
    private readonly sessions: UserSessionService,
  ) {}

  list = async (req: Request, res: Response) => {
    const result = await this.service.list(
      req.auth!.tenantId,
      req.query as unknown as UserListQuery,
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

  listSessions = async (req: Request, res: Response) => {
    return ok(
      res,
      await this.sessions.listSessions(
        String(req.params.id),
        req.auth!.tenantId,
        req.auth!.sessionFamilyId
          ? { currentSessionFamilyId: req.auth!.sessionFamilyId }
          : {},
      ),
    );
  };

  revokeSession = async (req: Request, res: Response) => {
    const userAgent = req.get("user-agent");
    return ok(
      res,
      await this.sessions.revokeSession(
        String(req.params.id),
        req.auth!.tenantId,
        String(req.params.sessionId),
        req.auth!.userId,
        {
          ...(req.ip ? { ip: req.ip } : {}),
          ...(userAgent ? { userAgent } : {}),
        },
      ),
    );
  };

  revokeAllSessions = async (req: Request, res: Response) => {
    const userAgent = req.get("user-agent");
    return ok(
      res,
      await this.sessions.revokeAllSessions(
        String(req.params.id),
        req.auth!.tenantId,
        req.auth!.userId,
        {
          ...(req.ip ? { ip: req.ip } : {}),
          ...(userAgent ? { userAgent } : {}),
        },
      ),
    );
  };
}

/**
 * Bulk import sits on its own sub-router mounted before `/:id`, so the literal
 * `import` segment is never parsed as a user identifier.
 */
const userImportRoutes = (service: UserImportService) => {
  const router = Router();

  router.get(
    "/template",
    permit("users:read"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(res, {
        ...userImportTemplate(),
        // Company-specific: Department is matched by name against this
        // Company's own departments, so the template has to say which names
        // exist. Without it a row can be refused for a reason the
        // administrator cannot resolve from the screen they are looking at.
        departments: await service.departmentNames(req.auth!.tenantId),
      }),
    ),
  );

  router.get(
    "/template.csv",
    permit("users:read"),
    asyncHandler(async (_req: Request, res: Response) => {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exportFilename("user-import-template")}"`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(userImportTemplateBody());
    }),
  );

  router.post(
    "/preview",
    permit("users:write"),
    importUploadRateLimiter(),
    validate(importPreviewSchema),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.preview(
          req.auth!.tenantId,
          req.auth!.permissions,
          String(req.body.csv),
        ),
      ),
    ),
  );

  router.post(
    "/commit",
    permit("users:write"),
    importUploadRateLimiter(),
    validate(importCommitSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const userAgent = req.get("user-agent");
      return ok(
        res,
        await service.commit(
          req.auth!.tenantId,
          req.auth!.userId,
          req.auth!.permissions,
          req.body as z.infer<typeof importCommitSchema>,
          {
            ...(req.ip ? { ip: req.ip } : {}),
            ...(userAgent ? { userAgent } : {}),
          },
        ),
      );
    }),
  );

  return router;
};

export const usersRoutes = (
  provider: SharedMasterProvider,
  repository: UsersRepository,
  userImports: UserImportService,
  sessions: UserSessionService,
) => {
  const router = Router();
  const controller = new UsersController(
    new UsersService(provider, repository),
    sessions,
  );
  router.use(authenticate);
  router.use("/import", userImportRoutes(userImports));
  router.get(
    "/",
    permit("users:read"),
    validate(userListSchema, "query"),
    asyncHandler(controller.list),
  );
  // Session routes before bare `/:id` is fine — Express matches path length —
  // but keep them explicit so revoke-all is never captured as a user id.
  router.get(
    "/:id/sessions",
    permit("users:read"),
    validate(paramsSchema, "params"),
    asyncHandler(controller.listSessions),
  );
  router.post(
    "/:id/sessions/revoke-all",
    permit("users:write"),
    validate(paramsSchema, "params"),
    asyncHandler(controller.revokeAllSessions),
  );
  router.post(
    "/:id/sessions/:sessionId/revoke",
    permit("users:write"),
    validate(sessionParamsSchema, "params"),
    asyncHandler(controller.revokeSession),
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
