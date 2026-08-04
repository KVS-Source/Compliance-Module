import { LoaderCircle, RefreshCw, WifiOff } from "lucide-react";
import { useEffect } from "react";
import {
  Navigate,
  createBrowserRouter,
  useNavigate,
  type RouteObject,
} from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { PermissionBoundary } from "../components/feedback/PermissionBoundary";
import { useAuth } from "../context/AuthContext";
import { CompaniesPage } from "../features/companies/CompaniesPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import {
  FrameworkRulesPage,
  FrameworksPage,
} from "../features/frameworks/FrameworksPage";
import { LoginPage } from "../features/auth/LoginPage";
import { NotFoundPage } from "../features/migration/PendingPage";
import { KpiActualEntryPage } from "../features/kpis/KpiActualEntryPage";
import { KpiApprovalPage } from "../features/kpis/KpiApprovalPage";
import { KpiConfigurationPage } from "../features/kpis/KpiConfigurationPage";
import { KpiTargetsPage } from "../features/kpis/KpiTargetsPage";
import { OrganisationPage } from "../features/organisation/OrganisationPage";
import { ModuleStatusPage } from "../features/migration/ModuleStatusPage";
import { ControlDetailPage } from "../features/controls/ControlDetailPage";
import { ControlRegisterPage } from "../features/controls/ControlRegisterPage";
import { CheckpointDetailPage } from "../features/checkpoints/CheckpointDetailPage";
import { CheckpointRegisterPage } from "../features/checkpoints/CheckpointRegisterPage";
import { EvidenceCreatePage } from "../features/evidence/EvidenceCreatePage";
import { EvidenceDetailPage } from "../features/evidence/EvidenceDetailPage";
import { EvidenceLibraryPage } from "../features/evidence/EvidenceLibraryPage";
import { EvidenceReviewQueuePage } from "../features/evidence/EvidenceReviewQueuePage";
import { PolicyDetailPage } from "../features/policies/PolicyDetailPage";
import { PolicyRegisterPage } from "../features/policies/PolicyRegisterPage";
import { RiskDetailPage } from "../features/risks/RiskDetailPage";
import { RiskRegisterPage } from "../features/risks/RiskRegisterPage";
import { GapDetailPage } from "../features/gaps/GapDetailPage";
import { GapRegisterPage } from "../features/gaps/GapRegisterPage";
import { CapaDetailPage } from "../features/capas/CapaDetailPage";
import { CapaRegisterPage } from "../features/capas/CapaRegisterPage";
import { ImportDetailPage } from "../features/imports/ImportDetailPage";
import { ImportHistoryPage } from "../features/imports/ImportHistoryPage";
import { ImportCentrePage } from "../features/imports/ImportCentrePage";
import { AuditTrailPage } from "../features/audit/AuditTrailPage";
import {
  OperationalRegisterDetailPage,
  OperationalRegistersPage,
} from "../features/registers/OperationalRegistersPage";
import { GenracIntegrationPage } from "../features/integrations/GenracIntegrationPage";
import { UsersPage } from "../features/users/UsersPage";
import { migratedPaths, routeDefinitions } from "./routeDefinitions";

function ProtectedShell() {
  const { user, loading, restoreError, retrySessionRestore } = useAuth();
  if (loading)
    return (
      <div className="app-loading" role="status">
        <LoaderCircle className="spin" size={28} />
        <strong>Restoring secure session…</strong>
      </div>
    );
  if (!user && restoreError)
    return (
      <div className="app-loading service-unavailable" role="alert">
        <WifiOff size={28} />
        <strong>Service temporarily unavailable</strong>
        <p>{restoreError.message}</p>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => void retrySessionRestore()}
        >
          <RefreshCw size={15} /> Retry connection
        </button>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function LegacyHashRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const definition = routeDefinitions.find(
      (item) => item.legacyHash === window.location.hash,
    );
    navigate(definition?.path ?? "/dashboard", { replace: true });
  }, [navigate]);
  return (
    <div className="app-loading" role="status">
      <LoaderCircle className="spin" size={24} />
      <strong>Opening migrated route…</strong>
    </div>
  );
}

const migratedRoutes: RouteObject[] = [
  {
    path: "dashboard",
    element: (
      <PermissionBoundary permission="dashboard:read">
        <DashboardPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "admin/companies",
    element: (
      <PermissionBoundary permission="tenants:read">
        <CompaniesPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "admin/users",
    element: (
      <PermissionBoundary permission="users:read">
        <UsersPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "admin/departments",
    element: (
      <PermissionBoundary permission="organisation:read">
        <OrganisationPage kind="departments" />
      </PermissionBoundary>
    ),
  },
  {
    path: "admin/locations",
    element: (
      <PermissionBoundary permission="organisation:read">
        <OrganisationPage kind="locations" />
      </PermissionBoundary>
    ),
  },
  {
    path: "admin/organisation-units",
    element: (
      <PermissionBoundary permission="organisation:read">
        <OrganisationPage kind="units" />
      </PermissionBoundary>
    ),
  },
  {
    path: "master/frameworks",
    element: (
      <PermissionBoundary permission="frameworks:read">
        <FrameworksPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "master/framework-rules",
    element: (
      <PermissionBoundary permission="frameworks:read">
        <FrameworksPage mode="rules" />
      </PermissionBoundary>
    ),
  },
  {
    path: "master/frameworks/:frameworkId/rules",
    element: (
      <PermissionBoundary permission="frameworks:read">
        <FrameworkRulesPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "kpi/configuration",
    element: (
      <PermissionBoundary permission="kpis:read">
        <KpiConfigurationPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "kpi/targets",
    element: (
      <PermissionBoundary permission="kpis:read">
        <KpiConfigurationPage mode="targets" />
      </PermissionBoundary>
    ),
  },
  {
    path: "kpi/configuration/:configurationId/targets",
    element: (
      <PermissionBoundary permission="kpis:read">
        <KpiTargetsPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "kpi/approval",
    element: (
      <PermissionBoundary permission="kpis:read">
        <KpiApprovalPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "kpi/actual-entry",
    element: (
      <PermissionBoundary permission="kpis:read">
        <KpiActualEntryPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "compliance/risks",
    element: (
      <PermissionBoundary permission="risk:read">
        <RiskRegisterPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "compliance/risks/:riskId",
    element: (
      <PermissionBoundary permission="risk:read">
        <RiskDetailPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "compliance/gaps",
    element: (
      <PermissionBoundary permission="gaps:read">
        <GapRegisterPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "compliance/gaps/:gapId",
    element: (
      <PermissionBoundary permission="gaps:read">
        <GapDetailPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "compliance/capa",
    element: (
      <PermissionBoundary permission="capa:read">
        <CapaRegisterPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "compliance/capa/:capaId",
    element: (
      <PermissionBoundary permission="capa:read">
        <CapaDetailPage />
      </PermissionBoundary>
    ),
  },
  { path: "data/import", element: <PermissionBoundary permission="imports:read"><ImportCentrePage /></PermissionBoundary> },
  { path: "data/import-history", element: <PermissionBoundary permission="imports:read"><ImportHistoryPage /></PermissionBoundary> },
  { path: "data/import-history/:importId", element: <PermissionBoundary permission="imports:read"><ImportDetailPage /></PermissionBoundary> },
  { path: "data/genrac-integration", element: <PermissionBoundary permission="integrations:read"><GenracIntegrationPage /></PermissionBoundary> },
  { path: "audit-trail", element: <PermissionBoundary permission="audit:read"><AuditTrailPage /></PermissionBoundary> },
  { path: "compliance/operational-registers", element: <PermissionBoundary permission="registers:read"><OperationalRegistersPage /></PermissionBoundary> },
  { path: "compliance/operational-registers/:registerCode", element: <PermissionBoundary permission="registers:read"><OperationalRegistersPage /></PermissionBoundary> },
  { path: "compliance/operational-registers/:registerCode/records/:recordId", element: <PermissionBoundary permission="registers:read"><OperationalRegisterDetailPage /></PermissionBoundary> },
  {
    path: "compliance/policy-register",
    element: (
      <PermissionBoundary permission="policies:read">
        <PolicyRegisterPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "compliance/policies/:policyId",
    element: (
      <PermissionBoundary permission="policies:read">
        <PolicyDetailPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "compliance/controls",
    element: (
      <PermissionBoundary permission="controls:read">
        <ControlRegisterPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "compliance/controls/:controlId",
    element: (
      <PermissionBoundary permission="controls:read">
        <ControlDetailPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "compliance/checkpoints",
    element: (
      <PermissionBoundary permission="checkpoints:read">
        <CheckpointRegisterPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "compliance/checkpoints/:checkpointId",
    element: (
      <PermissionBoundary permission="checkpoints:read">
        <CheckpointDetailPage />
      </PermissionBoundary>
    ),
  },
  // Previously published Evidence URLs. Declared ahead of the dynamic detail
  // route so a reserved segment can never be read as an Evidence ID.
  { path: "evidence/register", element: <Navigate to="/evidence/new" replace /> },
  { path: "evidence/upload", element: <Navigate to="/evidence/new" replace /> },
  { path: "evidence/approved", element: <Navigate to="/evidence?lifecycleStatus=APPROVED" replace /> },
  { path: "evidence/rejected", element: <Navigate to="/evidence?lifecycleStatus=REJECTED" replace /> },
  {
    path: "evidence",
    element: (
      <PermissionBoundary permission="evidence:read">
        <EvidenceLibraryPage />
      </PermissionBoundary>
    ),
  },
  {
    path: "evidence/new",
    element: (
      <PermissionBoundary permission="evidence:write">
        <EvidenceCreatePage />
      </PermissionBoundary>
    ),
  },
  {
    path: "evidence/review",
    element: (
      <PermissionBoundary permission="evidence:review">
        <EvidenceReviewQueuePage />
      </PermissionBoundary>
    ),
  },
  {
    path: "evidence/:evidenceId",
    element: (
      <PermissionBoundary permission="evidence:read">
        <EvidenceDetailPage />
      </PermissionBoundary>
    ),
  },
];

const pendingRoutes: RouteObject[] = routeDefinitions
  .filter((definition) => !migratedPaths.has(definition.path))
  .map((definition) => ({
    path: definition.path.slice(1),
    element: <ModuleStatusPage />,
  }));

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <ProtectedShell />,
    children: [
      { index: true, element: <LegacyHashRedirect /> },
      ...migratedRoutes,
      ...pendingRoutes,
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
