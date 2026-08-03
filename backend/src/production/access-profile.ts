export const PRODUCTION_PERMISSIONS = [
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
  ["evidence:write", "Create and update Company Evidence metadata and links"],
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
  ["dashboard:read", "Read the Company compliance dashboard"],
  ["exports:read", "Export Company records as CSV"],
] as const;

export type ProductionPermissionCode =
  (typeof PRODUCTION_PERMISSIONS)[number][0];

const all = PRODUCTION_PERMISSIONS.map(([code]) => code);
const readOnly = all.filter(
  (code) =>
    code.endsWith(":read") ||
    code === "kpis:read" ||
    code === "frameworks:read" ||
    code === "evidence:download" ||
    code === "exports:read",
);

export const PRODUCTION_ACCESS_PROFILES = {
  CLIENT_COMPANY_ADMINISTRATOR: {
    name: "Client Company Administrator",
    description: "Explicit Company administration and compliance permissions",
    permissions: all,
  },
  COMPLIANCE_MANAGER: {
    name: "Compliance Manager",
    description: "Compliance configuration, workflow and reporting permissions",
    permissions: all.filter((code) => code !== "users:write"),
  },
  DEPARTMENT_OWNER: {
    name: "Department Owner",
    description:
      "Operational contribution without administrative or approval rights",
    permissions: [
      ...readOnly,
      "kpi-actual:write",
      "risk:write",
      "risk:treat",
      "policies:write",
      "policies:submit",
      "controls:write",
      "checkpoints:write",
      "evidence:write",
      "gaps:write",
      "capa:write",
      "registers:write",
    ],
  },
  REVIEWER_APPROVER: {
    name: "Reviewer/Approver",
    description: "Read, review, approval and closure permissions",
    permissions: [
      ...readOnly,
      "kpi-target:approve",
      "kpi-actual:approve",
      "risk:treat",
      "risk:close",
      "policies:approve",
      "checkpoints:review",
      "evidence:review",
      "gaps:close",
      "capa:close",
    ],
  },
  MANAGEMENT_VIEWER: {
    name: "Read-only Management Viewer",
    description: "Read-only management visibility and CSV exports",
    permissions: readOnly,
  },
} as const satisfies Record<
  string,
  {
    name: string;
    description: string;
    permissions: readonly ProductionPermissionCode[];
  }
>;

export type ProductionRoleCode = keyof typeof PRODUCTION_ACCESS_PROFILES;

export const isProductionRoleCode = (
  value: string,
): value is ProductionRoleCode =>
  Object.hasOwn(PRODUCTION_ACCESS_PROFILES, value);
