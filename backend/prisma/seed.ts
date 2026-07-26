import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { RoleAssignmentService } from "../src/modules/access/role-assignment-service.js";
import { assertSeedExecutionAllowed } from "./seed-safety.js";

const seedMode = assertSeedExecutionAllowed(process.argv.slice(2));
const db = new PrismaClient();
const roleAssignments = new RoleAssignmentService(db);

async function main() {
  const companies = await Promise.all(
    [
      { code: "COM-001", name: "Company 001", industry: "Life Sciences" },
      {
        code: "COM-002",
        name: "Company 002",
        industry: "Healthcare Operations",
      },
      {
        code: "COM-003",
        name: "Company 003",
        industry: "Biotechnology Research",
      },
    ].map(({ code, name, industry }) =>
      db.tenant.upsert({
        where: { code },
        update: { name, industry, country: "Country 001", status: "ACTIVE" },
        create: {
          code,
          name,
          industry,
          country: "Country 001",
          status: "ACTIVE",
        },
      }),
    ),
  );
  const [company001, company002, company003] = companies;
  if (!company001 || !company002 || !company003)
    throw new Error("Company seed failed");

  const passwordHash = await argon2.hash("Admin001!Secure");
  const userPasswordHash = await argon2.hash("User001!Secure");
  const admin = await db.user.upsert({
    where: { email: "admin001@example.test" },
    update: {
      fullName: "User 001",
      passwordHash,
      status: "ACTIVE",
      defaultTenantId: company001.id,
    },
    create: {
      code: "USR-001",
      email: "admin001@example.test",
      fullName: "User 001",
      phone: "+00 00000 00001",
      passwordHash,
      status: "ACTIVE",
      defaultTenantId: company001.id,
    },
  });
  const user = await db.user.upsert({
    where: { email: "user001@example.test" },
    update: {
      fullName: "User 002",
      passwordHash: userPasswordHash,
      status: "ACTIVE",
      defaultTenantId: company001.id,
    },
    create: {
      code: "USR-002",
      email: "user001@example.test",
      fullName: "User 002",
      phone: "+00 00000 00002",
      passwordHash: userPasswordHash,
      status: "ACTIVE",
      defaultTenantId: company001.id,
    },
  });

  for (const tenant of companies) {
    await db.userCompany.upsert({
      where: { userId_tenantId: { userId: admin.id, tenantId: tenant.id } },
      update: { status: "ACTIVE" },
      create: { userId: admin.id, tenantId: tenant.id, status: "ACTIVE" },
    });
  }
  await db.userCompany.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: company001.id } },
    update: { status: "ACTIVE" },
    create: { userId: user.id, tenantId: company001.id, status: "ACTIVE" },
  });

  const permissions = await Promise.all(
    (
      [
        ["*", "All permissions"],
        ["tenants:read", "Read Companies"],
        ["users:read", "Read Company users"],
        ["users:write", "Create and update Company users"],
        ["organisation:read", "Read organisation master data"],
        ["departments:write", "Create and update Company departments"],
        ["locations:write", "Create and update Company locations"],
        ["units:write", "Create and update Company organisation units"],
        ["frameworks:read", "Read frameworks and rules"],
        ["kpis:read", "Read KPI definitions and goals"],
      ] as const
    ).map(([code, name]) =>
      db.permission.upsert({
        where: { code },
        update: { name },
        create: { code, name },
      }),
    ),
  );
  const allPermission = permissions.find(({ code }) => code === "*");
  if (!allPermission) throw new Error("Wildcard permission seed failed");
  for (const tenant of companies) {
    const role = await db.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: "COMPANY_ADMIN" } },
      update: { name: "Company Admin", status: "ACTIVE" },
      create: {
        tenantId: tenant.id,
        code: "COMPANY_ADMIN",
        name: "Company Admin",
        status: "ACTIVE",
      },
    });
    await db.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: allPermission.id,
        },
      },
      update: {},
      create: { roleId: role.id, permissionId: allPermission.id },
    });
    await roleAssignments.upsertActive({
      userId: admin.id,
      roleId: role.id,
      tenantId: tenant.id,
      assignedBy: admin.id,
    });
    if (tenant.id === company001.id) {
      await db.userRole.updateMany({
        where: {
          userId: user.id,
          tenantId: tenant.id,
          role: { code: "COMPANY_ADMIN" },
        },
        data: { status: "DISABLED" },
      });
      const companyUserRole = await db.role.upsert({
        where: {
          tenantId_code: { tenantId: tenant.id, code: "COMPANY_USER" },
        },
        update: { name: "Company User", status: "ACTIVE" },
        create: {
          tenantId: tenant.id,
          code: "COMPANY_USER",
          name: "Company User",
          status: "ACTIVE",
        },
      });
      for (const readerPermission of permissions.filter(
        ({ code }) =>
          code !== "*" &&
          code !== "users:read" &&
          code !== "users:write" &&
          code !== "departments:write" &&
          code !== "locations:write" &&
          code !== "units:write",
      )) {
        await db.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: companyUserRole.id,
              permissionId: readerPermission.id,
            },
          },
          update: {},
          create: {
            roleId: companyUserRole.id,
            permissionId: readerPermission.id,
          },
        });
      }
      await roleAssignments.upsertActive({
        userId: user.id,
        roleId: companyUserRole.id,
        tenantId: tenant.id,
        assignedBy: admin.id,
      });
    }

    const department = await db.orgDepartment.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: "DEP-001" } },
      update: {
        name: tenant.code === "COM-003" ? "Research" : "Compliance",
        status: "ACTIVE",
      },
      create: {
        tenantId: tenant.id,
        code: "DEP-001",
        name: tenant.code === "COM-003" ? "Research" : "Compliance",
        headName: tenant.code === "COM-001" ? "User 002" : "User 001",
      },
    });
    await db.userCompany.update({
      where: {
        userId_tenantId: { userId: admin.id, tenantId: tenant.id },
      },
      data: { departmentId: department.id },
    });
    if (tenant.id === company001.id) {
      await db.userCompany.update({
        where: {
          userId_tenantId: { userId: user.id, tenantId: tenant.id },
        },
        data: { departmentId: department.id },
      });
    }
    await db.orgLocation.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: "LOC-001" } },
      update: { name: "Location 001", status: "ACTIVE" },
      create: {
        tenantId: tenant.id,
        code: "LOC-001",
        name: "Location 001",
        city: "City 001",
        state: "State 001",
        country: "Country 001",
        type: "Office",
      },
    });
    await db.orgUnit.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: "UNIT-001" } },
      update: { name: "Organisation Unit 001", status: "ACTIVE" },
      create: {
        tenantId: tenant.id,
        code: "UNIT-001",
        name: "Organisation Unit 001",
      },
    });
  }

  const framework = await db.framework.upsert({
    where: { code_version: { code: "FRM-001", version: "2025" } },
    update: { name: "ISO 9001", status: "ACTIVE" },
    create: {
      code: "FRM-001",
      name: "ISO 9001",
      version: "2025",
      description: "Quality management system",
    },
  });
  await db.frameworkRule.upsert({
    where: { frameworkId_code: { frameworkId: framework.id, code: "RUL-001" } },
    update: { title: "Documented information control", status: "ACTIVE" },
    create: {
      frameworkId: framework.id,
      code: "RUL-001",
      title: "Documented information control",
      description: "Control documented information and retained evidence.",
    },
  });

  const kpi = await db.kpiDefinition.upsert({
    where: { code: "KPI-001" },
    update: { name: "Customer Satisfaction Score", status: "ACTIVE" },
    create: {
      code: "KPI-001",
      name: "Customer Satisfaction Score",
      description: "Quarterly verified customer satisfaction.",
      unit: "%",
      direction: "HIGHER_IS_BETTER",
      frequency: "QUARTERLY",
    },
  });
  for (const tenant of companies) {
    await db.kpiGoal.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: "TGT-001" } },
      update: {
        kpiDefinitionId: kpi.id,
        targetValue: "90",
        warningValue: "85",
        criticalValue: "75",
        period: "Q3 2026",
      },
      create: {
        tenantId: tenant.id,
        kpiDefinitionId: kpi.id,
        code: "TGT-001",
        targetValue: "90",
        warningValue: "85",
        criticalValue: "75",
        period: "Q3 2026",
        effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
      },
    });
  }
}

main()
  .then(() =>
    console.log(
      `${seedMode === "test" ? "Test fixture" : "Development seed"} complete`,
    ),
  )
  .catch(() => {
    console.error(
      `${seedMode === "test" ? "Test fixture" : "Development seed"} failed`,
    );
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
