import {
  Archive,
  BadgeCheck,
  Bell,
  BookOpenCheck,
  Building2,
  ChartLine,
  CircleCheck,
  CircleGauge,
  CircleSlash,
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
  KeyRound,
  Landmark,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Network,
  NotebookTabs,
  Repeat,
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

/**
 * The submission navigation.
 *
 * Every entry here is LIVE: it loads, reads a real API for the authenticated
 * Company and is permission-protected. Several Master Data entries are
 * deliberately the same page as their operational counterpart under a name the
 * client uses — Target Master is KPI Targets, Rule Master is Framework Rules —
 * because a second implementation of the same register is a second thing to
 * keep correct, not a feature.
 */
const navigationRouteDefinitions: RouteDefinition[] = [
  live(
    "/dashboard",
    "#dashboard",
    "Dashboard",
    "Overview",
    "Live Company-scoped compliance, KPI, Evidence and Risk analytics.",
    LayoutDashboard,
    { permission: "dashboard:read", api: "GET /dashboard/summary" },
  ),

  live(
    "/my-work",
    "#my-work",
    "My work",
    "Overview",
    "Your open gaps, CAPAs, risks, evidence review and KPI approvals.",
    ListChecks,
    {
      permission: "dashboard:read",
      api: "GET /gaps · GET /capas · GET /risks · GET /evidence/review-queue · GET /kpi-actuals",
    },
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
    "/admin/roles",
    "#admin/roles",
    "Role & Access",
    "Administration",
    "Read-only matrix of production access profiles, permissions and user counts.",
    ShieldCheck,
    { permission: "users:read", api: "GET /access/profiles" },
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
    "/master/users",
    "#master/users",
    "User Master",
    "Master Data",
    "The Company user register. The same governed records as Users.",
    Users,
    { permission: "users:read", api: "GET /users" },
  ),
  live(
    "/master/frequencies",
    "#master/frequencies",
    "Frequency Master",
    "Master Data",
    "Measurement frequencies in use across the KPI catalogue.",
    Repeat,
    { permission: "kpis:read", api: "GET /kpis/frequencies" },
  ),
  live(
    "/master/targets",
    "#master/targets",
    "Target Master",
    "Master Data",
    "KPI target lifecycle by configuration. The same records as KPI Targets.",
    Target,
    { permission: "kpis:read", api: "GET /kpi-configurations · GET /kpi-targets" },
  ),
  live(
    "/master/frameworks",
    "#master/frameworks",
    "Framework Master",
    "Master Data",
    "Active compliance frameworks and reference frameworks.",
    Landmark,
    { permission: "frameworks:read", api: "GET /frameworks" },
  ),
  live(
    "/master/rules",
    "#master/rules",
    "Rule Master",
    "Master Data",
    "Framework rules — the regulatory requirements Controls implement.",
    ListChecks,
    {
      permission: "frameworks:read",
      api: "GET /frameworks · GET /frameworks/:id/rules",
    },
  ),
  live(
    "/master/policies",
    "#master/policies",
    "Policy Master",
    "Master Data",
    "Governed policy records. The same register as Policy Register.",
    NotebookTabs,
    { permission: "policies:read", api: "GET /policies" },
  ),
  live(
    "/master/controls",
    "#master/controls",
    "Control Master",
    "Master Data",
    "Company control implementations. The same register as Controls.",
    Shield,
    { permission: "controls:read", api: "GET /controls" },
  ),
  live(
    "/master/kpis",
    "#master/kpis",
    "KPI Master",
    "Master Data",
    "The governed catalogue of KPI definitions.",
    Gauge,
    { permission: "kpis:read", api: "GET /kpis/catalogue" },
  ),

  live(
    "/kpi/catalogue",
    "#kpi/catalogue",
    "KPI Catalogue",
    "KPI Management",
    "KPI definitions with unit, frequency, direction and this Company's configuration state.",
    ListChecks,
    { permission: "kpis:read", api: "GET /kpis/catalogue" },
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
    "/kpi/analytics",
    "#kpi/analytics",
    "KPI Analytics",
    "KPI Management",
    "Achievement, RAG and department analysis over measured KPI actuals.",
    ChartLine,
    { permission: "kpis:read", api: "GET /kpis/analytics" },
  ),

  live(
    "/compliance/frameworks",
    "#compliance/frameworks",
    "Frameworks",
    "Compliance Management",
    "Review active compliance frameworks and reference frameworks.",
    Landmark,
    { permission: "frameworks:read", api: "GET /frameworks" },
  ),
  live(
    "/compliance/controls",
    "#compliance/controls",
    "Controls",
    "Compliance Management",
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
    "Compliance Management",
    "Recurring control and framework verification checkpoints.",
    ClipboardCheck,
    {
      permission: "checkpoints:read",
      api: "GET/POST /checkpoints · GET/PATCH /checkpoints/:id · Reviews, lifecycle, traceability and audit",
    },
  ),
  live(
    "/compliance/policy-register",
    "#compliance/policy-register",
    "Policy Register",
    "Compliance Management",
    "Governed policy records, Version status and review dates.",
    NotebookTabs,
    {
      permission: "policies:read",
      api: "GET/POST /policies · GET/PATCH /policies/:id · Version lifecycle",
    },
  ),
  live(
    "/compliance/risks",
    "#compliance/risks",
    "Risk Register",
    "Compliance Management",
    "Review and treat tenant-scoped KPI-linked and enterprise risks.",
    ShieldAlert,
    { permission: "risk:read", api: "GET /risks · GET /risks/:id" },
  ),
  live(
    "/compliance/gaps",
    "#compliance/gaps",
    "Gap Register",
    "Compliance Management",
    "Compliance gaps, ownership and remediation state.",
    TriangleAlert,
    {
      permission: "gaps:read",
      api: "GET/POST /gaps · GET/PATCH /gaps/:id · owner and closure actions",
    },
  ),
  live(
    "/compliance/capa",
    "#compliance/capa",
    "CAPA Register",
    "Compliance Management",
    "Corrective and preventive action records.",
    Wrench,
    {
      permission: "capa:read",
      api: "GET/POST /capas · GET/PATCH /capas/:id · owner and closure actions",
    },
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
    "/evidence/approved",
    "#evidence/approved",
    "Approved Evidence",
    "Evidence Management",
    "The Evidence Library with the Approved lifecycle status pinned.",
    CircleCheck,
    { permission: "evidence:read", api: "GET /evidence?lifecycleStatus=APPROVED" },
  ),
  live(
    "/evidence/rejected",
    "#evidence/rejected",
    "Rejected Evidence",
    "Evidence Management",
    "The Evidence Library with the Rejected lifecycle status pinned.",
    CircleSlash,
    { permission: "evidence:read", api: "GET /evidence?lifecycleStatus=REJECTED" },
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
    {
      permission: "imports:read",
      api: "GET /imports · GET /imports/:id · GET /imports/:id/errors",
    },
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

  live(
    "/audit-trail",
    "#audit-trail",
    "Audit Trail",
    "Audit & Reporting",
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
    "Audit & Reporting",
    "Audit schedule, findings, training, incidents, vendors, privacy, meetings and actions.",
    ClipboardList,
    {
      permission: "registers:read",
      api: "GET /operational-registers · GET /operational-registers/:code/records",
    },
  ),
  live(
    "/reports",
    "#reports",
    "Report Hub",
    "Audit & Reporting",
    "Tenant-scoped reports with filters, tables, charts and safe CSV export.",
    BookOpenCheck,
    { permission: "dashboard:read", api: "GET /reports" },
  ),
  live(
    "/reports/kpi-variance",
    "#reports/kpi-variance",
    "KPI Reports",
    "Audit & Reporting",
    "KPI variance and achievement by reporting period.",
    ChartLine,
    { permission: "kpis:read", api: "GET /reports/kpi-variance" },
  ),
  live(
    "/reports/framework-compliance",
    "#reports/framework-compliance",
    "Compliance Reports",
    "Audit & Reporting",
    "Framework compliance from mapped and implemented Controls.",
    CircleGauge,
    {
      permission: "controls:read",
      api: "GET /reports/framework-compliance",
    },
  ),
  live(
    "/reports/evidence-status",
    "#reports/evidence-status",
    "Evidence Reports",
    "Audit & Reporting",
    "Evidence status distribution and aging.",
    FileSearch,
    { permission: "evidence:read", api: "GET /reports/evidence-status" },
  ),
  live(
    "/reports/gaps",
    "#reports/gaps",
    "Risk / Gap / CAPA Reports",
    "Audit & Reporting",
    "Gap, Risk and CAPA reporting with severity, ownership and aging.",
    TriangleAlert,
    {
      permission: "gaps:read",
      api: "GET /reports/gaps · /reports/risks · /reports/capa-aging",
    },
  ),
  live(
    "/reports/audit-activity",
    "#reports/audit-activity",
    "Audit Reports",
    "Audit & Reporting",
    "Governed activity from the append-only audit trail.",
    History,
    { permission: "audit:read", api: "GET /reports/audit-activity" },
  ),
];

/**
 * Previously published prototype URLs stay routable, but now resolve to the
 * same truthful status treatment as their replacement rather than fake data.
 * They are intentionally hidden from navigation and global search.
 */
const legacyStatusRoutes: Array<[string, string]> = [
  ["/master/customers", "Customer Master"],
  ["/master/framework-rules", "Framework Rules"],
  ["/compliance/policy-versions", "Policy Versions"],
  ["/upload/policy-master", "Policy Master Upload"],
  ["/upload/evidence-master", "Evidence Master Upload"],
  ["/upload/kpi-data", "KPI Data Upload"],
  ["/upload/customer-data", "Customer Data Upload"],
  ["/upload/audit-reports", "Audit Reports Upload"],
  ["/analytics/customers", "Customer Analytics"],
  ["/analytics/kpis", "KPI Analytics"],
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
    "/kpi/dashboard",
    "#kpi/dashboard",
    "KPI Dashboard",
    "KPI Management",
    "Superseded by KPI Analytics.",
    ChartLine,
    { hidden: true, dependency: "Use KPI Analytics under KPI Management." },
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
    "Compliance Management",
    "Human review and disposition of compliance gaps.",
    FileSearch,
    { hidden: true },
  ),
  development(
    "/compliance/capa/review",
    "#compliance/capa/review",
    "CAPA Review",
    "Compliance Management",
    "Human review of CAPA progress and closure evidence.",
    ClipboardCheck,
    { hidden: true },
  ),
  development(
    "/tasks",
    "#tasks",
    "Tasks",
    "Audit & Reporting",
    "Assigned compliance work and due dates.",
    ClipboardList,
    {
      hidden: true,
      dependency: "Deferred — no production Task model in this release.",
    },
  ),
  development(
    "/notifications",
    "#notifications",
    "Notifications",
    "Audit & Reporting",
    "User notifications for assigned compliance events.",
    Bell,
    {
      hidden: true,
      dependency:
        "Deferred — no production notification channel in this release.",
    },
  ),
  development(
    "/data/upload-errors",
    "#data/upload-errors",
    "Upload Errors",
    "Data Management",
    "Validation errors from reviewed import attempts.",
    FileSearch,
    {
      hidden: true,
      dependency: "Errors are available from Import History batch detail.",
    },
  ),
  development(
    "/settings/tenant",
    "#settings/tenant",
    "Tenant Settings",
    "Settings",
    "Company-scoped platform preferences and defaults.",
    Settings,
    {
      hidden: true,
      dependency: "Deferred — settings polish not completed in this release.",
    },
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
  ["overview", "Overview", LayoutDashboard],
  ["administration", "Administration", ShieldCheck],
  ["master-data", "Master Data", Database],
  ["kpi", "KPI Management", Gauge],
  ["compliance", "Compliance Management", Landmark],
  ["evidence", "Evidence Management", Archive],
  ["data", "Data Management", FileSpreadsheet],
  ["audit-reporting", "Audit & Reporting", BookOpenCheck],
];

export const clientNavigationPaths = new Set([
  "/dashboard",
  "/my-work",
  "/admin/companies",
  "/admin/users",
  "/admin/roles",
  "/admin/departments",
  "/admin/locations",
  "/admin/organisation-units",
  "/master/users",
  "/master/frequencies",
  "/master/targets",
  "/master/frameworks",
  "/master/rules",
  "/master/policies",
  "/master/controls",
  "/master/kpis",
  "/kpi/catalogue",
  "/kpi/configuration",
  "/kpi/targets",
  "/kpi/actual-entry",
  "/kpi/approval",
  "/kpi/analytics",
  "/compliance/frameworks",
  "/compliance/controls",
  "/compliance/checkpoints",
  "/compliance/policy-register",
  "/compliance/risks",
  "/compliance/gaps",
  "/compliance/capa",
  "/evidence",
  "/evidence/new",
  "/evidence/review",
  "/evidence/approved",
  "/evidence/rejected",
  "/data/import",
  "/data/import-history",
  "/data/genrac-integration",
  "/audit-trail",
  "/compliance/operational-registers",
  "/reports",
  "/reports/kpi-variance",
  "/reports/framework-compliance",
  "/reports/evidence-status",
  "/reports/gaps",
  "/reports/audit-activity",
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

/**
 * LIVE routes reached from the Topbar account menu rather than the sidebar.
 * They are deliberately absent from `navigationGroups`, `clientNavigationPaths`
 * and `utilityRoutes` (which the sidebar footer renders), so the sidebar
 * contract asserted by the navigation specs is unchanged.
 */
export const accountRouteDefinitions: RouteDefinition[] = [
  live(
    "/account/change-password",
    "#account/change-password",
    "Change Password",
    "Account",
    "Change your own password. Signs every session out once it succeeds.",
    KeyRound,
    { api: "POST /api/v1/auth/change-password" },
  ),
];

export const migratedPaths = new Set([
  "/account/change-password",
  "/dashboard",
  "/my-work",
  "/admin/companies",
  "/admin/users",
  "/admin/roles",
  "/admin/departments",
  "/admin/locations",
  "/admin/organisation-units",
  "/master/users",
  "/master/frequencies",
  "/master/targets",
  "/master/frameworks",
  "/master/rules",
  "/master/policies",
  "/master/controls",
  "/master/kpis",
  "/kpi/catalogue",
  "/kpi/configuration",
  "/kpi/targets",
  "/kpi/actual-entry",
  "/kpi/approval",
  "/kpi/analytics",
  "/compliance/frameworks",
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
  "/evidence/approved",
  "/evidence/rejected",
  "/reports",
  "/reports/kpi-variance",
  "/reports/framework-compliance",
  "/reports/evidence-status",
  "/reports/gaps",
  "/reports/audit-activity",
]);

export const routeByPath = new Map(
  routeDefinitions.map((definition) => [definition.path, definition]),
);
