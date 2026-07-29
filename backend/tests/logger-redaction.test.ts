import { Writable } from "node:stream";
import express from "express";
import pinoHttp from "pino-http";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  createLogger,
  httpLoggerOptions,
  REDACTION_CENSOR,
  redactResponseHeaders,
} from "../src/config/logger.js";

const sensitiveMarker = "must-not-appear-in-structured-logs";
type CapturedLogEntry = Record<string, unknown>;
type LogPredicate = (entry: CapturedLogEntry) => boolean;
type LogWaiter = {
  predicate: LogPredicate;
  resolve: (entry: CapturedLogEntry) => void;
  reject: (error: Error) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFinalResponseLog = (entry: CapturedLogEntry) =>
  entry.msg === "request completed" || entry.msg === "request errored";

const captureHttpLogs = () => {
  const entries: CapturedLogEntry[] = [];
  const waiters: LogWaiter[] = [];
  let pending = "";
  let captureError: Error | undefined;

  const publish = (entry: CapturedLogEntry) => {
    entries.push(entry);
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index]!;
      if (waiter.predicate(entry)) {
        waiters.splice(index, 1);
        waiter.resolve(entry);
      }
    }
  };

  const failCapture = (error: unknown) => {
    captureError =
      error instanceof Error ? error : new Error("HTTP log capture failed");
    for (const waiter of waiters.splice(0)) waiter.reject(captureError);
  };

  const destination = new Writable({
    write(chunk, _encoding, callback) {
      try {
        pending += chunk.toString();
        let newlineIndex = pending.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = pending.slice(0, newlineIndex);
          pending = pending.slice(newlineIndex + 1);
          if (line.trim()) {
            const parsed = JSON.parse(line) as unknown;
            if (!isRecord(parsed)) {
              throw new Error("Captured HTTP log line is not a JSON object");
            }
            publish(parsed);
          }
          newlineIndex = pending.indexOf("\n");
        }
      } catch (error) {
        failCapture(error);
      }
      callback();
    },
  });

  const waitForLog = (predicate: LogPredicate) => {
    if (captureError) return Promise.reject(captureError);
    const existing = entries.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise<CapturedLogEntry>((resolve, reject) => {
      waiters.push({ predicate, resolve, reject });
    });
  };

  return {
    entries,
    logger: createLogger(destination, "info"),
    waitForLog,
  };
};

const serialiseCapturedEntries = (entries: CapturedLogEntry[]) =>
  entries.map((entry) => JSON.stringify(entry)).join("\n");

const responseMetadata = (entry: CapturedLogEntry) => ({
  message: entry.msg,
  statusCode: isRecord(entry.res) ? entry.res.statusCode : undefined,
  responseTimeIsNumber: typeof entry.responseTime === "number",
});

const responseCookieIsAbsentOrRedacted = (entry: CapturedLogEntry) => {
  if (!isRecord(entry.res) || !isRecord(entry.res.headers)) return true;
  const cookieEntry = Object.entries(entry.res.headers).find(
    ([name]) => name.toLowerCase() === "set-cookie",
  );
  if (!cookieEntry) return true;
  const value = cookieEntry[1];
  return Array.isArray(value)
    ? value.every((item) => item === REDACTION_CENSOR)
    : value === REDACTION_CENSOR;
};

const expectSecretSafeCapture = (
  entries: CapturedLogEntry[],
  rawCookieValue: string,
) => {
  const serialised = serialiseCapturedEntries(entries);
  expect(serialised.includes(sensitiveMarker)).toBe(false);
  expect(serialised.includes(rawCookieValue)).toBe(false);
  expect(serialised.includes(REDACTION_CENSOR)).toBe(true);
};

const loggedApp = (responseHeader: string | string[], statusCode = 200) => {
  const captured = captureHttpLogs();
  const app = express();
  app.use(pinoHttp(httpLoggerOptions(captured.logger)));
  app.get("/api/v1/auth/login", (_req, res) => {
    res.setHeader("Set-Cookie", responseHeader);
    res.status(statusCode).json({ success: statusCode < 400 });
  });
  app.post("/api/v1/auth/refresh", (_req, res) => {
    res.setHeader("set-cookie", responseHeader);
    res.status(statusCode).json({ success: statusCode < 400 });
  });
  app.post("/api/v1/auth/logout", (_req, res) => {
    res.setHeader("SET-COOKIE", responseHeader);
    res.status(statusCode).json({ success: statusCode < 400 });
  });
  return { app, ...captured };
};

describe("HTTP logger response-cookie redaction", () => {
  it("redacts Set-Cookie regardless of header capitalisation and representation", () => {
    expect(
      redactResponseHeaders({
        "Set-Cookie": [`session=${sensitiveMarker}`, `other=${sensitiveMarker}`],
        "Content-Type": "application/json",
      }),
    ).toEqual({
      "Set-Cookie": [REDACTION_CENSOR, REDACTION_CENSOR],
      "Content-Type": "application/json",
    });
    expect(
      redactResponseHeaders({
        "sEt-CoOkIe": `session=${sensitiveMarker}`,
      }),
    ).toEqual({ "sEt-CoOkIe": REDACTION_CENSOR });
  });

  it.each([
    ["login", "get", "/api/v1/auth/login"],
    ["refresh", "post", "/api/v1/auth/refresh"],
    ["logout", "post", "/api/v1/auth/logout"],
  ] as const)(
    "redacts the %s response while preserving safe HTTP metadata",
    async (_name, method, path) => {
      const rawCookieValue = `genbioca_refresh=${sensitiveMarker}; HttpOnly`;
      const { app, entries, waitForLog } = loggedApp([
        rawCookieValue,
        `secondary=${sensitiveMarker}; HttpOnly`,
      ]);
      const responseLog = waitForLog(isFinalResponseLog);

      await request(app)[method](path).expect(200);

      const completed = await responseLog;
      expect(isFinalResponseLog(completed)).toBe(true);
      expectSecretSafeCapture(entries, rawCookieValue);
      expect(responseCookieIsAbsentOrRedacted(completed)).toBe(true);
      expect(responseMetadata(completed)).toEqual({
        message: "request completed",
        statusCode: 200,
        responseTimeIsNumber: true,
      });
    },
  );

  it("redacts cookies on an error response without disabling HTTP logging", async () => {
    const rawCookieValue = `genbioca_refresh=${sensitiveMarker}; HttpOnly`;
    const { app, entries, waitForLog } = loggedApp(rawCookieValue, 500);
    const responseLog = waitForLog(isFinalResponseLog);

    await request(app).get("/api/v1/auth/login").expect(500);

    const completed = await responseLog;
    expect(isFinalResponseLog(completed)).toBe(true);
    expectSecretSafeCapture(entries, rawCookieValue);
    expect(responseCookieIsAbsentOrRedacted(completed)).toBe(true);
    expect(responseMetadata(completed)).toEqual({
      message: "request errored",
      statusCode: 500,
      responseTimeIsNumber: true,
    });
  });

  it("redacts alternate token, password and request-header fields", async () => {
    const { entries, logger, waitForLog } = captureHttpLogs();
    const emittedLog = waitForLog(() => true);
    logger.info({
      accessToken: sensitiveMarker,
      access_token: sensitiveMarker,
      refreshToken: sensitiveMarker,
      refresh_token: sensitiveMarker,
      password: sensitiveMarker,
      passwordHash: sensitiveMarker,
      password_hash: sensitiveMarker,
      tokenHash: sensitiveMarker,
      token_hash: sensitiveMarker,
      req: {
        headers: {
          authorization: sensitiveMarker,
          cookie: sensitiveMarker,
        },
      },
    });

    expect(isRecord(await emittedLog)).toBe(true);
    expectSecretSafeCapture(entries, sensitiveMarker);
  });
});
