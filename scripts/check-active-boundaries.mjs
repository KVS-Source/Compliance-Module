#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const activeRoots = ["frontend", "backend"];
const dormantPrototypeRoot = resolve(
  repositoryRoot,
  "frontend/src/features/prototype",
);
const excludedDirectories = new Set([
  "node_modules",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
]);
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const failures = [];
const rootPackage = JSON.parse(
  readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
);
const rootRuntimeDependencies = new Set([
  "@prisma/client",
  "bcryptjs",
  "cors",
  "dotenv",
  "express",
  "helmet",
  "jsonwebtoken",
  "morgan",
  "multer",
  "prisma",
  "supertest",
  "swagger-ui-express",
  "tsx",
  "typescript",
  "vitest",
  "zod",
]);

if (rootPackage.private !== true) {
  failures.push("package.json — repository package must be private");
}

for (const directory of ["src", "prisma"]) {
  if (existsSync(resolve(repositoryRoot, directory))) {
    failures.push(`${directory}/ — root-level runtime directory is prohibited`);
  }
}

for (const dependencyGroup of ["dependencies", "devDependencies"]) {
  for (const dependency of Object.keys(rootPackage[dependencyGroup] ?? {})) {
    if (rootRuntimeDependencies.has(dependency)) {
      failures.push(
        `package.json — root ${dependencyGroup} declares active-runtime package ${dependency}`,
      );
    }
  }
}

for (const [scriptName, command] of Object.entries(rootPackage.scripts ?? {})) {
  if (
    /\b(?:src|prisma)\//.test(command) ||
    /\bdist\/server\b/.test(command) ||
    /\b(?:node|tsx)\s+(?:watch\s+)?(?:src|server)\b/.test(command)
  ) {
    failures.push(
      `package.json — root script ${scriptName} starts or manages a retired root runtime`,
    );
  }
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    if (!entry.isFile() || !sourceExtensions.has(extname(entry.name))) continue;

    const source = readFileSync(path, "utf8");
    const importSpecifiers = [
      ...source.matchAll(/\bfrom\s*["']([^"']+)["']/g),
      ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g),
      ...source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']/g),
    ].map((match) => match[1]);

    // This guard exists to keep active code out of the retired root runtime in
    // `legacy/`, so only repository paths count. A bare package specifier such
    // as `pdfjs-dist/legacy/build/pdf.mjs` names a node_modules subpath of a
    // declared dependency, which this rule was never about.
    const importReferencesLegacy = importSpecifiers.some(
      (specifier) =>
        (specifier.startsWith(".") ||
          specifier.startsWith("/") ||
          specifier.startsWith("legacy/")) &&
        /(?:^|\/)legacy(?:\/|$)/.test(specifier),
    );
    if (importReferencesLegacy) {
      failures.push(
        `${relative(repositoryRoot, path)} — active runtime imports from legacy/`,
      );
    }

    const isDormantPrototypeSource =
      path === dormantPrototypeRoot ||
      path.startsWith(`${dormantPrototypeRoot}/`);
    const importsDormantPrototype =
      /(?:features\/prototype|prototypeRouteData|PrototypeRoutePage)/.test(
        source,
      );
    if (!isDormantPrototypeSource && importsDormantPrototype) {
      failures.push(
        `${relative(repositoryRoot, path)} — active runtime imports dormant prototype route data`,
      );
    }
  }
}

for (const activeRoot of activeRoots) walk(resolve(repositoryRoot, activeRoot));

if (failures.length > 0) {
  console.error("Active-runtime boundary guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Active-runtime boundary guard passed: root is orchestration-only and active runtimes do not import retired sources.",
);
