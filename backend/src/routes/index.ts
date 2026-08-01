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
import { KpiActualRepository } from "../modules/kpis/actual-repository.js";
import { KpiActualService } from "../modules/kpis/actual-service.js";
import { kpiActualRoutes } from "../modules/kpis/actual-routes.js";
import { KpiPerformanceService } from "../modules/kpis/performance-service.js";
import { RiskRepository } from "../modules/risks/repository.js";
import { RiskService } from "../modules/risks/service.js";
import { riskRoutes } from "../modules/risks/routes.js";
import { EvidenceGateService } from "../modules/evidence/evidence-gate-service.js";
import { DashboardRepository } from "../modules/dashboard/repository.js";
import { DashboardService } from "../modules/dashboard/service.js";
import { dashboardRoutes } from "../modules/dashboard/routes.js";
import { PolicyRepository } from "../modules/policies/repository.js";
import { PolicyService } from "../modules/policies/service.js";
import {
  policyRoutes,
  policyVersionRoutes,
} from "../modules/policies/routes.js";
import { ControlRepository } from "../modules/controls/repository.js";
import { ControlService } from "../modules/controls/service.js";
import { controlRoutes } from "../modules/controls/routes.js";
import { CheckpointRepository } from "../modules/checkpoints/repository.js";
import { CheckpointService } from "../modules/checkpoints/service.js";
import { checkpointRoutes } from "../modules/checkpoints/routes.js";
import { EvidenceRepository } from "../modules/evidence/repository.js";
import { EvidenceService } from "../modules/evidence/service.js";
import { evidenceRoutes } from "../modules/evidence/routes.js";
import {
  authenticate,
  authorizeTenantContext,
} from "../common/middleware/http.js";
import { apiRateLimiter } from "../common/middleware/rate-limit.js";
import type { FileStorageProvider } from "../providers/file-storage/file-storage.js";
import {
  createFileStorageProvider,
} from "../providers/file-storage/file-storage.js";
import { env } from "../config/env.js";

export const apiRoutes = (
  db: PrismaClient,
  provider: SharedMasterProvider,
  fileStorage: FileStorageProvider = createFileStorageProvider({
    driver: env.FILE_STORAGE_DRIVER,
    localRoot: env.LOCAL_UPLOAD_DIR,
  }),
) => {
  const router = Router();
  const kpiManagement = new KpiManagementService(
    new KpiManagementRepository(db),
  );
  const risks = new RiskService(new RiskRepository(db));
  const dashboard = new DashboardService(new DashboardRepository(db));
  const evidenceGate = new EvidenceGateService(db);
  const policies = new PolicyService(new PolicyRepository(db), evidenceGate);
  const controls = new ControlService(new ControlRepository(db));
  const checkpoints = new CheckpointService(
    new CheckpointRepository(db),
    evidenceGate,
  );
  const evidence = new EvidenceService(
    new EvidenceRepository(db),
    fileStorage,
  );
  const kpiActuals = new KpiActualService(
    new KpiActualRepository(db),
    new KpiPerformanceService(),
    risks,
    evidenceGate,
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
  router.use("/dashboard", dashboardRoutes(dashboard));
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
  router.use("/kpi-actuals", kpiActualRoutes(kpiActuals));
  router.use("/risks", riskRoutes(risks));
  router.use("/policies", policyRoutes(policies));
  router.use("/policy-versions", policyVersionRoutes(policies));
  router.use("/controls", controlRoutes(controls));
  router.use("/checkpoints", checkpointRoutes(checkpoints));
  router.use("/evidence", evidenceRoutes(evidence));
  return router;
};
