#!/usr/bin/env node

/**
 * Guards against a live, API-connected route silently reverting to the shared
 * module-status page. The router builds its status routes from every definition
 * missing from `migratedPaths`.
 */

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

const routeDefinitionsPath = resolve(
  repositoryRoot,
  "frontend/src/app/routeDefinitions.ts",
);
const routerPath = resolve(repositoryRoot, "frontend/src/app/router.tsx");

/**
 * Paths that must stay live. Add an entry here whenever a route is migrated
 * from the prototype shell to a real API-connected page.
 */
const requiredLiveRoutes = [
  { path: "/dashboard", component: "DashboardPage" },
  { path: "/admin/users", component: "UsersPage" },
  { path: "/admin/companies", component: "CompaniesPage" },
  { path: "/admin/departments", component: "OrganisationPage" },
  { path: "/admin/locations", component: "OrganisationPage" },
  { path: "/admin/organisation-units", component: "OrganisationPage" },
  { path: "/master/frameworks", component: "FrameworksPage" },
  { path: "/master/framework-rules", component: "FrameworksPage" },
  { path: "/kpi/configuration", component: "KpiConfigurationPage" },
  { path: "/kpi/targets", component: "KpiConfigurationPage" },
  { path: "/kpi/actual-entry", component: "KpiActualEntryPage" },
  { path: "/kpi/approval", component: "KpiApprovalPage" },
  { path: "/compliance/risks", component: "RiskRegisterPage" },
];

/**
 * Live child routes that carry no `routeDefinitions` entry of their own, so
 * they never appear in `migratedPaths`. They are still asserted in the router.
 */
const requiredLiveChildRoutes = [
  {
    path: "kpi/configuration/:configurationId/targets",
    component: "KpiTargetsPage",
  },
  { path: "compliance/risks/:riskId", component: "RiskDetailPage" },
  { path: "master/frameworks/:frameworkId/rules", component: "FrameworkRulesPage" },
];

const approvedClientNavigation = [
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
  "/evidence/register",
  "/evidence/upload",
  "/evidence/review",
  "/evidence/approved",
  "/evidence/rejected",
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
];

const failures = [];
const displayPath = (path) => relative(repositoryRoot, path);

const definitionsSource = readFileSync(routeDefinitionsPath, "utf8");
const routerSource = readFileSync(routerPath, "utf8");

const migratedBlockMatch = definitionsSource.match(
  /export const migratedPaths = new Set\(\[([\s\S]*?)\]\);/,
);

if (!migratedBlockMatch) {
  failures.push(
    `${displayPath(routeDefinitionsPath)} — could not locate the migratedPaths set`,
  );
} else {
  const migrated = new Set(
    [...migratedBlockMatch[1].matchAll(/"([^"]+)"/g)].map(([, path]) => path),
  );
  for (const { path } of requiredLiveRoutes) {
    if (!migrated.has(path)) {
      failures.push(
        `${displayPath(routeDefinitionsPath)} — "${path}" is missing from migratedPaths, so the router would render ModuleStatusPage for it`,
      );
    }
  }
}

const clientNavigationBlockMatch = definitionsSource.match(
  /export const clientNavigationPaths = new Set\(\[([\s\S]*?)\]\);/,
);
if (!clientNavigationBlockMatch) {
  failures.push(
    `${displayPath(routeDefinitionsPath)} — could not locate the clientNavigationPaths set`,
  );
} else {
  const visiblePaths = [
    ...clientNavigationBlockMatch[1].matchAll(/"([^"]+)"/g),
  ].map(([, path]) => path);
  const unexpected = visiblePaths.filter(
    (path) => !approvedClientNavigation.includes(path),
  );
  const missing = approvedClientNavigation.filter(
    (path) => !visiblePaths.includes(path),
  );
  if (unexpected.length > 0) {
    failures.push(
      `${displayPath(routeDefinitionsPath)} — UAT navigation exposes unapproved routes: ${unexpected.join(", ")}`,
    );
  }
  if (missing.length > 0) {
    failures.push(
      `${displayPath(routeDefinitionsPath)} — UAT navigation is missing approved routes: ${missing.join(", ")}`,
    );
  }
  if (new Set(visiblePaths).size !== visiblePaths.length) {
    failures.push(
      `${displayPath(routeDefinitionsPath)} — UAT navigation contains duplicate paths`,
    );
  }
}

/**
 * Finds the element bound to a router path so a live route cannot be pointed
 * at ModuleStatusPage while still sitting in migratedPaths.
 */
const elementForPath = (routerPathValue) => {
  const escaped = routerPathValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = routerSource.match(
    new RegExp(`path:\\s*"${escaped}"\\s*,\\s*element:\\s*\\(([\\s\\S]*?)\\n\\s*\\),`),
  );
  if (match) return match[1];
  const inline = routerSource.match(
    new RegExp(`path:\\s*"${escaped}"\\s*,\\s*element:\\s*(<[^\\n]*?)\\s*\\}`),
  );
  return inline ? inline[1] : null;
};

for (const { path, component } of [
  ...requiredLiveRoutes.map(({ path, component }) => ({
    path: path.slice(1),
    component,
  })),
  ...requiredLiveChildRoutes,
]) {
  const element = elementForPath(path);
  if (element === null) {
    failures.push(
      `${displayPath(routerPath)} — no route element found for "${path}"`,
    );
    continue;
  }
  if (
    element.includes("PrototypeRoutePage") ||
    element.includes("ModuleStatusPage")
  ) {
    failures.push(
      `${displayPath(routerPath)} — "${path}" renders a non-operational status page but must stay live`,
    );
  }
  if (!element.includes(`<${component}`)) {
    failures.push(
      `${displayPath(routerPath)} — "${path}" no longer renders ${component}`,
    );
  }
}

if (failures.length > 0) {
  console.error("Live-route guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Live-route guard passed: ${requiredLiveRoutes.length + requiredLiveChildRoutes.length} routes remain API-connected and ${approvedClientNavigation.length} approved UAT routes are visible.`,
);
