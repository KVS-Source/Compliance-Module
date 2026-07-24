import { BookOpenCheck, Database, Landmark } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { SearchToolbar } from "../../components/forms/SearchToolbar";
import { DataTable, type Column } from "../../components/tables/DataTable";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { frameworkApi } from "../../services/frameworkApi";
import type { Framework, FrameworkRule } from "../../types/api";

export function FrameworksPage() {
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Statuses");
  const resource = useApiResource(frameworkApi.list, [contextVersion, user?.activeCompany.id]);
  const rows = useMemo(() => (resource.data ?? []).filter((entry) => {
    const text = `${entry.code} ${entry.name} ${entry.version} ${entry.description ?? ""}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (status === "All Statuses" || entry.status === status);
  }), [resource.data, search, status]);
  const columns: Column<Framework>[] = [
    { key: "code", label: "Framework Code", render: (row) => <span className="mono link-text">{row.code}</span> },
    { key: "name", label: "Framework Name", render: (row) => <div className="cell-title"><strong>{row.name}</strong><small>{row.description ?? "Shared compliance framework"}</small></div> },
    { key: "version", label: "Version", render: (row) => row.version },
    { key: "scope", label: "Scope", render: () => <Badge tone="purple">Shared master</Badge> },
    { key: "status", label: "Status", render: (row) => <Badge>{row.status}</Badge> },
  ];
  return <div className="page"><PageHeader title="Framework Master" section="Master Data Setup" description="Maintain active compliance frameworks and reference-only frameworks." connected primaryLabel="Add Framework" onPrimary={() => showToast("info", "Read-only in Milestone 1", "Framework write APIs are scheduled for the next backend milestone.")} />
    <SearchToolbar value={search} onChange={setSearch} placeholder="Search frameworks or versions…" status={status} onStatusChange={setStatus} />
    {resource.loading ? <LoadingState label="Loading shared frameworks…" /> : resource.error ? <ErrorState error={resource.error} /> : <DataTable rows={rows} columns={columns} caption="Framework Master" companyName={user?.activeCompany.name} onView={(row) => navigate(`/master/frameworks/${row.id}/rules`)} />}
    <div className="grid-2"><section className="card information-card"><span className="feature-icon tone-green"><Landmark size={19} /></span><div><strong>Active frameworks</strong><p>Frameworks and their rules are shared master data. Company adoption and control mappings remain later-phase records.</p></div></section><section className="card information-card"><span className="feature-icon tone-purple"><BookOpenCheck size={19} /></span><div><strong>Reference-only frameworks</strong><p>GDPR, SOC 1, SOC 2 and ADA/WCAG remain reference terminology from the approved prototype.</p></div></section></div>
  </div>;
}

interface RulesData { framework: Framework; rules: FrameworkRule[] }

export function FrameworkRulesPage() {
  const { frameworkId = "" } = useParams();
  const navigate = useNavigate();
  const resource = useApiResource<RulesData>(async () => {
    const [framework, rules] = await Promise.all([
      frameworkApi.get(frameworkId),
      frameworkApi.listRules(frameworkId),
    ]);
    return { framework, rules };
  }, [frameworkId]);
  const columns: Column<FrameworkRule>[] = [
    { key: "code", label: "Rule Code", render: (row) => <span className="mono link-text">{row.code}</span> },
    { key: "title", label: "Rule Title", render: (row) => <strong>{row.title}</strong> },
    { key: "description", label: "Description", render: (row) => row.description ?? "—" },
    { key: "status", label: "Status", render: (row) => <Badge>{row.status}</Badge> },
  ];
  return <div className="page"><PageHeader title={resource.data ? `${resource.data.framework.name} Rules` : "Framework Rules"} section="Master Data Setup" description="Review shared-master requirements belonging to the selected framework." connected actions={<button className="btn btn-secondary" type="button" onClick={() => navigate("/master/frameworks")}>Back to Frameworks</button>} />
    {resource.loading ? <LoadingState label="Loading framework rules…" /> : resource.error ? <ErrorState error={resource.error} /> : resource.data ? <><section className="card framework-summary"><span className="feature-icon tone-blue"><Database size={20} /></span><div><span className="mono">{resource.data.framework.code} · Version {resource.data.framework.version}</span><h2>{resource.data.framework.name}</h2><p>{resource.data.framework.description ?? "Shared compliance framework"}</p></div><Badge>{resource.data.framework.status}</Badge></section><DataTable rows={resource.data.rules} columns={columns} caption={`${resource.data.framework.name} Framework Rules`} /></> : null}
  </div>;
}
