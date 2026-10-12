import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  asyncHandler,
  authenticate,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { AppError } from "../../common/errors/app-error.js";
import { pageMeta, ok, created } from "../../common/responses/envelope.js";
import {
  PRODUCTION_ACCESS_PROFILES,
  PRODUCTION_PERMISSIONS,
} from "../../production/access-profile.js";
import {
  paginationSchema,
  type Pagination,
} from "../../common/responses/pagination.js";
import type { SharedMasterProvider } from "../../providers/shared-master/provider.js";

/** Mirrors the code shape the production initializer enforces. */
const companyCodePattern = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;

export const createTenantSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(
      companyCodePattern,
      "Company code must use 2-64 uppercase safe characters",
    ),
  name: z.string().trim().min(1).max(200),
  industry: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(120).nullable().optional(),
});

export class TenantsService {
  constructor(
    private readonly provider: SharedMasterProvider,
    private readonly db?: PrismaClient,
  ) {}

  /**
   * Creates a Company and makes the caller its administrator.
   *
   * The caller must end up inside the new Company or they would create
   * something they cannot enter — every other endpoint requires an active
   * membership. This reuses the role and permission seeding the production
   * initializer performs, so a Company created here is indistinguishable from
   * one provisioned by `npm run client:initialize`.
   *
   * A new Company starts empty, so this grants the caller no access to any
   * existing Company's data.
   */
  async create(
    actorUserId: string,
    body: z.infer<typeof createTenantSchema>,
    context: { ip?: string; userAgent?: string },
  ) {
    if (!this.db) {
      throw new AppError(
        500,
        "TENANT_CREATE_UNAVAILABLE",
        "Company creation is not configured",
      );
    }
    const db = this.db;
    const profileCode = "CLIENT_COMPANY_ADMINISTRATOR" as const;
    const profile = PRODUCTION_ACCESS_PROFILES[profileCode];

    return db.$transaction(async (transaction) => {
      const existing = await transaction.tenant.findUnique({
        where: { code: body.code },
        select: { id: true },
      });
      if (existing) {
        throw new AppError(
          409,
          "COMPANY_CODE_TAKEN",
          "A Company already uses this code",
        );
      }

      const tenant = await transaction.tenant.create({
        data: {
          code: body.code,
          name: body.name,
          industry: body.industry ?? null,
          country: body.country ?? null,
          status: "ACTIVE",
        },
      });

      const permissionIds = new Map<string, string>();
      for (const [code, name] of PRODUCTION_PERMISSIONS) {
        const permission = await transaction.permission.upsert({
          where: { code },
          update: { name },
          create: { code, name },
        });
        permissionIds.set(code, permission.id);
      }

      const role = await transaction.role.create({
        data: {
          tenantId: tenant.id,
          code: profileCode,
          name: profile.name,
          description: profile.description,
          status: "ACTIVE",
        },
      });
      for (const code of profile.permissions) {
        const permissionId = permissionIds.get(code);
        if (!permissionId) {
          throw new AppError(
            500,
            "PERMISSION_CATALOGUE_INCOMPLETE",
            "The permission catalogue is incomplete",
          );
        }
        await transaction.rolePermission.create({
          data: { roleId: role.id, permissionId },
        });
      }

      await transaction.userCompany.create({
        data: { userId: actorUserId, tenantId: tenant.id, status: "ACTIVE" },
      });
      await transaction.userRole.create({
        data: {
          userId: actorUserId,
          roleId: role.id,
          tenantId: tenant.id,
          status: "ACTIVE",
        },
      });
      await transaction.auditEvent.create({
        data: {
          tenantId: tenant.id,
          userId: actorUserId,
          action: "COMPANY_CREATED",
          entityType: "TENANT",
          entityId: tenant.id,
          ipAddress: context.ip ?? null,
          userAgent: context.userAgent ?? null,
          metadata: {
            code: tenant.code,
            roleCode: profileCode,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        id: tenant.id,
        code: tenant.code,
        name: tenant.name,
        industry: tenant.industry,
        country: tenant.country,
        status: tenant.status,
        created: tenant.createdAt,
      };
    });
  }
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
  create = async (req: Request, res: Response) => {
    const userAgent = req.get("user-agent");
    const company = await this.service.create(
      req.auth!.userId,
      req.body as z.infer<typeof createTenantSchema>,
      {
        ...(req.ip ? { ip: req.ip } : {}),
        ...(userAgent ? { userAgent } : {}),
      },
    );
    return created(res, company);
  };
}

export const tenantsRoutes = (
  provider: SharedMasterProvider,
  db?: PrismaClient,
) => {
  const router = Router();
  const controller = new TenantsController(new TenantsService(provider, db));
  router.get(
    "/",
    authenticate,
    permit("tenants:read"),
    validate(paginationSchema, "query"),
    asyncHandler(controller.list),
  );
  router.post(
    "/",
    authenticate,
    permit("tenants:write"),
    validate(createTenantSchema),
    asyncHandler(controller.create),
  );
  return router;
};
