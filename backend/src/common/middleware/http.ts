import type { ErrorRequestHandler, RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { ZodError, type ZodSchema } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, forbidden, unauthorized } from "../errors/app-error.js";
import { verifyAccessToken } from "../security/tokens.js";
import { env } from "../../config/env.js";

export const asyncHandler =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export const authenticate: RequestHandler = (req, _res, next) => {
  const value = req.get("authorization");
  if (!value?.startsWith("Bearer ")) return next(unauthorized());
  try {
    const claims = verifyAccessToken(value.slice(7));
    if (claims.type !== "access") throw new Error("wrong token type");
    req.auth = {
      userId: claims.sub,
      tenantId: claims.tenantId,
      permissions:
        env.NODE_ENV === "production"
          ? claims.permissions.filter((permission) => permission !== "*")
          : claims.permissions,
      ...(claims.sessionFamilyId
        ? { sessionFamilyId: claims.sessionFamilyId }
        : {}),
    };
    next();
  } catch {
    next(unauthorized("Invalid or expired access token"));
  }
};

export const authorizeTenantContext =
  (db: PrismaClient): RequestHandler =>
  async (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    try {
      const membership = await db.userCompany.findFirst({
        where: {
          userId: req.auth.userId,
          tenantId: req.auth.tenantId,
          status: "ACTIVE",
          user: { status: "ACTIVE" },
          tenant: { status: "ACTIVE" },
        },
        select: { id: true },
      });
      if (!membership) {
        return next(unauthorized("Company context is no longer active"));
      }
      next();
    } catch (error) {
      next(error);
    }
  };

export const permissionAllowed = (
  permissions: readonly string[],
  permission: string,
  nodeEnvironment = env.NODE_ENV,
) =>
  permissions.includes(permission) ||
  (nodeEnvironment !== "production" && permissions.includes("*"));

export const permit =
  (permission: string): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth || !permissionAllowed(req.auth.permissions, permission)) {
      return next(forbidden());
    }
    next();
  };

export const validate =
  (
    schema: ZodSchema,
    source: "body" | "query" | "params" = "body",
  ): RequestHandler =>
  (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) return next(parsed.error);
    Object.defineProperty(req, source, {
      configurable: true,
      enumerable: true,
      value: parsed.data,
      writable: true,
    });
    next();
  };

export const notFoundHandler: RequestHandler = (req, _res, next) =>
  next(
    new AppError(
      404,
      "ROUTE_NOT_FOUND",
      `No route for ${req.method} ${req.path}`,
    ),
  );

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  void _next;
  req.log?.error({ err: error }, "request failed");
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }
  if (error instanceof AppError) {
    return res.status(error.status).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Field names are withheld: constraint targets describe internal schema.
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Resource not found" },
      });
    }
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        error: {
          code: "CONFLICT",
          message: "A record with these details already exists",
        },
      });
    }
    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        error: {
          code: "RELATED_RECORD_INVALID",
          message: "A referenced record is missing or cannot be changed",
        },
      });
    }
  }
  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
};
