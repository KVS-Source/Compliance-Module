import { randomUUID } from "node:crypto";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USER_IMPORT_HEADERS } from "../src/modules/users/import-template.js";
import { findForbiddenSecretPaths } from "./secret-safe-assertions.js";

if (
  process.env.INTEGRATION_TEST_RUNNER !== "isolated-postgres" ||
  !process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL !== process.env.DATABASE_URL_TEST ||
  process.env.NODE_ENV !== "test"
) {
  throw new Error(
    "Integration tests must run through the isolated test-database runner",
  );
}

const HEADER = USER_IMPORT_HEADERS.join(",");
const INITIAL_PASSWORD = "Onboard001!Secure";

describe("bulk user import API", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let adminUserId: string;
  let company001Id: string;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin001@example.test", password: "Admin001!Secure" })
      .expect(200);
    adminToken = login.body.data.accessToken as string;
    adminUserId = login.body.data.user.id as string;
    company001Id = login.body.data.user.activeCompany.id as string;
  });

  afterAll(async () => prisma.$disconnect());

  /** Unique per run so a repeated suite never collides on the global unique. */
  const identity = (label: string) => {
    const unique = randomUUID().slice(0, 8);
    return {
      code: `IMP-${label}-${unique}`.toUpperCase(),
      email: `imp.${label}.${unique}@example.test`.toLowerCase(),
    };
  };

  const preview = (csv: string, token = adminToken) =>
    request(app)
      .post("/api/v1/users/import/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({ csv });

  it("publishes the approved template as metadata and as a CSV file", async () => {
    const meta = await request(app)
      .get("/api/v1/users/import/template")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(meta.body.data.headers).toEqual([...USER_IMPORT_HEADERS]);
    expect(
      meta.body.data.roles.map((role: { code: string }) => role.code),
    ).toContain("COMPLIANCE_MANAGER");
    // The wildcard is never published as an assignable option.
    expect(
      meta.body.data.roles.map((role: { code: string }) => role.code),
    ).not.toContain("*");
    // Department matches by name against this Company, so the template must
    // report the names that exist rather than leaving the admin to guess.
    expect(Array.isArray(meta.body.data.departments)).toBe(true);
    expect(meta.body.data.departments).toContain("Compliance");
    const foreign = await prisma.orgDepartment.findFirst({
      where: { tenantId: { not: company001Id }, status: "ACTIVE" },
      select: { name: true },
    });
    if (foreign && !["Compliance"].includes(foreign.name)) {
      expect(meta.body.data.departments).not.toContain(foreign.name);
    }

    const file = await request(app)
      .get("/api/v1/users/import/template.csv")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(file.headers["content-type"]).toContain("text/csv");
    expect(file.headers["content-disposition"]).toContain("attachment");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.text.split("\r\n")[0]).toBe(HEADER);
  });

  it("refuses preview and commit without users:write", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "user001@example.test", password: "User001!Secure" })
      .expect(200);
    const token = login.body.data.accessToken as string;

    await preview(`${HEADER}\nU-1,User 1,u1@example.test,,,,\n`, token).expect(
      403,
    );
    await request(app)
      .post("/api/v1/users/import/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        initialPassword: INITIAL_PASSWORD,
        rows: [{ code: "U-1", name: "User 1", email: "u1@example.test" }],
      })
      .expect(403);
  });

  it("refuses a file that is not the approved template", async () => {
    const response = await preview(
      "Code,Name,Email\nU-1,User 1,u1@example.test\n",
    ).expect(400);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: "CSV_INVALID" },
    });
  });

  it("previews against live Company data without creating anything", async () => {
    const good = identity("prev");
    const response = await preview(
      [
        HEADER,
        `${good.code},Preview User,${good.email},,Compliance,Compliance Manager,ACTIVE`,
        // "Research" is Company 003's department; it must not resolve here.
        `IMP-PREV-DEPT,Preview Dept,imp.prev.dept@example.test,,Research,,`,
        // A seeded identity that already exists on the platform.
        `IMP-PREV-DUP,Preview Dup,admin001@example.test,,,,`,
      ].join("\n"),
    ).expect(200);

    expect(response.body.data).toMatchObject({
      totalRows: 3,
      validRows: 1,
      invalidRows: 2,
      canAssignRoles: true,
    });
    expect(response.body.data.rows[0].candidate).toMatchObject({
      code: good.code,
      email: good.email,
      departmentName: "Compliance",
      roleCode: "COMPLIANCE_MANAGER",
      status: "ACTIVE",
    });
    expect(response.body.data.rows[1].errors.join(" ")).toContain("Research");
    expect(response.body.data.rows[2].errors.join(" ")).toContain(
      "Email is already in use",
    );
    expect(findForbiddenSecretPaths(response.body)).toEqual([]);

    // A preview is a dry run: nothing was written.
    expect(
      await prisma.user.findUnique({ where: { email: good.email } }),
    ).toBeNull();
  });

  it("creates each row as its own governed record with its own audit events", async () => {
    const owner = identity("own");
    const viewer = identity("view");
    const department = await prisma.orgDepartment.findFirstOrThrow({
      where: { tenantId: company001Id, code: "DEP-001", status: "ACTIVE" },
    });

    const response = await request(app)
      .post("/api/v1/users/import/commit")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        initialPassword: INITIAL_PASSWORD,
        rows: [
          {
            line: 1,
            code: owner.code,
            name: "Import Owner",
            email: owner.email,
            phone: "00 00000 00101",
            departmentId: department.id,
            roleCode: "DEPARTMENT_OWNER",
            status: "ACTIVE",
          },
          {
            line: 2,
            code: viewer.code,
            name: "Import Viewer",
            email: viewer.email,
            roleCode: "MANAGEMENT_VIEWER",
            status: "ACTIVE",
          },
        ],
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      totalRows: 2,
      created: 2,
      failed: 0,
      rolesAssigned: 2,
    });
    expect(findForbiddenSecretPaths(response.body)).toEqual([]);
    expect(JSON.stringify(response.body)).not.toContain(INITIAL_PASSWORD);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: owner.email },
      include: {
        memberships: true,
        roles: { include: { role: true } },
      },
    });
    expect(stored.passwordHash.startsWith("$argon2")).toBe(true);
    expect(stored.memberships).toHaveLength(1);
    expect(stored.memberships[0]).toMatchObject({
      tenantId: company001Id,
      departmentId: department.id,
      status: "ACTIVE",
    });
    expect(stored.roles).toHaveLength(1);
    expect(stored.roles[0]?.role.code).toBe("DEPARTMENT_OWNER");
    expect(stored.roles[0]?.assignedBy).toBe(adminUserId);

    // Each imported user carries the same per-record trail as a manual create.
    for (const created of [owner, viewer]) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: created.email },
      });
      const events = await prisma.auditEvent.findMany({
        where: { tenantId: company001Id, entityId: user.id },
        orderBy: { createdAt: "asc" },
      });
      expect(events.map((event) => event.action)).toEqual(
        expect.arrayContaining(["USER_CREATE", "USER_ROLE_ASSIGN"]),
      );
      for (const event of events) {
        expect(findForbiddenSecretPaths(event.metadata)).toEqual([]);
      }
    }

    const batch = await prisma.auditEvent.findFirst({
      where: {
        tenantId: company001Id,
        action: "USER_IMPORT",
        userId: adminUserId,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(batch?.metadata).toMatchObject({ created: 2, failed: 0 });
    expect(findForbiddenSecretPaths(batch?.metadata)).toEqual([]);

    // The initial password the administrator supplied is the one that works.
    const signIn = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: owner.email, password: INITIAL_PASSWORD })
      .expect(200);
    expect(signIn.body.data.user.activeCompany.id).toBe(company001Id);
  });

  it("keeps valid rows when a neighbouring row is refused", async () => {
    const good = identity("mix");
    const otherCompanyDepartment = await prisma.orgDepartment.findFirstOrThrow({
      where: { tenant: { code: "COM-003" }, status: "ACTIVE" },
    });

    const response = await request(app)
      .post("/api/v1/users/import/commit")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        initialPassword: INITIAL_PASSWORD,
        rows: [
          {
            line: 1,
            code: "IMP-MIX-TAKEN",
            name: "Already Present",
            email: "admin001@example.test",
          },
          {
            line: 2,
            code: good.code,
            name: "Import Survivor",
            email: good.email,
            status: "INVITED",
          },
          {
            line: 3,
            code: "IMP-MIX-CROSS",
            name: "Cross Company Department",
            email: `imp.mix.cross.${randomUUID().slice(0, 8)}@example.test`,
            departmentId: otherCompanyDepartment.id,
          },
        ],
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      totalRows: 3,
      created: 1,
      failed: 2,
    });
    const byLine = new Map<number, { outcome: string; errors?: string[] }>(
      response.body.data.results.map(
        (result: { line: number; outcome: string; errors?: string[] }) => [
          result.line,
          result,
        ],
      ),
    );
    expect(byLine.get(1)?.outcome).toBe("FAILED");
    expect(byLine.get(2)?.outcome).toBe("CREATED");
    expect(byLine.get(3)?.outcome).toBe("FAILED");
    expect(byLine.get(3)?.errors?.join(" ")).toContain(
      "Department does not belong to this Company",
    );

    const survivor = await prisma.user.findUniqueOrThrow({
      where: { email: good.email },
    });
    expect(survivor.status).toBe("INVITED");
    // A refused row leaves nothing behind.
    expect(
      await prisma.user.findUnique({ where: { code: "IMP-MIX-CROSS" } }),
    ).toBeNull();
  });

  it("refuses an unsanctioned role code at commit", async () => {
    const target = identity("role");
    const response = await request(app)
      .post("/api/v1/users/import/commit")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        initialPassword: INITIAL_PASSWORD,
        rows: [
          {
            line: 1,
            code: target.code,
            name: "Wildcard Seeker",
            email: target.email,
            roleCode: "*",
          },
        ],
      })
      .expect(200);

    expect(response.body.data).toMatchObject({ created: 0, failed: 1 });
    expect(response.body.data.results[0].errors.join(" ")).toContain(
      "not a sanctioned access profile",
    );
    expect(
      await prisma.user.findUnique({ where: { email: target.email } }),
    ).toBeNull();
  });

  it("refuses a batch larger than one governed import", async () => {
    await request(app)
      .post("/api/v1/users/import/commit")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        initialPassword: INITIAL_PASSWORD,
        rows: Array.from({ length: 201 }, (_value, index) => ({
          code: `IMP-BULK-${index}`,
          name: `Bulk ${index}`,
          email: `imp.bulk.${index}@example.test`,
        })),
      })
      .expect(400);
  });

  it("refuses a weak initial password with the shared password rule", async () => {
    const target = identity("weak");
    await request(app)
      .post("/api/v1/users/import/commit")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        initialPassword: "short",
        rows: [
          { code: target.code, name: "Weak Password", email: target.email },
        ],
      })
      .expect(400);
    expect(
      await prisma.user.findUnique({ where: { email: target.email } }),
    ).toBeNull();
  });
});
