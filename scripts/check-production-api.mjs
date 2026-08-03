import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const apiConfig = readFileSync(
  resolve(repositoryRoot, "frontend/src/config/api.ts"),
  "utf8",
);
const client = readFileSync(
  resolve(repositoryRoot, "frontend/src/services/apiClient.ts"),
  "utf8",
);

if (!apiConfig.includes('configuredApiBase || "/api/v1"')) {
  throw new Error("Frontend production API base is not explicit");
}
if (
  !apiConfig.includes("Production API configuration must not use localhost")
) {
  throw new Error("Frontend production localhost guard is missing");
}
if (
  !apiConfig.includes('!API_BASE_URL.startsWith("//")') ||
  !apiConfig.includes("safe same-origin path or HTTPS URL")
) {
  throw new Error("Frontend protocol-relative API URL guard is missing");
}
if (!client.includes("`${API_BASE_URL}${path}`")) {
  throw new Error("Frontend transports do not share the approved API base");
}
if (/fetch\([`'"]https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(client)) {
  throw new Error("Frontend runtime contains a localhost API fallback");
}

console.log("Production API configuration guard passed");
