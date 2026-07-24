import "dotenv/config";
import { z } from "zod";

const schema = z.object({
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
  FRONTEND_DIST: z.string().default("../frontend/dist"),
  PROTOTYPE_DIR: z.string().default("../docs/prototype"),
  FILE_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_UPLOAD_DIR: z.string().default("./uploads"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    `Invalid environment: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
  );
}

export const env = parsed.data;
