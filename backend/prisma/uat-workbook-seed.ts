import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { RoleAssignmentService } from "../src/modules/access/role-assignment-service.js";
import {
  PRODUCTION_ACCESS_PROFILES,
  PRODUCTION_PERMISSIONS,
} from "../src/production/access-profile.js";
import { SAMPLE_PERMISSIONS } from "./sample-seed-data.js";
import { assertSampleSeedExecutionAllowed } from "./sample-seed-safety.js";

/**
 * Creates the GenBioCa UAT company, its roles and its synthetic login
 * accounts. It deliberately seeds no compliance records: departments,
 * frameworks, KPIs, risks, gaps, CAPAs and registers all arrive from the
 * authorised workbook through `npm run import:workbook:commit`.
 *
 * Keeping this separate from `prisma/sample-seed.ts` matters because the
 * workbook's own business codes (RSK-001, POL-001, …) collide with the
 * synthetic sample fixtures. Loading the workbook into its own company keeps
 * both data sets intact and truthful.
 *
 *   NODE_ENV=development SAMPLE_SEED_PASSWORD='<runtime value>' \
 *     npm run seed:uat:genbioca
 *
 * No password is stored in this file. `assertSampleSeedExecutionAllowed` refuses
 * to run in production and requires the password at execution time.
 */

const { password } = assertSampleSeedExecutionAllowed();
const db = new PrismaClient();
const roleAssignments = new RoleAssignmentService(db);

export const GENBIOCA_TENANT = {
  code: "GENBIOCA",
  name: "GenBioCa",
  industry: "Life Sciences and Healthcare",
  country: "India",
} as const;

/**
 * Three controlled-validation roles: an administrator, a permission-limited
 * Compliance Manager, and a read-mostly KPI Owner.
 *
 * The administrator holds the explicit `CLIENT_COMPANY_ADMINISTRATOR` profile
 * rather than the `*` wildcard. The wildcard is refused by the production
 * readiness probe in `src/routes/index.ts`, so seeding it here would leave the
 * GenBioCa workspace unable to report itself ready.
 *
 * The identities are generic and their addresses stay on the non-routable
 * `.test` domain, so no person or employee identity is embedded in source
 * control. The mailbox names are stable because they are used as the `--actor`
 * value for controlled workbook imports.
 *
 * `lastLoginMinutesAgo` is applied relative to seed time so a freshly seeded
 * workspace reads as one in active use rather than one never signed into.
 */
const UAT_USERS = [
  {
    code: "GBC-UAT-001",
    email: "uat-admin@genbioca.test",
    name: "GenBioCa Administrator",
    phone: null,
    lastLoginMinutesAgo: 40,
    roleCode: "CLIENT_COMPANY_ADMINISTRATOR",
    roleName: PRODUCTION_ACCESS_PROFILES.CLIENT_COMPANY_ADMINISTRATOR.name,
    permissions: [
      ...PRODUCTION_ACCESS_PROFILES.CLIENT_COMPANY_ADMINISTRATOR.permissions,
    ] as readonly string[],
  },
  {
    code: "GBC-UAT-002",
    email: "uat-compliance@genbioca.test",
    name: "GenBioCa Compliance User",
    phone: null,
    lastLoginMinutesAgo: 165,
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
    name: "GenBioCa Department User",
    phone: null,
    lastLoginMinutesAgo: 610,
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
  // PRODUCTION_PERMISSIONS is included so every code the administrator profile
  // declares — `roles:assign` among them — exists before it is granted.
  for (const [code, name] of [
    ...SAMPLE_PERMISSIONS,
    ...NEW_PERMISSIONS,
    ...PRODUCTION_PERMISSIONS,
  ]) {
    const permission = await db.permission.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
    permissionIds.set(code, permission.id);
  }

  const passwordHash = await argon2.hash(password);
  const seededAt = Date.now();
  for (const definition of UAT_USERS) {
    const lastLoginAt = new Date(
      seededAt - definition.lastLoginMinutesAgo * 60_000,
    );
    const user = await db.user.upsert({
      where: { email: definition.email },
      update: {
        code: definition.code,
        fullName: definition.name,
        phone: definition.phone,
        passwordHash,
        status: "ACTIVE",
        defaultTenantId: tenant.id,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt,
      },
      create: {
        code: definition.code,
        email: definition.email,
        fullName: definition.name,
        phone: definition.phone,
        passwordHash,
        status: "ACTIVE",
        defaultTenantId: tenant.id,
        lastLoginAt,
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
        description: "Controlled validation role for the GenBioCa workspace",
        status: "ACTIVE",
      },
      create: {
        tenantId: tenant.id,
        code: definition.roleCode,
        name: definition.roleName,
        description: "Controlled validation role for the GenBioCa workspace",
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
  console.log("Login identities:");
  for (const { name, email, roleName } of UAT_USERS) {
    console.log(`  ${name} <${email}> — ${roleName}`);
  }
  console.log(
    "Passwords are not printed; use the runtime SAMPLE_SEED_PASSWORD value.",
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
