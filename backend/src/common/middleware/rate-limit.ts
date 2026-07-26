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
