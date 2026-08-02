/**
 * Shared CSV writing.
 *
 * Two separate concerns are handled here and must not be conflated:
 *
 *  - RFC 4180 quoting, so a value containing a comma, quote or newline still
 *    parses back into one field;
 *  - formula-injection defence, so a value a spreadsheet would execute is
 *    neutralised before it reaches a file a user will open in Excel.
 */

/** Characters that make Excel, LibreOffice or Sheets treat a cell as a formula. */
const FORMULA_PREFIXES = ["=", "+", "-", "@"];
/** Tab and carriage return also start formula parsing in some spreadsheets. */
const FORMULA_CONTROL_PREFIXES = ["\t", "\r"];

/**
 * Neutralises a value a spreadsheet would evaluate.
 *
 * A leading apostrophe is the documented way to force a literal cell, and it
 * is stripped by the spreadsheet on display, so the reader still sees the
 * original text. The value is never silently dropped or truncated.
 */
export const neutraliseFormula = (value: string) => {
  if (value.length === 0) return value;
  const first = value[0]!;
  if (
    FORMULA_PREFIXES.includes(first) ||
    FORMULA_CONTROL_PREFIXES.includes(first)
  ) {
    return `'${value}`;
  }
  return value;
};

/** Quotes a field per RFC 4180, doubling any embedded quote. */
export const quoteField = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "object") return quoteField(JSON.stringify(value));
  return quoteField(neutraliseFormula(String(value)));
};

export interface CsvColumn<T> {
  readonly header: string;
  readonly value: (row: T) => unknown;
}

export const toCsv = <T>(
  columns: readonly CsvColumn<T>[],
  rows: readonly T[],
) => {
  const lines = [columns.map((column) => csvCell(column.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(column.value(row))).join(","));
  }
  // Trailing newline so the file ends cleanly for line-based tooling.
  return `${lines.join("\r\n")}\r\n`;
};

/**
 * Deterministic filename carrying the module and the export date, so a user
 * with several exports open can tell them apart.
 */
export const exportFilename = (module: string, at = new Date()) =>
  `genbioca-${module}-${at.toISOString().slice(0, 10)}.csv`;
