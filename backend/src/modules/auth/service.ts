import argon2 from "argon2";
import {
  AppError,
  forbidden,
  unauthorized,
} from "../../common/errors/app-error.js";
import {
  hashToken,
  newRefreshToken,
  signAccessToken,
} from "../../common/security/tokens.js";
import { env } from "../../config/env.js";
import type { AuthRepository } from "./repository.js";

type AuthUser = NonNullable<
  Awaited<ReturnType<AuthRepository["findUserById"]>>
>;

const activeMembership = (user: AuthUser, tenantId: string) =>
  user.memberships.find(
    (membership) =>
      membership.tenantId === tenantId &&
      membership.status === "ACTIVE" &&
      membership.tenant.status === "ACTIVE",
  );

const permissionsFor = (user: AuthUser, tenantId: string) => [
  ...new Set(
    user.roles
      .filter(
        (assignment) =>
          assignment.tenantId === tenantId &&
          assignment.status === "ACTIVE" &&
          assignment.role.tenantId === tenantId &&
          assignment.role.status === "ACTIVE",
      )
      .flatMap((assignment) =>
        assignment.role.permissions.map((entry) => entry.permission.code),
      ),
  ),
];

const userDto = (user: AuthUser, tenantId: string) => ({
  id: user.id,
  code: user.code,
  name: user.fullName,
  email: user.email,
  phone: user.phone,
  status: user.status,
  lastLogin: user.lastLoginAt,
  permissions: permissionsFor(user, tenantId),
  activeCompany: user.memberships
    .filter((membership) => membership.tenantId === tenantId)
    .map((membership) => ({
      id: membership.tenant.id,
      code: membership.tenant.code,
      name: membership.tenant.name,
    }))[0],
  companies: user.memberships
    .filter(
      (membership) =>
        membership.status === "ACTIVE" && membership.tenant.status === "ACTIVE",
    )
    .map((membership) => ({
      id: membership.tenant.id,
      code: membership.tenant.code,
      name: membership.tenant.name,
    })),
});

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async login(
    email: string,
    password: string,
    context: { ip?: string; userAgent?: string },
  ) {
    const user = await this.repository.findUserByEmail(email.toLowerCase());
    if (!user) throw unauthorized("Incorrect email or password");
    if (user.status !== "ACTIVE") throw forbidden("Account is not active");
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(429, "ACCOUNT_LOCKED", "Account temporarily locked");
    }
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      const failures = user.failedLoginCount + 1;
      await this.repository.updateLoginFailure(
        user.id,
        failures,
        failures >= 5 ? new Date(Date.now() + 15 * 60_000) : undefined,
      );
      throw unauthorized("Incorrect email or password");
    }
    const membership =
      user.memberships.find(
        (entry) =>
          entry.tenantId === user.defaultTenantId &&
          entry.status === "ACTIVE" &&
          entry.tenant.status === "ACTIVE",
      ) ??
      user.memberships.find(
        (entry) =>
          entry.status === "ACTIVE" && entry.tenant.status === "ACTIVE",
      );
    if (!membership) throw forbidden("No active Company membership");
    await this.repository.updateLoginSuccess(user.id);
    const tokens = await this.issue(user, membership.tenantId);
    await this.repository.audit(
      membership.tenantId,
      user.id,
      "AUTH_LOGIN",
      {},
      context.ip,
      context.userAgent,
    );
    return { ...tokens, user: userDto(user, membership.tenantId) };
  }

  async refresh(raw: string) {
    const stored = await this.repository.findRefresh(hashToken(raw));
    if (!stored) throw unauthorized("Invalid refresh token");
    if (stored.revokedAt) {
      await this.repository.revokeFamily(stored.familyId);
      throw unauthorized("Refresh token reuse detected");
    }
    if (stored.expiresAt <= new Date())
      throw unauthorized("Refresh token expired");
    const user = await this.repository.findUserById(stored.userId);
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !activeMembership(user, stored.tenantId)
    ) {
      throw unauthorized("Account or Company membership is inactive");
    }
    const next = await this.issue(
      user,
      stored.tenantId,
      stored.familyId,
      stored.id,
    );
    return { ...next, user: userDto(user, stored.tenantId) };
  }

  async logout(raw: string | undefined, userId?: string, tenantId?: string) {
    if (raw) await this.repository.revokeRefresh(hashToken(raw));
    if (userId && tenantId) {
      await this.repository.audit(tenantId, userId, "AUTH_LOGOUT", {});
    }
  }

  async me(userId: string, tenantId: string) {
    const user = await this.repository.findUserById(userId);
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !activeMembership(user, tenantId)
    ) {
      throw unauthorized();
    }
    return userDto(user, tenantId);
  }

  async switchCompany(
    userId: string,
    tenantId: string,
    currentRefresh?: string,
  ) {
    const membership = await this.repository.membership(userId, tenantId);
    if (
      !membership ||
      membership.status !== "ACTIVE" ||
      membership.tenant.status !== "ACTIVE"
    ) {
      throw forbidden("User is not an active member of this Company");
    }
    const user = await this.repository.findUserById(userId);
    if (!user || user.status !== "ACTIVE") throw unauthorized();
    if (currentRefresh) {
      await this.repository.revokeRefresh(hashToken(currentRefresh));
    }
    const tokens = await this.issue(user, tenantId);
    await this.repository.audit(tenantId, userId, "AUTH_COMPANY_SWITCH", {
      companyCode: membership.tenant.code,
    });
    return { ...tokens, user: userDto(user, tenantId) };
  }

  private async issue(
    user: AuthUser,
    tenantId: string,
    familyId?: string,
    previousRefreshId?: string,
  ) {
    const refresh = newRefreshToken();
    const actualFamily = familyId ?? refresh.familyId;
    const input = {
      tokenHash: hashToken(refresh.raw),
      userId: user.id,
      tenantId,
      familyId: actualFamily,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000),
    };
    const stored = previousRefreshId
      ? await this.repository.rotateRefresh(previousRefreshId, input)
      : await this.repository.createRefresh(input);
    if (!stored) {
      await this.repository.revokeFamily(actualFamily);
      throw unauthorized("Refresh token reuse detected");
    }
    return {
      accessToken: signAccessToken({
        sub: user.id,
        tenantId,
        permissions: permissionsFor(user, tenantId),
      }),
      refreshToken: refresh.raw,
      refreshId: stored.id,
    };
  }
}
