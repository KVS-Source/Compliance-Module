import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Export reviewed source files only. No Git history or ignored local state.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = process.argv[2] && resolve(process.argv[2]);
if (!destination) throw new Error("Usage: npm run package:delivery -- /absolute/new-output-folder");
const inside = relative(root, destination);
if (!inside.startsWith("..") || isAbsolute(inside)) throw new Error("Destination must be outside the source checkout");
const archive = `${destination}.zip`;
if (existsSync(destination) || existsSync(archive)) throw new Error("Output already exists; packaging never overwrites a delivery");
const allowedRootFiles = new Set([
  "README.md", "CONTRIBUTING.md", "LICENSE", "LICENSE.md", "package.json", "package-lock.json",
  "docker-compose.yml", "docker-compose.production.yml", ".dockerignore", ".gitignore",
  ".env.example", ".env.production.example", ".gitleaks.toml", ".gitleaksignore",
  "GenBioCa-Compliance-Platform (1).html",
]);
const allowedRoots = new Set(["backend", "frontend", "scripts", "docs", "deploy", "legacy", ".github"]);
const files = [...new Set(execFileSync("git", ["-c", "core.fsmonitor=false", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean))].sort();
const selected = files.filter((file) => {
  const parts = file.split("/");
  if (!allowedRootFiles.has(file) && !allowedRoots.has(parts[0])) return false;
  // Dormant configuration has development defaults and is not an onboarding template.
  if (parts[0] === "legacy" && basename(file).startsWith(".env")) return false;
  if (parts.some((part) => ["node_modules", "dist", "build", "coverage", "uploads", "backups", "private-reference", "test-results", "playwright-report", "blob-report", "design-review", "screenshots"].includes(part))) return false;
  if (parts.some((part) => part.startsWith(".") && ![".github", ".dockerignore", ".gitignore", ".env.example", ".env.production.example", ".gitleaks.toml", ".gitleaksignore", ".prettierignore"].includes(part))) return false;
  if (/\.(?:xlsx?|dump|backup|zip|log|pem|key|p12|pfx|sqlite3?|db|tsbuildinfo)$/i.test(file)) return false;
  if (/^(?:credentials|service-account)/i.test(basename(file))) return false;
  return true;
});
if (!selected.length) throw new Error("No source files found");
// Validate everything before writing. Deleted tracked files are not exported.
const present = selected.filter((file) => existsSync(resolve(root, file)));
for (const file of present) {
  const source = resolve(root, file);
  if (relative(root, source).startsWith("..") || !lstatSync(source).isFile()) throw new Error("Unsafe source path or symlink");
}
mkdirSync(destination, { recursive: true });
const manifest = [];
for (const file of present) {
  const target = resolve(destination, file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(root, file), target);
  manifest.push(`${createHash("sha256").update(readFileSync(target)).digest("hex")}  ${file}`);
}
writeFileSync(resolve(destination, "SOURCE-SHA256.txt"), `${manifest.join("\n")}\n`, { flag: "wx" });
execFileSync("zip", ["-X", "-q", "-r", archive, basename(destination)], { cwd: dirname(destination), stdio: "inherit" });
console.log(JSON.stringify({ result: "PACKAGED", files: present.length, folder: destination, archive, sha256: createHash("sha256").update(readFileSync(archive)).digest("hex") }, null, 2));
console.log("Scan this export for secrets and inspect it before sending. It contains no operational database.");
