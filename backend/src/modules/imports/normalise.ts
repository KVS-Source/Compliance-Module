import type { CellValue } from "./xlsx/workbook-reader.js";

/**
 * Value normalisers shared by every sheet mapping. Each returns `undefined`
 * for "absent" and throws `FieldParseError` for "present but unreadable", so a
 * bad cell becomes a visible row error instead of a silent null.
 */

export class FieldParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldParseError";
  }
}

/** Collapses whitespace and strips the workbook's decorative placeholders. */
export const normaliseText = (value: CellValue): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text === "") return undefined;
  // The workbook uses these as "deliberately blank" markers in data columns.
  if (text === "—" || text === "–" || text === "-" || text === "N/A") {
    return undefined;
  }
  return text;
};

/**
 * Header keys are compared case-insensitively with punctuation removed, so
 * `Chk ID`, `CHK-ID` and `Chk  Id` all resolve to the same column.
 */
export const normaliseHeader = (value: CellValue): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\(auto\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const normaliseNumber = (value: CellValue): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  const text = normaliseText(value);
  if (text === undefined) return undefined;
  // Tolerates `85%`, `1,250`, `₹ 4.5` and a trailing unit written by hand.
  const cleaned = text.replace(/[,\s₹$£€]/g, "").replace(/%$/, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new FieldParseError(`"${text}" is not a number`);
  }
  return parsed;
};

export const normaliseInteger = (value: CellValue): number | undefined => {
  const parsed = normaliseNumber(value);
  if (parsed === undefined) return undefined;
  return Math.round(parsed);
};

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Excel's day 0 is 30 December 1899, including its 1900 leap-year bug. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Parses the date shapes the client workbooks actually contain: the dominant
 * `23-Apr-2026` text form, ISO `2026-04-23`, and — defensively — an Excel
 * serial number, in case a future revision stores a real date cell.
 *
 * Dates are returned as UTC midnight to match the `@db.Date` columns, so a
 * machine in IST never shifts an imported date by a day.
 */
export const normaliseDate = (value: CellValue): Date | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      throw new FieldParseError(`"${value}" is not a date`);
    }
    return new Date(EXCEL_EPOCH_UTC + Math.round(value) * MILLISECONDS_PER_DAY);
  }
  const text = normaliseText(value);
  if (text === undefined) return undefined;
  if (/^(tbd|pending|ongoing)$/i.test(text)) return undefined;

  const dayMonthYear = /^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/.exec(
    text,
  );
  if (dayMonthYear) {
    const month = MONTHS[dayMonthYear[2]!.slice(0, 3).toLowerCase()];
    if (month === undefined) {
      throw new FieldParseError(`"${text}" has an unknown month`);
    }
    const year = Number(dayMonthYear[3]);
    return new Date(
      Date.UTC(year < 100 ? 2000 + year : year, month, Number(dayMonthYear[1])),
    );
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    return new Date(
      Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])),
    );
  }

  const numericDayFirst = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
  if (numericDayFirst) {
    // The workbook is authored in an Indian locale, so DD-MM-YYYY wins over
    // MM-DD-YYYY. Anything ambiguous is still parsed the same way every run.
    const day = Number(numericDayFirst[1]);
    const month = Number(numericDayFirst[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new FieldParseError(`"${text}" is not a valid date`);
    }
    return new Date(Date.UTC(Number(numericDayFirst[3]), month - 1, day));
  }

  throw new FieldParseError(`"${text}" is not a recognised date`);
};

/** Accepts `Yes`/`No`, `Y`/`N`, `True`/`False`, `1`/`0`. */
export const normaliseBoolean = (value: CellValue): boolean | undefined => {
  if (typeof value === "boolean") return value;
  const text = normaliseText(value);
  if (text === undefined) return undefined;
  if (/^(yes|y|true|1)$/i.test(text)) return true;
  if (/^(no|n|false|0)$/i.test(text)) return false;
  return undefined;
};

/**
 * A percentage may arrive as `0.98` (Excel percent format) or `98`. Values at
 * or below 1 are treated as fractions; the caller states the expected range.
 */
export const normalisePercentage = (value: CellValue): number | undefined => {
  const parsed = normaliseNumber(value);
  if (parsed === undefined) return undefined;
  const percentage = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, Math.round(percentage)));
};

/**
 * Splits a multi-value cell such as
 * `ISO 27001:2022 A.5.1; HIPAA §164.308` into trimmed parts.
 */
export const splitList = (value: CellValue): string[] => {
  const text = normaliseText(value);
  if (text === undefined) return [];
  return text
    .split(/[;\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

/**
 * Maps a workbook label onto an enum member. Comparison ignores case, spacing
 * and punctuation so `Higher is Better`, `higher-is-better` and
 * `HIGHER_IS_BETTER` all resolve.
 */
export const mapEnum = <T extends string>(
  value: CellValue,
  table: Readonly<Record<string, T>>,
): T | undefined => {
  const text = normaliseText(value);
  if (text === undefined) return undefined;
  const key = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const [label, mapped] of Object.entries(table)) {
    if (label.toLowerCase().replace(/[^a-z0-9]+/g, "") === key) return mapped;
  }
  return undefined;
};

/**
 * Matches a value against a table by prefix, for vocabularies where the
 * workbook appends free text, such as `P3 - Medium` or `Tier 1 - Critical`.
 */
export const mapEnumByPrefix = <T extends string>(
  value: CellValue,
  table: Readonly<Record<string, T>>,
): T | undefined => {
  const direct = mapEnum(value, table);
  if (direct !== undefined) return direct;
  const text = normaliseText(value);
  if (text === undefined) return undefined;
  const key = text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const [label, mapped] of Object.entries(table)) {
    const candidate = label.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (key.startsWith(candidate) || candidate.startsWith(key)) return mapped;
  }
  return undefined;
};
