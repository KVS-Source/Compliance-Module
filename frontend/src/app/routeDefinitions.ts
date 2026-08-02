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
  development(
    "/admin/roles",
    "#admin/roles",
    "Roles",
    "Administration",
    "Role and permission administration for the active Company.",
    ShieldCheck,
    {
      plannedCapabilities: [
        "Review role permissions",
        "Assign approved permission sets",
        "Audit access-control changes",
      ],
      dependency: "Reviewed role-management APIs and permission policy.",
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
  development(
    "/compliance/policy-versions",
    "#compliance/policy-versions",
    "Policy Versions",
    "Policies & Controls",
    "Version history and approval state for governed policies.",
    FileClock,
    {
      plannedCapabilities: [
        "Create immutable policy versions",
        "Review approval history",
        "Compare superseded content",
      ],
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

  development(
    "/master/kpis",
    "#master/kpis",
    "KPI Catalogue",
    "KPI Management",
    "The governed catalogue of KPI definitions.",
    Gauge,
    {
      plannedCapabilities: [
        "Browse governed KPI definitions",
        "Maintain calculation metadata",
        "Retire superseded definitions",
      ],
      dependency: "Reviewed KPI definition write workflow.",
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
  development(
    "/kpi/dashboard",
    "#kpi/dashboard",
    "KPI Dashboard",
    "KPI Management",
    "Detailed KPI trend and performance analysis.",
    ChartLine,
    {
      plannedCapabilities: [
        "Analyse KPI trends by period",
        "Compare actuals with approved targets",
        "Filter performance by organisation scope",
      ],
      dependency: "Reviewed analytical read models and reporting acceptance criteria.",
    },
  ),
  development(
    "/kpi/mapping",
    "#kpi/mapping",
    "KPI Mapping",
    "KPI Management",
    "Trace KPI definitions to compliance and risk records.",
    GitMerge,
    {
      plannedCapabilities: [
        "Map KPIs to frameworks and controls",
        "Review traceability coverage",
        "Audit mapping changes",
      ],
      dependency: "The reviewed KPI mapping domain is not yet implemented.",
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
  development(
    "/compliance/gaps/review",
    "#compliance/gaps/review",
    "Gap Review",
    "Gap & CAPA",
    "Human review and disposition of compliance gaps.",
    FileSearch,
    {
      plannedCapabilities: [
        "Review gap severity",
        "Record disposition decisions",
        "Escalate accepted gaps to CAPA",
      ],
    },
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
  development(
    "/compliance/capa/review",
    "#compliance/capa/review",
    "CAPA Review",
    "Gap & CAPA",
    "Human review of CAPA progress and closure evidence.",
    ClipboardCheck,
    {
      plannedCapabilities: [
        "Review CAPA completion",
        "Verify closure evidence",
        "Record append-only decisions",
      ],
    },
  ),

  development(
    "/audit-trail",
    "#audit-trail",
    "Audit Trail",
    "Audit & Operations",
    "Searchable tenant-scoped history of governed activity.",
    History,
    {
      plannedCapabilities: [
        "Search immutable audit events",
        "Filter by actor and record",
        "Export reviewed audit history",
      ],
      dependency: "Reviewed audit-query API and export controls.",
    },
  ),
  development(
    "/tasks",
    "#tasks",
    "Tasks",
    "Audit & Operations",
    "Assigned compliance work and due dates.",
    ClipboardList,
    {
      plannedCapabilities: [
        "Review assigned work",
        "Track due dates and status",
        "Navigate to governed source records",
      ],
    },
  ),
  development(
    "/notifications",
    "#notifications",
    "Notifications",
    "Audit & Operations",
    "User notifications for assigned compliance events.",
    Bell,
    {
      plannedCapabilities: [
        "Review workflow notifications",
        "Mark notifications as read",
        "Configure delivery preferences",
      ],
    },
  ),

  development(
    "/data/import",
    "#data/import",
    "CSV/XLSX Import",
    "Data Management",
    "Validated import of approved data templates.",
    FileSpreadsheet,
    {
      plannedCapabilities: [
        "Upload approved CSV and XLSX templates",
        "Validate records before import",
        "Confirm reviewed imports",
      ],
      dependency: "Reviewed template contracts and safe import transaction design.",
    },
  ),
  development(
    "/data/import-history",
    "#data/import-history",
    "Import History",
    "Data Management",
    "Auditable history of reviewed data imports.",
    FileClock,
    {
      plannedCapabilities: [
        "Review prior import jobs",
        "Inspect accepted and rejected counts",
        "Navigate to import audit events",
      ],
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
      plannedCapabilities: [
        "Review row-level validation errors",
        "Download correction reports",
        "Retry corrected imports",
      ],
    },
  ),
  route(
    "/data/genrac-integration",
    "#data/genrac-integration",
    "GenRAC Integration",
    "Data Management",
    "Planned read-only access to selected GenRAC master data.",
    Database,
    4,
    "AWAITING_INTEGRATION",
    {
      statusLabel: "Awaiting GenRAC Access",
      plannedCapabilities: [
        "Read selected master data from GenRAC",
        "Keep the integration one-way and read-only",
        "Support an independently reviewed manual or CSV path",
      ],
      dependency:
        "Client access, interface documentation and connectivity approval are pending. No live connection is configured.",
      targetMilestone: "After client GenRAC access is available and reviewed",
    },
  ),

  development(
    "/reports",
    "#reports",
    "Reports",
    "Reports & Analytics",
    "Governed report generation and export.",
    BookOpenCheck,
    {
      plannedCapabilities: [
        "Generate tenant-scoped reports",
        "Apply reviewed filters",
        "Export authorised report formats",
      ],
      dependency: "Reviewed report definitions and export controls.",
    },
  ),
  development(
    "/reports/kpi-performance",
    "#reports/kpi-performance",
    "KPI Performance",
    "Reports & Analytics",
    "Period-based KPI performance reporting.",
    ChartLine,
    {
      plannedCapabilities: [
        "Report target-versus-actual performance",
        "Summarise RAG outcomes",
        "Filter by period and organisation scope",
      ],
    },
  ),
  development(
    "/reports/risk-summary",
    "#reports/risk-summary",
    "Risk Summary",
    "Reports & Analytics",
    "Tenant-scoped risk distribution and treatment reporting.",
    ShieldAlert,
    {
      plannedCapabilities: [
        "Summarise risk level and status",
        "Report treatment progress",
        "Trace KPI-linked risk sources",
      ],
    },
  ),
  development(
    "/reports/compliance-summary",
    "#reports/compliance-summary",
    "Compliance Summary",
    "Reports & Analytics",
    "Framework, control, gap and evidence summary reporting.",
    CircleGauge,
    {
      plannedCapabilities: [
        "Summarise compliance coverage",
        "Report open gaps and CAPAs",
        "Trace supporting evidence",
      ],
      dependency:
        "The underlying policies, controls, gaps, CAPA and evidence modules must be implemented first.",
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
      plannedCapabilities: [
        "Configure tenant defaults",
        "Review security preferences",
        "Audit settings changes",
      ],
      dependency: "Reviewed tenant-settings schema and permission policy.",
    },
  ),
  development(
    "/settings/integrations",
    "#settings/integrations",
    "Integration Settings",
    "Settings",
    "Administration of approved external-system connections.",
    Settings2,
    {
      plannedCapabilities: [
        "Review configured integrations",
        "Manage non-secret connection metadata",
        "Audit integration settings changes",
      ],
      dependency:
        "Reviewed integration configuration and secret-management design.",
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

export const routeDefinitions: RouteDefinition[] = [
  ...navigationRouteDefinitions,
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
  ["reports", "Reports & Analytics", ChartLine],
  ["settings", "Settings", Settings],
];

export const clientNavigationPaths = new Set([
  "/dashboard",
  "/admin/companies",
  "/admin/users",
  "/admin/roles",
  "/admin/departments",
  "/admin/locations",
  "/admin/organisation-units",
  "/master/frameworks",
  "/master/framework-rules",
  "/compliance/policy-register",
  "/compliance/policy-versions",
  "/compliance/controls",
  "/compliance/checkpoints",
  "/master/kpis",
  "/kpi/configuration",
  "/kpi/targets",
  "/kpi/actual-entry",
  "/kpi/approval",
  "/kpi/dashboard",
  "/kpi/mapping",
  "/compliance/risks",
  "/evidence",
  "/evidence/new",
  "/evidence/review",
  "/compliance/gaps",
  "/compliance/gaps/review",
  "/compliance/capa",
  "/compliance/capa/review",
  "/audit-trail",
  "/tasks",
  "/notifications",
  "/data/import",
  "/data/import-history",
  "/data/upload-errors",
  "/data/genrac-integration",
  "/reports",
  "/reports/kpi-performance",
  "/reports/risk-summary",
  "/reports/compliance-summary",
  "/settings/tenant",
  "/settings/integrations",
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
  "/evidence",
  "/evidence/new",
  "/evidence/review",
]);

export const routeByPath = new Map(
  routeDefinitions.map((definition) => [definition.path, definition]),
);
