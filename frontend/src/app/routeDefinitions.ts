import {
  Archive,
  BadgeCheck,
  Bell,
  BookOpenCheck,
  Building2,
  ChartLine,
  CircleGauge,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileClock,
  FileSearch,
  FileSpreadsheet,
  FileUp,
  Gauge,
  GitMerge,
  History,
  Landmark,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Network,
  NotebookTabs,
  ScanSearch,
  Settings,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SquarePen,
  Target,
  TriangleAlert,
  UploadCloud,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type {
  ModuleStatus,
  NavigationGroup,
  RouteDefinition,
} from "../types/navigation";

type RouteOptions = Partial<
  Pick<
    RouteDefinition,
    | "permission"
    | "api"
    | "statusLabel"
    | "plannedCapabilities"
    | "dependency"
    | "targetMilestone"
    | "backPath"
    | "hidden"
  >
>;

const route = (
  path: string,
  legacyHash: string,
  title: string,
  section: string,
  description: string,
  icon: LucideIcon,
  phase: 1 | 2 | 3 | 4 | 5,
  status: ModuleStatus,
  options: RouteOptions = {},
): RouteDefinition => ({
  id: path.slice(1).replaceAll("/", "."),
  path,
  legacyHash,
  title,
  section,
  description,
  icon,
  phase,
  status,
  ...options,
});

const development = (
  path: string,
  legacyHash: string,
  title: string,
  section: string,
  description: string,
  icon: LucideIcon,
  options: RouteOptions = {},
) =>
  route(path, legacyHash, title, section, description, icon, 4, "IN_DEVELOPMENT", {
    statusLabel: "In Development",
    dependency:
      "Reviewed workflow, API authority and acceptance coverage are still being completed.",
    targetMilestone: "Post-UAT product milestone",
    ...options,
  });

const live = (
  path: string,
  legacyHash: string,
  title: string,
  section: string,
  description: string,
  icon: LucideIcon,
  options: RouteOptions = {},
) => route(path, legacyHash, title, section, description, icon, 1, "LIVE", options);

const navigationRouteDefinitions: RouteDefinition[] = [
  live(
    "/dashboard",
    "#dashboard",
    "Dashboard",
    "Dashboard",
    "Company-scoped KPI, risk, organisation and framework overview.",
    LayoutDashboard,
    { permission: "dashboard:read", api: "GET /dashboard/summary" },
  ),

  live(
    "/admin/companies",
    "#admin/companies",
    "Companies",
    "Administration",
    "Review the companies available to the signed-in user.",
    Building2,
    { permission: "tenants:read", api: "GET /tenants" },
  ),
  live(
    "/admin/users",
    "#admin/users",
    "Users",
    "Administration",
    "Manage Company-scoped user access, roles and account status.",
    Users,
    {
      permission: "users:read",
      api: "GET/POST /users · GET/PATCH /users/:id",
    },
  ),
  live(
    "/admin/departments",
    "#admin/departments",
    "Departments",
    "Administration",
    "Maintain Company-scoped departments and ownership.",
    Network,
    {
      permission: "organisation:read",
      api: "GET/POST /organisation/departments · PATCH /organisation/departments/:id",
    },
  ),
  live(
    "/admin/locations",
    "#admin/locations",
    "Locations",
    "Administration",
    "Maintain Company-scoped operating locations.",
    MapPin,
    {
      permission: "organisation:read",
      api: "GET/POST /organisation/locations · PATCH /organisation/locations/:id",
    },
  ),
  live(
    "/admin/organisation-units",
    "#admin/organisation-units",
    "Organisation Units",
    "Administration",
    "Maintain Company-scoped organisation units.",
    Network,
    {
      permission: "organisation:read",
      api: "GET/POST /organisation/units · PATCH /organisation/units/:id",
    },
  ),

  live(
    "/master/frameworks",
    "#master/frameworks",
    "Frameworks",
    "Frameworks & Rules",
    "Review active compliance frameworks and reference frameworks.",
    Landmark,
    { permission: "frameworks:read", api: "GET /frameworks" },
  ),
  live(
    "/master/framework-rules",
    "#master/framework-rules",
    "Framework Rules",
    "Frameworks & Rules",
    "Choose a framework and review its database-backed rules.",
    ListChecks,
    {
      permission: "frameworks:read",
      api: "GET /frameworks · GET /frameworks/:id/rules",
    },
  ),

  live(
    "/compliance/policy-register",
    "#compliance/policy-register",
    "Policy Register",
    "Policies & Controls",
    "Governed policy records, Version status and review dates.",
    NotebookTabs,
    {
      permission: "policies:read",
      api: "GET/POST /policies · GET/PATCH /policies/:id · Version lifecycle",
    },
  ),
  live(
    "/compliance/controls",
    "#compliance/controls",
    "Controls",
    "Policies & Controls",
    "Control ownership, evidence requirements, mappings and compliance state.",
    Shield,
    {
      permission: "controls:read",
      api: "GET/POST /controls · GET/PATCH /controls/:id · lifecycle and mappings",
    },
  ),
  live(
    "/compliance/checkpoints",
    "#compliance/checkpoints",
    "Checkpoints",
    "Policies & Controls",
    "Recurring control and framework verification checkpoints.",
    ClipboardCheck,
    {
      permission: "checkpoints:read",
      api: "GET/POST /checkpoints · GET/PATCH /checkpoints/:id · Reviews, lifecycle, traceability and audit",
    },
  ),

  live(
    "/kpi/configuration",
    "#kpi/configuration",
    "KPI Configuration",
    "KPI Management",
    "Configure KPI scope, ownership, thresholds and approvals.",
    Settings2,
    {
      permission: "kpis:read",
      api: "GET/POST /kpi-configurations · PATCH/DELETE /kpi-configurations/:id",
    },
  ),
  live(
    "/kpi/targets",
    "#kpi/targets",
    "KPI Targets",
    "KPI Management",
    "Choose a KPI configuration and manage its target lifecycle.",
    Target,
    {
      permission: "kpis:read",
      api: "GET /kpi-configurations · GET/POST /kpi-targets · POST /kpi-targets/:id/submit|approve|reject|versions",
    },
  ),
  live(
    "/kpi/actual-entry",
    "#kpi/actual-entry",
    "KPI Actual Entry",
    "KPI Management",
    "Record KPI performance against an approved target.",
    SquarePen,
    {
      permission: "kpis:read",
      api: "GET /kpi-configurations · GET /kpi-targets · POST /kpi-actuals",
    },
  ),
  live(
    "/kpi/approval",
    "#kpi/approval",
    "KPI Approval",
    "KPI Management",
    "Review submitted KPI actuals and record approval decisions.",
    BadgeCheck,
    {
      permission: "kpis:read",
      api: "GET /kpi-actuals · GET /kpi-actuals/:id · POST /kpi-actuals/:id/approve|reject|resubmit",
    },
  ),

  live(
    "/compliance/risks",
    "#compliance/risks",
    "Risk Register",
    "Risk Management",
    "Review and treat tenant-scoped KPI-linked risks.",
    ShieldAlert,
    { permission: "risk:read", api: "GET /risks · GET /risks/:id" },
  ),

  live(
    "/evidence",
    "#evidence",
    "Evidence Library",
    "Evidence Management",
    "The governed inventory of Company-scoped compliance Evidence.",
    Archive,
    {
      permission: "evidence:read",
      api: "GET /evidence · GET /evidence/:id · PATCH /evidence/:id · Lifecycle, file, review and audit",
    },
  ),
  live(
    "/evidence/new",
    "#evidence/new",
    "Create Evidence",
    "Evidence Management",
    "Register Evidence metadata and upload its validated file.",
    UploadCloud,
    {
      permission: "evidence:write",
      api: "POST /evidence · POST /evidence/:id/file",
    },
  ),
  live(
    "/evidence/review",
    "#evidence/review",
    "Evidence Review",
    "Evidence Management",
    "Human review of Evidence awaiting a decision.",
    ScanSearch,
    {
      permission: "evidence:review",
      api: "GET /evidence/review-queue · POST /evidence/:id/approve|reject",
    },
  ),

  live(
    "/compliance/gaps",
    "#compliance/gaps",
    "Gap Register",
    "Gap & CAPA",
    "Compliance gaps, ownership and remediation state.",
    TriangleAlert,
    { permission: "gaps:read", api: "GET/POST /gaps · GET/PATCH /gaps/:id · owner and closure actions" },
  ),
  live(
    "/compliance/capa",
    "#compliance/capa",
    "CAPA Register",
    "Gap & CAPA",
    "Corrective and preventive action records.",
    Wrench,
    { permission: "capa:read", api: "GET/POST /capas · GET/PATCH /capas/:id · owner and closure actions" },
  ),

  live(
    "/audit-trail",
    "#audit-trail",
    "Audit Trail",
    "Audit & Operations",
    "Searchable tenant-scoped history of governed activity.",
    History,
    {
      permission: "audit:read",
      api: "GET /audit-events · GET /audit-events/:id · GET /audit-events/export.csv",
    },
  ),
  live(
    "/compliance/operational-registers",
    "#compliance/operational-registers",
    "Operational Registers",
    "Audit & Operations",
    "Audit schedule, findings, training, incidents, vendors, privacy, meetings and actions.",
    ClipboardList,
    {
      permission: "registers:read",
      api: "GET /operational-registers · GET /operational-registers/:code/records",
    },
  ),

  live(
    "/data/import",
    "#data/import",
    "Data Import",
    "Data Management",
    "Validated browser import of approved XLSX workbooks and CSV templates.",
    FileSpreadsheet,
    {
      permission: "imports:read",
      api: "POST /imports/workbook/preview · POST /imports/csv/preview · POST /imports/:id/commit",
    },
  ),
  live(
    "/data/import-history",
    "#data/import-history",
    "Import History",
    "Data Management",
    "Auditable history of reviewed data imports.",
    FileClock,
    { permission: "imports:read", api: "GET /imports · GET /imports/:id · GET /imports/:id/errors" },
  ),
  live(
    "/data/genrac-integration",
    "#data/genrac-integration",
    "GenRAC Integration",
    "Data Management",
    "Configuration-driven GenRAC connector status. Live access is not claimed when unconfigured.",
    Database,
    {
      permission: "integrations:read",
      api: "GET /integrations/genrac/status · POST test/preview/sync · GET history",
    },
  ),
];

/**
 * Previously published prototype URLs stay routable, but now resolve to the
 * same truthful status treatment as their replacement rather than fake data.
 * They are intentionally hidden from navigation and global search.
 */
const legacyStatusRoutes: Array<[string, string]> = [
  ["/master/users", "User Master"],
  ["/master/frequencies", "Frequency Master"],
  ["/master/targets", "Target Master"],
  ["/master/customers", "Customer Master"],
  ["/master/controls", "Control Master"],
  ["/master/policies", "Policy Master"],
  ["/master/rules", "Rule Master"],
  ["/compliance/frameworks", "Compliance Frameworks"],
  ["/upload/policy-master", "Policy Master Upload"],
  ["/upload/evidence-master", "Evidence Master Upload"],
  ["/upload/kpi-data", "KPI Data Upload"],
  ["/upload/customer-data", "Customer Data Upload"],
  ["/upload/audit-reports", "Audit Reports Upload"],
  ["/analytics/customers", "Customer Analytics"],
  ["/analytics/kpis", "KPI Analytics"],
  ["/reports/compliance", "Compliance Reports"],
  ["/reports/evidence", "Evidence Reports"],
  ["/reports/audit", "Audit Reports"],
  ["/reports/attribution", "Attribution Reports"],
  ["/reports/deals", "Deals Won / Lost"],
  ["/reports/customer-outcomes", "Customer Won / Lost"],
  ["/settings", "Settings"],
];

const legacyStatusDefinitions: RouteDefinition[] = legacyStatusRoutes.map(
  ([path, title]) =>
  route(
    path,
    `#${path.slice(1)}`,
    title,
    "Scheduled Modules",
    "This preserved route is not enabled for operational use in the UAT release.",
    FileUp,
    4,
    "COMPATIBILITY",
    {
      hidden: true,
      statusLabel: "Compatibility Route",
      plannedCapabilities: [
        "Complete the reviewed domain design",
        "Connect an authorised API",
        "Add acceptance and tenant-isolation coverage",
      ],
      dependency:
        "This previously published URL is retained only for backwards compatibility.",
      targetMilestone: "No operational milestone assigned",
      backPath: "/dashboard",
    },
  ),
);

/** Deferred product routes retained for deep links; hidden from production navigation. */
const deferredRouteDefinitions: RouteDefinition[] = [
  development(
    "/admin/roles",
    "#admin/roles",
    "Roles",
    "Administration",
    "Role and permission administration for the active Company.",
    ShieldCheck,
    {
      hidden: true,
      plannedCapabilities: [
        "Review role permissions",
        "Assign approved permission sets",
        "Audit access-control changes",
      ],
      dependency: "Reviewed role-management APIs and permission policy.",
    },
  ),
  development(
    "/compliance/policy-versions",
    "#compliance/policy-versions",
    "Policy Versions",
    "Policies & Controls",
    "Version history and approval state for governed policies.",
    FileClock,
    { hidden: true },
  ),
  development(
    "/master/kpis",
    "#master/kpis",
    "KPI Catalogue",
    "KPI Management",
    "The governed catalogue of KPI definitions.",
    Gauge,
    { hidden: true },
  ),
  development(
    "/kpi/dashboard",
    "#kpi/dashboard",
    "KPI Dashboard",
    "KPI Management",
    "Detailed KPI trend and performance analysis.",
    ChartLine,
    { hidden: true },
  ),
  development(
    "/kpi/mapping",
    "#kpi/mapping",
    "KPI Mapping",
    "KPI Management",
    "Trace KPI definitions to compliance and risk records.",
    GitMerge,
    { hidden: true },
  ),
  development(
    "/compliance/gaps/review",
    "#compliance/gaps/review",
    "Gap Review",
    "Gap & CAPA",
    "Human review and disposition of compliance gaps.",
    FileSearch,
    { hidden: true },
  ),
  development(
    "/compliance/capa/review",
    "#compliance/capa/review",
    "CAPA Review",
    "Gap & CAPA",
    "Human review of CAPA progress and closure evidence.",
    ClipboardCheck,
    { hidden: true },
  ),
  development(
    "/tasks",
    "#tasks",
    "Tasks",
    "Audit & Operations",
    "Assigned compliance work and due dates.",
    ClipboardList,
    { hidden: true, dependency: "Deferred — no production Task model in this release." },
  ),
  development(
    "/notifications",
    "#notifications",
    "Notifications",
    "Audit & Operations",
    "User notifications for assigned compliance events.",
    Bell,
    { hidden: true, dependency: "Deferred — no production notification channel in this release." },
  ),
  development(
    "/data/upload-errors",
    "#data/upload-errors",
    "Upload Errors",
    "Data Management",
    "Validation errors from reviewed import attempts.",
    FileSearch,
    { hidden: true, dependency: "Errors are available from Import History batch detail." },
  ),
  development(
    "/reports",
    "#reports",
    "Reports",
    "Reports & Analytics",
    "Governed report generation and export.",
    BookOpenCheck,
    { hidden: true },
  ),
  development(
    "/reports/kpi-performance",
    "#reports/kpi-performance",
    "KPI Performance",
    "Reports & Analytics",
    "Period-based KPI performance reporting.",
    ChartLine,
    { hidden: true },
  ),
  development(
    "/reports/risk-summary",
    "#reports/risk-summary",
    "Risk Summary",
    "Reports & Analytics",
    "Tenant-scoped risk distribution and treatment reporting.",
    ShieldAlert,
    { hidden: true },
  ),
  development(
    "/reports/compliance-summary",
    "#reports/compliance-summary",
    "Compliance Summary",
    "Reports & Analytics",
    "Framework, control, gap and evidence summary reporting.",
    CircleGauge,
    { hidden: true },
  ),
  development(
    "/settings/tenant",
    "#settings/tenant",
    "Tenant Settings",
    "Settings",
    "Company-scoped platform preferences and defaults.",
    Settings,
    { hidden: true, dependency: "Deferred — settings polish not completed in this release." },
  ),
  development(
    "/settings/integrations",
    "#settings/integrations",
    "Integration Settings",
    "Settings",
    "Administration of approved external-system connections.",
    Settings2,
    { hidden: true, dependency: "Use GenRAC Integration under Data Management." },
  ),
];

export const routeDefinitions: RouteDefinition[] = [
  ...navigationRouteDefinitions,
  ...deferredRouteDefinitions,
  ...legacyStatusDefinitions,
];

const groups: Array<[string, string, LucideIcon]> = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["administration", "Administration", ShieldCheck],
  ["frameworks", "Frameworks & Rules", Landmark],
  ["policies", "Policies & Controls", BookOpenCheck],
  ["kpi", "KPI Management", Gauge],
  ["risk", "Risk Management", ShieldAlert],
  ["evidence", "Evidence Management", Archive],
  ["gap-capa", "Gap & CAPA", TriangleAlert],
  ["audit-operations", "Audit & Operations", History],
  ["data", "Data Management", Database],
];

export const clientNavigationPaths = new Set([
  "/dashboard",
  "/admin/companies",
  "/admin/users",
  "/admin/departments",
  "/admin/locations",
  "/admin/organisation-units",
  "/master/frameworks",
  "/master/framework-rules",
  "/compliance/policy-register",
  "/compliance/controls",
  "/compliance/checkpoints",
  "/kpi/configuration",
  "/kpi/targets",
  "/kpi/actual-entry",
  "/kpi/approval",
  "/compliance/risks",
  "/evidence",
  "/evidence/new",
  "/evidence/review",
  "/compliance/gaps",
  "/compliance/capa",
  "/audit-trail",
  "/compliance/operational-registers",
  "/data/import",
  "/data/import-history",
  "/data/genrac-integration",
]);

export const navigationGroups: NavigationGroup[] = groups.map(
  ([id, label, icon]) => ({
    id,
    label,
    icon,
    routes: navigationRouteDefinitions.filter(
      (definition) =>
        definition.section === label &&
        clientNavigationPaths.has(definition.path),
    ),
  }),
);

export const utilityRoutes: RouteDefinition[] = [];

export const migratedPaths = new Set([
  "/dashboard",
  "/admin/companies",
  "/admin/users",
  "/admin/departments",
  "/admin/locations",
  "/admin/organisation-units",
  "/master/frameworks",
  "/master/framework-rules",
  "/kpi/configuration",
  "/kpi/targets",
  "/kpi/actual-entry",
  "/kpi/approval",
  "/compliance/risks",
  "/compliance/policy-register",
  "/compliance/controls",
  "/compliance/checkpoints",
  "/compliance/gaps",
  "/compliance/capa",
  "/compliance/operational-registers",
  "/audit-trail",
  "/data/import",
  "/data/import-history",
  "/data/genrac-integration",
  "/evidence",
  "/evidence/new",
  "/evidence/review",
]);

export const routeByPath = new Map(
  routeDefinitions.map((definition) => [definition.path, definition]),
);
