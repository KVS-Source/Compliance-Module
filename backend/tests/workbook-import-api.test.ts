import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { WorkbookImportService } from "../src/modules/imports/service.js";
import { buildWorkbook, type SheetSpec } from "./support/xlsx-builder.js";

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

/**
 * Import behaviour is exercised with synthetic, anonymised workbooks built in
 * memory. No client workbook is committed to the repository, and no real name
 * or business record appears in a fixture.
 */

/** Shared-string indexes are positional, so cells reference this table. */
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

const GAP_HEADERS = [
  "Gap ID",
  "Date Logged",
  "Framework",
  "Clause / Control",
  "Source",
  "Gap Description",
  "Recommended Corrective Action",
  "Severity",
  "Owner",
  "Due Date",
  "Status",
  "CAPA-ID",
];

/** Builds a `10_Gap_Analysis` sheet: banner, summary band, header at row 5. */
const gapSheet = (
  rows: {
    code: string;
    description: string;
    severity: string;
    status: string;
    due?: string;
  }[],
): SheetSpec => ({
  name: "10_Gap_Analysis",
  rowsXml:
    row(1, ["GAP ANALYSIS REGISTER"]) +
    row(2, ["Each row is one gap."]) +
    row(3, ["Total Gaps"]) +
    row(4, [String(rows.length)]) +
    row(5, GAP_HEADERS) +
    rows
      .map((gap, index) =>
        row(6 + index, [
          gap.code,
          "23-Apr-2026",
          "ISO 27001:2022",
          "A.5.15",
          "Internal Audit",
          gap.description,
          "Introduce the missing review step",
          gap.severity,
          "U-004",
          gap.due ?? "23-May-2026",
          gap.status,
          null,
        ]),
      )
      .join(""),
});

const frameworkSheet = (): SheetSpec => ({
  name: "05_Frameworks_Master",
  rowsXml:
    row(1, ["FRAMEWORKS MASTER"]) +
    row(2, ["Status drives the dashboard."]) +
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
      "ISO 27001",
      "2022",
      "Information Security",
      "Annex A",
      "Certified",
    ]),
});

const organisationSheet = (): SheetSpec => ({
  name: "03_Company_Setup",
  rowsXml:
    row(1, ["COMPANY SETUP"]) +
    row(29, ["#", "Business Unit", "Department / Function", "Leader", "Location"]) +
    row(30, [
      1,
      "Synthetic Services",
      "Synthetic Assurance",
      null,
      "Test City (Testland)",
    ]),
});

const kpiMasterSheet = (code: string): SheetSpec => ({
  name: "14_KPI_Master",
  rowsXml:
    row(1, ["KPI MASTER"]) +
    row(4, [
      "KPI Code",
      "KPI Name",
      "Description",
      "Unit",
      "Direction",
      "Frequency",
      "Default Data Source",
      "Owner Suggestion",
      "Compliance Framework Mapping",
    ]) +
    row(5, [
      code,
      "Synthetic completion rate",
      "An anonymised import mapping fixture",
      "%",
      "Higher is Better",
      "Quarterly",
      "Manual Entry",
      "Assurance Lead",
      "ISO 27001:2022 (9.1)",
    ]),
});

const kpiConfigurationSheet = (code: string): SheetSpec => ({
  name: "15_KPI_Config_Targets",
  rowsXml:
    row(1, ["KPI CONFIGURATION & TARGETS"]) +
    row(4, [
      "KPI Code",
      "KPI Name (auto)",
      "Unit (auto)",
      "Direction (auto)",
      "Enabled?",
      "Target Value",
      "Period",
      "Review Frequency",
      "Owner (User ID)",
      "Business Unit",
      "Location",
      "Product / Service",
      "Notes",
    ]) +
    row(5, [
      code,
      "Synthetic completion rate",
      "%",
      "Higher is Better",
      "Yes",
      95,
      "FY26-27",
      "Quarterly",
      "U-003",
      "Synthetic Services",
      "Test City (Testland)",
      "Assurance",
      "Synthetic integration fixture",
    ]),
});

describe("workbook import", () => {
  let prisma: PrismaClient;
  let service: WorkbookImportService;
  let companyOne: string;
  let companyTwo: string;
  let actorOne: string;
  let actorTwo: string;

  beforeAll(async () => {
    ({ prisma } = await import("../src/config/prisma.js"));
    service = new WorkbookImportService(prisma);
    const one = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-001" },
    });
    const two = await prisma.tenant.findUniqueOrThrow({
      where: { code: "COM-002" },
    });
    companyOne = one.id;
    companyTwo = two.id;
    const membershipOne = await prisma.userCompany.findFirstOrThrow({
      where: { tenantId: companyOne, status: "ACTIVE" },
      select: { userId: true },
    });
    const membershipTwo = await prisma.userCompany.findFirstOrThrow({
      where: { tenantId: companyTwo, status: "ACTIVE" },
      select: { userId: true },
    });
    actorOne = membershipOne.userId;
    actorTwo = membershipTwo.userId;
  });

  afterAll(async () => prisma.$disconnect());

  const uniqueCode = (suffix: string) => `GAP-TEST-${suffix}`;

  it("previews without writing any compliance record", async () => {
    const code = uniqueCode(`preview-${Date.now()}`);
    const workbook = buildWorkbook(
      [
        gapSheet([
          {
            code,
            description: "Preview must not persist this row",
            severity: "Major",
            status: "Open",
          },
        ]),
      ],
      strings,
    );
    const report = service.preview("preview.xlsx", workbook);
    const gapSummary = report.sheets.find((sheet) => sheet.key === "gaps");
    expect(gapSummary?.totalRows).toBe(1);
    expect(gapSummary?.errorRows).toBe(0);
    expect(report.workbook.checksum).toMatch(/^[a-f0-9]{64}$/);

    expect(
      await prisma.gap.count({ where: { tenantId: companyOne, code } }),
    ).toBe(0);
    expect(
      await prisma.importBatch.count({ where: { tenantId: companyOne } }),
    ).toBeGreaterThanOrEqual(0);
  });

  it("commits, then returns the recorded result for an identical workbook", async () => {
    const code = uniqueCode(`idem-${Date.now()}`);
    const workbook = buildWorkbook(
      [
        gapSheet([
          {
            code,
            description: "Rerunning must not duplicate this row",
            severity: "Minor",
            status: "Open",
          },
        ]),
      ],
      strings,
    );
    const first = await service.commit(
      companyOne,
      actorOne,
      "idempotent.xlsx",
      workbook,
    );
    expect(first.alreadyImported).toBe(false);
    expect(first.counts.created).toBeGreaterThanOrEqual(1);

    const second = await service.commit(
      companyOne,
      actorOne,
      "idempotent.xlsx",
      workbook,
    );
    expect(second.alreadyImported).toBe(true);
    expect(second.batchId).toBe(first.batchId);

    expect(
      await prisma.gap.count({ where: { tenantId: companyOne, code } }),
    ).toBe(1);
    expect(
      await prisma.importBatch.count({
        where: { tenantId: companyOne, fileChecksum: first.workbook.checksum },
      }),
    ).toBe(1);
  });

  it("upserts by business key when a revised workbook changes a row", async () => {
    const code = uniqueCode(`revise-${Date.now()}`);
    const original = buildWorkbook(
      [
        gapSheet([
          {
            code,
            description: "Original description",
            severity: "Minor",
            status: "Open",
          },
        ]),
      ],
      strings,
    );
    await service.commit(companyOne, actorOne, "v1.xlsx", original);

    const revised = buildWorkbook(
      [
        gapSheet([
          {
            code,
            description: "Revised description after re-audit",
            severity: "Critical",
            status: "In Progress",
          },
          {
            code: `${code}-NEW`,
            description: "A gap the revision added",
            severity: "Minor",
            status: "Open",
          },
        ]),
      ],
      strings,
    );
    const report = await service.commit(
      companyOne,
      actorOne,
      "v2.xlsx",
      revised,
    );
    expect(report.alreadyImported).toBe(false);

    const updated = await prisma.gap.findFirstOrThrow({
      where: { tenantId: companyOne, code },
    });
    expect(updated.severity).toBe("CRITICAL");
    expect(updated.status).toBe("IN_PROGRESS");
    expect(updated.description).toBe("Revised description after re-audit");
    // The revision updates in place and adds one, never duplicates.
    expect(
      await prisma.gap.count({ where: { tenantId: companyOne, code } }),
    ).toBe(1);
    expect(
      await prisma.gap.count({
        where: { tenantId: companyOne, code: `${code}-NEW` },
      }),
    ).toBe(1);
  });

  it("reports duplicate business keys instead of merging them", async () => {
    const code = uniqueCode(`dupe-${Date.now()}`);
    const workbook = buildWorkbook(
      [
        gapSheet([
          {
            code,
            description: "First row claiming this code",
            severity: "Minor",
            status: "Open",
          },
          {
            code,
            description: "Second row claiming the same code",
            severity: "Major",
            status: "Open",
          },
        ]),
      ],
      strings,
    );
    const report = service.preview("duplicates.xlsx", workbook);
    const gapSummary = report.sheets.find((sheet) => sheet.key === "gaps");
    expect(gapSummary?.errorRows).toBe(2);
    expect(
      report.issues.filter((issue) => issue.message.includes("Duplicate")),
    ).toHaveLength(2);

    // Neither row is written: picking a winner arbitrarily would be a silent
    // data loss.
    await service.commit(companyOne, actorOne, "duplicates.xlsx", workbook);
    expect(
      await prisma.gap.count({ where: { tenantId: companyOne, code } }),
    ).toBe(0);
  });

  it("records an invalid row as FAILED without writing it", async () => {
    const code = uniqueCode(`invalid-${Date.now()}`);
    const workbook = buildWorkbook(
      [
        gapSheet([
          {
            code,
            description: "Row with an unreadable due date",
            severity: "Minor",
            status: "Open",
            due: "not a date at all",
          },
        ]),
      ],
      strings,
    );
    const report = await service.commit(
      companyOne,
      actorOne,
      "invalid.xlsx",
      workbook,
    );
    expect(report.counts.errors).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.gap.count({ where: { tenantId: companyOne, code } }),
    ).toBe(0);
    const failedRows = await prisma.importBatchRow.findMany({
      where: { batchId: report.batchId, importResult: "FAILED" },
      select: { sheet: true, rowNumber: true },
    });
    expect(failedRows.length).toBeGreaterThanOrEqual(1);
    expect(failedRows[0]?.sheet).toBe("10_Gap_Analysis");
  });

  it("keeps two companies importing the same workbook fully isolated", async () => {
    const code = uniqueCode(`isolation-${Date.now()}`);
    const workbook = buildWorkbook(
      [
        gapSheet([
          {
            code,
            description: "Both companies import this same code",
            severity: "Major",
            status: "Open",
          },
        ]),
      ],
      strings,
    );
    const first = await service.commit(
      companyOne,
      actorOne,
      "shared.xlsx",
      workbook,
    );
    const second = await service.commit(
      companyTwo,
      actorTwo,
      "shared.xlsx",
      workbook,
    );
    // Same checksum, different companies: each gets its own batch and record.
    expect(second.alreadyImported).toBe(false);
    expect(second.batchId).not.toBe(first.batchId);

    const gaps = await prisma.gap.findMany({
      where: { code },
      select: { tenantId: true },
    });
    expect(gaps).toHaveLength(2);
    expect(new Set(gaps.map((gap) => gap.tenantId))).toEqual(
      new Set([companyOne, companyTwo]),
    );

    const batchRows = await prisma.importBatchRow.findMany({
      where: { batchId: first.batchId },
      select: { tenantId: true },
    });
    expect(batchRows.every((entry) => entry.tenantId === companyOne)).toBe(
      true,
    );
  });

  it("writes an auditable commit event carrying no confidential row", async () => {
    const code = uniqueCode(`audit-${Date.now()}`);
    const workbook = buildWorkbook(
      [
        gapSheet([
          {
            code,
            description: "Commit must be auditable",
            severity: "Minor",
            status: "Open",
          },
        ]),
      ],
      strings,
    );
    const report = await service.commit(
      companyOne,
      actorOne,
      "audited.xlsx",
      workbook,
    );
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: {
        tenantId: companyOne,
        action: "WORKBOOK_IMPORT_COMMITTED",
        entityId: report.batchId,
      },
      select: { metadata: true, source: true, userId: true },
    });
    expect(event.source).toBe("SYSTEM");
    expect(event.userId).toBe(actorOne);
    const metadata = event.metadata as Record<string, unknown>;
    expect(metadata.fileChecksum).toBe(report.workbook.checksum);
    // The event identifies the workbook, never reproduces its rows.
    expect(JSON.stringify(metadata)).not.toContain(code);
  });

  it("imports the framework master and keeps its in-scope vocabulary", async () => {
    const workbook = buildWorkbook([frameworkSheet()], strings);
    await service.commit(companyOne, actorOne, "frameworks.xlsx", workbook);
    const framework = await prisma.framework.findFirstOrThrow({
      where: { code: "ISO 27001", version: "2022" },
      select: { status: true, scopeStatus: true },
    });
    expect(framework.status).toBe("ACTIVE");
    expect(framework.scopeStatus).toBe("Certified");
  });

  it("resolves workbook KPI unit and location references without provisioning workbook users", async () => {
    const code = `KPI-MAP-${Date.now()}`;
    const workbook = buildWorkbook(
      [
        organisationSheet(),
        kpiMasterSheet(code),
        kpiConfigurationSheet(code),
      ],
      strings,
    );
    await service.commit(
      companyOne,
      actorOne,
      "kpi-organisation-mapping.xlsx",
      workbook,
    );

    const configuration = await prisma.kpiConfiguration.findFirstOrThrow({
      where: {
        tenantId: companyOne,
        definition: { code },
        deletedAt: null,
      },
      select: {
        ownerId: true,
        sourceOwnerRef: true,
        orgUnit: { select: { name: true } },
        orgLocation: { select: { name: true, city: true, country: true } },
      },
    });

    expect(configuration).toEqual({
      ownerId: actorOne,
      sourceOwnerRef: "U-003",
      orgUnit: { name: "Synthetic Services" },
      orgLocation: {
        name: "Test City (Testland)",
        city: "Test City",
        country: "Testland",
      },
    });
    expect(
      await prisma.user.count({ where: { code: "U-003" } }),
    ).toBe(0);
  });

  it("refuses a file that is not a workbook", async () => {
    await expect(async () =>
      service.commit(
        companyOne,
        actorOne,
        "notes.txt",
        Buffer.from("this is not a spreadsheet"),
      ),
    ).rejects.toMatchObject({ code: "WORKBOOK_INVALID" });
  });

  it("refuses an empty file", () => {
    expect(() => service.preview("empty.xlsx", Buffer.alloc(0))).toThrow(
      /empty/i,
    );
  });
});
