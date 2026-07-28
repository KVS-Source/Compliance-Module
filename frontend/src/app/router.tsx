import { LoaderCircle } from "lucide-react";
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
import { RiskDetailPage } from "../features/risks/RiskDetailPage";
import { RiskRegisterPage } from "../features/risks/RiskRegisterPage";
import { UsersPage } from "../features/users/UsersPage";
import { migratedPaths, routeDefinitions } from "./routeDefinitions";

function ProtectedShell() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="app-loading" role="status">
        <LoaderCircle className="spin" size={28} />
        <strong>Restoring secure session…</strong>
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
  { path: "dashboard", element: <DashboardPage /> },
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
