import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type { SharedMasterProvider } from "../providers/shared-master/provider.js";
import { authRoutes } from "../modules/auth/routes.js";
import { AuthRepository } from "../modules/auth/repository.js";
import { AuthService } from "../modules/auth/service.js";
import { tenantsRoutes } from "../modules/tenants/routes.js";
import { usersRoutes } from "../modules/users/routes.js";
import { UsersRepository } from "../modules/users/repository.js";
import { organisationRoutes } from "../modules/organisation/routes.js";
import {
  frameworksRoutes,
  FrameworksRepository,
} from "../modules/frameworks/routes.js";
import { kpiDefinitionRoutes, kpiGoalRoutes } from "../modules/kpis/routes.js";
import {
  authenticate,
  authorizeTenantContext,
} from "../common/middleware/http.js";

export const apiRoutes = (db: PrismaClient, provider: SharedMasterProvider) => {
  const router = Router();
  router.get("/health", (_req, res) =>
    res.json({
      success: true,
      data: { status: "ok", service: "genbioca-compliance-api" },
    }),
  );
  router.use("/auth", authRoutes(new AuthService(new AuthRepository(db))));
  router.use(authenticate, authorizeTenantContext(db));
  router.use("/tenants", tenantsRoutes(provider));
  router.use("/users", usersRoutes(provider, new UsersRepository(db)));
  router.use("/organisation", organisationRoutes(provider));
  router.use(
    "/frameworks",
    frameworksRoutes(provider, new FrameworksRepository(db)),
  );
  router.use("/kpi-definitions", kpiDefinitionRoutes(provider));
  router.use("/kpi-goals", kpiGoalRoutes(provider));
  return router;
};
