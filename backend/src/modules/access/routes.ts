import { Router, type Request, type Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { asyncHandler, permit } from "../../common/middleware/http.js";
import { ok } from "../../common/responses/envelope.js";
import {
  PRODUCTION_ACCESS_PROFILES,
  PRODUCTION_PERMISSIONS,
} from "../../production/access-profile.js";

/**
 * Read-only Role & Access.
 *
 * The production access profiles are the authority on what a role may do, so
 * this endpoint reports them rather than a mutable copy. There is deliberately
 * no write path: role mutation is not in this release, and an endpoint that
 * only pretended to save would be worse than its absence.
 *
 * The wildcard `*` permission is never published here. It exists for the
 * bootstrap fixture only and production readiness fails when it is assigned,
 * so listing it as an option would advertise a state the platform rejects.
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
  return router;
};
