#!/usr/bin/env node

/**
 * Guards against a live, API-connected route silently reverting to
 * PrototypeRoutePage. The router builds its prototype routes from every
 * definition missing from `migratedPaths`, so dropping a path from that set is
 * enough to turn a real screen back into demonstration data without any other
 * visible change.
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
  { path: "/kpi/configuration", component: "KpiConfigurationPage" },
  { path: "/kpi/actual-entry", component: "KpiActualEntryPage" },
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
        `${displayPath(routeDefinitionsPath)} — "${path}" is missing from migratedPaths, so the router would render PrototypeRoutePage for it`,
      );
    }
  }
}

/**
 * Finds the element bound to a router path so a live route cannot be pointed
 * at PrototypeRoutePage while still sitting in migratedPaths.
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
  if (element.includes("PrototypeRoutePage")) {
    failures.push(
      `${displayPath(routerPath)} — "${path}" renders PrototypeRoutePage but must stay live`,
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
  `Live-route guard passed: ${requiredLiveRoutes.length + requiredLiveChildRoutes.length} routes remain API-connected.`,
);
