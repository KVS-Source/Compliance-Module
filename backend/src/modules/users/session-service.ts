import type { Prisma, PrismaClient } from "@prisma/client";
import { notFound } from "../../common/errors/app-error.js";

export type UserSessionDto = {
  /** Session identity is the refresh-token family, not a single tip row. */
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** True when this family matches the caller's current refresh cookie. */
  current: boolean;
};

/**
 * Administrator session management over existing refresh-token families.
 *
 * Sessions are not a second store: each live, non-expired refresh tip is one
 * session, identified by `familyId` so revoke matches logout (whole family).
 * Token hashes are never returned.
 */
export class UserSessionService {
  constructor(private readonly db: PrismaClient) {}

  async listSessions(
    userId: string,
    tenantId: string,
    options: { currentSessionFamilyId?: string } = {},
  ): Promise<UserSessionDto[]> {
    await this.requireMembership(userId, tenantId);

    const now = new Date();
    const tips = await this.db.refreshToken.findMany({
      where: {
        userId,
        tenantId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
    });

    const currentFamilyId = options.currentSessionFamilyId ?? null;

    // One tip per family is the normal shape after rotation; if legacy data
    // ever held two live tips, prefer the most recently used.
    const byFamily = new Map<string, (typeof tips)[number]>();
    for (const tip of tips) {
      const existing = byFamily.get(tip.familyId);
      if (!existing || tip.lastUsedAt > existing.lastUsedAt) {
        byFamily.set(tip.familyId, tip);
      }
    }

    const familyIds = [...byFamily.keys()];
    const createdByFamily = new Map<string, Date>();
    if (familyIds.length > 0) {
      const origins = await this.db.refreshToken.groupBy({
        by: ["familyId"],
        where: { userId, tenantId, familyId: { in: familyIds } },
        _min: { createdAt: true },
      });
      for (const origin of origins) {
        if (origin._min.createdAt) {
          createdByFamily.set(origin.familyId, origin._min.createdAt);
        }
      }
    }

    return [...byFamily.values()]
      .sort((a, b) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
      .map((tip) => ({
        id: tip.familyId,
        createdAt: (
          createdByFamily.get(tip.familyId) ?? tip.createdAt
        ).toISOString(),
        lastUsedAt: tip.lastUsedAt.toISOString(),
        expiresAt: tip.expiresAt.toISOString(),
        ipAddress: tip.ipAddress,
        userAgent: tip.userAgent,
        current: currentFamilyId !== null && tip.familyId === currentFamilyId,
      }));
  }

  async revokeSession(
    userId: string,
    tenantId: string,
    familyId: string,
    actorUserId: string,
    context: { ip?: string; userAgent?: string },
  ) {
    await this.requireMembership(userId, tenantId);

    const live = await this.db.refreshToken.count({
      where: {
        userId,
        tenantId,
        familyId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (live === 0) {
      throw notFound("Session not found");
    }

    const revoked = await this.db.refreshToken.updateMany({
      where: { userId, tenantId, familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit(
      tenantId,
      actorUserId,
      "USER_SESSION_REVOKE",
      userId,
      {
        familyId,
        tokensRevoked: revoked.count,
        scope: "single",
      },
      context,
    );

    return { revoked: true as const, familyId, tokensRevoked: revoked.count };
  }

  async revokeAllSessions(
    userId: string,
    tenantId: string,
    actorUserId: string,
    context: { ip?: string; userAgent?: string },
  ) {
    await this.requireMembership(userId, tenantId);

    const now = new Date();
    const live = await this.db.refreshToken.findMany({
      where: {
        userId,
        tenantId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { familyId: true },
    });
    const familyIds = [...new Set(live.map((row) => row.familyId))];

    const revoked = await this.db.refreshToken.updateMany({
      where: { userId, tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit(
      tenantId,
      actorUserId,
      "USER_SESSION_REVOKE_ALL",
      userId,
      {
        sessionCount: familyIds.length,
        tokensRevoked: revoked.count,
        scope: "all",
      },
      context,
    );

    return {
      revoked: true as const,
      sessionCount: familyIds.length,
      tokensRevoked: revoked.count,
    };
  }

  private async requireMembership(userId: string, tenantId: string) {
    const membership = await this.db.userCompany.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { id: true },
    });
    if (!membership) throw notFound("User not found");
  }

  private audit(
    tenantId: string,
    actorUserId: string,
    action: string,
    targetUserId: string,
    metadata: Record<string, unknown>,
    context: { ip?: string; userAgent?: string },
  ) {
    return this.db.auditEvent.create({
      data: {
        tenantId,
        userId: actorUserId,
        action,
        entityType: "USER",
        entityId: targetUserId,
        metadata: metadata as Prisma.InputJsonValue,
        ...(context.ip ? { ipAddress: context.ip } : {}),
        ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      },
    });
  }
}
