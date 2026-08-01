import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { grantRolePermissionIfAbsent } from "./owned-role-permission-grant.js";
import { LocalFileStorageProvider } from "../src/providers/file-storage/file-storage.js";

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

describe("Evidence file API Slice 5.2", () => {
  let app: Express;
  let prisma: PrismaClient;
  let storageRoot: string;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), "genbioca-evidence-"));
    const { createApp } = await import("../src/app.js");
    ({ prisma } = await import("../src/config/prisma.js"));
    const { logger } = await import("../src/config/logger.js");
    app = createApp(
      prisma,
      logger,
      new LocalFileStorageProvider(storageRoot),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await rm(storageRoot, { recursive: true, force: true });
  });

  const loginAs = async (email: string, password: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    return response.body.data as {
      accessToken: string;
      user: { id: string };
    };
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createDraft = async (token: string) => {
    const response = await request(app)
      .post("/api/v1/evidence")
      .set(auth(token))
      .send({ title: `File evidence ${randomUUID()}` })
      .expect(201);
    return response.body.data as { id: string; code: string; hasFile: boolean };
  };

  it("uploads a PDF, hides storageKey, and allows submit", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const uniquePdf = Buffer.from(
      `%PDF-1.4\n${randomUUID()}\ntrailer\n%%EOF\n`,
      "utf8",
    );
    const draft = await createDraft(admin.accessToken);
    expect(draft.hasFile).toBe(false);

    const uploaded = await request(app)
      .post(`/api/v1/evidence/${draft.id}/file`)
      .set(auth(admin.accessToken))
      .attach("file", uniquePdf, {
        filename: "proof.pdf",
        contentType: "application/pdf",
      })
      .expect(200);

    expect(uploaded.body.data.hasFile).toBe(true);
    expect(uploaded.body.data).not.toHaveProperty("storageKey");
    expect(uploaded.body.data.file).toMatchObject({
      originalFileName: "proof.pdf",
      mimeType: "application/pdf",
      byteSize: uniquePdf.length,
      contentSha256: createHash("sha256").update(uniquePdf).digest("hex"),
    });
    expect(uploaded.body.data.file).not.toHaveProperty("storageKey");

    const submitted = await request(app)
      .post(`/api/v1/evidence/${draft.id}/submit`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(200);
    expect(submitted.body.data.lifecycleStatus).toBe("SUBMITTED");

    const audit = await prisma.auditEvent.findMany({
      where: {
        entityId: draft.id,
        action: { in: ["EVIDENCE_FILE_UPLOADED", "EVIDENCE_SUBMITTED"] },
      },
    });
    expect(audit.some((a) => a.action === "EVIDENCE_FILE_UPLOADED")).toBe(true);
    expect(audit.some((a) => a.action === "EVIDENCE_SUBMITTED")).toBe(true);
    for (const row of audit) {
      const meta = row.metadata as Record<string, unknown>;
      expect(meta).not.toHaveProperty("storageKey");
    }
  });

  it("rejects second upload and tenant-scoped hash duplicates", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const content = Buffer.from(
      `%PDF-1.4\nDUP-${randomUUID()}\n%%EOF\n`,
      "utf8",
    );
    const first = await createDraft(admin.accessToken);
    await request(app)
      .post(`/api/v1/evidence/${first.id}/file`)
      .set(auth(admin.accessToken))
      .attach("file", content, {
        filename: "a.pdf",
        contentType: "application/pdf",
      })
      .expect(200);

    await request(app)
      .post(`/api/v1/evidence/${first.id}/file`)
      .set(auth(admin.accessToken))
      .attach("file", content, {
        filename: "b.pdf",
        contentType: "application/pdf",
      })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("EVIDENCE_FILE_ALREADY_EXISTS");
      });

    const second = await createDraft(admin.accessToken);
    const dup = await request(app)
      .post(`/api/v1/evidence/${second.id}/file`)
      .set(auth(admin.accessToken))
      .attach("file", content, {
        filename: "c.pdf",
        contentType: "application/pdf",
      })
      .expect(409);
    expect(dup.body.error.code).toBe("EVIDENCE_FILE_DUPLICATE");
    expect(JSON.stringify(dup.body)).not.toContain(first.id);
    expect(JSON.stringify(dup.body)).not.toContain(first.code);
  });

  it("rejects disallowed types and oversized payloads", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const draft = await createDraft(admin.accessToken);
    await request(app)
      .post(`/api/v1/evidence/${draft.id}/file`)
      .set(auth(admin.accessToken))
      .attach("file", Buffer.from("<html>x</html>"), {
        filename: "page.html",
        contentType: "text/html",
      })
      .expect(400);

    const big = Buffer.alloc(10_485_761, 1);
    big.write("%PDF-1.4", 0);
    await request(app)
      .post(`/api/v1/evidence/${draft.id}/file`)
      .set(auth(admin.accessToken))
      .attach("file", big, {
        filename: "huge.pdf",
        contentType: "application/pdf",
      })
      .expect(413);
  });

  it("enforces download permissions and streams attachment", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const user = await loginAs("user001@example.test", "User001!Secure");
    const uniquePdf = Buffer.from(
      `%PDF-1.4\n${randomUUID()}\ntrailer\n%%EOF\n`,
      "utf8",
    );
    const draft = await createDraft(admin.accessToken);
    await request(app)
      .post(`/api/v1/evidence/${draft.id}/file`)
      .set(auth(admin.accessToken))
      .attach("file", uniquePdf, {
        filename: "dl.pdf",
        contentType: "application/pdf",
      })
      .expect(200);

    await request(app)
      .get(`/api/v1/evidence/${draft.id}/file`)
      .set(auth(user.accessToken))
      .expect(403);

    const grant = await grantRolePermissionIfAbsent(prisma, {
      tenantCode: "COM-001",
      roleCode: "COMPANY_USER",
      permissionCode: "evidence:download",
    });
    try {
      const reloaded = await loginAs("user001@example.test", "User001!Secure");
      const download = await request(app)
        .get(`/api/v1/evidence/${draft.id}/file`)
        .set(auth(reloaded.accessToken))
        .buffer(true)
        .parse((res, callback) => {
          const data: Buffer[] = [];
          res.on("data", (chunk) => data.push(chunk));
          res.on("end", () => callback(null, Buffer.concat(data)));
        })
        .expect(200);
      expect(download.headers["content-disposition"]).toMatch(/attachment/);
      expect(download.headers["content-type"]).toMatch(/pdf/);
      expect(Buffer.from(download.body).equals(uniquePdf)).toBe(true);
    } finally {
      await grant.revoke();
    }

    await new Promise((r) => setTimeout(r, 300));
    const downloads = await prisma.auditEvent.findMany({
      where: { entityId: draft.id, action: "EVIDENCE_FILE_DOWNLOADED" },
    });
    expect(downloads.length).toBeGreaterThanOrEqual(1);
    expect(downloads[0]?.metadata as object).not.toHaveProperty("storageKey");
  });

  it("keeps fileless submit blocked", async () => {
    const admin = await loginAs("admin001@example.test", "Admin001!Secure");
    const draft = await createDraft(admin.accessToken);
    await request(app)
      .post(`/api/v1/evidence/${draft.id}/submit`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe("EVIDENCE_FILE_REQUIRED");
      });
  });
});
