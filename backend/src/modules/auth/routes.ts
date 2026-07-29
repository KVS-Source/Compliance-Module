import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  asyncHandler,
  authenticate,
  validate,
} from "../../common/middleware/http.js";
import {
  authRateLimiter,
  refreshRateLimiter,
} from "../../common/middleware/rate-limit.js";
import { ok } from "../../common/responses/envelope.js";
import { env } from "../../config/env.js";
import type { AuthService } from "./service.js";

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
});
const switchSchema = z.object({ companyId: z.string().uuid() });
const REFRESH_COOKIE = "genbioca_refresh";

type RefreshCookieConfiguration = Pick<
  typeof env,
  "COOKIE_SECURE" | "REFRESH_TOKEN_DAYS"
>;

export const refreshCookieOptions = (
  configuration: RefreshCookieConfiguration,
) => ({
  httpOnly: true,
  secure: configuration.COOKIE_SECURE === "true",
  sameSite: "strict" as const,
  path: "/api/v1/auth",
  maxAge: configuration.REFRESH_TOKEN_DAYS * 86_400_000,
});

const cookieOptions = refreshCookieOptions(env);

export class AuthController {
  constructor(private readonly service: AuthService) {}

  login = async (req: Request, res: Response) => {
    const userAgent = req.get("user-agent");
    const result = await this.service.login(req.body.email, req.body.password, {
      ...(req.ip ? { ip: req.ip } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
    return ok(res, { accessToken: result.accessToken, user: result.user });
  };

  refresh = async (req: Request, res: Response) => {
    const raw = req.cookies[REFRESH_COOKIE] as string | undefined;
    const result = await this.service.refresh(raw ?? "");
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
    return ok(res, { accessToken: result.accessToken, user: result.user });
  };

  logout = async (req: Request, res: Response) => {
    const userAgent = req.get("user-agent");
    try {
      await this.service.logout(
        req.cookies[REFRESH_COOKIE] as string | undefined,
        {
          ...(req.ip ? { ip: req.ip } : {}),
          ...(userAgent ? { userAgent } : {}),
        },
      );
    } finally {
      res.clearCookie(REFRESH_COOKIE, cookieOptions);
    }
    return ok(res, { loggedOut: true });
  };

  me = async (req: Request, res: Response) =>
    ok(res, await this.service.me(req.auth!.userId, req.auth!.tenantId));

  switchCompany = async (req: Request, res: Response) => {
    const result = await this.service.switchCompany(
      req.auth!.userId,
      req.body.companyId,
      req.cookies[REFRESH_COOKIE] as string | undefined,
    );
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
    return ok(res, { accessToken: result.accessToken, user: result.user });
  };
}

export const authRoutes = (service: AuthService) => {
  const router = Router();
  const controller = new AuthController(service);
  router.post(
    "/login",
    authRateLimiter(),
    validate(loginSchema),
    asyncHandler(controller.login),
  );
  router.post(
    "/refresh",
    refreshRateLimiter(),
    asyncHandler(controller.refresh),
  );
  router.post("/logout", asyncHandler(controller.logout));
  router.get("/me", authenticate, asyncHandler(controller.me));
  router.post(
    "/tenant-context",
    authRateLimiter(),
    authenticate,
    validate(switchSchema),
    asyncHandler(controller.switchCompany),
  );
  return router;
};
