#!/usr/bin/env node

/**
 * Guards against a live, API-connected route silently reverting to the shared
 * module-status page. The router builds its status routes from every definition
 * missing from `migratedPaths`.
 */

import { existsSync, readFileSync } from "node:fs";
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
  { path: "/compliance/policy-register", component: "PolicyRegisterPage" },
  { path: "/compliance/controls", component: "ControlRegisterPage" },
  { path: "/compliance/checkpoints", component: "CheckpointRegisterPage" },
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
  {
    path: "compliance/policies/:policyId",
    component: "PolicyDetailPage",
  },
  {
    path: "compliance/controls/:controlId",
    component: "ControlDetailPage",
  },
  {
    path: "compliance/checkpoints/:checkpointId",
    component: "CheckpointDetailPage",
  },
  { path: "master/frameworks/:frameworkId/rules", component: "FrameworkRulesPage" },
];

const failures = [];
const displayPath = (path) => relative(repositoryRoot, path);

const definitionsSource = readFileSync(routeDefinitionsPath, "utf8");
const routerSource = readFileSync(routerPath, "utf8");
const prototypePagePath = resolve(
  repositoryRoot,
  "frontend/src/features/prototype/PrototypeRoutePage.tsx",
);
const prototypeDataPath = resolve(
  repositoryRoot,
  "frontend/src/features/prototype/prototypeRouteData.ts",
);

const block = (start, end) => {
  const match = definitionsSource.match(
    new RegExp(`${start}([\\s\\S]*?)${end}`),
  );
  return match?.[1] ?? null;
};

const pathsFrom = (source) =>
  [...source.matchAll(/"((?:\\.|[^"])*)"/g)]
    .map(([, value]) => value)
    .filter((value) => value.startsWith("/"));

const navigationBlock = block(
  "const navigationRouteDefinitions: RouteDefinition\\[\\] = \\[",
  "\\n\\];\\n\\n/\\*\\*\\n \\* Previously published",
);
const compatibilityBlock = block(
  "const legacyStatusRoutes: Array<\\[string, string\\]> = \\[",
  "\\n\\];",
);
const clientPathsBlock = block(
  "export const clientNavigationPaths = new Set\\(\\[",
  "\\n\\]\\);",
);
const migratedPathsBlock = block(
  "export const migratedPaths = new Set\\(\\[",
  "\\n\\]\\);",
);

if (
  navigationBlock === null ||
  compatibilityBlock === null ||
  clientPathsBlock === null ||
  migratedPathsBlock === null
) {
  failures.push(
    `${displayPath(routeDefinitionsPath)} — could not parse authoritative route metadata blocks`,
  );
}

const navigationDefinitionPaths = navigationBlock
  ? [
      ...navigationBlock.matchAll(
        /(?:live|development|route)\(\s*"([^"]+)"/g,
      ),
    ].map(([, path]) => path)
  : [];
const compatibilityPaths = compatibilityBlock
  ? [...compatibilityBlock.matchAll(/\["([^"]+)",\s*"[^"]+"\]/g)].map(
      ([, path]) => path,
    )
  : [];
const visiblePaths = clientPathsBlock ? pathsFrom(clientPathsBlock) : [];
const migratedPaths = migratedPathsBlock ? pathsFrom(migratedPathsBlock) : [];

const duplicateValues = (values) =>
  [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const routeId = (path) => path.slice(1).replaceAll("/", ".");

for (const duplicate of duplicateValues([
  ...navigationDefinitionPaths,
  ...compatibilityPaths,
])) {
  failures.push(
    `${displayPath(routeDefinitionsPath)} — duplicate route path "${duplicate}"`,
  );
}
for (const duplicate of duplicateValues(
  [...navigationDefinitionPaths, ...compatibilityPaths].map(routeId),
)) {
  failures.push(
    `${displayPath(routeDefinitionsPath)} — duplicate route ID "${duplicate}"`,
  );
}
for (const duplicate of duplicateValues(visiblePaths)) {
  failures.push(
    `${displayPath(routeDefinitionsPath)} — duplicate visible navigation path "${duplicate}"`,
  );
}

for (const path of visiblePaths) {
  if (!navigationDefinitionPaths.includes(path)) {
    failures.push(
      `${displayPath(routeDefinitionsPath)} — visible navigation path "${path}" has no route definition`,
    );
  }
}
for (const path of navigationDefinitionPaths) {
  if (!visiblePaths.includes(path)) {
    failures.push(
      `${displayPath(routeDefinitionsPath)} — visible route definition "${path}" is missing from navigation`,
    );
  }
}

if (migratedPathsBlock !== null) {
  const migrated = new Set(migratedPaths);
  for (const { path } of requiredLiveRoutes) {
    if (!migrated.has(path)) {
      failures.push(
        `${displayPath(routeDefinitionsPath)} — "${path}" is missing from migratedPaths, so the router would render ModuleStatusPage for it`,
      );
    }
  }
}

const statusCounts = {
  LIVE: (navigationBlock?.match(/\blive\(/g) ?? []).length,
  IN_DEVELOPMENT: (navigationBlock?.match(/\bdevelopment\(/g) ?? []).length,
  AWAITING_INTEGRATION:
    (navigationBlock?.match(/"AWAITING_INTEGRATION"/g) ?? []).length,
  COMPATIBILITY: compatibilityPaths.length,
};
const protectedLivePatterns =
  statusCounts.LIVE + requiredLiveChildRoutes.length;
if (
  protectedLivePatterns !== 22 ||
  statusCounts.IN_DEVELOPMENT !== 26 ||
  statusCounts.AWAITING_INTEGRATION !== 1 ||
  statusCounts.COMPATIBILITY !== 22 ||
  visiblePaths.length !== 43
) {
  failures.push(
    `${displayPath(routeDefinitionsPath)} — expected 22 protected LIVE route patterns, 26 visible IN_DEVELOPMENT routes, 1 AWAITING_INTEGRATION route, 22 hidden COMPATIBILITY routes and 43 visible navigation routes; found ${JSON.stringify(statusCounts)}, ${visiblePaths.length} visible, ${protectedLivePatterns} protected LIVE patterns`,
  );
}

for (const path of compatibilityPaths) {
  if (visiblePaths.includes(path) || migratedPaths.includes(path)) {
    failures.push(
      `${displayPath(routeDefinitionsPath)} — compatibility route "${path}" must remain hidden and non-live`,
    );
  }
}

if (
  !definitionsSource.includes('"COMPATIBILITY"') ||
  !definitionsSource.includes("hidden: true")
) {
  failures.push(
    `${displayPath(routeDefinitionsPath)} — compatibility routes lack explicit hidden compatibility metadata`,
  );
}
if (
  !definitionsSource.includes('"AWAITING_INTEGRATION"') ||
  !definitionsSource.includes("No live connection is configured")
) {
  failures.push(
    `${displayPath(routeDefinitionsPath)} — GenRAC route must explicitly state that no live connection is configured`,
  );
}
if (
  routerSource.includes("PrototypeRoutePage") ||
  routerSource.includes("prototypeRouteData")
) {
  failures.push(
    `${displayPath(routerPath)} — dormant prototype components must remain unrouted`,
  );
}
if (!existsSync(prototypePagePath) || !existsSync(prototypeDataPath)) {
  failures.push(
    "Dormant prototype reference files are missing; removal requires a separate approved decision",
  );
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
  `Live-route guard passed: 1 public login, 22 protected LIVE patterns, 26 visible IN_DEVELOPMENT routes, 1 AWAITING_INTEGRATION route, and 22 hidden COMPATIBILITY routes.`,
);
