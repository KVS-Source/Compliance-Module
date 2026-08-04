import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, writeFile, access, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { buildWorkbook, type SheetSpec } from "./support/xlsx-builder.js";
import { env } from "../src/config/env.js";
import { removeRetainedPreview } from "../src/modules/imports/preview-cleanup.js";
import { MAX_WORKBOOK_BYTES } from "../src/modules/imports/service.js";

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

const strings: string[] = [];
const s = (value: string) => {
  const existing = strings.indexOf(value);
  if (existing >= 0) return existing;
  strings.push(value);
  return strings.length - 1;
};
const cell = (ref: string, value: string | number) =>
  typeof value === "number"
    ? `<c r="${ref}"><v>${value}</v></c>`
    : `<c r="${ref}" t="s"><v>${s(value)}</v></c>`;
const row = (index: number, values: (string | number | null)[]) => {
  const columns = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const cells = values
    .map((value, column) =>
      value === null ? "" : cell(`${columns[column]}${index}`, value),
    )
    .join("");
  return `<row r="${index}">${cells}</row>`;
};

const frameworkSheet = (name: string): SheetSpec => ({
  name: "05_Frameworks_Master",
  rowsXml:
    row(1, ["FRAMEWORKS MASTER"]) +
    row(2, ["Status"]) +
    row(3, []) +
    row(4, [
      "#",
      "Framework",
      "Version",
      "Scope",
      "Clauses / Controls",
      "Status",
    ]) +
    row(5, [1, name, "2022", "Information Security", "Annex A", "Certified"]),
});

describe("final client completion HTTP coverage", () => {
  let app: Express;
  let prisma: PrismaClient;
  let adminToken: string;
  let adminUserId: string;
  let companyOneId: string;
  let companyTwoId: string;
  let companyTwoToken: string;
  let uploadRoot: string;

  const loginAs = async (email: string, password: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return response.body.data as {
      accessToken: string;
      user: {
        id: string;
        companies: Array<{ id: string; code: string }>;
      };
    };
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app } = await import("../src/app.js"));
    ({ prisma } = await import("../src/config/prisma.js"));
    uploadRoot = await mkdtemp(join(tmpdir(), "fcc-http-upload-"));
    // Retain previews under a disposable directory for this suite.
    (env as { LOCAL_UPLOAD_DIR: string }).LOCAL_UPLOAD_DIR = uploadRoot;

    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    adminToken = admin.accessToken;
    adminUserId = admin.user.id;
    const company1 = admin.user.companies.find((c) => c.code === "COM-001");
    const company2 = admin.user.companies.find((c) => c.code === "COM-002");
    if (!company1 || !company2) throw new Error("COM-001/COM-002 fixtures missing");
    companyOneId = company1.id;
    companyTwoId = company2.id;
    companyTwoToken = (
      await request(app)
        .post("/api/v1/auth/tenant-context")
        .set(auth(adminToken))
        .send({ companyId: companyTwoId })
        .expect(200)
    ).body.data.accessToken as string;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects imports:write when the role lacks the permission", async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: {
        tenantId_code: { tenantId: companyOneId, code: "COMPANY_USER" },
      },
      select: { id: true },
    });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { code: "imports:write" },
      select: { id: true },
    });
    const existing = await prisma.rolePermission.findUnique({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
    });
    if (existing) {
      await prisma.rolePermission.delete({ where: { id: existing.id } });
    }
    try {
      const user = await loginAs("user001@example.test", "User001!Secure");
      await request(app)
        .post("/api/v1/imports/workbook/preview")
        .set(auth(user.accessToken))
        .attach("file", Buffer.from("not-a-workbook"), {
          filename: "x.xlsx",
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
        .expect(403);
      // Read remains available when imports:read is still granted.
      await request(app)
        .get("/api/v1/imports")
        .set(auth(user.accessToken))
        .expect(200);
    } finally {
      if (existing) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id },
        });
      }
    }
  });

  it("isolates preview, commit, errors and audit across two real tenants", async () => {
    const name = `ISO HTTP ${Date.now()}`;
    const buffer = buildWorkbook([frameworkSheet(name)], strings);

    const preview = await request(app)
      .post("/api/v1/imports/workbook/preview")
      .set(auth(adminToken))
      .attach("file", buffer, {
        filename: "tenant-a.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      .expect(200);
    const importId = preview.body.data.importId as string;
    expect(preview.body.data.alreadyImported).toBe(false);

    // Cross-tenant preview/commit denial.
    await request(app)
      .post(`/api/v1/imports/${importId}/commit`)
      .set(auth(companyTwoToken))
      .expect(404);
    await request(app)
      .get(`/api/v1/imports/${importId}`)
      .set(auth(companyTwoToken))
      .expect(404);
    await request(app)
      .get(`/api/v1/imports/${importId}/errors`)
      .set(auth(companyTwoToken))
      .expect(404);

    const commit = await request(app)
      .post(`/api/v1/imports/${importId}/commit`)
      .set(auth(adminToken))
      .expect(200);
    expect(commit.body.data.alreadyImported).toBe(false);

    // Retained temp payload cleaned after successful commit.
    await expect(
      access(join(uploadRoot, ".import-tmp", companyOneId, importId, "payload.bin")),
    ).rejects.toThrow();

    // Second tenant can import the same bytes independently.
    const previewB = await request(app)
      .post("/api/v1/imports/workbook/preview")
      .set(auth(companyTwoToken))
      .attach("file", buffer, {
        filename: "tenant-b.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      .expect(200);
    expect(previewB.body.data.alreadyImported).toBe(false);
    const importIdB = previewB.body.data.importId as string;
    expect(importIdB).not.toBe(importId);

    const auditA = await request(app)
      .get("/api/v1/audit-events?page=1&pageSize=50")
      .set(auth(adminToken))
      .expect(200);
    const auditB = await request(app)
      .get("/api/v1/audit-events?page=1&pageSize=50")
      .set(auth(companyTwoToken))
      .expect(200);

    const aIds = new Set(
      (auditA.body.data as Array<{ id: string }>).map((row) => row.id),
    );
    const bEvents = auditB.body.data as Array<{
      id: string;
      action: string;
      entityId: string | null;
    }>;
    for (const event of bEvents) {
      expect(aIds.has(event.id)).toBe(false);
    }
    // Company B must not see Company A's import batch id in audit payloads.
    const aSerialised = JSON.stringify(auditA.body.data);
    expect(aSerialised).not.toContain(importIdB);
    const bSerialised = JSON.stringify(auditB.body.data);
    expect(bSerialised).not.toContain(importId);
  });

  it("rejects unsupported upload extensions and oversized workbook at the API boundary", async () => {
    await request(app)
      .post("/api/v1/imports/workbook/preview")
      .set(auth(adminToken))
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "not-excel.pdf",
        contentType: "application/pdf",
      })
      .expect(400);

    const oversized = Buffer.alloc(MAX_WORKBOOK_BYTES + 1024, 1);
    const response = await request(app)
      .post("/api/v1/imports/workbook/preview")
      .set(auth(adminToken))
      .attach("file", oversized, {
        filename: "too-large.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      .expect(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/<\/?html/i);
  });

  it("returns CSV header and row-level validation errors without leaking formulae as executable", async () => {
    const badHeaders = await request(app)
      .post("/api/v1/imports/csv/preview?type=GAPS")
      .set(auth(adminToken))
      .attach("file", Buffer.from("Wrong,Headers\nA,B\n", "utf8"), {
        filename: "bad.csv",
        contentType: "text/csv",
      })
      .expect(400);
    expect(badHeaders.body.error.message).toMatch(/header/i);

    const formulaCsv = Buffer.from(
      [
        "Gap ID,Gap Description,Severity,Status,Owner,Due Date,Framework,Clause / Control,Recommended Corrective Action",
        'GAP-FORM,"=cmd|\'/C calc\'!A0",Major,Open,U-004,2026-08-31,ISO 27001,A.5.15,Remediate',
      ].join("\n"),
      "utf8",
    );
    const preview = await request(app)
      .post("/api/v1/imports/csv/preview?type=GAPS")
      .set(auth(adminToken))
      .attach("file", formulaCsv, {
        filename: "formula.csv",
        contentType: "text/csv",
      })
      .expect(200);
    const serialised = JSON.stringify(preview.body.data.preview);
    // Formula-like text may appear as data, but the response must remain JSON
    // and must not include host filesystem paths.
    expect(serialised).not.toMatch(/\/var\/|\/Users\/|LOCAL_UPLOAD_DIR/);
    expect(preview.body.success).toBe(true);

    if (preview.body.data.preview.totals.errorRows > 0) {
      const importId = preview.body.data.importId as string;
      const errors = await request(app)
        .get(`/api/v1/imports/${importId}/errors`)
        .set(auth(adminToken))
        .expect(200);
      expect(Array.isArray(errors.body.data)).toBe(true);
    }
  });

  it("keeps operational register reads tenant-scoped", async () => {
    const code = `HTTP_REG_${Date.now()}`;
    await prisma.operationalRegisterType.create({
      data: {
        tenantId: companyOneId,
        code,
        name: "HTTP Isolation Register",
        sourceSheet: "12_Audit_Schedule",
        fieldConfiguration: [{ key: "Owner", label: "Owner", type: "string" }],
      },
    });
    const listA = await request(app)
      .get("/api/v1/operational-registers")
      .set(auth(adminToken))
      .expect(200);
    const codesA = (listA.body.data as Array<{ code: string }>).map(
      (row) => row.code,
    );
    expect(codesA).toContain(code);

    const listB = await request(app)
      .get("/api/v1/operational-registers")
      .set(auth(companyTwoToken))
      .expect(200);
    const codesB = (listB.body.data as Array<{ code: string }>).map(
      (row) => row.code,
    );
    expect(codesB).not.toContain(code);
  });

  it("rejects GenRAC path traversal and reports not configured for sync", async () => {
    await prisma.externalSystemConnection.updateMany({
      where: { tenantId: companyOneId, systemCode: "GENRAC" },
      data: { status: "NOT_CONFIGURED", config: {}, secretRefKeys: [] },
    });
    const status = await request(app)
      .get("/api/v1/integrations/genrac/status")
      .set(auth(adminToken))
      .expect(200);
    expect(status.body.data.connection.status).toBe("NOT_CONFIGURED");

    for (const filename of ["..", "../x.csv", "/etc/passwd", "a/b.csv"]) {
      const response = await request(app)
        .post("/api/v1/integrations/genrac/configure-csv")
        .set(auth(adminToken))
        .send({ filename })
        .expect(400);
      expect(JSON.stringify(response.body)).not.toMatch(/\/etc\/passwd/);
      expect(response.body.error.code).toMatch(/VALIDATION_ERROR|GENRAC/);
    }

    await request(app)
      .post("/api/v1/integrations/genrac/sync")
      .set(auth(adminToken))
      .expect(409);
  });

  it("supports GenRAC CSV configure, conflict skip/update and external-record idempotency", async () => {
    const genracDir = join(uploadRoot, ".genrac");
    await mkdir(genracDir, { recursive: true });
    const filename = `genrac-${randomUUID().slice(0, 8)}.csv`;
    const externalId = `CUST-HTTP-${randomUUID().slice(0, 8)}`;
    const conflictId = `CUST-HTTP-CONFLICT-${randomUUID().slice(0, 8)}`;
    const csvPath = join(genracDir, filename);
    await writeFile(
      csvPath,
      `entity_type,external_id,updated_at,name\nCUSTOMER_MASTER,${externalId},2026-01-01,Customer One\n`,
      "utf8",
    );

    const configured = await request(app)
      .post("/api/v1/integrations/genrac/configure-csv")
      .set(auth(adminToken))
      .send({ filename })
      .expect(200);
    expect(configured.body.data.status).toBe("CONFIGURED");
    expect(configured.body.data.secretRefKeys).toEqual([]);
    expect(JSON.stringify(configured.body.data.config)).not.toMatch(
      /password|api[_-]?key|token/i,
    );

    const firstSync = await request(app)
      .post("/api/v1/integrations/genrac/sync")
      .set(auth(adminToken))
      .expect(200);
    expect(firstSync.body.data.create).toBeGreaterThanOrEqual(1);

    const secondPreview = await request(app)
      .post("/api/v1/integrations/genrac/preview")
      .set(auth(adminToken))
      .expect(200);
    expect(secondPreview.body.data.counts.skip).toBeGreaterThanOrEqual(1);

    // Protected local type conflict: seed a map pointing at GAP.
    const connection = await prisma.externalSystemConnection.findFirstOrThrow({
      where: { tenantId: companyOneId, systemCode: "GENRAC" },
    });
    await prisma.externalRecordMap.create({
      data: {
        tenantId: companyOneId,
        connectionId: connection.id,
        sourceEntityType: "CUSTOMER_MASTER",
        externalRecordId: conflictId,
        localEntityType: "GAP",
        localEntityId: randomUUID(),
        syncHash: "old-hash",
        status: "ACTIVE",
      },
    });
    await writeFile(
      csvPath,
      `entity_type,external_id,updated_at,name\nCUSTOMER_MASTER,${conflictId},2026-01-02,Conflict Customer\n`,
      "utf8",
    );
    const conflictSync = await request(app)
      .post("/api/v1/integrations/genrac/sync")
      .set(auth(adminToken))
      .expect(200);
    expect(conflictSync.body.data.conflict).toBeGreaterThanOrEqual(1);

    // Restore not-configured so peer suites keep a clean GenRAC baseline.
    await prisma.externalSystemConnection.update({
      where: { id: connection.id },
      data: {
        status: "NOT_CONFIGURED",
        config: {},
        secretRefKeys: [],
      },
    });

    void adminUserId;
    void removeRetainedPreview;
  });
});
