import { resolve } from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import type { PrismaClient } from "@prisma/client";
import { env, resolveTrustProxy } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/prisma.js";
import { errorHandler, notFoundHandler } from "./common/middleware/http.js";
import { openApiDocument } from "./docs/openapi.js";
import { LocalPostgresSharedMasterProvider } from "./providers/shared-master/local-postgres.js";
import { apiRoutes } from "./routes/index.js";

export const createApp = (db: PrismaClient = prisma) => {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", resolveTrustProxy(env.TRUST_PROXY));
  app.use(pinoHttp({ logger }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  const provider = new LocalPostgresSharedMasterProvider(db);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use("/api/v1", apiRoutes(db, provider));
  const frontendDist = resolve(process.cwd(), env.FRONTEND_DIST);
  const prototypeDir = resolve(process.cwd(), env.PROTOTYPE_DIR);
  app.use("/prototype", (_req, res, next) => {
    // Isolate the approved legacy reference behind a compatibility policy.
    // The production React application retains Helmet's stricter CSP above.
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://unpkg.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
    next();
  });
  app.get(
    "/prototype/GenBioCa-Compliance-Platform-v2.html",
    (_req, res, next) => {
      res.sendFile(
        resolve(process.cwd(), "../GenBioCa-Compliance-Platform (1).html"),
        (error) => {
          if (error) next(error);
        },
      );
    },
  );
  app.use("/prototype", express.static(prototypeDir));
  app.use(express.static(frontendDist, { index: false }));
  // Never SPA-fallback hashed assets or source maps — that returns HTML as JS/CSS
  // and produces a blank page with only the unstyled skip link.
  app.get(/^\/assets(?:\/|$)/, (_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: "ASSET_NOT_FOUND",
        message:
          "Frontend asset was not found. Hard-refresh to load the latest build.",
      },
    });
  });
  app.get(/^\/(?!api(?:\/|$)|prototype(?:\/|$)).*/, (_req, res, next) => {
    res.sendFile(resolve(frontendDist, "index.html"), (error) => {
      if (error) next(error);
    });
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

export const app = createApp();
