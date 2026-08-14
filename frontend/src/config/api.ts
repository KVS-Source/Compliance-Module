const configuredApiBase = (
  import.meta.env.VITE_API_BASE_URL as string | undefined
)?.trim();

export const API_BASE_URL = (configuredApiBase || "/api/v1").replace(/\/$/, "");

const sameOriginPath =
  API_BASE_URL.startsWith("/") &&
  !API_BASE_URL.startsWith("//") &&
  !API_BASE_URL.includes("\\") &&
  !/[?#]/.test(API_BASE_URL);
let approvedAbsoluteUrl = false;
try {
  const parsed = new URL(API_BASE_URL);
  approvedAbsoluteUrl =
    parsed.protocol === "https:" &&
    !parsed.username &&
    !parsed.password &&
    !parsed.search &&
    !parsed.hash;
} catch {
  // Same-origin paths are intentionally not absolute URLs.
}

if (!sameOriginPath && !approvedAbsoluteUrl) {
  throw new Error("API base URL must be a safe same-origin path or HTTPS URL");
}

if (
  import.meta.env.PROD &&
  /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(API_BASE_URL)
) {
  throw new Error("Production API configuration must not use localhost");
}
