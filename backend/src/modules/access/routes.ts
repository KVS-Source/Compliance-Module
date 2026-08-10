import { Router, type Request, type Response } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AppError, notFound } from "../../common/errors/app-error.js";
import {
  asyncHandler,
  permit,
  validate,
} from "../../common/middleware/http.js";
import { ok } from "../../common/responses/envelope.js";
import {
  PRODUCTION_ACCESS_PROFILES,
  PRODUCTION_PERMISSIONS,
  isProductionRoleCode,
} from "../../production/access-profile.js";
import {
  bindUserToProductionRole,
  provisionProductionRole,
} from "./role-provisioning.js";

const userParamsSchema = z.object({ userId: z.string().uuid() });
const assignmentSchema = z.object({
  roleCode: z.string().trim().min(1).max(64),
});

/**
 * Production-profile Role & Access.
 *
 * The production access profiles are the authority on what a role may do, so
 * the profile catalogue reports them rather than a mutable copy. Profile and
 * permission mutation remain unavailable; the only write binds a user to one
 * sanctioned profile and synchronises its Company-local Role row.
 *
 * The wildcard `*` permission is never published or assignable here because
 * production readiness rejects active assignments that hold it.
 */
export class AccessProfileService {
  constructor(private readonly db: PrismaClient) {}

  async profiles(tenantId: string) {
    const roles = await this.db.role.findMany({
      where: { tenantId },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        permissions: {
          select: { permission: { select: { code: true } } },
        },
        _count: {
          select: {
            users: { where: { status: "ACTIVE", user: { status: "ACTIVE" } } },
          },
        },
      },
      orderBy: { code: "asc" },
    });

    const descriptions = new Map(
      PRODUCTION_PERMISSIONS.map(([code, description]) => [code, description]),
    );

    /**
     * A role assigned in this Company is reported with its live user count.
     * A profile with no role row yet is still listed, at zero, so the matrix
     * describes the whole access model rather than only what is in use.
     */
    const assigned = new Map(roles.map((role) => [role.code, role]));

    const profiles = Object.entries(PRODUCTION_ACCESS_PROFILES).map(
      ([code, profile]) => {
        const role = assigned.get(code);
        const permissions = (
          role
            ? role.permissions
                .map((entry) => entry.permission.code)
                .filter((permission) => permission !== "*")
            : [...profile.permissions]
        ).sort();
        return {
          code,
          name: profile.name,
          description: profile.description,
          /** True once a Role row exists for this profile in the Company. */
          provisioned: role !== undefined,
          enabled: role ? role.status === "ACTIVE" : false,
          userCount: role?._count.users ?? 0,
          permissions,
          permissionCount: permissions.length,
        };
      },
    );

    /**
     * Roles that exist in the Company but match no production profile, for
     * example the bootstrap `COMPANY_ADMIN`. They are reported truthfully
     * rather than hidden, with any wildcard flagged for the reader.
     */
    const additional = roles
      .filter((role) => !(role.code in PRODUCTION_ACCESS_PROFILES))
      .map((role) => {
        const codes = role.permissions.map((entry) => entry.permission.code);
        return {
          code: role.code,
          name: role.name,
          description: "Company role outside the production access profiles.",
          provisioned: true,
          enabled: role.status === "ACTIVE",
          userCount: role._count.users,
          permissions: codes.filter((code) => code !== "*").sort(),
          permissionCount: codes.filter((code) => code !== "*").length,
          holdsWildcard: codes.includes("*"),
        };
      });

    return {
      profiles,
      additionalRoles: additional,
      permissions: PRODUCTION_PERMISSIONS.map(([code]) => ({
        code,
        description: descriptions.get(code) ?? code,
        module: code.split(":")[0] ?? code,
      })),
      /** Stated in the response so the UI never has to assert it itself. */
      mutable: false,
    };
  }

  async userRoles(userId: string, tenantId: string) {
    const membership = await this.db.userCompany.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { id: true },
    });
    if (!membership) throw notFound("User not found");

    const assignments = await this.db.userRole.findMany({
      where: { userId, tenantId },
      include: {
        role: { select: { id: true, code: true, name: true, status: true } },
      },
      orderBy: { assignedAt: "desc" },
    });
    return assignments.map((assignment) => ({
      id: assignment.id,
      userId: assignment.userId,
      status: assignment.status,
      assignedBy: assignment.assignedBy,
      assignedAt: assignment.assignedAt,
      role: assignment.role,
    }));
  }

  /**
   * Privilege access review: who currently holds sensitive permissions.
   *
   * Built for the auditor question ("who can assign roles / approve?") from
   * live RolePermission rows and ACTIVE user assignments — not from a static
   * profile map alone, so non-profile roles (if any) still surface truthfully.
   */
  async privilegeReview(tenantId: string) {
    const sensitive = [
      "roles:assign",
      "tenants:write",
      "users:write",
      "kpi-target:approve",
      "kpi-actual:approve",
      "policies:approve",
      "evidence:review",
      "gaps:close",
      "capa:close",
      "risk:close",
    ] as const;

    const descriptions = new Map(
      PRODUCTION_PERMISSIONS.map(([code, description]) => [code, description]),
    );

    const assignments = await this.db.userRole.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        role: { status: "ACTIVE" },
      },
      select: {
        user: {
          select: {
            id: true,
            code: true,
            fullName: true,
            email: true,
            status: true,
          },
        },
        role: {
          select: {
            id: true,
            code: true,
            name: true,
            permissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        },
      },
      orderBy: [{ user: { fullName: "asc" } }],
    });

    const holdersByPermission = new Map<
      string,
      Array<{
        id: string;
        code: string;
        name: string;
        email: string;
        roleCode: string;
        roleName: string;
      }>
    >();
    for (const code of sensitive) {
      holdersByPermission.set(code, []);
    }

    for (const assignment of assignments) {
      const permissionCodes = new Set(
        assignment.role.permissions.map((entry) => entry.permission.code),
      );
      // Wildcard (legacy seed debt) grants every published permission.
      const holdsAll = permissionCodes.has("*");
      for (const code of sensitive) {
        if (!holdsAll && !permissionCodes.has(code)) continue;
        const list = holdersByPermission.get(code)!;
        if (list.some((holder) => holder.id === assignment.user.id)) continue;
        list.push({
          id: assignment.user.id,
          code: assignment.user.code,
          name: assignment.user.fullName,
          email: assignment.user.email,
          roleCode: assignment.role.code,
          roleName: assignment.role.name,
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      permissions: sensitive.map((code) => ({
        code,
        description: descriptions.get(code) ?? code,
        holderCount: holdersByPermission.get(code)?.length ?? 0,
        holders: holdersByPermission.get(code) ?? [],
      })),
    };
  }

  async assignUserRole(
    userId: string,
    tenantId: string,
    actorUserId: string,
    roleCode: string,
    context: { ip?: string; userAgent?: string },
  ) {
    if (userId === actorUserId) {
      throw new AppError(
        403,
        "SELF_ROLE_ASSIGNMENT_FORBIDDEN",
        "Users cannot assign their own Company role",
      );
    }
    if (roleCode === "*" || !isProductionRoleCode(roleCode)) {
      throw new AppError(
        400,
        "INVALID_ROLE_CODE",
        "Role code must identify a sanctioned production access profile",
      );
    }

    return this.db.$transaction(async (transaction) => {
      const role = await provisionProductionRole(
        transaction,
        tenantId,
        roleCode,
      );
      const { assignment, disabledAssignmentCount } =
        await bindUserToProductionRole(transaction, {
          userId,
          tenantId,
          roleId: role.id,
          assignedBy: actorUserId,
        });

      await transaction.auditEvent.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: "USER_ROLE_ASSIGN",
          entityType: "USER",
          entityId: userId,
          metadata: {
            assignmentId: assignment.id,
            roleCode,
            roleId: role.id,
            disabledAssignmentCount,
          } as Prisma.InputJsonValue,
          ...(context.ip ? { ipAddress: context.ip } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });

      return {
        id: assignment.id,
        userId: assignment.userId,
        status: assignment.status,
        assignedBy: assignment.assignedBy,
        assignedAt: assignment.assignedAt,
        role: {
          id: role.id,
          code: role.code,
          name: role.name,
          status: role.status,
        },
      };
    });
  }
}

export const accessRoutes = (service: AccessProfileService) => {
  const router = Router();
  router.get(
    "/profiles",
    permit("users:read"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(res, await service.profiles(req.auth!.tenantId)),
    ),
  );
  router.get(
    "/privilege-review",
    permit("users:read"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(res, await service.privilegeReview(req.auth!.tenantId)),
    ),
  );
  router.get(
    "/users/:userId/roles",
    permit("users:read"),
    validate(userParamsSchema, "params"),
    asyncHandler(async (req: Request, res: Response) =>
      ok(
        res,
        await service.userRoles(String(req.params.userId), req.auth!.tenantId),
      ),
    ),
  );
  router.put(
    "/users/:userId/roles",
    permit("roles:assign"),
    validate(userParamsSchema, "params"),
    validate(assignmentSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const userAgent = req.get("user-agent");
      return ok(
        res,
        await service.assignUserRole(
          String(req.params.userId),
          req.auth!.tenantId,
          req.auth!.userId,
          String(req.body.roleCode),
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
