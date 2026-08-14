import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";

interface RateLimiterOptions {
  limit: number;
  windowMs?: number;
  code?: string;
  message?: string;
  disabled?: boolean;
}

export const createRateLimiter = ({
  limit,
  windowMs = env.RATE_LIMIT_WINDOW_MS,
  code = "RATE_LIMITED",
  message = "Too many requests. Try again later.",
  disabled = env.RATE_LIMIT_DISABLED === "true",
}: RateLimiterOptions): RequestHandler =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => disabled,
    handler: (req, res) => {
      req.log?.warn({ path: req.path }, "rate limit exceeded");
      res.status(429).json({ success: false, error: { code, message } });
    },
  });

/** Broad ceiling for authenticated API traffic. Probes are mounted ahead of it. */
export const apiRateLimiter = () =>
  createRateLimiter({
    limit: env.RATE_LIMIT_API_MAX,
    code: "RATE_LIMITED",
  });

/**
 * Credential-accepting routes. Per-account lockout stops repeated guesses at one
 * account; this stops one source spraying a password across many accounts.
 */
export const authRateLimiter = () =>
  createRateLimiter({
    limit: env.RATE_LIMIT_AUTH_MAX,
    code: "AUTH_RATE_LIMITED",
    message: "Too many authentication attempts. Try again later.",
  });

/** Refresh runs on every app load and token expiry, so it needs more headroom. */
export const refreshRateLimiter = () =>
  createRateLimiter({
    limit: env.RATE_LIMIT_REFRESH_MAX,
    code: "AUTH_RATE_LIMITED",
    message: "Too many session refresh attempts. Try again later.",
  });

/**
 * Evidence multipart upload. Keys by authenticated user when present, else IP.
 * Does not replace the broader API limiter mounted on `/api/v1`.
 */
export const evidenceUploadRateLimiter = (): RequestHandler =>
  rateLimit({
    windowMs: env.EVIDENCE_UPLOAD_RATE_WINDOW_MS,
    limit: env.EVIDENCE_UPLOAD_RATE_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.RATE_LIMIT_DISABLED === "true",
    // Prefer authenticated user id; fall back to default IP keying.
    keyGenerator: (req) => {
      if (req.auth?.userId) return `evidence-upload:user:${req.auth.userId}`;
      // Default library behaviour for IP (validated) when user is absent.
      return `evidence-upload:ip:${req.ip || "unknown"}`;
    },
    validate: {
      // Custom key prefers userId; IP fallback is intentional for unauthenticated edge cases.
      keyGeneratorIpFallback: false,
    },
    handler: (req, res) => {
      req.log?.warn({ path: req.path }, "evidence upload rate limit exceeded");
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many evidence upload attempts. Try again later.",
        },
      });
    },
  });

/**
 * Browser workbook/CSV preview and commit. Keys by authenticated user.
 */
export const importUploadRateLimiter = (): RequestHandler =>
  rateLimit({
    windowMs: env.EVIDENCE_UPLOAD_RATE_WINDOW_MS,
    limit: env.EVIDENCE_UPLOAD_RATE_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.RATE_LIMIT_DISABLED === "true",
    keyGenerator: (req) => {
      if (req.auth?.userId) return `import-upload:user:${req.auth.userId}`;
      return `import-upload:ip:${req.ip || "unknown"}`;
    },
    validate: {
      keyGeneratorIpFallback: false,
    },
    handler: (req, res) => {
      req.log?.warn({ path: req.path }, "import upload rate limit exceeded");
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many import attempts. Try again later.",
        },
      });
    },
  });
