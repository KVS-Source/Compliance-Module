import { AppError } from "../../common/errors/app-error.js";
import { normaliseHeader } from "./normalise.js";
import {
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  csvTemplateFor,
  type CsvImportType,
} from "./csv-templates.js";
import { planForKey } from "./sheet-plan.js";
import { buildSingleSheetWorkbook } from "./xlsx/simple-builder.js";

/**
 * RFC 4180-ish CSV parser with quoted-field support.
 * Rejects oversized payloads and over-row limits before workbook adaptation.
 */
export const parseCsv = (buffer: Buffer): string[][] => {
  if (buffer.length === 0) {
    throw new AppError(400, "CSV_INVALID", "CSV file is empty");
  }
  if (buffer.length > MAX_CSV_BYTES) {
    throw new AppError(
      400,
      "CSV_INVALID",
      `CSV exceeds the ${MAX_CSV_BYTES / (1024 * 1024)} MB limit`,
    );
  }

  let text: string;
  try {
    text = buffer.toString("utf8");
  } catch {
    throw new AppError(400, "CSV_INVALID", "CSV must be UTF-8 encoded");
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      if (field.endsWith("\r")) field = field.slice(0, -1);
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  if (inQuotes) {
    throw new AppError(400, "CSV_INVALID", "Unterminated quoted CSV field");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  if (rows.length === 0) {
    throw new AppError(400, "CSV_INVALID", "CSV contains no data rows");
  }
  if (rows.length - 1 > MAX_CSV_ROWS) {
    throw new AppError(
      400,
      "CSV_INVALID",
      `CSV exceeds the ${MAX_CSV_ROWS} row limit`,
    );
  }
  return rows;
};

/**
 * Validates exact approved headers for a typed CSV import and returns a
 * synthetic workbook buffer the shared commit pipeline can process.
 */
export const csvToWorkbookBuffer = (
  importType: CsvImportType,
  buffer: Buffer,
): { filename: string; workbookBuffer: Buffer; rowCount: number } => {
  const template = csvTemplateFor(importType);
  const plan = planForKey(template.sheetKey);
  if (!plan) {
    throw new AppError(
      500,
      "CSV_INVALID",
      `No sheet plan for CSV type ${importType}`,
    );
  }

  const rows = parseCsv(buffer);
  const headerRow = rows[0] ?? [];
  const expected = template.headers.map((header) => normaliseHeader(header));
  const actual = headerRow.map((header) => normaliseHeader(header));

  if (actual.length !== expected.length) {
    throw new AppError(
      400,
      "CSV_INVALID",
      `CSV header count mismatch for ${importType}: expected ${expected.length} columns`,
    );
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) {
      throw new AppError(
        400,
        "CSV_INVALID",
        `CSV header mismatch at column ${i + 1}: expected "${template.headers[i]}", got "${headerRow[i] ?? ""}"`,
      );
    }
  }

  const dataRows = rows.slice(1).map((row) => {
    const padded = [...row];
    while (padded.length < template.headers.length) padded.push("");
    return padded.slice(0, template.headers.length);
  });

  const workbookBuffer = buildSingleSheetWorkbook({
    sheetName: plan.sheetName,
    headerRow: plan.headerRow,
    headers: template.headers,
    rows: dataRows,
  });

  return {
    filename: `${importType.toLowerCase()}.csv.xlsx`,
    workbookBuffer,
    rowCount: dataRows.length,
  };
};
