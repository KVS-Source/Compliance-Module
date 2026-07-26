#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(process.argv[2] ?? scriptDirectory, process.argv[2] ? "" : "..");
const excludedDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
]);
const frameworkPackages = [
  "@react-router/dev",
  "@react-router/node",
  "@react-router/serve",
];
const failures = [];

const displayPath = (path) => relative(repositoryRoot, path) || ".";

function walk(directory, visit) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path, visit);
    else if (entry.isFile()) visit(path);
  }
}

function fail(path, check, reason) {
  failures.push(`${displayPath(path)}: ${check} — ${reason}`);
}

walk(repositoryRoot, (path) => {
  const name = basename(path);
  const normalized = path.split(sep).join("/");

  if (name === "package.json") {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      fail(path, "invalid package.json", "the router guard cannot inspect dependencies");
      return;
    }
    const dependencyGroups = [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.peerDependencies,
      manifest.optionalDependencies,
    ];
    for (const packageName of frameworkPackages) {
      if (dependencyGroups.some((group) => group?.[packageName])) {
        fail(
          path,
          `forbidden dependency ${packageName}`,
          "it enables React Router Framework Mode",
        );
      }
    }
  }

  if (/^vite\.config\.(?:[cm]?[jt]s)$/.test(name)) {
    const source = readFileSync(path, "utf8");
    if (source.includes("@react-router/dev/vite")) {
      fail(
        path,
        "forbidden @react-router/dev/vite import",
        "the application must remain in library/data mode",
      );
    }
    if (/\breactRouter\s*\(/.test(source)) {
      fail(
        path,
        "forbidden reactRouter() Vite plugin",
        "the plugin switches the application to Framework Mode",
      );
    }
  }

  if (/^react-router\.config\./.test(name)) {
    fail(
      path,
      "forbidden React Router config",
      "file-based Framework Mode configuration is not allowed",
    );
  }

  if (/\/app\/routes\.tsx?$/.test(normalized)) {
    fail(
      path,
      "forbidden app/routes file",
      "file-system route configuration enables Framework Mode",
    );
  }

  if (
    /(?:^|\.)(?:config)\.(?:json|[cm]?[jt]s)$/.test(name) &&
    /\bssr\s*:\s*true\b/.test(readFileSync(path, "utf8"))
  ) {
    fail(
      path,
      "forbidden ssr: true",
      "server rendering is outside the approved client-side router architecture",
    );
  }
});

if (failures.length > 0) {
  console.error("React Router mode guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (!existsSync(resolve(repositoryRoot, "frontend/src/app/router.tsx"))) {
  console.error(
    "React Router mode guard failed: frontend/src/app/router.tsx is missing — the approved router entry point cannot be verified",
  );
  process.exit(1);
}

console.log("React Router mode guard passed: library/data mode controls are intact.");
