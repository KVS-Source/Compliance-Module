import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  CircleGauge,
  ClipboardCheck,
  FileSearch,
  Landmark,
  MapPin,
  Network,
  Wrench,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { MetricCard } from "../../components/charts/MetricCard";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { dashboardApi } from "../../services/dashboardApi";

const value = (count: number | undefined) => count ?? "—";

export function DashboardPage() {
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const navigate = useNavigate();
  const resource = useApiResource(
    () => dashboardApi.summary(),
    [contextVersion, user?.activeCompany.id],
  );
  const kpis = resource.data?.kpis;
  const risks = resource.data?.risks;
  const organisation = resource.data?.organisation;
  const frameworks = resource.data?.frameworks;
  const compliance = resource.data?.compliance;
  const gaps = resource.data?.gaps;
  const capas = resource.data?.capas;
  const evidence = resource.data?.evidence;
  const registerRecords = resource.data?.registers?.reduce(
    (total, register) => total + register.recordCount,
    0,
  );
  const operationalCount =
    (kpis?.activeConfigurations ?? 0) +
    (kpis?.amberActuals ?? 0) +
    (kpis?.redActuals ?? 0) +
    (risks?.openRisks ?? 0) +
    (risks?.risksUnderTreatment ?? 0) +
    (risks?.closedRisks ?? 0);
  const deadlineCount =
    operationalCount +
    (gaps?.open ?? 0) +
    (capas?.open ?? 0) +
    (evidence?.pendingReview ?? 0) +
    (registerRecords ?? 0);

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        section="Overview"
        description="Live Company-scoped KPI, approval and risk status from PostgreSQL."
        connected
        actions={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => navigate("/compliance/risks")}
            >
              <ShieldAlert size={16} /> Risk Register
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => navigate("/kpi/actual-entry")}
            >
              <CircleGauge size={16} /> Record KPI Actual
            </button>
          </>
        }
      />

      {resource.loading ? (
        <LoadingState label="Loading live dashboard aggregates…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : resource.data ? (
        <>
          {deadlineCount === 0 && (
            <div className="state-panel" role="status">
              <CircleGauge size={24} />
              <div>
                <strong>No compliance activity yet</strong>
                <p>
                  Configure a KPI and submit an actual to populate this
                  dashboard.
                </p>
              </div>
            </div>
          )}

          <div className="cards dashboard-cards">
            <MetricCard
              label="Overall Compliance"
              value={compliance ? `${compliance.overallPercentage}%` : "—"}
              note={compliance ? `${compliance.kpisMeetingTarget} of ${compliance.measuredKpis} measured KPIs met target` : "permission restricted"}
              icon={CircleGauge}
              tone="blue"
              to="/kpi/approval"
            />
            <MetricCard
              label="Active KPI Configurations"
              value={value(kpis?.activeConfigurations)}
              note={kpis ? "enabled in this Company" : "permission restricted"}
              icon={CircleGauge}
              tone="blue"
              to="/kpi/configuration"
            />
            <MetricCard
              label="KPIs Meeting Target"
              value={value(kpis?.meetingTarget)}
              note={kpis ? "non-informational actuals" : "permission restricted"}
              icon={CheckCircle2}
              tone="green"
              to="/kpi/approval"
            />
            <MetricCard
              label="AMBER KPI Actuals"
              value={value(kpis?.amberActuals)}
              note={kpis ? "Minor risk candidates" : "permission restricted"}
              icon={TriangleAlert}
              tone="amber"
              to="/kpi/approval"
            />
            <MetricCard
              label="RED KPI Actuals"
              value={value(kpis?.redActuals)}
              note={kpis ? "Major risk candidates" : "permission restricted"}
              icon={TriangleAlert}
              tone="red"
              to="/kpi/approval"
            />
            <MetricCard
              label="Pending KPI Approvals"
              value={value(kpis?.pendingApprovals)}
              note={kpis ? "awaiting a decision" : "permission restricted"}
              icon={BadgeCheck}
              tone="purple"
              to="/kpi/approval"
            />
            <MetricCard
              label="Open Risks"
              value={value(risks?.openRisks)}
              note={risks ? "status OPEN" : "permission restricted"}
              icon={ShieldAlert}
              tone="red"
              to="/compliance/risks"
            />
            <MetricCard
              label="MINOR Risks"
              value={value(risks?.minorRisks)}
              note={risks ? "active KPI risks" : "permission restricted"}
              icon={ShieldAlert}
              tone="amber"
              to="/compliance/risks"
            />
            <MetricCard
              label="MAJOR Risks"
              value={value(risks?.majorRisks)}
              note={risks ? "active KPI risks" : "permission restricted"}
              icon={ShieldAlert}
              tone="red"
              to="/compliance/risks"
            />
            <MetricCard
              label="Risks Under Treatment"
              value={value(risks?.risksUnderTreatment)}
              note={risks ? "status TREATED" : "permission restricted"}
              icon={ShieldAlert}
              tone="blue"
              to="/compliance/risks"
            />
            <MetricCard
              label="Closed Risks"
              value={value(risks?.closedRisks)}
              note={risks ? "status CLOSED" : "permission restricted"}
              icon={CheckCircle2}
              tone="green"
              to="/compliance/risks"
            />
            <MetricCard label="Open Gaps" value={value(gaps?.open)} note={gaps ? "requiring remediation" : "permission restricted"} icon={TriangleAlert} tone="amber" to="/compliance/gaps" />
            <MetricCard label="Overdue Gaps" value={value(gaps?.overdue)} note={gaps ? "past due and still open" : "permission restricted"} icon={TriangleAlert} tone="red" to="/compliance/gaps" />
            <MetricCard label="Open CAPAs" value={value(capas?.open)} note={capas ? "corrective actions active" : "permission restricted"} icon={Wrench} tone="blue" to="/compliance/capa" />
            <MetricCard label="Overdue CAPAs" value={value(capas?.overdue)} note={capas ? "past due and still open" : "permission restricted"} icon={Wrench} tone="red" to="/compliance/capa" />
            <MetricCard label="Pending Evidence Reviews" value={value(evidence?.pendingReview)} note={evidence ? "submitted for decision" : "permission restricted"} icon={FileSearch} tone="purple" to="/evidence" />
            <MetricCard label="Operational Records" value={value(registerRecords)} note={resource.data.registers ? `across ${resource.data.registers.length} active registers` : "permission restricted"} icon={ClipboardCheck} tone="grey" to="/compliance/operational-registers" />
          </div>

          <div className="grid-2 dashboard-secondary-grid">
            <section className="card">
              <header className="card-head">
                <div>
                  <h2>Organisation Summary</h2>
                  <p>Active records in {user?.activeCompany.name}</p>
                </div>
                <Link className="btn btn-secondary" to="/admin/departments">
                  View all departments
                </Link>
              </header>
              <div className="boundary-grid">
                <Link
                  to="/admin/departments"
                  aria-label={`Departments: ${value(organisation?.departments)}. Open Departments`}
                >
                  <Network size={20} />
                  <strong>{value(organisation?.departments)}</strong>
                  <span>Departments</span>
                </Link>
                <Link
                  to="/admin/locations"
                  aria-label={`Locations: ${value(organisation?.locations)}. Open Locations`}
                >
                  <MapPin size={20} />
                  <strong>{value(organisation?.locations)}</strong>
                  <span>Locations</span>
                </Link>
                <Link
                  to="/admin/organisation-units"
                  aria-label={`Organisation Units: ${value(organisation?.organisationUnits)}. Open Organisation Units`}
                >
                  <Building2 size={20} />
                  <strong>{value(organisation?.organisationUnits)}</strong>
                  <span>Organisation Units</span>
                </Link>
              </div>
            </section>
            <section className="card">
              <header className="card-head">
                <div>
                  <h2>Framework Summary</h2>
                  <p>Shared active compliance catalogue</p>
                </div>
                <Link className="btn btn-secondary" to="/master/frameworks">
                  View all frameworks
                </Link>
              </header>
              <div className="boundary-grid">
                <Link
                  to="/master/frameworks"
                  aria-label={`Active Frameworks: ${value(frameworks?.activeFrameworks)}. Open Frameworks`}
                >
                  <Landmark size={20} />
                  <strong>{value(frameworks?.activeFrameworks)}</strong>
                  <span>Active Frameworks</span>
                </Link>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
