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

describe("Organisation masters write API", () => {
  let app: Express;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
  });

  afterAll(async () => prisma.$disconnect());

  const loginAs = async (email: string, password: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return response.body.data as {
      accessToken: string;
      user: {
        id: string;
        activeCompany: { id: string; code: string };
        companies: Array<{ id: string; code: string }>;
      };
    };
  };

  const switchCompany = async (token: string, companyId: string) => {
    const switched = await request(app)
      .post("/api/v1/auth/tenant-context")
      .set("Authorization", `Bearer ${token}`)
      .send({ companyId })
      .expect(200);
    return switched.body.data.accessToken as string;
  };

  describe("departments", () => {
    it("creates with departments:write and writes DEPARTMENT_CREATE audit", async () => {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const code = `DEP-W${Date.now().toString().slice(-6)}`;
      const created = await request(app)
        .post("/api/v1/organisation/departments")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          code,
          name: "Quality Assurance",
          headName: "User Writer 001",
          status: "ACTIVE",
        })
        .expect(201);

      expect(created.body.data).toMatchObject({
        code,
        name: "Quality Assurance",
        headName: "User Writer 001",
      });
      expect(created.body.data).not.toHaveProperty("tenantId");

      const audit = await prisma.auditEvent.findFirst({
        where: {
          tenantId: admin.user.activeCompany.id,
          action: "DEPARTMENT_CREATE",
          entityType: "DEPARTMENT",
          entityId: created.body.data.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toMatchObject({ userId: admin.user.id });
    });

    it("rejects create without departments:write", async () => {
      const regular = await loginAs("user001@example.test", "User001!Secure");
      await request(app)
        .post("/api/v1/organisation/departments")
        .set("Authorization", `Bearer ${regular.accessToken}`)
        .send({ code: "DEP-DENIED", name: "Denied" })
        .expect(403);
    });

    it("rejects cross-tenant update and ignores body tenant ids", async () => {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const company1 = admin.user.activeCompany;
      const company2 = admin.user.companies.find(
        (company) => company.code === "COM-002",
      );
      expect(company2).toBeTruthy();

      const created = await request(app)
        .post("/api/v1/organisation/departments")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          code: `DEP-C1${Date.now().toString().slice(-5)}`,
          name: "Company 001 Department",
          tenantId: company2!.id,
          companyId: company2!.id,
        })
        .expect(201);

      const stored = await prisma.orgDepartment.findUniqueOrThrow({
        where: { id: created.body.data.id },
      });
      expect(stored.tenantId).toBe(company1.id);

      const company2Token = await switchCompany(
        admin.accessToken,
        company2!.id,
      );
      await request(app)
        .patch(`/api/v1/organisation/departments/${created.body.data.id}`)
        .set("Authorization", `Bearer ${company2Token}`)
        .send({ name: "Hijacked" })
        .expect(404);

      const after = await prisma.orgDepartment.findUniqueOrThrow({
        where: { id: created.body.data.id },
      });
      expect(after.name).toBe("Company 001 Department");
    });

    it("returns 409 for duplicate code within a tenant", async () => {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const response = await request(app)
        .post("/api/v1/organisation/departments")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ code: "DEP-001", name: "Duplicate Department" })
        .expect(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: "CONFLICT" },
      });
    });

    it("updates and writes DEPARTMENT_UPDATE audit", async () => {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const created = await request(app)
        .post("/api/v1/organisation/departments")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          code: `DEP-P${Date.now().toString().slice(-6)}`,
          name: "Before Patch",
        })
        .expect(201);

      const updated = await request(app)
        .patch(`/api/v1/organisation/departments/${created.body.data.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ name: "After Patch", headName: "Head 001" })
        .expect(200);

      expect(updated.body.data).toMatchObject({
        name: "After Patch",
        headName: "Head 001",
      });

      const audit = await prisma.auditEvent.findFirst({
        where: {
          tenantId: admin.user.activeCompany.id,
          action: "DEPARTMENT_UPDATE",
          entityId: created.body.data.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toMatchObject({
        userId: admin.user.id,
        entityType: "DEPARTMENT",
      });
    });
  });

  describe("locations", () => {
    it("creates with locations:write and writes LOCATION_CREATE audit", async () => {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const code = `LOC-W${Date.now().toString().slice(-6)}`;
      const created = await request(app)
        .post("/api/v1/organisation/locations")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          code,
          name: "Site Writer 001",
          city: "City 010",
          state: "State 010",
          country: "Country 001",
          type: "Plant",
        })
        .expect(201);

      expect(created.body.data).toMatchObject({
        code,
        name: "Site Writer 001",
        city: "City 010",
        type: "Plant",
      });
      expect(created.body.data).not.toHaveProperty("tenantId");

      const audit = await prisma.auditEvent.findFirst({
        where: {
          tenantId: admin.user.activeCompany.id,
          action: "LOCATION_CREATE",
          entityId: created.body.data.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toMatchObject({
        userId: admin.user.id,
        entityType: "LOCATION",
      });
    });

    it("rejects create without locations:write", async () => {
      const regular = await loginAs("user001@example.test", "User001!Secure");
      await request(app)
        .post("/api/v1/organisation/locations")
        .set("Authorization", `Bearer ${regular.accessToken}`)
        .send({ code: "LOC-DENIED", name: "Denied" })
        .expect(403);
    });

    it("rejects cross-tenant update and ignores body tenant ids", async () => {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const company1 = admin.user.activeCompany;
      const company2 = admin.user.companies.find(
        (company) => company.code === "COM-002",
      );
      expect(company2).toBeTruthy();

      const created = await request(app)
        .post("/api/v1/organisation/locations")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          code: `LOC-C1${Date.now().toString().slice(-5)}`,
          name: "Company 001 Location",
          tenantId: company2!.id,
        })
        .expect(201);

      const stored = await prisma.orgLocation.findUniqueOrThrow({
        where: { id: created.body.data.id },
      });
      expect(stored.tenantId).toBe(company1.id);

      const company2Token = await switchCompany(
        admin.accessToken,
        company2!.id,
      );
      await request(app)
        .patch(`/api/v1/organisation/locations/${created.body.data.id}`)
        .set("Authorization", `Bearer ${company2Token}`)
        .send({ name: "Hijacked" })
        .expect(404);
    });

    it("returns 409 for duplicate code within a tenant", async () => {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      await request(app)
        .post("/api/v1/organisation/locations")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ code: "LOC-001", name: "Duplicate Location" })
        .expect(409);
    });

    it("updates and writes LOCATION_UPDATE audit", async () => {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const created = await request(app)
        .post("/api/v1/organisation/locations")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          code: `LOC-P${Date.now().toString().slice(-6)}`,
          name: "Before Patch",
        })
        .expect(201);

      const updated = await request(app)
        .patch(`/api/v1/organisation/locations/${created.body.data.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ name: "After Patch", city: "City 099" })
        .expect(200);

      expect(updated.body.data).toMatchObject({
        name: "After Patch",
        city: "City 099",
      });

      const audit = await prisma.auditEvent.findFirst({
        where: {
          action: "LOCATION_UPDATE",
          entityId: created.body.data.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toMatchObject({ entityType: "LOCATION" });
    });
  });

  describe("organisation units", () => {
    it("creates with units:write and writes UNIT_CREATE audit", async () => {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const code = `UNIT-W${Date.now().toString().slice(-5)}`;
      const created = await request(app)
        .post("/api/v1/organisation/units")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ code, name: "Unit Writer 001" })
        .expect(201);

      expect(created.body.data).toMatchObject({
        code,
        name: "Unit Writer 001",
      });
      expect(created.body.data).not.toHaveProperty("tenantId");

      const audit = await prisma.auditEvent.findFirst({
        where: {
          tenantId: admin.user.activeCompany.id,
          action: "UNIT_CREATE",
          entityId: created.body.data.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toMatchObject({
        userId: admin.user.id,
        entityType: "UNIT",
      });
    });

    it("rejects create without units:write", async () => {
      const regular = await loginAs("user001@example.test", "User001!Secure");
      await request(app)
        .post("/api/v1/organisation/units")
        .set("Authorization", `Bearer ${regular.accessToken}`)
        .send({ code: "UNIT-DENIED", name: "Denied" })
        .expect(403);
    });

    it("rejects cross-tenant update and ignores body tenant ids", async () => {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const company1 = admin.user.activeCompany;
      const company2 = admin.user.companies.find(
        (company) => company.code === "COM-002",
      );
      expect(company2).toBeTruthy();

      const created = await request(app)
        .post("/api/v1/organisation/units")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          code: `UNIT-C${Date.now().toString().slice(-5)}`,
          name: "Company 001 Unit",
          tenantId: company2!.id,
        })
        .expect(201);

      const stored = await prisma.orgUnit.findUniqueOrThrow({
        where: { id: created.body.data.id },
      });
      expect(stored.tenantId).toBe(company1.id);

      const company2Token = await switchCompany(
        admin.accessToken,
        company2!.id,
      );
      await request(app)
        .patch(`/api/v1/organisation/units/${created.body.data.id}`)
        .set("Authorization", `Bearer ${company2Token}`)
        .send({ name: "Hijacked" })
        .expect(404);
    });

    it("returns 409 for duplicate code within a tenant", async () => {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      await request(app)
        .post("/api/v1/organisation/units")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ code: "UNIT-001", name: "Duplicate Unit" })
        .expect(409);
    });

    it("updates and writes UNIT_UPDATE audit", async () => {
      const admin = await loginAs("admin001@example.test", "Admin001!Secure");
      const created = await request(app)
        .post("/api/v1/organisation/units")
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({
          code: `UNIT-P${Date.now().toString().slice(-5)}`,
          name: "Before Patch",
        })
        .expect(201);

      const updated = await request(app)
        .patch(`/api/v1/organisation/units/${created.body.data.id}`)
        .set("Authorization", `Bearer ${admin.accessToken}`)
        .send({ name: "After Patch" })
        .expect(200);

      expect(updated.body.data).toMatchObject({ name: "After Patch" });

      const audit = await prisma.auditEvent.findFirst({
        where: {
          action: "UNIT_UPDATE",
          entityId: created.body.data.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toMatchObject({ entityType: "UNIT" });
    });
  });
});
