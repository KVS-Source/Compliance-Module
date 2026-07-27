import type { KpiDirection, KpiFrequency } from "@prisma/client";

export const DEMO_TENANT = {
  code: "DEMO-UAT",
  name: "GenBioCa Demo Organisation",
  industry: "Life Sciences and Healthcare",
  country: "India",
} as const;

export const DEMO_PERMISSIONS = [
  ["*", "All permissions"],
  ["tenants:read", "Read Companies"],
  ["users:read", "Read Company users"],
  ["users:write", "Create and update Company users"],
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
] as const;

export const DEMO_USERS = [
  {
    code: "DEMO-USR-001",
    email: "demo-admin@example.test",
    name: "User 001",
    roleCode: "COMPANY_ADMIN",
    roleName: "Company Admin",
    permissions: ["*"],
    departmentCode: "DEMO-DEP-001",
  },
  {
    code: "DEMO-USR-002",
    email: "demo-compliance@example.test",
    name: "User 002",
    roleCode: "COMPLIANCE_MANAGER",
    roleName: "Compliance Manager",
    permissions: [
      "tenants:read",
      "users:read",
      "organisation:read",
      "frameworks:read",
      "kpis:read",
      "kpi-config:write",
      "kpi-target:write",
      "kpi-target:approve",
      "kpi-actual:approve",
      "risk:read",
      "risk:write",
      "risk:treat",
      "risk:close",
    ],
    departmentCode: "DEMO-DEP-001",
  },
  {
    code: "DEMO-USR-003",
    email: "demo-kpi-owner@example.test",
    name: "User 003",
    roleCode: "KPI_OWNER",
    roleName: "KPI Owner",
    permissions: [
      "organisation:read",
      "frameworks:read",
      "kpis:read",
      "kpi-config:write",
      "kpi-target:write",
      "kpi-actual:write",
      "risk:read",
    ],
    departmentCode: "DEMO-DEP-002",
  },
  {
    code: "DEMO-USR-004",
    email: "demo-kpi-approver@example.test",
    name: "User 004",
    roleCode: "KPI_APPROVER",
    roleName: "KPI Approver",
    permissions: [
      "organisation:read",
      "frameworks:read",
      "kpis:read",
      "kpi-target:approve",
      "kpi-actual:approve",
      "risk:read",
    ],
    departmentCode: "DEMO-DEP-001",
  },
  {
    code: "DEMO-USR-005",
    email: "demo-risk-manager@example.test",
    name: "User 005",
    roleCode: "RISK_MANAGER",
    roleName: "Risk Manager",
    permissions: [
      "users:read",
      "organisation:read",
      "frameworks:read",
      "kpis:read",
      "risk:read",
      "risk:write",
      "risk:treat",
      "risk:close",
    ],
    departmentCode: "DEMO-DEP-001",
  },
  {
    code: "DEMO-USR-006",
    email: "demo-viewer@example.test",
    name: "User 006",
    roleCode: "VIEWER",
    roleName: "Viewer",
    permissions: [
      "tenants:read",
      "users:read",
      "organisation:read",
      "frameworks:read",
      "kpis:read",
      "risk:read",
    ],
    departmentCode: "DEMO-DEP-008",
  },
] as const;

export const DEMO_UNITS = [
  ["DEMO-UNIT-001", "Corporate"],
  ["DEMO-UNIT-002", "Life Sciences"],
  ["DEMO-UNIT-003", "Healthcare"],
  ["DEMO-UNIT-004", "Digital Transformation"],
] as const;

export const DEMO_DEPARTMENTS = [
  ["DEMO-DEP-001", "Compliance"],
  ["DEMO-DEP-002", "Quality / QMS"],
  ["DEMO-DEP-003", "Human Resources"],
  ["DEMO-DEP-004", "Finance"],
  ["DEMO-DEP-005", "Sales"],
  ["DEMO-DEP-006", "Customer Support"],
  ["DEMO-DEP-007", "Information Technology"],
  ["DEMO-DEP-008", "Operations"],
] as const;

export const DEMO_LOCATIONS = [
  {
    code: "DEMO-LOC-001",
    name: "Thane (India)",
    city: "Thane",
    state: "Maharashtra",
    country: "India",
    type: "Office",
  },
  {
    code: "DEMO-LOC-002",
    name: "USA",
    city: null,
    state: null,
    country: "USA",
    type: "Office",
  },
] as const;

export const DEMO_FRAMEWORKS = [
  ["DEMO-FRM-001", "ISO 9001", "2015"],
  ["DEMO-FRM-002", "ISO 27001", "2022"],
  ["DEMO-FRM-003", "ISO 14001", "2015"],
  ["DEMO-FRM-004", "ISO 45001", "2018"],
  ["DEMO-FRM-005", "ISO 22301", "2019"],
  ["DEMO-FRM-006", "SA 8000", "2014"],
  ["DEMO-FRM-007", "HIPAA", "Current"],
  ["DEMO-FRM-008", "CMMI-SVC", "2.2"],
  ["DEMO-FRM-009", "DPDPA", "2023"],
  ["DEMO-FRM-010", "GDPR", "2016/679"],
  ["DEMO-FRM-011", "SOC 1 / SOC 2", "Current"],
  ["DEMO-FRM-012", "ADA / WCAG", "2.2"],
] as const;

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
    code: "DEMO-KPI-001",
    name: "Customer Satisfaction Index",
    description: "Synthetic customer experience measure for UAT.",
    unit: "%",
    direction: "HIGHER_IS_BETTER",
    frequency: "QUARTERLY",
    targetValue: "85",
    actualValue: "90",
    expectedRag: "GREEN",
    departmentCode: "DEMO-DEP-006",
    unitCode: "DEMO-UNIT-003",
    rejectionHistory: true,
  },
  {
    code: "DEMO-KPI-002",
    name: "Total Revenue",
    description: "Synthetic revenue measure for UAT.",
    unit: "INR Cr",
    direction: "HIGHER_IS_BETTER",
    frequency: "QUARTERLY",
    targetValue: "120",
    actualValue: "116",
    expectedRag: "GREEN",
    departmentCode: "DEMO-DEP-004",
    unitCode: "DEMO-UNIT-001",
  },
  {
    code: "DEMO-KPI-003",
    name: "Revenue Growth Rate",
    description: "Synthetic growth measure for UAT.",
    unit: "%",
    direction: "HIGHER_IS_BETTER",
    frequency: "QUARTERLY",
    targetValue: "18",
    actualValue: "14",
    expectedRag: "RED",
    departmentCode: "DEMO-DEP-004",
    unitCode: "DEMO-UNIT-001",
    riskScenario: "OPEN",
  },
  {
    code: "DEMO-KPI-004",
    name: "Employee Satisfaction Index",
    description: "Synthetic workforce experience measure for UAT.",
    unit: "%",
    direction: "HIGHER_IS_BETTER",
    frequency: "QUARTERLY",
    targetValue: "80",
    actualValue: "75",
    expectedRag: "AMBER",
    departmentCode: "DEMO-DEP-003",
    unitCode: "DEMO-UNIT-001",
    riskScenario: "UNDER_REVIEW",
  },
  {
    code: "DEMO-KPI-005",
    name: "Attrition Rate",
    description: "Synthetic workforce attrition measure for UAT.",
    unit: "%",
    direction: "LOWER_IS_BETTER",
    frequency: "QUARTERLY",
    targetValue: "12",
    actualValue: "12.8",
    expectedRag: "AMBER",
    departmentCode: "DEMO-DEP-003",
    unitCode: "DEMO-UNIT-001",
    riskScenario: "TREATMENT_PLANNED",
  },
  {
    code: "DEMO-KPI-006",
    name: "Response Time to Customer Issues",
    description: "Synthetic customer response-time measure for UAT.",
    unit: "Hours",
    direction: "LOWER_IS_BETTER",
    frequency: "MONTHLY",
    targetValue: "8",
    actualValue: "9",
    expectedRag: "RED",
    departmentCode: "DEMO-DEP-006",
    unitCode: "DEMO-UNIT-003",
    riskScenario: "TREATMENT_IN_PROGRESS",
  },
  {
    code: "DEMO-KPI-007",
    name: "CAPAs Closed Within SLA",
    description: "Synthetic remediation-timeliness measure for UAT.",
    unit: "%",
    direction: "HIGHER_IS_BETTER",
    frequency: "MONTHLY",
    targetValue: "90",
    actualValue: "84",
    expectedRag: "AMBER",
    departmentCode: "DEMO-DEP-002",
    unitCode: "DEMO-UNIT-002",
    riskScenario: "CLOSED",
  },
  {
    code: "DEMO-KPI-008",
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
    departmentCode: "DEMO-DEP-007",
    unitCode: "DEMO-UNIT-004",
    riskScenario: "REOPENED",
  },
  {
    code: "DEMO-KPI-009",
    name: "Training Sessions Delivered",
    description: "Synthetic informational activity measure for UAT.",
    unit: "Count",
    direction: "INFORMATIONAL",
    frequency: "MONTHLY",
    targetValue: "0",
    actualValue: "42",
    expectedRag: null,
    departmentCode: "DEMO-DEP-003",
    unitCode: "DEMO-UNIT-001",
  },
];
