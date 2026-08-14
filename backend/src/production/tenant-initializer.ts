import argon2 from "argon2";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  PRODUCTION_ACCESS_PROFILES,
  PRODUCTION_PERMISSIONS,
  type ProductionRoleCode,
} from "./access-profile.js";

export type TenantInitializationInput = {
  companyCode: string;
  companyName: string;
  userCode: string;
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  roleCode: ProductionRoleCode;
};

const codePattern = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;

const validateInput = (input: TenantInitializationInput) => {
  if (
    !codePattern.test(input.companyCode) ||
    !codePattern.test(input.userCode)
  ) {
    throw new Error(
      "Company and user codes must use 2-64 uppercase safe characters",
    );
  }
  if (!input.companyName.trim() || !input.fullName.trim()) {
    throw new Error("Company and user names are required");
  }
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid operator email address is required");
  }
  if (email.endsWith(".test")) {
    throw new Error(
      "Synthetic .test identities are forbidden in production initialization",
    );
  }
  if (
    input.password.length < 14 ||
    !/[a-z]/.test(input.password) ||
    !/[A-Z]/.test(input.password) ||
    !/[0-9]/.test(input.password) ||
    !/[^A-Za-z0-9]/.test(input.password)
  ) {
    throw new Error(
      "The one-time password does not meet production complexity requirements",
    );
  }
  return { ...input, email };
};

export const initializeTenantUser = async (
  db: PrismaClient,
  rawInput: TenantInitializationInput,
) => {
  const input = validateInput(rawInput);
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
  });
  const profile = PRODUCTION_ACCESS_PROFILES[input.roleCode];

  return db.$transaction(async (transaction) => {
    const duplicate = await transaction.user.findFirst({
      where: { OR: [{ code: input.userCode }, { email: input.email }] },
      select: { id: true },
    });
    if (duplicate) throw new Error("User code or email already exists");

    const tenant = await transaction.tenant.upsert({
      where: { code: input.companyCode },
      update: {},
      create: {
        code: input.companyCode,
        name: input.companyName.trim(),
        status: "ACTIVE",
      },
    });

    const permissions = new Map<string, string>();
    for (const [code, name] of PRODUCTION_PERMISSIONS) {
      const permission = await transaction.permission.upsert({
        where: { code },
        update: { name },
        create: { code, name },
      });
      permissions.set(code, permission.id);
    }

    const role = await transaction.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: input.roleCode } },
      update: {
        name: profile.name,
        description: profile.description,
        status: "ACTIVE",
      },
      create: {
        tenantId: tenant.id,
        code: input.roleCode,
        name: profile.name,
        description: profile.description,
        status: "ACTIVE",
      },
    });

    await transaction.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permission: { code: { notIn: [...profile.permissions] } },
      },
    });
    for (const code of profile.permissions) {
      const permissionId = permissions.get(code);
      if (!permissionId)
        throw new Error(`Permission catalogue is incomplete: ${code}`);
      await transaction.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }

    const user = await transaction.user.create({
      data: {
        code: input.userCode,
        email: input.email,
        fullName: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        passwordHash,
        status: "ACTIVE",
        defaultTenantId: tenant.id,
        memberships: { create: { tenantId: tenant.id, status: "ACTIVE" } },
      },
    });
    await transaction.userRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        tenantId: tenant.id,
        status: "ACTIVE",
      },
    });
    await transaction.auditEvent.create({
      data: {
        tenantId: tenant.id,
        action: "INITIAL_USER_PROVISIONED",
        entityType: "USER",
        entityId: user.id,
        metadata: {
          userCode: user.code,
          roleCode: role.code,
          operatorProcess: true,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      tenant: { id: tenant.id, code: tenant.code, name: tenant.name },
      user: { id: user.id, code: user.code },
      role: {
        code: role.code,
        name: role.name,
        permissionCount: profile.permissions.length,
      },
    };
  });
};
