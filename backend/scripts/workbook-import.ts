import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  WorkbookImportService,
  type CommitReport,
  type PreviewReport,
} from "../src/modules/imports/service.js";

/**
 * Workbook import CLI. Preview never writes; commit writes inside a single
 * transaction and is safe to rerun.
 *
 *   npm run import:workbook:preview -- --file "<path>.xlsx"
 *   npm run import:workbook:commit  -- --file "<path>.xlsx" --tenant GENBIOCA --actor <email>
 *   npm run import:workbook:report  -- --tenant GENBIOCA [--batch <id>]
 */

interface Options {
  readonly command: string;
  readonly file?: string;
  readonly tenant?: string;
  readonly actor?: string;
  readonly batch?: string;
  readonly json?: string;
  readonly idempotencyKey?: string;
}

const parseOptions = (argv: readonly string[]): Options => {
  const [command = "preview", ...rest] = argv;
  const values: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]!;
    if (!token.startsWith("--")) continue;
    const [flag, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) {
      values[flag!] = inline;
      continue;
    }
    const next = rest[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      values[flag!] = next;
      index += 1;
    } else {
      values[flag!] = "true";
    }
  }
  return { command, ...values } as Options;
};

const requireOption = (value: string | undefined, name: string) => {
  if (!value || value === "true") {
    throw new Error(`Missing required option --${name}`);
  }
  return value;
};

const readWorkbookFile = (file: string) => {
  const path = resolve(file);
  const buffer = readFileSync(path);
  return { path, buffer, filename: basename(path) };
};

const pad = (value: string | number, width: number) =>
  String(value).padEnd(width);

/**
 * Human-readable report. Row values are never printed: only sheet names, row
 * numbers, field labels and messages, so a confidential cell cannot reach a
 * terminal or a CI log.
 */
const printReport = (report: PreviewReport | CommitReport) => {
  const commit = "counts" in report ? (report as CommitReport) : null;
  console.log("");
  console.log(`Workbook : ${report.workbook.filename}`);
  console.log(`Checksum : ${report.workbook.checksum}`);
  console.log(
    `Size     : ${report.workbook.byteSize} bytes across ${report.workbook.sheetCount} sheets`,
  );
  if (commit) {
    console.log(`Batch    : ${commit.batchId}`);
    console.log(
      `Status   : ${commit.status}${commit.alreadyImported ? " (identical workbook already imported; no records rewritten)" : ""}`,
    );
  }
  console.log("");
  console.log(
    `${pad("SHEET", 30)}${pad("TARGET", 12)}${pad("ROWS", 7)}${pad("VALID", 7)}${pad("ERRORS", 8)}${pad("FLAGGED", 9)}`,
  );
  console.log("-".repeat(73));
  for (const sheet of report.sheets) {
    if (!sheet.present) {
      console.log(`${pad(sheet.sheetName, 30)}${pad("ABSENT", 12)}`);
      continue;
    }
    if (sheet.target === "derived") {
      console.log(
        `${pad(sheet.sheetName, 30)}${pad("derived", 12)}not imported: ${sheet.reason ?? ""}`,
      );
      continue;
    }
    if (sheet.missingHeaders.length > 0) {
      console.log(
        `${pad(sheet.sheetName, 30)}${pad(sheet.target, 12)}REFUSED: missing columns ${sheet.missingHeaders.join(", ")}`,
      );
      continue;
    }
    console.log(
      `${pad(sheet.sheetName, 30)}${pad(sheet.target, 12)}${pad(sheet.totalRows, 7)}${pad(sheet.validRows, 7)}${pad(sheet.errorRows, 8)}${pad(sheet.flaggedRows, 9)}`,
    );
  }
  console.log("-".repeat(73));
  console.log(
    `${pad("TOTAL", 42)}${pad(report.totals.totalRows, 7)}${pad(report.totals.validRows, 7)}${pad(report.totals.errorRows, 8)}${pad(report.totals.flaggedRows, 9)}`,
  );

  if (report.unmappedSheets.length > 0) {
    console.log("");
    console.log(`Unmapped sheets: ${report.unmappedSheets.join(", ")}`);
  }

  if (commit) {
    console.log("");
    console.log(
      `Created ${commit.counts.created} · updated ${commit.counts.updated} · ` +
        `unchanged ${commit.counts.unchanged} · skipped ${commit.counts.skipped} · ` +
        `invalid ${commit.counts.errors}`,
    );
    if (commit.perSheetOutcomes.length > 0) {
      console.log("");
      console.log(
        `${pad("SHEET", 30)}${pad("CREATED", 9)}${pad("UPDATED", 9)}${pad("UNCHANGED", 11)}${pad("SKIPPED", 9)}`,
      );
      console.log("-".repeat(68));
      for (const outcome of commit.perSheetOutcomes) {
        console.log(
          `${pad(outcome.sheet, 30)}${pad(outcome.created, 9)}${pad(outcome.updated, 9)}${pad(outcome.unchanged, 11)}${pad(outcome.skipped, 9)}`,
        );
      }
    }
  }

  if (report.issues.length > 0) {
    console.log("");
    console.log(`Row issues (${report.issues.length}):`);
    for (const issue of report.issues.slice(0, 50)) {
      console.log(
        `  ${issue.sheet} row ${issue.rowNumber}` +
          `${issue.businessKey ? ` [${issue.businessKey}]` : ""} · ${issue.field}: ${issue.message}`,
      );
    }
    if (report.issues.length > 50) {
      console.log(`  … ${report.issues.length - 50} more; use --json for all`);
    }
  }
  console.log("");
};

const resolveTenant = async (db: PrismaClient, code: string) => {
  const tenant = await db.tenant.findUnique({
    where: { code },
    select: { id: true, code: true, name: true },
  });
  if (!tenant) throw new Error(`No company exists with code "${code}"`);
  return tenant;
};

/**
 * Resolves the actor whose identity is recorded on every imported row. The
 * account must already be an active member of the target company, so the CLI
 * cannot write across a company boundary.
 */
const resolveActor = async (
  db: PrismaClient,
  tenantId: string,
  email: string,
) => {
  const membership = await db.userCompany.findFirst({
    where: {
      tenantId,
      status: "ACTIVE",
      user: { email: email.toLowerCase(), status: "ACTIVE" },
    },
    select: { user: { select: { id: true, email: true } } },
  });
  if (!membership) {
    throw new Error(
      "The actor account must be an active member of the target company",
    );
  }
  return membership.user;
};

const main = async () => {
  const options = parseOptions(process.argv.slice(2));
  const db = new PrismaClient();
  try {
    const service = new WorkbookImportService(db);

    if (options.command === "preview") {
      const { buffer, filename } = readWorkbookFile(
        requireOption(options.file, "file"),
      );
      const report = service.preview(filename, buffer);
      printReport(report);
      if (options.json) {
        writeFileSync(resolve(options.json), JSON.stringify(report, null, 2));
        console.log(`Machine-readable report written to ${options.json}`);
      }
      process.exitCode = report.totals.errorRows > 0 ? 2 : 0;
      return;
    }

    if (options.command === "commit") {
      const { buffer, filename } = readWorkbookFile(
        requireOption(options.file, "file"),
      );
      const tenant = await resolveTenant(
        db,
        requireOption(options.tenant, "tenant"),
      );
      const actor = await resolveActor(
        db,
        tenant.id,
        requireOption(options.actor, "actor"),
      );
      console.log(`Importing into company ${tenant.code} as ${actor.email}`);
      const report = await service.commit(
        tenant.id,
        actor.id,
        filename,
        buffer,
        options.idempotencyKey
          ? { idempotencyKey: options.idempotencyKey }
          : {},
      );
      printReport(report);
      if (options.json) {
        writeFileSync(resolve(options.json), JSON.stringify(report, null, 2));
        console.log(`Machine-readable report written to ${options.json}`);
      }
      process.exitCode = report.status === "FAILED" ? 1 : 0;
      return;
    }

    if (options.command === "report") {
      const tenant = await resolveTenant(
        db,
        requireOption(options.tenant, "tenant"),
      );
      const batch = options.batch
        ? await db.importBatch.findFirst({
            where: { tenantId: tenant.id, id: options.batch },
          })
        : await db.importBatch.findFirst({
            where: { tenantId: tenant.id },
            orderBy: { startedAt: "desc" },
          });
      if (!batch) {
        console.log("No import batch found for this company");
        process.exitCode = 1;
        return;
      }
      printReport(batch.report as unknown as CommitReport);
      const failures = await db.importBatchRow.findMany({
        where: {
          tenantId: tenant.id,
          batchId: batch.id,
          importResult: "FAILED",
        },
        select: { sheet: true, rowNumber: true, businessKey: true },
        orderBy: [{ sheet: "asc" }, { rowNumber: "asc" }],
        take: 200,
      });
      if (failures.length > 0) {
        console.log(`Rejected rows (${failures.length}):`);
        for (const failure of failures) {
          console.log(
            `  ${failure.sheet} row ${failure.rowNumber}${failure.businessKey ? ` [${failure.businessKey}]` : ""}`,
          );
        }
      }
      return;
    }

    console.error(
      `Unknown command "${options.command}". Use preview, commit or report.`,
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
};

main().catch((error: unknown) => {
  // Never print the error object wholesale: a Prisma error can carry a
  // connection string.
  console.error(
    `Workbook import failed: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
});
