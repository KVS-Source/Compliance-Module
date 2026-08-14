import type { KpiDirection, KpiFrequency } from "@prisma/client";
import { PRODUCTION_ACCESS_PROFILES } from "../src/production/access-profile.js";

/**
 * The display name carries no "sample" wording so the workspace reads as an
 * ordinary Company on screen. The `SAMPLE-CO` code is deliberately unchanged:
 * it is the business key every seeded record's code derives from and that the
 * seed's conflict guards compare against, so it stays honest in the data layer
 * where operators and the audit trail can see it.
 */
export const DEMO_TENANT = {
  code: "SAMPLE-CO",
  name: "GenBioCa Operations",
  industry: "Life Sciences and Healthcare",
  country: "India",
} as const;

export const SAMPLE_PERMISSIONS = [
  ["tenants:read", "Read Companies"],
  ["users:read", "Read Company users"],
  ["users:write", "Create and update Company users"],
  ["roles:assign", "Assign sanctioned roles to Company users"],
  ["organisation:read", "Read organisation master data"],
  ["departments:write", "Create and update Company departments"],
  ["locations:write", "Create and update Company locations"],
  ["units:write", "Create and update Company organisation units"],
  ["frameworks:read", "Read frameworks and rules"],
  ["kpis:read", "Read KPI definitions and goals"],
  ["kpi-config:write", "Create and update Company KPI configurations"],
  ["kpi-target:write", "Create and update Company KPI targets"],
  ["kpi-target:approve", "Approve and reject Company KPI targets"],
  ["kpi-actual:write", "Submit Company KPI actuals"],
  ["kpi-actual:approve", "Approve and reject Company KPI actuals"],
  ["risk:read", "Read Company risks"],
  ["risk:write", "Create and update Company risks"],
  ["risk:treat", "Review, treat and assign Company risks"],
  ["risk:close", "Close and reopen Company risks"],
  ["policies:read", "Read Company Policies and Policy Versions"],
  ["policies:write", "Create and update Company Policies and Policy Versions"],
  ["policies:submit", "Submit Company Policy Versions for approval"],
  ["policies:approve", "Approve and reject Company Policy Versions"],
  ["controls:read", "Read Company Controls and mappings"],
  ["controls:write", "Create and update Company Controls and mappings"],
  ["checkpoints:read", "Read Company Checkpoints and reviews"],
  ["checkpoints:write", "Create and update Company Checkpoints"],
  ["checkpoints:review", "Record Company Checkpoint reviews"],
  ["evidence:read", "Read Company Evidence, links, review and audit history"],
  [
    "evidence:write",
    "Create and update Company Evidence metadata, submit, archive and links",
  ],
  ["evidence:review", "Approve or reject submitted Company Evidence"],
  ["evidence:download", "Download Company Evidence file content"],
  ["gaps:read", "Read Company Gaps"],
  ["gaps:write", "Create and update Company Gaps"],
  ["gaps:close", "Close and reopen Company Gaps"],
  ["capa:read", "Read Company CAPAs"],
  ["capa:write", "Create and update Company CAPAs"],
  ["capa:close", "Close and reopen Company CAPAs"],
  ["registers:read", "Read Company operational registers"],
  ["registers:write", "Create and update Company operational register records"],
  ["imports:read", "Read Company workbook import batches and row errors"],
  ["imports:write", "Preview and commit Company workbook and CSV imports"],
  ["audit:read", "Read Company audit trail events"],
  ["integrations:read", "Read external integration status and sync history"],
  ["integrations:write", "Test and run configured external integrations"],
  ["dashboard:read", "Read the Company compliance dashboard"],
  ["exports:read", "Export Company records as CSV"],
] as const;

/**
 * Roles are declared once, separately from the people who hold them, so that
 * several sample users can share a role without the seed re-deriving a different
 * permission set per person.
 */
export const DEMO_ROLES = [
  {
    code: "CLIENT_COMPANY_ADMINISTRATOR",
    ...PRODUCTION_ACCESS_PROFILES.CLIENT_COMPANY_ADMINISTRATOR,
  },
  {
    code: "COMPLIANCE_MANAGER",
    ...PRODUCTION_ACCESS_PROFILES.COMPLIANCE_MANAGER,
  },
  {
    code: "DEPARTMENT_OWNER",
    ...PRODUCTION_ACCESS_PROFILES.DEPARTMENT_OWNER,
  },
  {
    code: "REVIEWER_APPROVER",
    ...PRODUCTION_ACCESS_PROFILES.REVIEWER_APPROVER,
  },
  {
    code: "MANAGEMENT_VIEWER",
    ...PRODUCTION_ACCESS_PROFILES.MANAGEMENT_VIEWER,
  },
] as const;

/**
 * Invented personas for the sample workspace. The names are fictional and every
 * address stays on the non-routable `.test` domain, so no real customer or
 * employee identity enters the repository.
 *
 * `lastLoginMinutesAgo` is applied relative to seed time. A freshly seeded
 * workspace therefore opens on a roster that has been signing in all week
 * rather than one that has never been touched.
 *
 * The first user carrying each role code is the one the KPI and governance
 * workflows attribute their records to. Risk ownership is named explicitly by
 * `DEMO_RISK_MANAGER_CODE` below, because several people share
 * `COMPLIANCE_MANAGER` and "first holder" would move with roster order.
 */
export const DEMO_USERS = [
  {
    code: "SMP-USR-001",
    email: "aarav.deshmukh@example.test",
    name: "Aarav Deshmukh",
    phone: "+91 98765 40001",
    roleCode: "CLIENT_COMPANY_ADMINISTRATOR",
    departmentCode: "SMP-DEP-001",
    lastLoginMinutesAgo: 35,
  },
  {
    code: "SMP-USR-002",
    email: "priya.nair@example.test",
    name: "Priya Nair",
    phone: "+91 98765 40002",
    roleCode: "COMPLIANCE_MANAGER",
    departmentCode: "SMP-DEP-001",
    lastLoginMinutesAgo: 95,
  },
  {
    code: "SMP-USR-003",
    email: "rohan.iyer@example.test",
    name: "Rohan Iyer",
    phone: "+91 98765 40003",
    roleCode: "DEPARTMENT_OWNER",
    departmentCode: "SMP-DEP-002",
    lastLoginMinutesAgo: 210,
  },
  {
    code: "SMP-USR-004",
    email: "ananya.verma@example.test",
    name: "Ananya Verma",
    phone: "+91 98765 40004",
    roleCode: "REVIEWER_APPROVER",
    departmentCode: "SMP-DEP-001",
    lastLoginMinutesAgo: 400,
  },
  {
    code: "SMP-USR-005",
    email: "vikram.chandran@example.test",
    name: "Vikram Chandran",
    phone: "+91 98765 40005",
    roleCode: "COMPLIANCE_MANAGER",
    departmentCode: "SMP-DEP-001",
    lastLoginMinutesAgo: 1500,
  },
  {
    code: "SMP-USR-006",
    email: "meera.joshi@example.test",
    name: "Meera Joshi",
    phone: "+91 98765 40006",
    roleCode: "MANAGEMENT_VIEWER",
    departmentCode: "SMP-DEP-008",
    lastLoginMinutesAgo: 2600,
  },
  {
    code: "SMP-USR-007",
    email: "karthik.reddy@example.test",
    name: "Karthik Reddy",
    phone: "+91 98765 40007",
    roleCode: "DEPARTMENT_OWNER",
    departmentCode: "SMP-DEP-007",
    lastLoginMinutesAgo: 150,
  },
  {
    code: "SMP-USR-008",
    email: "sneha.kulkarni@example.test",
    name: "Sneha Kulkarni",
    phone: "+91 98765 40008",
    roleCode: "DEPARTMENT_OWNER",
    departmentCode: "SMP-DEP-003",
    lastLoginMinutesAgo: 320,
  },
  {
    code: "SMP-USR-009",
    email: "arjun.malhotra@example.test",
    name: "Arjun Malhotra",
    phone: "+91 98765 40009",
    roleCode: "REVIEWER_APPROVER",
    departmentCode: "SMP-DEP-004",
    lastLoginMinutesAgo: 1180,
  },
  {
    code: "SMP-USR-010",
    email: "divya.rangarajan@example.test",
    name: "Divya Rangarajan",
    phone: "+91 98765 40010",
    roleCode: "DEPARTMENT_OWNER",
    departmentCode: "SMP-DEP-006",
    lastLoginMinutesAgo: 60,
  },
  {
    code: "SMP-USR-011",
    email: "imran.shaikh@example.test",
    name: "Imran Shaikh",
    phone: "+91 98765 40011",
    roleCode: "MANAGEMENT_VIEWER",
    departmentCode: "SMP-DEP-005",
    lastLoginMinutesAgo: 4300,
  },
  {
    code: "SMP-USR-012",
    email: "neha.bhattacharya@example.test",
    name: "Neha Bhattacharya",
    phone: "+91 98765 40012",
    roleCode: "COMPLIANCE_MANAGER",
    departmentCode: "SMP-DEP-002",
    lastLoginMinutesAgo: 700,
  },
] as const;

export const DEMO_UNITS = [
  ["SMP-UNIT-001", "Corporate"],
  ["SMP-UNIT-002", "Life Sciences"],
  ["SMP-UNIT-003", "Healthcare"],
  ["SMP-UNIT-004", "Digital Transformation"],
] as const;

/**
 * The persona who owns every sample risk. Held separate from the role lookup so
 * that reordering or re-roling the roster never reassigns risks that a seeded
 * workspace has already recorded.
 */
export const DEMO_RISK_MANAGER_CODE = "SMP-USR-005";

/** `[code, name, headName]` — heads are drawn from `DEMO_USERS` above. */
export const DEMO_DEPARTMENTS = [
  ["SMP-DEP-001", "Compliance", "Priya Nair"],
  ["SMP-DEP-002", "Quality / QMS", "Neha Bhattacharya"],
  ["SMP-DEP-003", "Human Resources", "Sneha Kulkarni"],
  ["SMP-DEP-004", "Finance", "Arjun Malhotra"],
  ["SMP-DEP-005", "Sales", "Imran Shaikh"],
  ["SMP-DEP-006", "Customer Support", "Divya Rangarajan"],
  ["SMP-DEP-007", "Information Technology", "Karthik Reddy"],
  ["SMP-DEP-008", "Operations", "Meera Joshi"],
] as const;

export const DEMO_LOCATIONS = [
  {
    code: "SMP-LOC-001",
    name: "Thane (India)",
    city: "Thane",
    state: "Maharashtra",
    country: "India",
    type: "Office",
  },
  {
    code: "SMP-LOC-002",
    name: "USA",
    city: null,
    state: null,
    country: "USA",
    type: "Office",
  },
] as const;

/**
 * Canonical framework catalogue for the sample seed.
 *
 * Codes match the client workbook importer (`code === Framework label`) so a
 * workspace that already imported ISO 27001 / GDPR / HIPAA reuses those rows
 * instead of minting a parallel SMP-FRM-* catalogue. The dashboard framework
 * compliance widget and Control Register filter then see a single set.
 *
 * Tuple: `[code, name, preferredVersion]`. When a row with the same code
 * already exists (any version), the seed reuses it and does not invent a
 * second version.
 */
export const DEMO_FRAMEWORKS = [
  ["ISO 9001", "ISO 9001", "2015"],
  ["ISO 27001", "ISO 27001", "2022"],
  ["ISO 14001", "ISO 14001", "2015"],
  ["ISO 45001", "ISO 45001", "2018"],
  ["ISO 22301", "ISO 22301", "2019"],
  ["SA 8000", "SA 8000", "2014"],
  ["HIPAA", "HIPAA", "2013 Omnibus"],
  ["CMMI-SVC", "CMMI-SVC", "V2.0 L3"],
  ["DPDPA", "DPDPA", "2023/2025"],
  ["GDPR", "GDPR", "2016/679"],
  ["SOC 1 & SOC 2", "SOC 1 & SOC 2", "SSAE 18 / TSC 2017"],
  ["ADA / WCAG", "ADA / WCAG", "2.1 AA"],
] as const;

/** Synthetic rule code attached to every sample framework for control mapping. */
export const DEMO_FRAMEWORK_RULE_CODE = "SMP-R1";

export type DemoRiskScenario =
  | "OPEN"
  | "UNDER_REVIEW"
  | "TREATMENT_PLANNED"
  | "TREATMENT_IN_PROGRESS"
  | "CLOSED"
  | "REOPENED";

export interface DemoKpi {
  code: string;
  name: string;
  description: string;
  unit: string;
  direction: KpiDirection;
  frequency: KpiFrequency;
  targetValue: string;
  actualValue: string;
  minValue?: string;
  maxValue?: string;
  expectedRag: "GREEN" | "AMBER" | "RED" | null;
  departmentCode: string;
  unitCode: string;
  riskScenario?: DemoRiskScenario;
  rejectionHistory?: boolean;
}

export const DEMO_KPIS: readonly DemoKpi[] = [
  {
    code: "SMP-KPI-001",
    name: "Customer Satisfaction Index",
    description: "Synthetic customer experience measure for UAT.",
    unit: "%",
    direction: "HIGHER_IS_BETTER",
    frequency: "QUARTERLY",
    targetValue: "85",
    actualValue: "90",
    expectedRag: "GREEN",
    departmentCode: "SMP-DEP-006",
    unitCode: "SMP-UNIT-003",
    rejectionHistory: true,
  },
  {
    code: "SMP-KPI-002",
    name: "Total Revenue",
    description: "Synthetic revenue measure for UAT.",
    unit: "INR Cr",
    direction: "HIGHER_IS_BETTER",
    frequency: "QUARTERLY",
    targetValue: "120",
    actualValue: "116",
    expectedRag: "GREEN",
    departmentCode: "SMP-DEP-004",
    unitCode: "SMP-UNIT-001",
  },
  {
    code: "SMP-KPI-003",
    name: "Revenue Growth Rate",
    description: "Synthetic growth measure for UAT.",
    unit: "%",
    direction: "HIGHER_IS_BETTER",
    frequency: "QUARTERLY",
    targetValue: "18",
    actualValue: "14",
    expectedRag: "RED",
    departmentCode: "SMP-DEP-004",
    unitCode: "SMP-UNIT-001",
    riskScenario: "OPEN",
  },
  {
    code: "SMP-KPI-004",
    name: "Employee Satisfaction Index",
    description: "Synthetic workforce experience measure for UAT.",
    unit: "%",
    direction: "HIGHER_IS_BETTER",
    frequency: "QUARTERLY",
    targetValue: "80",
    actualValue: "75",
    expectedRag: "AMBER",
    departmentCode: "SMP-DEP-003",
    unitCode: "SMP-UNIT-001",
    riskScenario: "UNDER_REVIEW",
  },
  {
    code: "SMP-KPI-005",
    name: "Attrition Rate",
    description: "Synthetic workforce attrition measure for UAT.",
    unit: "%",
    direction: "LOWER_IS_BETTER",
    frequency: "QUARTERLY",
    targetValue: "12",
    actualValue: "12.8",
    expectedRag: "AMBER",
    departmentCode: "SMP-DEP-003",
    unitCode: "SMP-UNIT-001",
    riskScenario: "TREATMENT_PLANNED",
  },
  {
    code: "SMP-KPI-006",
    name: "Response Time to Customer Issues",
    description: "Synthetic customer response-time measure for UAT.",
    unit: "Hours",
    direction: "LOWER_IS_BETTER",
    frequency: "MONTHLY",
    targetValue: "8",
    actualValue: "9",
    expectedRag: "RED",
    departmentCode: "SMP-DEP-006",
    unitCode: "SMP-UNIT-003",
    riskScenario: "TREATMENT_IN_PROGRESS",
  },
  {
    code: "SMP-KPI-007",
    name: "CAPAs Closed Within SLA",
    description: "Synthetic remediation-timeliness measure for UAT.",
    unit: "%",
    direction: "HIGHER_IS_BETTER",
    frequency: "MONTHLY",
    targetValue: "90",
    actualValue: "84",
    expectedRag: "AMBER",
    departmentCode: "SMP-DEP-002",
    unitCode: "SMP-UNIT-002",
    riskScenario: "CLOSED",
  },
  {
    code: "SMP-KPI-008",
    name: "Product Release Variance",
    description: "Synthetic exact-band release timing measure for UAT.",
    unit: "Days",
    direction: "TARGET_EXACT",
    frequency: "PER_EVENT",
    targetValue: "0",
    actualValue: "2",
    minValue: "-1",
    maxValue: "1",
    expectedRag: "RED",
    departmentCode: "SMP-DEP-007",
    unitCode: "SMP-UNIT-004",
    riskScenario: "REOPENED",
  },
  {
    code: "SMP-KPI-009",
    name: "Training Sessions Delivered",
    description: "Synthetic informational activity measure for UAT.",
    unit: "Count",
    direction: "INFORMATIONAL",
    frequency: "MONTHLY",
    targetValue: "0",
    actualValue: "42",
    expectedRag: null,
    departmentCode: "SMP-DEP-003",
    unitCode: "SMP-UNIT-001",
  },
];
