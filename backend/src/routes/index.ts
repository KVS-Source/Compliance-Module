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
import { OrganisationRepository } from "../modules/organisation/repository.js";
import {
  frameworksRoutes,
  FrameworksRepository,
} from "../modules/frameworks/routes.js";
import { kpiDefinitionRoutes, kpiGoalRoutes } from "../modules/kpis/routes.js";
import { KpiManagementRepository } from "../modules/kpis/management-repository.js";
import { KpiManagementService } from "../modules/kpis/management-service.js";
import {
  kpiConfigurationRoutes,
  kpiTargetRoutes,
} from "../modules/kpis/management-routes.js";
import {
  authenticate,
  authorizeTenantContext,
} from "../common/middleware/http.js";
import { apiRateLimiter } from "../common/middleware/rate-limit.js";

export const apiRoutes = (db: PrismaClient, provider: SharedMasterProvider) => {
  const router = Router();
  const kpiManagement = new KpiManagementService(
    new KpiManagementRepository(db),
  );
  router.get("/health", (_req, res) =>
    res.json({
      success: true,
      data: { status: "ok" },
    }),
  );
  router.get("/ready", async (req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return res.json({ success: true, data: { status: "ready" } });
    } catch {
      req.log?.warn("readiness check failed");
      return res.status(503).json({
        success: false,
        error: {
          code: "NOT_READY",
          message: "Service is not ready",
        },
      });
    }
  });
  // Mounted after the probes so orchestrator health checks never consume budget.
  router.use(apiRateLimiter());
  router.use("/auth", authRoutes(new AuthService(new AuthRepository(db))));
  router.use(authenticate, authorizeTenantContext(db));
  router.use("/tenants", tenantsRoutes(provider));
  router.use("/users", usersRoutes(provider, new UsersRepository(db)));
  router.use(
    "/organisation",
    organisationRoutes(provider, new OrganisationRepository(db)),
  );
  router.use(
    "/frameworks",
    frameworksRoutes(provider, new FrameworksRepository(db)),
  );
  router.use("/kpi-definitions", kpiDefinitionRoutes(provider));
  router.use("/kpi-goals", kpiGoalRoutes(provider));
  router.use("/kpi-configurations", kpiConfigurationRoutes(kpiManagement));
  router.use("/kpi-targets", kpiTargetRoutes(kpiManagement));
  return router;
};
