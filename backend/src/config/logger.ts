import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from "pino";
import type { Options as PinoHttpOptions } from "pino-http";
import { env } from "./env.js";

const REDACTED = "[REDACTED]";

const sensitivePaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
  'res.headers["set-cookie"]',
  "password",
  "*.password",
  "*.*.password",
  "refreshToken",
  "*.refreshToken",
  "*.*.refreshToken",
  "accessToken",
  "*.accessToken",
  "*.*.accessToken",
  "cookie",
  "*.cookie",
  "cookies",
  "*.cookies",
] as const;

const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [...sensitivePaths],
    censor: REDACTED,
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Pino's path redaction is case-sensitive, while header names are not. Sanitize
 * response headers before Pino sees them so Set-Cookie is protected regardless
 * of capitalisation or whether Node represents it as a string or string array.
 */
export const redactResponseHeaders = (
  headers: unknown,
): Record<string, unknown> | unknown => {
  if (!isRecord(headers)) return headers;
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      name.toLowerCase() === "set-cookie"
        ? Array.isArray(value)
          ? value.map(() => REDACTED)
          : REDACTED
        : value,
    ]),
  );
};

export const serializeHttpResponse = (response: unknown): unknown => {
  if (!isRecord(response)) return response;
  return {
    ...response,
    ...(Object.hasOwn(response, "headers")
      ? { headers: redactResponseHeaders(response.headers) }
      : {}),
  };
};

export const createLogger = (destination?: DestinationStream): Logger =>
  pino(loggerOptions, destination);

export const httpLoggerOptions = (
  httpLogger: Logger,
): PinoHttpOptions => ({
  logger: httpLogger,
  serializers: {
    res: serializeHttpResponse,
  },
});

export const logger = createLogger();
