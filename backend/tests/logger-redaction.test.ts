import { Writable } from "node:stream";
import express from "express";
import pinoHttp from "pino-http";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  createLogger,
  httpLoggerOptions,
  redactResponseHeaders,
} from "../src/config/logger.js";

const sensitiveMarker = "must-not-appear-in-structured-logs";

const captureHttpLogs = () => {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return {
    lines,
    logger: createLogger(destination),
  };
};

const parseFinalLog = (lines: string[]) =>
  lines
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .find(
      (entry) =>
        entry.msg === "request completed" || entry.msg === "request errored",
    );

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
      "Set-Cookie": ["[REDACTED]", "[REDACTED]"],
      "Content-Type": "application/json",
    });
    expect(
      redactResponseHeaders({
        "sEt-CoOkIe": `session=${sensitiveMarker}`,
      }),
    ).toEqual({ "sEt-CoOkIe": "[REDACTED]" });
  });

  it.each([
    ["login", "get", "/api/v1/auth/login"],
    ["refresh", "post", "/api/v1/auth/refresh"],
    ["logout", "post", "/api/v1/auth/logout"],
  ] as const)(
    "redacts the %s response while preserving safe HTTP metadata",
    async (_name, method, path) => {
      const { app, lines } = loggedApp([
        `genbioca_refresh=${sensitiveMarker}; HttpOnly`,
        `secondary=${sensitiveMarker}; HttpOnly`,
      ]);

      await request(app)[method](path).expect(200);

      const rawOutput = lines.join("");
      const completed = parseFinalLog(lines);
      expect(rawOutput).not.toContain(sensitiveMarker);
      expect(rawOutput).toContain("[REDACTED]");
      expect(completed).toMatchObject({
        res: { statusCode: 200 },
        msg: "request completed",
      });
      expect(completed?.responseTime).toEqual(expect.any(Number));
    },
  );

  it("redacts cookies on an error response without disabling HTTP logging", async () => {
    const { app, lines } = loggedApp(
      `genbioca_refresh=${sensitiveMarker}; HttpOnly`,
      500,
    );

    await request(app).get("/api/v1/auth/login").expect(500);

    const rawOutput = lines.join("");
    const completed = parseFinalLog(lines);
    expect(rawOutput).not.toContain(sensitiveMarker);
    expect(rawOutput).toContain("[REDACTED]");
    expect(completed).toMatchObject({
      res: { statusCode: 500 },
      msg: "request errored",
    });
    expect(completed?.responseTime).toEqual(expect.any(Number));
  });

  it("redacts alternate token, password and request-header fields", () => {
    const { lines, logger } = captureHttpLogs();
    logger.info({
      accessToken: sensitiveMarker,
      refreshToken: sensitiveMarker,
      password: sensitiveMarker,
      req: {
        headers: {
          authorization: sensitiveMarker,
          cookie: sensitiveMarker,
        },
      },
    });

    const rawOutput = lines.join("");
    expect(rawOutput).not.toContain(sensitiveMarker);
    expect(rawOutput).toContain("[REDACTED]");
  });
});
