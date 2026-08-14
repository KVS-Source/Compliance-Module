import "dotenv/config";
import { isAbsolute } from "node:path";
import { z } from "zod";

const unsafeProductionSecret =
  /replace|change[-_ ]?me|placeholder|development[-_ ]?secret|example|default|<|>/i;
const unsafeProductionIssuer =
  /replace|change[-_ ]?me|placeholder|development|example|localhost/i;
const unsafeProductionLocation =
  /replace|change[-_ ]?me|placeholder|example|localhost|127\.0\.0\.1|<|>/i;
const supportedJwtDuration = /^[1-9]\d*(?:ms|s|m|h|d|w|y)$/i;
const supportedEvidenceExtensions = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".docx",
  ".xlsx",
  ".csv",
  ".txt",
]);

export const parseCorsOrigins = (value: string) =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

export const parseEvidenceExtensions = (value: string) =>
  value
    .split(",")
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => extension.length > 0);

const isSafeFrontendApiUrl = (value: string) => {
  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[?#]/.test(value)
  ) {
    return value.length > 1;
  }
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      !unsafeProductionLocation.test(parsed.hostname)
    );
  } catch {
    return false;
  }
};

export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(8000),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    REFRESH_TOKEN_SECRET: z.string().min(32).optional(),
    JWT_ACCESS_TTL: z.string().regex(supportedJwtDuration).default("15m"),
    JWT_ISSUER: z.string().trim().min(1),
    REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
    TRUST_PROXY: z.string().default("false"),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900_000),
    RATE_LIMIT_API_MAX: z.coerce.number().int().min(1).default(600),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_REFRESH_MAX: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_DISABLED: z.enum(["true", "false"]).default("false"),
    CORS_ORIGINS: z.string().default(""),
    FRONTEND_API_URL: z.string().trim().default("/api/v1"),
    PRODUCTION_DOMAIN: z.string().trim().optional(),
    JSON_BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(10_485_760)
      .default(1_048_576),
    FRONTEND_DIST: z.string().default("../frontend/dist"),
    SERVE_FRONTEND: z.enum(["true", "false"]).default("true"),
    PROTOTYPE_DIR: z.string().default("../docs/prototype"),
    ENABLE_API_DOCS: z.enum(["true", "false"]).default("true"),
    ENABLE_PROTOTYPE_ROUTES: z.enum(["true", "false"]).default("true"),
    FILE_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    LOCAL_UPLOAD_DIR: z.string().default("./uploads"),
    EVIDENCE_ALLOWED_EXTENSIONS: z
      .string()
      .default(".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.txt"),
    EVIDENCE_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(52_428_800)
      .default(10_485_760),
    EVIDENCE_UPLOAD_RATE_MAX: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(20),
    EVIDENCE_UPLOAD_RATE_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(86_400_000)
      .default(900_000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    BACKUP_PATH: z.string().default("./backups"),
    READINESS_STORAGE_CHECK: z.enum(["true", "false"]).default("false"),
    SHUTDOWN_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(10_000),
    /** Hours a browser import preview payload may be retained before TTL sweep. */
    IMPORT_PREVIEW_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(168)
      .default(24),
    /** Interval for the import-temp sweeper; 0 disables the periodic timer. */
    IMPORT_PREVIEW_CLEANUP_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(0)
      .max(86_400_000)
      .default(3_600_000),
    DATABASE_CONNECTION_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10),
    DATABASE_POOL_TIMEOUT_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(120)
      .default(10),
    DATABASE_CONNECT_TIMEOUT_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(60)
      .default(5),
    S3_ENDPOINT: z.string().url().optional(),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    /**
     * When true, FILE_STORAGE_DRIVER=s3 is allowed only if an injected client
     * is provided at process bootstrap (tests). Default false so production
     * without a wired client cannot accidentally select s3 and crash.
     */
    S3_ALLOW_INJECTED_CLIENT: z.enum(["true", "false"]).default("false"),
  })
  .superRefine((value, context) => {
    const evidenceExtensions = parseEvidenceExtensions(
      value.EVIDENCE_ALLOWED_EXTENSIONS,
    );
    if (
      evidenceExtensions.length === 0 ||
      evidenceExtensions.some(
        (extension) => !supportedEvidenceExtensions.has(extension),
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EVIDENCE_ALLOWED_EXTENSIONS"],
        message: "Evidence extensions must be a non-empty supported subset",
      });
    }
    if (value.FILE_STORAGE_DRIVER === "s3") {
      if (!value.S3_BUCKET?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["S3_BUCKET"],
          message: "S3_BUCKET is required when FILE_STORAGE_DRIVER=s3",
        });
      }
      // Real AWS credentials are not available in this environment. S3 is
      // selectable only when a process injects a client (unit tests) or a
      // future production bootstrap wires one. Default remains local.
      if (value.S3_ALLOW_INJECTED_CLIENT !== "true" && value.NODE_ENV === "production") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["FILE_STORAGE_DRIVER"],
          message:
            "FILE_STORAGE_DRIVER=s3 requires a production S3 client bootstrap; use local until credentials and client wiring exist",
        });
      }
    }
    if (value.NODE_ENV !== "production") return;
    if (
      value.TRUST_PROXY === "true" ||
      value.TRUST_PROXY.trim() === "" ||
      value.TRUST_PROXY === "false"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TRUST_PROXY"],
        message:
          "TRUST_PROXY must name the exact proxy hop count or address in production",
      });
    }
    if (value.RATE_LIMIT_DISABLED === "true") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["RATE_LIMIT_DISABLED"],
        message: "RATE_LIMIT_DISABLED must be false in production",
      });
    }
    if (value.COOKIE_SECURE !== "true") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["COOKIE_SECURE"],
        message: "COOKIE_SECURE must be true in production",
      });
    }
    if (unsafeProductionSecret.test(value.JWT_ACCESS_SECRET)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_ACCESS_SECRET"],
        message: "JWT_ACCESS_SECRET contains an unsafe placeholder",
      });
    }
    if (
      !value.REFRESH_TOKEN_SECRET ||
      unsafeProductionSecret.test(value.REFRESH_TOKEN_SECRET)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REFRESH_TOKEN_SECRET"],
        message: "REFRESH_TOKEN_SECRET must be a non-placeholder secret",
      });
    } else if (value.REFRESH_TOKEN_SECRET === value.JWT_ACCESS_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REFRESH_TOKEN_SECRET"],
        message: "Refresh and access-token secrets must be different",
      });
    }
    if (unsafeProductionIssuer.test(value.JWT_ISSUER)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_ISSUER"],
        message: "JWT_ISSUER contains an unsafe production placeholder",
      });
    }
    const origins = parseCorsOrigins(value.CORS_ORIGINS);
    if (
      origins.length === 0 ||
      origins.some((origin) => {
        try {
          const parsed = new URL(origin);
          return (
            parsed.protocol !== "https:" ||
            parsed.origin !== origin ||
            unsafeProductionLocation.test(parsed.hostname)
          );
        } catch {
          return true;
        }
      })
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGINS"],
        message:
          "CORS_ORIGINS must contain exact comma-separated HTTPS origins without wildcards or localhost",
      });
    }
    if (!isSafeFrontendApiUrl(value.FRONTEND_API_URL)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FRONTEND_API_URL"],
        message:
          "FRONTEND_API_URL must be a same-origin path or non-local production URL",
      });
    }
    if (
      !value.PRODUCTION_DOMAIN ||
      unsafeProductionLocation.test(value.PRODUCTION_DOMAIN) ||
      !/^[a-z0-9.-]+$/i.test(value.PRODUCTION_DOMAIN)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PRODUCTION_DOMAIN"],
        message: "PRODUCTION_DOMAIN must be the approved production hostname",
      });
    }
    if (!isAbsolute(value.LOCAL_UPLOAD_DIR)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["LOCAL_UPLOAD_DIR"],
        message: "LOCAL_UPLOAD_DIR must be an absolute persistent path",
      });
    }
    if (!isAbsolute(value.BACKUP_PATH)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BACKUP_PATH"],
        message: "BACKUP_PATH must be an absolute protected path",
      });
    }
    if (value.READINESS_STORAGE_CHECK !== "true") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["READINESS_STORAGE_CHECK"],
        message: "Storage readiness checking is mandatory in production",
      });
    }
    if (value.ENABLE_API_DOCS !== "false") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ENABLE_API_DOCS"],
        message: "API documentation must be disabled in production",
      });
    }
    if (value.ENABLE_PROTOTYPE_ROUTES !== "false") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ENABLE_PROTOTYPE_ROUTES"],
        message: "Prototype routes must be disabled in production",
      });
    }
    if (["debug", "trace", "silent"].includes(value.LOG_LEVEL)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["LOG_LEVEL"],
        message: "Production LOG_LEVEL must retain operational auditability",
      });
    }
  });

/**
 * Express reads `trust proxy` to derive `req.ip`, which keys rate limiting and
 * audit records. A hop count that does not match the real deployment either
 * lets clients forge `X-Forwarded-For` or collapses every client onto one key.
 */
export const resolveTrustProxy = (value: string): boolean | number | string => {
  const normalised = value.trim();
  if (normalised === "" || normalised.toLowerCase() === "false") return false;
  if (normalised.toLowerCase() === "true") return true;
  if (/^\d+$/.test(normalised)) return Number(normalised);
  return normalised;
};

export const parseEnvironment = (input: NodeJS.ProcessEnv) => {
  const parsed = environmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.issues
        .map(
          (issue) =>
            `${issue.path.join(".") || "environment"}: ${issue.message}`,
        )
        .join("; ")}`,
    );
  }
  return parsed.data;
};

export const env = parseEnvironment(process.env);
