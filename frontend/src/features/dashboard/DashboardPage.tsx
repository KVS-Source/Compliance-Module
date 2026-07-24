import {
  Activity,
  AlarmClock,
  Archive,
  BookOpenCheck,
  CheckCircle2,
  CircleGauge,
  Download,
  FileCheck2,
  MoreHorizontal,
  Plus,
  Search,
  ShieldAlert,
  TriangleAlert,
  Wrench,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MetricCard } from "../../components/charts/MetricCard";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { frameworkApi } from "../../services/frameworkApi";
import { masterDataApi } from "../../services/masterDataApi";
import type { Framework, KpiDefinition } from "../../types/api";

interface DashboardData {
  frameworks: Framework[] | null;
  kpis: KpiDefinition[] | null;
}

const months = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];

function DashboardFilters({ companyName }: { companyName: string }) {
  return (
    <form className="filter-bar dashboard-filters" onSubmit={(event) => event.preventDefault()}>
      <label className="filter-search"><span className="sr-only">Search this page</span><Search className="icon" size={16} /><input className="control" type="search" placeholder="Search records…" /></label>
      <label><span className="sr-only">Department</span><select className="control" defaultValue="all"><option value="all">All Departments</option></select></label>
      <label><span className="sr-only">Framework</span><select className="control" defaultValue="all"><option value="all">All Active Frameworks</option></select></label>
      <label><span className="sr-only">Date Range</span><select className="control" defaultValue="six"><option value="six">Last 6 Months</option><option value="quarter">This Quarter</option><option value="year">This Year</option></select></label>
      <label><span className="sr-only">Owner</span><select className="control" defaultValue="all"><option value="all">All Owners</option></select></label>
      <label><span className="sr-only">Status</span><select className="control" defaultValue="all"><option value="all">All Statuses</option></select></label>
      <label><span className="sr-only">Saved view</span><select className="control" defaultValue="all"><option value="all">All Records</option></select></label>
      <button className="btn btn-ghost" type="reset">× Clear</button>
      <span className="filter-meta">Company-scoped data</span>
      <div className="filter-chips"><span className="chip">{companyName}</span><span className="chip">All Records</span></div>
    </form>
  );
}

function TrendPlaceholder() {
  return (
    <div className="line-chart" aria-label="KPI trend awaiting actuals API">
      <div className="line-bars">
        {months.map((month, index) => <div className="month-col" key={month}><span className="vbar trend-target skeleton" style={{ height: `${48 + index * 5}%` }} /><span className="vbar trend-actual skeleton" style={{ height: `${38 + index * 4}%` }} /><span className="month-label">{month}</span></div>)}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const resource = useApiResource<DashboardData>(async () => {
    const [frameworks, kpis] = await Promise.all([
      hasPermission("frameworks:read") ? frameworkApi.list() : Promise.resolve(null),
      hasPermission("kpis:read") ? masterDataApi.listKpiDefinitions() : Promise.resolve(null),
    ]);
    return { frameworks, kpis };
  }, [contextVersion, user?.activeCompany.id]);

  const totalKpis = resource.data?.kpis?.length ?? null;
  const activeKpis = resource.data?.kpis?.filter((kpi) => kpi.status === "ACTIVE").length ?? null;

  return <div className="page">
    <PageHeader
      title="Dashboard"
      section="Overview"
      description="Company-wide compliance, KPI, evidence, CAPA and risk overview."
      connected
      actions={<><button className="btn btn-secondary" type="button" onClick={() => showToast("info", "Export boundary", "Operational dashboard export requires the later reporting API.")}><Download size={16} /> Export CSV</button><button className="btn btn-primary" type="button" onClick={() => navigate("/master/kpis")}><Plus size={16} /> Quick Add</button></>}
    />
    <DashboardFilters companyName={user?.activeCompany.name ?? "Active Company"} />
    {resource.loading ? <LoadingState label="Loading dashboard data…" /> : resource.error ? <ErrorState error={resource.error} /> : resource.data ? <>
      <div className="cards dashboard-cards">
        <MetricCard label="Total KPIs" value={totalKpis ?? "—"} note={totalKpis === null ? "permission restricted" : "catalogue definitions"} icon={CircleGauge} tone="blue" />
        <MetricCard label="Active KPIs" value={activeKpis ?? "—"} note="in current catalogue" icon={Activity} tone="green" />
        <MetricCard label="KPIs Achieved" value="—" note="actuals API · Milestone 4" icon={CheckCircle2} tone="green" />
        <MetricCard label="KPIs Not Achieved" value="—" note="actuals API · Milestone 4" icon={XCircle} tone="red" />
        <MetricCard label="Pending Evidence" value="—" note="evidence API · Milestone 4" icon={Archive} tone="amber" />
        <MetricCard label="Open Gaps" value="—" note="gap API · Milestone 5" icon={TriangleAlert} tone="amber" />
        <MetricCard label="Open CAPA" value="—" note="CAPA API · Milestone 5" icon={Wrench} tone="blue" />
        <MetricCard label="Overdue CAPA" value="—" note="CAPA API · Milestone 5" icon={AlarmClock} tone="red" />
        <MetricCard label="Policies Pending Review" value="—" note="policy API · Milestone 3" icon={BookOpenCheck} tone="amber" />
        <MetricCard label="High Risks" value="—" note="risk API · Milestone 5" icon={ShieldAlert} tone="red" />
      </div>
      <div className="dashboard-grid">
        <section className="card"><header className="card-head"><div><h2>KPI Performance Trend</h2><p>Target vs actual · actuals are not yet authoritative</p></div><button className="tiny-btn" type="button" aria-label="Chart menu"><MoreHorizontal size={16} /></button></header><TrendPlaceholder /></section>
        <section className="card"><header className="card-head"><div><h2>Evidence Approval Status</h2><p>Company-scoped inventory · Milestone 4 API</p></div></header><div className="donut-wrap"><div className="donut donut-pending" data-total="—" /><div className="legend"><div className="legend-row"><span className="legend-dot tone-grey" />Awaiting evidence service</div><div className="legend-row"><FileCheck2 size={14} /> No local mock records</div></div></div></section>
      </div>
      <div className="grid-2 dashboard-secondary-grid">
        <section className="card"><header className="card-head"><div><h2>Compliance Status by Framework</h2><p>{resource.data.frameworks?.length ?? 0} framework catalogue records</p></div></header><div className="framework-list">{resource.data.frameworks?.map((framework) => <div className="framework-row" key={framework.id}><span><strong>{framework.name}</strong><small>{framework.code} · {framework.version}</small></span><span className={`badge ${framework.status === "ACTIVE" ? "badge-green" : "badge-grey"}`}>{framework.status}</span></div>)}</div></section>
        <section className="card dashboard-boundary"><header className="card-head"><div><h2>Risk, CAPA & Evidence</h2><p>Prototype structure retained without invented operational data</p></div></header><div className="boundary-grid"><div><ShieldAlert size={20} /><strong>Risk Heat Map</strong><span>Milestone 5 API</span></div><div><Wrench size={20} /><strong>CAPA Aging</strong><span>Milestone 5 API</span></div><div><Archive size={20} /><strong>Evidence Pending</strong><span>Milestone 4 API</span></div></div></section>
      </div>
    </> : null}
  </div>;
}
