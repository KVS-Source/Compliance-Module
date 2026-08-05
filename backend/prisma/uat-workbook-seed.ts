import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { RoleAssignmentService } from "../src/modules/access/role-assignment-service.js";
import { DEMO_PERMISSIONS } from "./demo-seed-data.js";
import { assertDemoSeedExecutionAllowed } from "./demo-seed-safety.js";

/**
 * Creates the GenBioCa UAT company, its roles and its synthetic login
 * accounts. It deliberately seeds no compliance records: departments,
 * frameworks, KPIs, risks, gaps, CAPAs and registers all arrive from the
 * client workbook through `npm run import:workbook:commit`.
 *
 * Keeping this separate from `prisma/demo-seed.ts` matters because the
 * workbook's own business codes (RSK-001, POL-001, …) collide with the
 * synthetic demo fixtures. Loading the workbook into its own company keeps
 * both data sets intact and truthful.
 *
 *   NODE_ENV=development DEMO_SEED_PASSWORD='<runtime value>' \
 *     npm run seed:uat:genbioca
 *
 * No password is stored in this file. `assertDemoSeedExecutionAllowed` refuses
 * to run in production and requires the password at execution time.
 */

const { password } = assertDemoSeedExecutionAllowed();
const db = new PrismaClient();
const roleAssignments = new RoleAssignmentService(db);

export const GENBIOCA_TENANT = {
  code: "GENBIOCA",
  name: "GenBioCa",
  industry: "Life Sciences and Healthcare",
  country: "India",
} as const;

/**
 * Three roles covering the demo's authorisation story: an administrator with
 * unrestricted access, a permission-limited Compliance Manager, and a
 * read-mostly Department User.
 */
const UAT_USERS = [
  {
    code: "GBC-UAT-001",
    email: "uat-admin@genbioca.test",
    name: "UAT Administrator",
    roleCode: "COMPANY_ADMIN",
    roleName: "Company Administrator",
    permissions: ["*"] as readonly string[],
  },
  {
    code: "GBC-UAT-002",
    email: "uat-compliance@genbioca.test",
    name: "UAT Compliance Manager",
    roleCode: "COMPLIANCE_MANAGER",
    roleName: "Compliance Manager",
    permissions: [
      "tenants:read",
      "users:read",
      "organisation:read",
      "frameworks:read",
      "kpis:read",
      "kpi-config:write",
      "kpi-target:write",
      "kpi-actual:write",
      "risk:read",
      "risk:write",
      "risk:treat",
      "policies:read",
      "policies:write",
      "policies:submit",
      "controls:read",
      "checkpoints:read",
      "checkpoints:review",
      "evidence:read",
      "evidence:write",
      "evidence:review",
      "gaps:read",
      "gaps:write",
      "gaps:close",
      "capa:read",
      "capa:write",
      "capa:close",
      "registers:read",
      "registers:write",
      "imports:read",
      "imports:write",
      "dashboard:read",
      "exports:read",
    ] as readonly string[],
  },
  {
    code: "GBC-UAT-003",
    email: "uat-department@genbioca.test",
    name: "UAT Department User",
    roleCode: "DEPARTMENT_USER",
    roleName: "Department User",
    permissions: [
      "tenants:read",
      "organisation:read",
      "frameworks:read",
      "kpis:read",
      "kpi-actual:write",
      "risk:read",
      "policies:read",
      "controls:read",
      "checkpoints:read",
      "evidence:read",
      "gaps:read",
      "capa:read",
      "registers:read",
      "dashboard:read",
    ] as readonly string[],
  },
] as const;

/** Permissions this milestone adds on top of the existing catalogue. */
const NEW_PERMISSIONS: readonly (readonly [string, string])[] = [
  ["gaps:read", "Read Company Gaps"],
  ["gaps:write", "Create and update Company Gaps"],
  ["gaps:close", "Close and reopen Company Gaps"],
  ["capa:read", "Read Company CAPAs"],
  ["capa:write", "Create and update Company CAPAs"],
  ["capa:close", "Close and reopen Company CAPAs"],
  ["registers:read", "Read Company operational registers"],
  ["registers:write", "Create and update Company operational register records"],
  ["imports:read", "Read Company workbook import batches and row errors"],
  ["imports:write", "Preview and commit Company workbook and CSV imports"],
  ["audit:read", "Read Company audit trail events"],
  ["integrations:read", "Read external integration status and sync history"],
  ["integrations:write", "Test and run configured external integrations"],
  ["dashboard:read", "Read the Company compliance dashboard"],
  ["exports:read", "Export Company records as CSV"],
];

const main = async () => {
  const tenant = await db.tenant.upsert({
    where: { code: GENBIOCA_TENANT.code },
    update: { ...GENBIOCA_TENANT, status: "ACTIVE" },
    create: { ...GENBIOCA_TENANT, status: "ACTIVE" },
  });

  const permissionIds = new Map<string, string>();
  for (const [code, name] of [...DEMO_PERMISSIONS, ...NEW_PERMISSIONS]) {
    const permission = await db.permission.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
    permissionIds.set(code, permission.id);
  }

  const passwordHash = await argon2.hash(password);
  for (const definition of UAT_USERS) {
    const user = await db.user.upsert({
      where: { email: definition.email },
      update: {
        code: definition.code,
        fullName: definition.name,
        passwordHash,
        status: "ACTIVE",
        defaultTenantId: tenant.id,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      create: {
        code: definition.code,
        email: definition.email,
        fullName: definition.name,
        passwordHash,
        status: "ACTIVE",
        defaultTenantId: tenant.id,
      },
    });
    await db.userCompany.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      update: { status: "ACTIVE" },
      create: { userId: user.id, tenantId: tenant.id, status: "ACTIVE" },
    });

    const role = await db.role.upsert({
      where: {
        tenantId_code: { tenantId: tenant.id, code: definition.roleCode },
      },
      update: {
        name: definition.roleName,
        description: "Synthetic UAT role for the GenBioCa workbook demo",
        status: "ACTIVE",
      },
      create: {
        tenantId: tenant.id,
        code: definition.roleCode,
        name: definition.roleName,
        description: "Synthetic UAT role for the GenBioCa workbook demo",
        status: "ACTIVE",
      },
    });
    // Re-running must not leave a permission a role no longer declares.
    await db.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permission: { code: { notIn: [...definition.permissions] } },
      },
    });
    for (const permissionCode of definition.permissions) {
      const permissionId = permissionIds.get(permissionCode);
      if (permissionId === undefined) {
        throw new Error(`UAT seed conflict: missing permission`);
      }
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
    await db.userRole.updateMany({
      where: {
        userId: user.id,
        tenantId: tenant.id,
        roleId: { not: role.id },
        status: "ACTIVE",
      },
      data: { status: "DISABLED" },
    });
    await roleAssignments.upsertActive({
      userId: user.id,
      roleId: role.id,
      tenantId: tenant.id,
      assignedBy: user.id,
    });
  }

  console.log(`Company ready: ${tenant.code} (${tenant.name})`);
  console.log(
    `Login identities: ${UAT_USERS.map((user) => user.email).join(", ")}`,
  );
  console.log(
    "Passwords are not printed; use the runtime DEMO_SEED_PASSWORD value.",
  );
  console.log(
    "Next: npm run import:workbook:commit -- --file <workbook.xlsx> " +
      `--tenant ${tenant.code} --actor ${UAT_USERS[0].email}`,
  );
};

main()
  .catch((error: unknown) => {
    console.error(
      `UAT seed failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
