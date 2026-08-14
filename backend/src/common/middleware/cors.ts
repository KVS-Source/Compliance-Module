import type { RequestHandler } from "express";
import { forbidden } from "../errors/app-error.js";

const appendVaryOrigin = (current: string | undefined) => {
  const values = (current ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.some((value) => value.toLowerCase() === "origin")) {
    values.push("Origin");
  }
  return values.join(", ");
};

export const exactOriginCors = (
  allowedOrigins: readonly string[],
): RequestHandler => {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.get("origin");
    if (!origin) return next();
    if (!allowed.has(origin)) {
      return next(forbidden("Browser origin is not allowed"));
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Disposition, X-Request-Id",
    );
    res.setHeader("Vary", appendVaryOrigin(res.getHeader("Vary")?.toString()));

    if (req.method !== "OPTIONS") return next();
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Request-Id",
    );
    res.setHeader("Access-Control-Max-Age", "600");
    return res.status(204).end();
  };
};
