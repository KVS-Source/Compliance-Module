/**
 * Central sheet mapping for the GenBioCa compliance workbook.
 *
 * Every sheet the importer knows about is declared here exactly once, with the
 * aliases seen across workbook revisions. A sheet that is absent from this
 * table is reported as unmapped rather than guessed at.
 */

export type SheetTarget =
  /** Imported into a normalised domain table. */
  | "normalised"
  /** Imported into operational_register_records. */
  | "register"
  /**
   * Read for context but never imported as source records: dashboards, pivots,
   * formula summaries, navigation and export manifests. Their values are
   * recalculated from PostgreSQL instead.
   */
  | "derived";

export interface SheetPlan {
  /** Stable key used by the report, independent of the sheet's display name. */
  readonly key: string;
  readonly sheetName: string;
  readonly aliases: readonly string[];
  readonly target: SheetTarget;
  /** 1-based row holding the column headers. */
  readonly headerRow: number;
  /** Headers that must exist for the sheet to be importable. */
  readonly requiredHeaders: readonly string[];
  /** Why a `derived` sheet is not imported; shown in the report. */
  readonly derivedReason?: string;
  /** Register metadata for `register` sheets. */
  readonly register?: {
    readonly code: string;
    readonly name: string;
    /** Header of the column holding the row's business code. */
    readonly codeHeader: string;
    /** Header used as the record title. */
    readonly titleHeader: string;
    readonly statusHeader?: string;
    readonly ownerHeader?: string;
    readonly dateHeader?: string;
    readonly dueDateHeader?: string;
  };
}

export const SHEET_PLANS: readonly SheetPlan[] = [
  {
    key: "company",
    sheetName: "03_Company_Setup",
    aliases: ["Company_Setup", "03_Company Setup"],
    target: "normalised",
    // A key/value profile block plus a departments table; the reader locates
    // the "B. ORGANISATION STRUCTURE" band rather than a single header row.
    headerRow: 29,
    requiredHeaders: ["business unit", "department function"],
  },
  {
    key: "frameworks",
    sheetName: "05_Frameworks_Master",
    aliases: ["Frameworks_Master", "05_Frameworks"],
    target: "normalised",
    headerRow: 4,
    requiredHeaders: ["framework", "version", "status"],
  },
  {
    key: "framework_checkpoints",
    sheetName: "06_Framework_Checkpoints",
    aliases: ["Framework_Checkpoints", "06_Checkpoints"],
    target: "normalised",
    headerRow: 4,
    requiredHeaders: ["chk id", "framework", "audit checkpoint"],
  },
  {
    key: "policies",
    sheetName: "20_Policy_Register",
    aliases: ["Policy_Register", "20_Policies"],
    target: "normalised",
    headerRow: 5,
    requiredHeaders: ["policy id", "title", "status"],
  },
  {
    key: "evidence",
    sheetName: "08_Evidence_Register",
    aliases: ["Evidence_Register", "08_Evidence"],
    target: "normalised",
    headerRow: 4,
    requiredHeaders: ["evidence id", "title", "status"],
  },
  {
    key: "kpi_master",
    sheetName: "14_KPI_Master",
    aliases: ["KPI_Master", "14_KPI Master"],
    target: "normalised",
    headerRow: 4,
    requiredHeaders: ["kpi code", "kpi name", "unit", "direction", "frequency"],
  },
  {
    key: "kpi_config",
    sheetName: "15_KPI_Config_Targets",
    aliases: ["KPI_Config_Targets", "15_KPI_Config"],
    target: "normalised",
    headerRow: 4,
    requiredHeaders: ["kpi code", "enabled", "target value", "period"],
  },
  {
    key: "kpi_actuals",
    sheetName: "16_KPI_Actuals_Entry",
    aliases: ["KPI_Actuals_Entry", "16_KPI_Actuals"],
    target: "normalised",
    headerRow: 4,
    requiredHeaders: ["kpi code", "period", "actual"],
  },
  {
    key: "risks",
    sheetName: "18_Risk_Register",
    aliases: ["Risk_Register", "18_Risks"],
    target: "normalised",
    headerRow: 5,
    requiredHeaders: ["risk id", "risk description", "status"],
  },
  {
    key: "gaps",
    sheetName: "10_Gap_Analysis",
    aliases: ["Gap_Analysis", "10_Gaps"],
    target: "normalised",
    headerRow: 5,
    requiredHeaders: ["gap id", "gap description", "severity", "status"],
  },
  {
    key: "capas",
    sheetName: "11_CAPA_Register",
    aliases: ["CAPA_Register", "11_CAPA"],
    target: "normalised",
    headerRow: 5,
    requiredHeaders: ["capa id", "status", "priority"],
  },
  {
    key: "audit_trail",
    sheetName: "26_Audit_Trail",
    aliases: ["Audit_Trail", "26_Audit Trail"],
    target: "normalised",
    headerRow: 5,
    requiredHeaders: ["event id", "action"],
  },

  {
    key: "audit_schedule",
    sheetName: "12_Audit_Schedule",
    aliases: ["Audit_Schedule"],
    target: "register",
    headerRow: 5,
    requiredHeaders: ["audit id", "audit type", "status"],
    register: {
      code: "AUDIT_SCHEDULE",
      name: "Audit Schedule",
      codeHeader: "audit id",
      titleHeader: "scope",
      statusHeader: "status",
      ownerHeader: "lead auditor",
      dateHeader: "planned start",
      dueDateHeader: "planned end",
    },
  },
  {
    key: "audit_findings",
    sheetName: "13_Audit_Findings",
    aliases: ["Audit_Findings"],
    target: "register",
    headerRow: 5,
    requiredHeaders: ["finding id", "status"],
    register: {
      code: "AUDIT_FINDINGS",
      name: "Audit Findings",
      codeHeader: "finding id",
      titleHeader: "finding description",
      statusHeader: "status",
      ownerHeader: "owner",
      dateHeader: "date",
    },
  },
  {
    key: "training",
    sheetName: "19_Training_Records",
    aliases: ["Training_Records"],
    target: "register",
    headerRow: 5,
    requiredHeaders: ["record id", "training title", "status"],
    register: {
      code: "TRAINING_RECORDS",
      name: "Training Records",
      codeHeader: "record id",
      titleHeader: "training title",
      statusHeader: "status",
      ownerHeader: "employee id",
      dateHeader: "date conducted",
      dueDateHeader: "refresher due",
    },
  },
  {
    key: "incidents",
    sheetName: "21_Incidents_Breach",
    aliases: ["Incidents_Breach", "21_Incidents"],
    target: "register",
    headerRow: 5,
    requiredHeaders: ["incident id", "type", "status"],
    register: {
      code: "INCIDENTS",
      name: "Incidents and Breaches",
      codeHeader: "incident id",
      titleHeader: "description",
      statusHeader: "status",
      ownerHeader: "owner",
      dateHeader: "date detected",
      dueDateHeader: "notif deadline",
    },
  },
  {
    key: "vendors",
    sheetName: "22_Vendor_Compliance",
    aliases: ["Vendor_Compliance"],
    target: "register",
    headerRow: 5,
    requiredHeaders: ["vendor id", "vendor name"],
    register: {
      code: "VENDOR_COMPLIANCE",
      name: "Vendor Compliance",
      codeHeader: "vendor id",
      titleHeader: "vendor name",
      statusHeader: "tier",
      ownerHeader: "owner",
      dateHeader: "last review",
      dueDateHeader: "next review",
    },
  },
  {
    key: "privacy",
    sheetName: "23_Privacy_Consent_DSR",
    aliases: ["Privacy_Consent_DSR"],
    target: "register",
    headerRow: 5,
    requiredHeaders: ["record id", "status"],
    register: {
      code: "PRIVACY_DSR",
      name: "Privacy, Consent and Data Subject Requests",
      codeHeader: "record id",
      titleHeader: "data principal",
      statusHeader: "status",
      dateHeader: "date captured",
      dueDateHeader: "response due",
    },
  },
  {
    key: "meetings",
    sheetName: "24_Review_Meetings",
    aliases: ["Review_Meetings"],
    target: "register",
    headerRow: 5,
    requiredHeaders: ["meeting id", "type", "status"],
    register: {
      code: "REVIEW_MEETINGS",
      name: "Review Meetings",
      codeHeader: "meeting id",
      titleHeader: "type",
      statusHeader: "status",
      ownerHeader: "chair",
      dateHeader: "date",
    },
  },
  {
    key: "actions",
    sheetName: "25_Action_Items",
    aliases: ["Action_Items"],
    target: "register",
    headerRow: 5,
    requiredHeaders: ["action id", "action description", "status"],
    register: {
      code: "ACTION_ITEMS",
      name: "Action Items",
      codeHeader: "action id",
      titleHeader: "action description",
      statusHeader: "status",
      ownerHeader: "owner",
      dueDateHeader: "due date",
    },
  },
  {
    key: "cross_framework_map",
    sheetName: "07_Cross_Framework_Map",
    aliases: ["Cross_Framework_Map"],
    target: "register",
    headerRow: 4,
    requiredHeaders: ["common control area"],
    register: {
      code: "CROSS_FRAMEWORK_MAP",
      name: "Cross-Framework Control Map",
      codeHeader: "",
      titleHeader: "common control area",
    },
  },

  {
    key: "cover",
    sheetName: "00_Cover",
    aliases: [],
    target: "derived",
    headerRow: 1,
    requiredHeaders: [],
    derivedReason: "Cover sheet carries no operational records",
  },
  {
    key: "navigation",
    sheetName: "01_Navigation",
    aliases: [],
    target: "derived",
    headerRow: 1,
    requiredHeaders: [],
    derivedReason: "Navigation index carries no operational records",
  },
  {
    key: "how_to_use",
    sheetName: "02_How_To_Use",
    aliases: [],
    target: "derived",
    headerRow: 1,
    requiredHeaders: [],
    derivedReason: "Instructions carry no operational records",
  },
  {
    key: "users",
    sheetName: "04_Users_Roles",
    aliases: ["Users_Roles"],
    target: "derived",
    headerRow: 4,
    requiredHeaders: [],
    derivedReason:
      "Workbook users are never provisioned as authenticated accounts; owner tokens are retained on each record instead",
  },
  {
    key: "compliance_dashboard",
    sheetName: "09_Compliance_Dashboard",
    aliases: [],
    target: "derived",
    headerRow: 1,
    requiredHeaders: [],
    derivedReason: "Recalculated by the dashboard service from PostgreSQL",
  },
  {
    key: "kpi_dashboard",
    sheetName: "17_KPI_Dashboard",
    aliases: [],
    target: "derived",
    headerRow: 1,
    requiredHeaders: [],
    derivedReason:
      "Recalculated by the KPI performance service from PostgreSQL",
  },
  {
    key: "lookups",
    sheetName: "27_Lookups",
    aliases: [],
    target: "derived",
    headerRow: 4,
    requiredHeaders: [],
    derivedReason: "Reference vocabularies are modelled as database enums",
  },
  {
    key: "export_summary",
    sheetName: "Export Summary",
    aliases: [],
    target: "derived",
    headerRow: 1,
    requiredHeaders: [],
    derivedReason: "Export manifest describes the workbook, not its records",
  },
  {
    key: "kpi_owner_form",
    sheetName: "KPI_owner_form",
    aliases: [],
    target: "derived",
    headerRow: 1,
    requiredHeaders: [],
    derivedReason: "Blank data-entry form, not a populated register",
  },
];

/** Dependency-ordered keys for the commit phase. */
export const IMPORT_ORDER: readonly string[] = [
  "company",
  "frameworks",
  "framework_checkpoints",
  "policies",
  "evidence",
  "kpi_master",
  "kpi_config",
  // The enterprise risk register is loaded before KPI actuals so its own
  // RSK-nnn codes are present when the KPI miss rule allocates new ones.
  "risks",
  "kpi_actuals",
  "gaps",
  "capas",
  "audit_schedule",
  "audit_findings",
  "training",
  "incidents",
  "vendors",
  "privacy",
  "meetings",
  "actions",
  "cross_framework_map",
  "audit_trail",
];

const normaliseSheetName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Resolves a workbook sheet name to its plan through the alias table, so a
 * renamed sheet in a revised workbook still maps to the same target.
 */
export const planForSheet = (sheetName: string) => {
  const key = normaliseSheetName(sheetName);
  return SHEET_PLANS.find(
    (plan) =>
      normaliseSheetName(plan.sheetName) === key ||
      plan.aliases.some((alias) => normaliseSheetName(alias) === key),
  );
};

export const planForKey = (key: string) =>
  SHEET_PLANS.find((plan) => plan.key === key);
