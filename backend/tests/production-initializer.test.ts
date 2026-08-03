import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/config/prisma.js";
import { initializeClientUser } from "../src/production/client-initializer.js";
import { PRODUCTION_ACCESS_PROFILES } from "../src/production/access-profile.js";

const runSuffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
const tenantCode = `PI${runSuffix}`;
const userCode = `PIU${runSuffix}`;
const email = `production.initializer.${runSuffix.toLowerCase()}@example.invalid`;
const input = {
  companyCode: tenantCode,
  companyName: "Company Production Initialization 001",
  userCode,
  fullName: "Production Operator 001",
  email,
  password: "Synthetic-Prod-Init-001!",
  roleCode: "CLIENT_COMPANY_ADMINISTRATOR" as const,
};
let initializedTenantId = "";

describe("production client initializer", () => {
  afterAll(() => prisma.$disconnect());

  it("creates one tenant-scoped user with an explicit production role and audit", async () => {
    const result = await initializeClientUser(prisma, input);
    initializedTenantId = result.tenant.id;
    expect(result).toMatchObject({
      tenant: { code: tenantCode },
      user: { code: userCode },
      role: { code: "CLIENT_COMPANY_ADMINISTRATOR" },
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { code: userCode },
      include: {
        memberships: true,
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    expect(await argon2.verify(user.passwordHash, input.password)).toBe(true);
    expect(user.memberships).toHaveLength(1);
    const codes = user.roles[0]!.role.permissions.map(
      ({ permission }) => permission.code,
    );
    expect(codes).not.toContain("*");
    expect(new Set(codes)).toEqual(
      new Set(
        PRODUCTION_ACCESS_PROFILES.CLIENT_COMPANY_ADMINISTRATOR.permissions,
      ),
    );
    await expect(
      prisma.auditEvent.count({
        where: {
          tenantId: user.memberships[0]!.tenantId,
          action: "CLIENT_USER_INITIALIZED",
          entityId: user.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it("refuses duplicate creation without creating a second user or audit event", async () => {
    await expect(initializeClientUser(prisma, input)).rejects.toThrow(
      /already exists/,
    );
    await expect(
      prisma.user.count({ where: { code: userCode } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({
        where: {
          tenantId: initializedTenantId,
          action: "CLIENT_USER_INITIALIZED",
        },
      }),
    ).resolves.toBe(1);
  });

  it("rejects synthetic .test identities before database initialization", async () => {
    await expect(
      initializeClientUser(prisma, { ...input, email: "blocked@example.test" }),
    ).rejects.toThrow(/\.test identities/);
  });
});
