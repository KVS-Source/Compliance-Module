import { toCsv, type CsvColumn } from "../exports/csv.js";
import { planForKey, type SheetPlan } from "./sheet-plan.js";

/**
 * Template-based CSV import types. Headers must match exactly (after
 * normalisation) — arbitrary CSV is never guessed from free-form columns.
 */

export const CSV_IMPORT_TYPES = [
  "KPI_ACTUALS",
  "GAPS",
  "CAPAS",
  "TRAINING_RECORDS",
  "INCIDENTS",
  "VENDOR_COMPLIANCE",
  "ACTION_ITEMS",
] as const;

export type CsvImportType = (typeof CSV_IMPORT_TYPES)[number];

export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 5_000;

type CsvTemplate = {
  readonly type: CsvImportType;
  readonly label: string;
  readonly sheetKey: string;
  readonly headers: readonly string[];
  readonly sampleRow: readonly string[];
};

const planHeaders = (plan: SheetPlan, extras: readonly string[]) => {
  const required = [...plan.requiredHeaders];
  for (const header of extras) {
    if (!required.includes(header)) required.push(header);
  }
  return required.map((header) =>
    header
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
  );
};

const templates: readonly CsvTemplate[] = [
  {
    type: "KPI_ACTUALS",
    label: "KPI Actuals",
    sheetKey: "kpi_actuals",
    headers: planHeaders(planForKey("kpi_actuals")!, ["notes"]),
    sampleRow: ["DEMO-KPI-001", "2026-Q1", "95", ""],
  },
  {
    type: "GAPS",
    label: "Gaps",
    sheetKey: "gaps",
    headers: [
      "Gap ID",
      "Gap Description",
      "Severity",
      "Status",
      "Owner",
      "Due Date",
      "Framework",
      "Clause / Control",
      "Recommended Corrective Action",
    ],
    sampleRow: [
      "GAP-CSV-001",
      "Missing access review evidence",
      "Major",
      "Open",
      "U-004",
      "2026-08-31",
      "ISO 27001",
      "A.5.15",
      "Complete quarterly review",
    ],
  },
  {
    type: "CAPAS",
    label: "CAPAs",
    sheetKey: "capas",
    headers: [
      "CAPA ID",
      "Status",
      "Priority",
      "Description / Non Conformity",
      "Owner",
      "Due Date",
      "Root Cause / 5 Why",
      "Corrective / Preventive Action",
    ],
    sampleRow: [
      "CAPA-CSV-001",
      "Open",
      "High",
      "Close access review gap",
      "U-004",
      "2026-09-15",
      "Process gap",
      "Introduce checklist",
    ],
  },
  {
    type: "TRAINING_RECORDS",
    label: "Training Records",
    sheetKey: "training",
    headers: [
      "Record ID",
      "Training Title",
      "Status",
      "Employee ID",
      "Date Conducted",
      "Refresher Due",
    ],
    sampleRow: [
      "TRN-CSV-001",
      "Information Security Awareness",
      "Completed",
      "U-004",
      "2026-01-15",
      "2027-01-15",
    ],
  },
  {
    type: "INCIDENTS",
    label: "Incidents and Breaches",
    sheetKey: "incidents",
    headers: [
      "Incident ID",
      "Type",
      "Status",
      "Description",
      "Owner",
      "Date Detected",
      "Notif Deadline",
    ],
    sampleRow: [
      "INC-CSV-001",
      "Security",
      "Open",
      "Suspicious login attempt",
      "U-004",
      "2026-07-01",
      "2026-07-03",
    ],
  },
  {
    type: "VENDOR_COMPLIANCE",
    label: "Vendor Compliance",
    sheetKey: "vendors",
    headers: [
      "Vendor ID",
      "Vendor Name",
      "Tier",
      "Owner",
      "Last Review",
      "Next Review",
    ],
    sampleRow: [
      "VEN-CSV-001",
      "Example Vendor",
      "Tier 1",
      "U-004",
      "2026-01-01",
      "2026-07-01",
    ],
  },
  {
    type: "ACTION_ITEMS",
    label: "Action Items",
    sheetKey: "actions",
    headers: [
      "Action ID",
      "Action Description",
      "Status",
      "Owner",
      "Due Date",
      "Priority",
    ],
    sampleRow: [
      "ACT-CSV-001",
      "Update vendor questionnaire",
      "Open",
      "U-004",
      "2026-08-30",
      "Medium",
    ],
  },
];

export const csvTemplateFor = (type: CsvImportType) => {
  const template = templates.find((item) => item.type === type);
  if (!template) throw new Error(`Unknown CSV import type: ${type}`);
  return template;
};

export const listCsvTemplates = () =>
  templates.map((template) => ({
    type: template.type,
    label: template.label,
    headers: template.headers,
    sheetKey: template.sheetKey,
  }));

export const csvTemplateBody = (type: CsvImportType) => {
  const template = csvTemplateFor(type);
  const columns: CsvColumn<readonly string[]>[] = template.headers.map(
    (header, index) => ({
      header,
      value: (row) => row[index] ?? "",
    }),
  );
  return toCsv(columns, [template.sampleRow]);
};

export const isCsvImportType = (value: string): value is CsvImportType =>
  (CSV_IMPORT_TYPES as readonly string[]).includes(value);
