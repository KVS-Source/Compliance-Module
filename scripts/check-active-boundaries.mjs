#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const activeRoots = ["frontend", "backend"];
const excludedDirectories = new Set([
  "node_modules",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
]);
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const failures = [];

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
    const importReferencesLegacy =
      /\bfrom\s*["'][^"']*legacy(?:\/|["'])/.test(source) ||
      /\bimport\s*\(\s*["'][^"']*legacy(?:\/|["'])/.test(source) ||
      /\brequire\s*\(\s*["'][^"']*legacy(?:\/|["'])/.test(source);
    if (importReferencesLegacy) {
      failures.push(
        `${relative(repositoryRoot, path)} — active runtime imports from legacy/`,
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

console.log("Active-runtime boundary guard passed: no imports from legacy/.");
