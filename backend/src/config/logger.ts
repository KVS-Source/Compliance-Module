import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from "pino";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Options as PinoHttpOptions } from "pino-http";
import { env } from "./env.js";

export const REDACTION_CENSOR = "[REDACTED]";

const sensitivePaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
  'res.headers["set-cookie"]',
  "password",
  "*.password",
  "*.*.password",
  "passwordHash",
  "*.passwordHash",
  "*.*.passwordHash",
  "password_hash",
  "*.password_hash",
  "*.*.password_hash",
  "refreshToken",
  "*.refreshToken",
  "*.*.refreshToken",
  "refresh_token",
  "*.refresh_token",
  "*.*.refresh_token",
  "accessToken",
  "*.accessToken",
  "*.*.accessToken",
  "access_token",
  "*.access_token",
  "*.*.access_token",
  "tokenHash",
  "*.tokenHash",
  "*.*.tokenHash",
  "token_hash",
  "*.token_hash",
  "*.*.token_hash",
  "cookie",
  "*.cookie",
  "cookies",
  "*.cookies",
] as const;

const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [...sensitivePaths],
    censor: REDACTION_CENSOR,
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
          ? value.map(() => REDACTION_CENSOR)
          : REDACTION_CENSOR
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

export const createLogger = (
  destination?: DestinationStream,
  level: LoggerOptions["level"] = env.LOG_LEVEL,
): Logger => pino({ ...loggerOptions, level }, destination);

export const httpLoggerOptions = (httpLogger: Logger): PinoHttpOptions => ({
  logger: httpLogger,
  genReqId: (request: IncomingMessage, response: ServerResponse) => {
    const supplied = request.headers["x-request-id"];
    const candidate = Array.isArray(supplied) ? supplied[0] : supplied;
    const requestId =
      candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)
        ? candidate
        : randomUUID();
    response.setHeader("X-Request-Id", requestId);
    return requestId;
  },
  serializers: {
    res: serializeHttpResponse,
  },
});

export const logger = createLogger();
