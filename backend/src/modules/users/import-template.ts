import { z } from "zod";
import { AppError } from "../../common/errors/app-error.js";
import {
  PRODUCTION_ACCESS_PROFILES,
  type ProductionRoleCode,
} from "../../production/access-profile.js";
import { toCsv, type CsvColumn } from "../exports/csv.js";
import { parseCsv } from "../imports/csv-parser.js";
import { normaliseHeader } from "../imports/normalise.js";

/**
 * The approved bulk user import template.
 *
 * Deliberately carries **no password column**. Credentials never travel in a
 * file that is emailed around an office; the administrator supplies one
 * initial password with the commit request instead, exactly as `POST /users`
 * already works, and the platform never returns it.
 */
export const USER_IMPORT_HEADERS = [
  "User Code",
  "Full Name",
  "Email",
  "Phone",
  "Department",
  "Role",
  "Status",
] as const;

/**
 * Onboarding a department, not migrating a directory. The cap keeps one
 * request inside a sensible response time: every row costs an Argon2 hash and
 * its own governed create.
 */
export const MAX_USER_IMPORT_ROWS = 200;
export const MAX_USER_IMPORT_BYTES = 256 * 1024;

export const USER_IMPORT_STATUSES = [
  "ACTIVE",
  "INVITED",
  "DISABLED",
  "LOCKED",
] as const;

export type UserImportStatus = (typeof USER_IMPORT_STATUSES)[number];

const SAMPLE_ROWS: readonly (readonly string[])[] = [
  [
    "U-101",
    "User 101",
    "user101@example.test",
    // No leading "+": the shared CSV writer neutralises formula-leading
    // characters, and a template must round-trip through Excel unchanged.
    "00 00000 00101",
    "Quality",
    "DEPARTMENT_OWNER",
    "ACTIVE",
  ],
  [
    "U-102",
    "User 102",
    "user102@example.test",
    "",
    "",
    "Reviewer/Approver",
    "INVITED",
  ],
];

export const userImportTemplateBody = () => {
  const columns: CsvColumn<readonly string[]>[] = USER_IMPORT_HEADERS.map(
    (header, index) => ({ header, value: (row) => row[index] ?? "" }),
  );
  return toCsv(columns, SAMPLE_ROWS);
};

export const userImportTemplate = () => ({
  headers: [...USER_IMPORT_HEADERS],
  maxRows: MAX_USER_IMPORT_ROWS,
  statuses: [...USER_IMPORT_STATUSES],
  roles: Object.entries(PRODUCTION_ACCESS_PROFILES).map(([code, profile]) => ({
    code,
    name: profile.name,
  })),
});

/**
 * Role is accepted as either the profile code or the profile name shown in the
 * product, because an administrator filling a spreadsheet by hand types what
 * the Users screen shows them. Anything else is refused rather than guessed —
 * a mistyped role must never silently become a lesser or greater privilege.
 */
const roleLookup = new Map<string, ProductionRoleCode>();
for (const [code, profile] of Object.entries(PRODUCTION_ACCESS_PROFILES)) {
  roleLookup.set(normaliseHeader(code), code as ProductionRoleCode);
  roleLookup.set(normaliseHeader(profile.name), code as ProductionRoleCode);
}

export const resolveRoleCode = (value: string) =>
  roleLookup.get(normaliseHeader(value));

export const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Code must be alphanumeric");
export const nameSchema = z.string().trim().min(1).max(200);
export const emailSchema = z.string().trim().email().max(254).toLowerCase();
export const phoneSchema = z.string().trim().max(64);

export type ParsedImportRow = {
  /** 1-based data line in the uploaded file, header excluded. */
  line: number;
  code: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  status: string;
};

/**
 * Parses the uploaded CSV text into raw rows. Headers must match the approved
 * template exactly after normalisation; an arbitrary spreadsheet is never
 * guessed from free-form columns.
 */
export const parseUserImportCsv = (csv: string): ParsedImportRow[] => {
  const buffer = Buffer.from(csv, "utf8");
  if (buffer.byteLength > MAX_USER_IMPORT_BYTES) {
    throw new AppError(
      400,
      "CSV_INVALID",
      `CSV exceeds the ${MAX_USER_IMPORT_BYTES / 1024} KB limit`,
    );
  }

  const rows = parseCsv(buffer);
  const headerRow = rows[0] ?? [];
  const expected = USER_IMPORT_HEADERS.map((header) => normaliseHeader(header));
  const actual = headerRow.map((header) => normaliseHeader(header));

  if (actual.length !== expected.length) {
    throw new AppError(
      400,
      "CSV_INVALID",
      `CSV header count mismatch: expected ${expected.length} columns (${USER_IMPORT_HEADERS.join(", ")})`,
    );
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new AppError(
        400,
        "CSV_INVALID",
        `CSV header mismatch at column ${index + 1}: expected "${USER_IMPORT_HEADERS[index]}", got "${headerRow[index] ?? ""}"`,
      );
    }
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    throw new AppError(400, "CSV_INVALID", "CSV contains no data rows");
  }
  if (dataRows.length > MAX_USER_IMPORT_ROWS) {
    throw new AppError(
      400,
      "CSV_INVALID",
      `CSV exceeds the ${MAX_USER_IMPORT_ROWS} row limit for one user import`,
    );
  }

  return dataRows.map((row, index) => ({
    line: index + 1,
    code: (row[0] ?? "").trim(),
    name: (row[1] ?? "").trim(),
    email: (row[2] ?? "").trim(),
    phone: (row[3] ?? "").trim(),
    department: (row[4] ?? "").trim(),
    role: (row[5] ?? "").trim(),
    status: (row[6] ?? "").trim(),
  }));
};
