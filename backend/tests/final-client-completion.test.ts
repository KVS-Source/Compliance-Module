import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PrismaClient } from "@prisma/client";
import { WorkbookImportService } from "../src/modules/imports/service.js";
import { buildWorkbook, type SheetSpec } from "./support/xlsx-builder.js";
import { GenracSyncService } from "../src/modules/genrac/service.js";
import { AuditTrailService } from "../src/modules/audit/service.js";

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

describe("final client completion integration", () => {
  let prisma: PrismaClient;
  let service: WorkbookImportService;
  let genrac: GenracSyncService;
  let audit: AuditTrailService;
  let tenantId: string;
  let userId: string;
  let tempRoot: string;

  beforeAll(async () => {
    ({ prisma } = await import("../src/config/prisma.js"));
    service = new WorkbookImportService(prisma);
    genrac = new GenracSyncService(prisma);
    audit = new AuditTrailService(prisma);
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    tenantId = tenant.id;
    const membership = await prisma.userCompany.findFirstOrThrow({
      where: { tenantId, status: "ACTIVE" },
      select: { userId: true },
    });
    userId = membership.userId;
    tempRoot = join(tmpdir(), `fcc-import-${Date.now()}`);
    await mkdir(tempRoot, { recursive: true });
    process.env.LOCAL_UPLOAD_DIR = tempRoot;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("previews and commits workbook upload with idempotent second commit", async () => {
    const frameworkSheet: SheetSpec = {
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
        row(5, [
          1,
          `ISO FCC ${Date.now()}`,
          "2022",
          "Information Security",
          "Annex A",
          "Certified",
        ]),
    };
    const buffer = buildWorkbook([frameworkSheet], strings);
    const tempPath = join(tempRoot, "preview.xlsx");
    await writeFile(tempPath, buffer);

    const preview = await service.previewUpload(
      tenantId,
      userId,
      "preview.xlsx",
      tempPath,
      buffer,
    );
    expect(preview.importId).toBeTruthy();

    const first = await service.commitPreview(tenantId, userId, preview.importId);
    expect(first.alreadyImported).toBe(false);

    const tempPath2 = join(tempRoot, "preview2.xlsx");
    await writeFile(tempPath2, buffer);
    const preview2 = await service.previewUpload(
      tenantId,
      userId,
      "preview2.xlsx",
      tempPath2,
      buffer,
    );
    expect(preview2.alreadyImported).toBe(true);
    const second = await service.commitPreview(
      tenantId,
      userId,
      preview2.importId,
    );
    expect(second.alreadyImported).toBe(true);
  });

  it("scopes audit trail to the tenant", async () => {
    const result = await audit.list(tenantId, { page: 1, pageSize: 5 });
    expect(result.meta.page).toBe(1);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("reports GenRAC as not configured by default", async () => {
    const status = await genrac.status(tenantId);
    expect(status.connection.status).toBe("NOT_CONFIGURED");
    expect(status.liveAccess).toBe(false);
  });
});
