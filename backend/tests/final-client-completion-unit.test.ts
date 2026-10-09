import { describe, expect, it } from "vitest";
import { mkdir, writeFile, access, rm, mkdtemp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { parseCsv, csvToWorkbookBuffer } from "../src/modules/imports/csv-parser.js";
import { isCsvImportType } from "../src/modules/imports/csv-templates.js";
import { presentSource } from "../src/modules/audit/service.js";
import { isProtectedLocalType } from "../src/modules/genrac/connector.js";
import { GenracCsvAdapter } from "../src/modules/genrac/adapters/csv-adapter.js";
import {
  assertSafeGenracCsvFilename,
  resolveGenracCsvPath,
} from "../src/modules/genrac/service.js";
import { AppError } from "../src/common/errors/app-error.js";
import {
  pruneEmptyImportTempParents,
  removeRetainedPreview,
  resolveUnderImportTemp,
  sweepExpiredImportPreviews,
} from "../src/modules/imports/preview-cleanup.js";

describe("final client completion unit coverage", () => {
  it("rejects CSV with wrong headers", () => {
    expect(isCsvImportType("GAPS")).toBe(true);
    expect(() =>
      csvToWorkbookBuffer(
        "GAPS",
        Buffer.from("Wrong,Headers\nA,B\n", "utf8"),
      ),
    ).toThrow(/header/i);
  });

  it("parses quoted CSV fields and builds a workbook", () => {
    const csv = Buffer.from(
      'Gap ID,Gap Description,Severity,Status,Owner,Due Date,Framework,Clause / Control,Recommended Corrective Action\n"GAP-1","Desc, with comma",Major,Open,U-004,2026-08-31,ISO 27001,A.5.15,Fix it\n',
      "utf8",
    );
    const rows = parseCsv(csv);
    expect(rows[1]?.[1]).toBe("Desc, with comma");
    const adapted = csvToWorkbookBuffer("GAPS", csv);
    expect(adapted.workbookBuffer.length).toBeGreaterThan(100);
    expect(adapted.rowCount).toBe(1);
  });

  it("presents audit sources truthfully", () => {
    expect(presentSource("IMPORT", "user-1")).toBe("IMPORT");
    expect(presentSource("SYSTEM", "user-1")).toBe("USER");
    expect(presentSource("SYSTEM", null)).toBe("SYSTEM");
    expect(presentSource("EXTERNAL_SYNC", null)).toBe("EXTERNAL_SYNC");
  });

  it("protects GenBioCa compliance types from GenRAC overwrite", () => {
    expect(isProtectedLocalType("GAP")).toBe(true);
    expect(isProtectedLocalType("EVIDENCE")).toBe(true);
    expect(isProtectedLocalType("GENRAC_CUSTOMER_MASTER")).toBe(false);
  });

  it("runs GenRAC CSV adapter validation without live access", async () => {
    const dir = join(tmpdir(), `genrac-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const csvPath = join(dir, "genrac.csv");
    await writeFile(
      csvPath,
      "entity_type,external_id,updated_at,name\nCUSTOMER_MASTER,CUST-1,2026-01-01,Example Customer\nPOLICY,POL-1,2026-01-01,Must Be Invalid\n",
      "utf8",
    );
    const adapter = new GenracCsvAdapter(csvPath);
    expect((await adapter.testConnection()).ok).toBe(true);
    const { changes } = await adapter.fetchChanges();
    const { counts, validations } = await adapter.preview(changes);
    expect(counts.invalid).toBeGreaterThanOrEqual(1);
    expect(validations.some((item) => item.ok)).toBe(true);
  });
});

describe("import preview temp cleanup", () => {
  it("enforces path boundary under the import-temp root", () => {
    const root = resolve("/tmp/import-tmp-root-test");
    const inside = join(root, "tenant-a", "batch-a", "payload.bin");
    expect(resolveUnderImportTemp(inside, root)).toBe(resolve(inside));
    expect(resolveUnderImportTemp(join(root, "..", "escape.bin"), root)).toBe(
      null,
    );
    // Prefix-confusion: sibling path that only startsWith the root string.
    expect(resolveUnderImportTemp(`${root}-evil/payload.bin`, root)).toBe(null);
  });

  it("removes retained payload and empty dirs after commit-style cleanup", async () => {
    const uploadDir = await mkdtemp(join(tmpdir(), "import-upload-"));
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const batchId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const dir = join(uploadDir, ".import-tmp", tenantId, batchId);
    await mkdir(dir, { recursive: true });
    const payload = join(dir, "payload.bin");
    await writeFile(payload, Buffer.from("preview-bytes"));

    expect(await removeRetainedPreview(tenantId, batchId, { uploadDir })).toBe(
      true,
    );
    await expect(access(payload)).rejects.toThrow();
    await expect(
      access(join(uploadDir, ".import-tmp", tenantId)),
    ).rejects.toThrow();
  });

  it("sweeps expired payloads while retaining active ones", async () => {
    const uploadDir = await mkdtemp(join(tmpdir(), "import-sweep-"));
    const tenantA = "11111111-1111-4111-8111-111111111111";
    const tenantB = "22222222-2222-4222-8222-222222222222";
    const expiredBatch = "33333333-3333-4333-8333-333333333333";
    const activeBatch = "44444444-4444-4444-8444-444444444444";

    for (const [tenantId, batchId] of [
      [tenantA, expiredBatch],
      [tenantA, activeBatch],
      [tenantB, expiredBatch],
    ] as const) {
      const dir = join(uploadDir, ".import-tmp", tenantId, batchId);
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "payload.bin"),
        Buffer.from(`${tenantId}:${batchId}`),
      );
    }

    const now = new Date("2026-08-04T12:00:00.000Z");
    const result = await sweepExpiredImportPreviews({
      uploadDir,
      ttlHours: 24,
      now,
      lookupPreview: async (tenantId, batchId) => {
        if (batchId === activeBatch && tenantId === tenantA) {
          return {
            active: true,
            expiresAt: new Date("2026-08-05T12:00:00.000Z"),
          };
        }
        return {
          active: true,
          expiresAt: new Date("2026-08-03T12:00:00.000Z"),
        };
      },
    });

    expect(result.removedPayloads).toBe(2);
    expect(result.retainedActive).toBe(1);
    await expect(
      access(
        join(uploadDir, ".import-tmp", tenantA, activeBatch, "payload.bin"),
      ),
    ).resolves.toBeUndefined();
    await expect(
      access(
        join(uploadDir, ".import-tmp", tenantA, expiredBatch, "payload.bin"),
      ),
    ).rejects.toThrow();
    await expect(
      access(
        join(uploadDir, ".import-tmp", tenantB, expiredBatch, "payload.bin"),
      ),
    ).rejects.toThrow();
  });

  it("prunes empty staging directories after validation-failure cleanup", async () => {
    const uploadDir = await mkdtemp(join(tmpdir(), "import-empty-"));
    const tenantId = "55555555-5555-4555-8555-555555555555";
    const staging = join(uploadDir, ".import-tmp", tenantId, "staging-uuid");
    await mkdir(staging, { recursive: true });
    const tempFile = join(staging, "upload.xlsx");
    await writeFile(tempFile, Buffer.from("x"));
    await rm(tempFile);

    const removed = await pruneEmptyImportTempParents(tempFile, { uploadDir });
    expect(removed).toBeGreaterThanOrEqual(1);
    await expect(access(staging)).rejects.toThrow();
  });

  it("keeps tenant trees separate during sweep", async () => {
    const uploadDir = await mkdtemp(join(tmpdir(), "import-tenant-"));
    const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
    const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01";
    const batchId = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
    for (const tenantId of [tenantA, tenantB]) {
      const dir = join(uploadDir, ".import-tmp", tenantId, batchId);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "payload.bin"), Buffer.from(tenantId));
    }
    await sweepExpiredImportPreviews({
      uploadDir,
      now: new Date("2026-08-04T12:00:00.000Z"),
      lookupPreview: async (tenantId) =>
        tenantId === tenantA
          ? {
              active: true,
              expiresAt: new Date("2026-08-03T00:00:00.000Z"),
            }
          : {
              active: true,
              expiresAt: new Date("2026-08-05T00:00:00.000Z"),
            },
    });
    await expect(
      access(join(uploadDir, ".import-tmp", tenantA, batchId, "payload.bin")),
    ).rejects.toThrow();
    await expect(
      access(join(uploadDir, ".import-tmp", tenantB, batchId, "payload.bin")),
    ).resolves.toBeUndefined();
  });
});

describe("GenRAC CSV path validation", () => {
  it("accepts a valid fixture filename under an injected GenRAC root", async () => {
    const root = await mkdtemp(join(tmpdir(), "genrac-csv-"));
    await writeFile(
      join(root, "fixture.csv"),
      "entity_type,external_id\nCUSTOMER_MASTER,C-1\n",
      "utf8",
    );
    expect(assertSafeGenracCsvFilename("fixture.csv")).toBe("fixture.csv");
    expect(resolveGenracCsvPath("fixture.csv", root)).toBe(
      resolve(root, "fixture.csv"),
    );
  });

  it.each([
    "..",
    "../file.csv",
    "../../etc/passwd",
    "/tmp/evil.csv",
    "subdir/file.csv",
    "file\\name.csv",
    "",
    ".",
  ])("rejects unsafe filename %s", (filename) => {
    expect(() => assertSafeGenracCsvFilename(filename)).toThrow(AppError);
    try {
      assertSafeGenracCsvFilename(filename);
    } catch (error) {
      const message = (error as AppError).message;
      expect(message).not.toMatch(/\/etc\/passwd/);
      expect(message).not.toMatch(/\/tmp\/evil/);
    }
  });

  it("rejects prefix-confusion paths outside the GenRAC root", () => {
    const root = resolve("/var/lib/genbioca/evidence/.genrac");
    // Craft a filename that would resolve outside if only startsWith were used
    // after joining a malicious absolute-looking segment — basename rules reject it first.
    expect(() => assertSafeGenracCsvFilename("../outside.csv")).toThrow(AppError);
    expect(() => resolveGenracCsvPath("..", root)).toThrow(AppError);
  });

  it("rejects a missing file before CONFIGURED (via resolve + access pattern)", async () => {
    const root = await mkdtemp(join(tmpdir(), "genrac-missing-"));
    const absolute = resolveGenracCsvPath("missing.csv", root);
    await expect(access(absolute)).rejects.toThrow();
  });
});

describe("nginx upload limit configuration", () => {
  const repoRoot = resolve(process.cwd(), "..");

  it("uses trusted configured hosts rather than request-controlled redirect or upstream hosts", () => {
    const production = readFileSync(resolve(repoRoot, "deploy/nginx/production.conf.template"), "utf8");
    const local = readFileSync(resolve(repoRoot, "deploy/nginx/local-smoke.conf.template"), "utf8");
    expect(production).toContain("return 308 https://${PRODUCTION_DOMAIN}$request_uri;");
    expect(production.match(/proxy_set_header Host \$\{PRODUCTION_DOMAIN\};/g)).toHaveLength(2);
    expect(local.match(/proxy_set_header Host 127\.0\.0\.1;/g)).toHaveLength(2);
    expect(production).not.toContain("$host");
    expect(local).not.toContain("$host");
  });

  it("permits only same-origin, browser-consented geolocation", () => {
    const production = readFileSync(resolve(repoRoot, "deploy/nginx/production.conf.template"), "utf8");
    expect(production).toContain('Permissions-Policy "camera=(), microphone=(), geolocation=(self)"');
  });

  it("pins every GitHub Action to an immutable commit", () => {
    const workflow = readFileSync(resolve(repoRoot, ".github/workflows/ci.yml"), "utf8");
    const actions = [...workflow.matchAll(/uses:\s+(\S+)/g)].map((match) => match[1]);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) expect(action).toMatch(/^[\w-]+\/[\w-]+@[0-9a-f]{40}$/);
  });

  it("keeps production and smoke templates at 21m with JSON 413", () => {
    for (const relative of [
      "deploy/nginx/production.conf.template",
      "deploy/nginx/local-smoke.conf.template",
    ]) {
      const body = readFileSync(resolve(repoRoot, relative), "utf8");
      expect(body).toContain(
        "client_max_body_size ${NGINX_CLIENT_MAX_BODY_SIZE}",
      );
      expect(body).toContain("21m covers the 20 MB workbook limit");
      expect(body).toContain("@upload_too_large");
      expect(body).toContain("UPLOAD_TOO_LARGE");
      expect(body).toContain("application/json");
    }
    const compose = readFileSync(
      resolve(repoRoot, "docker-compose.production.yml"),
      "utf8",
    );
    expect(compose).toContain("NGINX_CLIENT_MAX_BODY_SIZE:-21m");
    const envExample = readFileSync(
      resolve(repoRoot, ".env.production.example"),
      "utf8",
    );
    expect(envExample).toMatch(/NGINX_CLIENT_MAX_BODY_SIZE=21m/);
  });

  it("does not weaken Evidence upload ceiling in production env example", () => {
    const envExample = readFileSync(
      resolve(repoRoot, ".env.production.example"),
      "utf8",
    );
    expect(envExample).toMatch(/EVIDENCE_MAX_UPLOAD_BYTES=10485760/);
  });
});

describe("OpenAPI GenRAC contract", () => {
  it("documents configure-csv and history detail without credentials", async () => {
    const { openApiDocument } = await import("../src/docs/openapi.js");
    const paths = openApiDocument.paths as Record<string, unknown>;
    expect(paths["/integrations/genrac/configure-csv"]).toBeTruthy();
    expect(paths["/integrations/genrac/history/{syncRunId}"]).toBeTruthy();
    const serialised = JSON.stringify(
      paths["/integrations/genrac/configure-csv"],
    );
    expect(serialised.toLowerCase()).not.toContain("password");
    expect(serialised.toLowerCase()).not.toContain("secret_value");
  });
});

void readFile;
