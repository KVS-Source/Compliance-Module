import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

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

describe("Operational registers, dashboard and CSV export", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let adminUserId: string;
  let readerToken: string;
  let companyOne: string;
  let companyTwoToken: string;
  let registerCode: string;

  const loginAs = async (email: string, password: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return response.body.data as {
      accessToken: string;
      user: { id: string; companies: Array<{ id: string; code: string }> };
    };
  };

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    adminToken = admin.accessToken;
    adminUserId = admin.user.id;
    readerToken = (await loginAs("user001@example.test", "User001!Secure"))
      .accessToken;
    const one = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    companyOne = one.id;
    const company2 = admin.user.companies.find(
      ({ code }) => code === "COM-002",
    );
    if (!company2) throw new Error("COM-002 fixture is unavailable");
    companyTwoToken = (
      await request(app)
        .post("/api/v1/auth/tenant-context")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ companyId: company2.id })
        .expect(200)
    ).body.data.accessToken as string;

    registerCode = `TEST_REGISTER_${Date.now()}`;
    await prisma.operationalRegisterType.create({
      data: {
        tenantId: companyOne,
        code: registerCode,
        name: "Test Audit Schedule",
        sourceSheet: "12_Audit_Schedule",
        fieldConfiguration: [
          { key: "Audit Type", label: "Audit Type", type: "string" },
          { key: "Lead Auditor", label: "Lead Auditor", type: "string" },
        ],
      },
    });
  });

  afterAll(async () => prisma.$disconnect());

  it("lists register types with their record counts and field layout", async () => {
    const response = await request(app)
      .get("/api/v1/operational-registers?pageSize=100")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const register = (
      response.body.data as {
        code: string;
        recordCount: number;
        fields: unknown;
      }[]
    ).find((item) => item.code === registerCode);
    expect(register).toBeDefined();
    expect(register!.recordCount).toBe(0);
    expect(register!.fields).toEqual([
      { key: "Audit Type", label: "Audit Type", type: "string" },
      { key: "Lead Auditor", label: "Lead Auditor", type: "string" },
    ]);
  });

  it("creates, reads and updates a register record through one generic path", async () => {
    const created = await request(app)
      .post(`/api/v1/operational-registers/${registerCode}/records`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        businessRecordCode: "AUD-TEST-001",
        title: "Annex A surveillance audit",
        status: "Planned",
        dueDate: "2026-11-30",
        payload: {
          "Audit Type": "Internal Audit",
          "Lead Auditor": "Auditor 001",
        },
      })
      .expect(201);
    expect(created.body.data.businessRecordCode).toBe("AUD-TEST-001");
    expect(created.body.data.fields["Audit Type"]).toBe("Internal Audit");

    const recordId = created.body.data.id as string;
    const fetched = await request(app)
      .get(`/api/v1/operational-registers/${registerCode}/records/${recordId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(fetched.body.data.title).toBe("Annex A surveillance audit");

    const updated = await request(app)
      .patch(
        `/api/v1/operational-registers/${registerCode}/records/${recordId}`,
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Closed" })
      .expect(200);
    expect(updated.body.data.status).toBe("Closed");

    await request(app)
      .patch(
        `/api/v1/operational-registers/${registerCode}/records/${recordId}`,
      )
      .set("Authorization", `Bearer ${readerToken}`)
      .send({ status: "Reopened" })
      .expect(403);
  });

  it("rejects a duplicate business code within one register", async () => {
    await request(app)
      .post(`/api/v1/operational-registers/${registerCode}/records`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ businessRecordCode: "AUD-TEST-DUP", title: "First" })
      .expect(201);
    const conflict = await request(app)
      .post(`/api/v1/operational-registers/${registerCode}/records`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ businessRecordCode: "AUD-TEST-DUP", title: "Second" })
      .expect(409);
    expect(conflict.body.error.code).toBe("CONFLICT");
  });

  it("hides a register belonging to another company", async () => {
    await request(app)
      .get(`/api/v1/operational-registers/${registerCode}/records`)
      .set("Authorization", `Bearer ${companyTwoToken}`)
      .expect(404);
  });

  it("requires registers:write to create a record", async () => {
    await request(app)
      .post(`/api/v1/operational-registers/${registerCode}/records`)
      .set("Authorization", `Bearer ${readerToken}`)
      .send({ businessRecordCode: "AUD-TEST-DENIED", title: "Denied" })
      .expect(403);
  });

  it("computes overdue from the due date rather than a stored flag", async () => {
    const overdue = await request(app)
      .post(`/api/v1/operational-registers/${registerCode}/records`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        businessRecordCode: "AUD-TEST-OVERDUE",
        title: "Audit that slipped",
        status: "Planned",
        dueDate: "2020-01-01",
      })
      .expect(201);
    expect(overdue.body.data.overdue).toBe(true);

    const closed = await request(app)
      .patch(
        `/api/v1/operational-registers/${registerCode}/records/${overdue.body.data.id}`,
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "Closed" })
      .expect(200);
    // A past due date on a closed record is not overdue.
    expect(closed.body.data.overdue).toBe(false);
  });

  it("returns a dashboard summary backed by real counts", async () => {
    const before = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const openGapsBefore = before.body.data.gaps.open as number;

    const gap = await request(app)
      .post("/api/v1/gaps")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "Dashboard counting gap", severity: "MAJOR" })
      .expect(201);

    const after = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.data.gaps.open).toBe(openGapsBefore + 1);

    // The dashboard must agree with a direct database query.
    const direct = await prisma.gap.count({
      where: {
        tenantId: companyOne,
        deletedAt: null,
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
    });
    expect(after.body.data.gaps.open).toBe(direct);

    await prisma.gap.delete({ where: { id: gap.body.data.id as string } });
  });

  it("preserves the Milestone 1 summary keys the frontend already consumes", async () => {
    const response = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const data = response.body.data;
    expect(data.kpis).toHaveProperty("activeConfigurations");
    expect(data.kpis).toHaveProperty("meetingTarget");
    expect(data.risks).toHaveProperty("openRisks");
    expect(data.organisation).toHaveProperty("departments");
    expect(data.frameworks).toHaveProperty("activeFrameworks");
  });

  it("excludes actuals for disabled KPI configurations from compliance", async () => {
    const candidate = await prisma.kpiActual.findFirstOrThrow({
      where: {
        tenantId: companyOne,
        deletedAt: null,
        configuration: {
          enabled: true,
          status: "ACTIVE",
          deletedAt: null,
          definition: { direction: { not: "INFORMATIONAL" } },
        },
      },
      select: { kpiConfigurationId: true },
    });
    const configurationActuals = await prisma.kpiActual.count({
      where: {
        tenantId: companyOne,
        deletedAt: null,
        kpiConfigurationId: candidate.kpiConfigurationId,
      },
    });
    const before = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    await prisma.kpiConfiguration.update({
      where: { id: candidate.kpiConfigurationId },
      data: { enabled: false },
    });
    try {
      const after = await request(app)
        .get("/api/v1/dashboard/summary")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(after.body.data.compliance.measuredKpis).toBe(
        before.body.data.compliance.measuredKpis - configurationActuals,
      );
    } finally {
      await prisma.kpiConfiguration.update({
        where: { id: candidate.kpiConfigurationId },
        data: { enabled: true },
      });
    }
  });

  it("derives active-framework totals from scopeStatus", async () => {
    const before = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const unique = Date.now().toString();
    const created = await prisma.framework.createManyAndReturn({
      data: [
        {
          code: `TEST-PLANNING-${unique}`,
          name: "Synthetic planning framework",
          version: "1",
          status: "ACTIVE",
          scopeStatus: "Planning",
        },
        {
          code: `TEST-IN-SCOPE-${unique}`,
          name: "Synthetic in-scope framework",
          version: "1",
          status: "ACTIVE",
          scopeStatus: "Active – In Scope",
        },
      ],
      select: { id: true },
    });
    try {
      const after = await request(app)
        .get("/api/v1/dashboard/summary")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(after.body.data.frameworks.activeFrameworks).toBe(
        before.body.data.frameworks.activeFrameworks + 1,
      );
      expect(after.body.data.frameworks.active).toBe(
        before.body.data.frameworks.active + 1,
      );
    } finally {
      await prisma.framework.deleteMany({
        where: { id: { in: created.map(({ id }) => id) } },
      });
    }
  });

  it("keeps Major, Minor and enterprise risk counts as separate figures", async () => {
    const response = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const risks = response.body.data.risks as {
      openMajor: number;
      openMinor: number;
      openEnterprise: number;
      openTotal: number;
    };
    expect(risks).toHaveProperty("openMajor");
    expect(risks).toHaveProperty("openMinor");
    expect(risks).toHaveProperty("openEnterprise");
    // The KPI classes and the enterprise register partition the open set.
    expect(risks.openMajor + risks.openMinor + risks.openEnterprise).toBe(
      risks.openTotal,
    );
  });

  it("withholds sections the caller may not read", async () => {
    const response = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${readerToken}`)
      .expect(200);
    // The reader fixture holds risk:read but not the write permissions.
    expect(response.body.data.risks).toBeNull();
    expect(response.body.data.gaps).not.toBeNull();
    expect(response.body.data.compliance).not.toBeNull();
  });

  it("requires dashboard:read before returning any dashboard activity", async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: companyOne, code: "COMPANY_USER" },
      },
      select: { id: true },
    });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: "dashboard:read" },
      select: { id: true },
    });
    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
    });
    try {
      const revoked = await loginAs("user001@example.test", "User001!Secure");
      await request(app)
        .get("/api/v1/dashboard/summary")
        .set("Authorization", `Bearer ${revoked.accessToken}`)
        .expect(403);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }
  });

  it("returns stable empty-data shapes for a company with no records", async () => {
    const response = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", `Bearer ${companyTwoToken}`)
      .expect(200);
    const data = response.body.data;
    expect(data.compliance.overallPercentage).toBeTypeOf("number");
    expect(Array.isArray(data.recentActivity)).toBe(true);
    expect(Array.isArray(data.registers)).toBe(true);
    expect(data.gaps.open).toBeGreaterThanOrEqual(0);
  });

  it("accepts documented filters and rejects an unknown one", async () => {
    await request(app)
      .get("/api/v1/dashboard/summary?period=FY26-27%20Q1&from=2026-04-01")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .get(
        "/api/v1/dashboard/summary?companyId=00000000-0000-4000-8000-000000000000",
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
  });

  it("exports CSV with a deterministic filename and neutralised formulas", async () => {
    await request(app)
      .post("/api/v1/gaps")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "=cmd|'/c calc'!A0",
        severity: "MINOR",
        description: "A title a spreadsheet would try to execute",
      })
      .expect(201);

    const response = await request(app)
      .get("/api/v1/exports/gaps.csv")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toMatch(
      /attachment; filename="genbioca-gaps-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.text).toContain("Gap Code,Title,Severity");
    // The dangerous value is present but defused.
    expect(response.text).toContain("'=cmd|'/c calc'!A0");
    expect(response.text).not.toMatch(/,=cmd/);
  });

  it("gates a CSV download behind exports:read", async () => {
    // Export is a permission of its own, so it can be withheld from a role
    // that may still browse the data. The fixture reader holds it; revoking it
    // proves the route enforces it rather than merely declaring it.
    const role = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: companyOne, code: "COMPANY_USER" },
      },
      select: { id: true },
    });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: "exports:read" },
      select: { id: true },
    });
    await request(app)
      .get("/api/v1/exports/gaps.csv")
      .set("Authorization", `Bearer ${readerToken}`)
      .expect(200);

    await prisma.rolePermission.delete({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
    });
    try {
      const revoked = await loginAs("user001@example.test", "User001!Secure");
      await request(app)
        .get("/api/v1/exports/gaps.csv")
        .set("Authorization", `Bearer ${revoked.accessToken}`)
        .expect(403);
      // Reading the module itself is unaffected by losing export rights.
      await request(app)
        .get("/api/v1/gaps")
        .set("Authorization", `Bearer ${revoked.accessToken}`)
        .expect(200);
    } finally {
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }
  });

  it("scopes a CSV export to the authenticated company", async () => {
    // Gap codes are company scoped and both companies start at GAP-001, so
    // isolation is asserted on a value that is genuinely unique.
    const marker = `Company one only ${Date.now()}`;
    await request(app)
      .post("/api/v1/gaps")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: marker, severity: "MINOR" })
      .expect(201);

    const mine = await request(app)
      .get("/api/v1/exports/gaps.csv")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(mine.text).toContain(marker);

    const theirs = await request(app)
      .get("/api/v1/exports/gaps.csv")
      .set("Authorization", `Bearer ${companyTwoToken}`)
      .expect(200);
    expect(theirs.text).not.toContain(marker);
  });

  it("reports evidence file availability truthfully in the export", async () => {
    await prisma.evidence.create({
      data: {
        tenantId: companyOne,
        code: `EVD-CSV-${Date.now()}`,
        title: "Metadata-only imported evidence",
        sourceFileReference: "/evidence/only-a-path.pdf",
        createdById: adminUserId,
        updatedById: adminUserId,
      },
    });
    const response = await request(app)
      .get("/api/v1/exports/evidence.csv")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(response.text).toContain("File Held,Workbook File Reference");
    expect(response.text).toContain("false,/evidence/only-a-path.pdf");
  });
});
