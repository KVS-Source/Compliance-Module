import "dotenv/config";
import { z } from "zod";

const unsafeProductionSecret =
  /replace|change[-_ ]?me|placeholder|development[-_ ]?secret/i;

export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(8000),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default("15m"),
    JWT_ISSUER: z.string().default("genbioca-compliance"),
    REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
    TRUST_PROXY: z.string().default("false"),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900_000),
    RATE_LIMIT_API_MAX: z.coerce.number().int().min(1).default(600),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_REFRESH_MAX: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_DISABLED: z.enum(["true", "false"]).default("false"),
    FRONTEND_DIST: z.string().default("../frontend/dist"),
    PROTOTYPE_DIR: z.string().default("../docs/prototype"),
    FILE_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    LOCAL_UPLOAD_DIR: z.string().default("./uploads"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    S3_ENDPOINT: z.string().url().optional(),
    S3_BUCKET: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV !== "production") return;
    if (value.TRUST_PROXY === "true") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TRUST_PROXY"],
        message:
          "TRUST_PROXY must name the proxy hop count or address in production; 'true' lets clients spoof req.ip",
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
      `Invalid environment: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
};

export const env = parseEnvironment(process.env);
