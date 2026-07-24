import type { Prisma, PrismaClient } from "@prisma/client";

class RefreshTokenClaimError extends Error {}

interface RefreshTokenInput {
  tokenHash: string;
  userId: string;
  tenantId: string;
  familyId: string;
  expiresAt: Date;
}

export class AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  findUserByEmail(email: string) {
    return this.db.user.findUnique({
      where: { email },
      include: {
        memberships: { include: { tenant: true } },
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
  }

  findUserById(id: string) {
    return this.db.user.findUnique({
      where: { id },
      include: {
        memberships: { include: { tenant: true } },
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
  }

  updateLoginSuccess(id: string) {
    return this.db.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }

  updateLoginFailure(id: string, failedLoginCount: number, lockedUntil?: Date) {
    return this.db.user.update({
      where: { id },
      data: { failedLoginCount, ...(lockedUntil ? { lockedUntil } : {}) },
    });
  }

  createRefresh(input: RefreshTokenInput) {
    return this.db.refreshToken.create({ data: input });
  }

  findRefresh(tokenHash: string) {
    return this.db.refreshToken.findUnique({ where: { tokenHash } });
  }

  async rotateRefresh(id: string, input: RefreshTokenInput) {
    try {
      return await this.db.$transaction(async (transaction) => {
        const replacement = await transaction.refreshToken.create({
          data: input,
        });
        const claimed = await transaction.refreshToken.updateMany({
          where: { id, revokedAt: null },
          data: { revokedAt: new Date(), replacedBy: replacement.id },
        });
        if (claimed.count !== 1) throw new RefreshTokenClaimError();
        return replacement;
      });
    } catch (error) {
      if (error instanceof RefreshTokenClaimError) return null;
      throw error;
    }
  }

  revokeRefresh(tokenHash: string) {
    return this.db.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  revokeFamily(familyId: string) {
    return this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  membership(userId: string, tenantId: string) {
    return this.db.userCompany.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: { tenant: true },
    });
  }

  audit(
    tenantId: string,
    userId: string | null,
    action: string,
    metadata: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.db.auditEvent.create({
      data: {
        tenantId,
        userId,
        action,
        entityType: "AUTH",
        metadata: metadata as Prisma.InputJsonValue,
        ...(ipAddress ? { ipAddress } : {}),
        ...(userAgent ? { userAgent } : {}),
      },
    });
  }
}
