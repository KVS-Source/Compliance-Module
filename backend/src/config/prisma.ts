import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

export const databaseRuntimeUrl = (
  rawUrl: string,
  options: {
    connectionLimit: number;
    poolTimeoutSeconds: number;
    connectTimeoutSeconds: number;
  },
) => {
  const url = new URL(rawUrl);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", String(options.connectionLimit));
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", String(options.poolTimeoutSeconds));
  }
  if (!url.searchParams.has("connect_timeout")) {
    url.searchParams.set(
      "connect_timeout",
      String(options.connectTimeoutSeconds),
    );
  }
  return url.toString();
};

export const prisma = new PrismaClient({
  datasourceUrl: databaseRuntimeUrl(env.DATABASE_URL, {
    connectionLimit: env.DATABASE_CONNECTION_LIMIT,
    poolTimeoutSeconds: env.DATABASE_POOL_TIMEOUT_SECONDS,
    connectTimeoutSeconds: env.DATABASE_CONNECT_TIMEOUT_SECONDS,
  }),
  errorFormat: env.NODE_ENV === "production" ? "minimal" : "colorless",
});
