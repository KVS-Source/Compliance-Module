import {
  Archive,
  ArrowRight,
  BookOpenCheck,
  CircleGauge,
  Download,
  GitMerge,
  Landmark,
  ListChecks,
  Shield,
  ShieldAlert,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MetricCard } from "../../components/charts/MetricCard";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { kpiCatalogueApi } from "../../services/submissionApi";
import type {
  KpiTraceabilityRef,
  KpiTraceabilityRow,
} from "../../types/api";

type TraceNodeData = {
  label: string;
  primary: string;
  secondary: string;
  status: string;
  tone: "blue" | "green" | "amber" | "red" | "purple" | "grey";
  icon: LucideIcon;
  to?: string;
  missing?: boolean;
};

const first = <T,>(items: T[]) => items[0];
const additional = (items: unknown[]) =>
  items.length > 1 ? ` · +${items.length - 1} more` : "";
const displayName = (item: KpiTraceabilityRef | undefined) =>
  item?.title ?? item?.name ?? "Not linked";

function TraceNode({ node }: { node: TraceNodeData }) {
  const Icon = node.icon;
  const content = (
    <>
      <span className={`card-icon tone-${node.tone}`}><Icon size={18} /></span>
      <span className="trace-node-label">{node.label}</span>
      <strong>{node.primary}</strong>
      <small>{node.secondary}</small>
      <Badge tone={node.missing ? "grey" : node.tone}>{node.status}</Badge>
    </>
  );
  return node.to ? (
    <Link className="kpi-trace-node" to={node.to}>{content}</Link>
  ) : (
    <article className={`kpi-trace-node${node.missing ? " missing" : ""}`}>
      {content}
    </article>
  );
}

const csvCell = (value: string | number) =>
  `"${String(value).replaceAll('"', '""')}"`;

export function KpiTraceabilityPage() {
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const resource = useApiResource(kpiCatalogueApi.traceability, [
    contextVersion,
    user?.activeCompany.id,
  ]);
  const data = resource.data;
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.rows ?? []).filter((row) =>
      !query ||
      [
        row.kpi.code,
        row.kpi.name,
        row.kpi.frameworkMapping ?? "",
        row.targetActual.period,
        ...row.policies.flatMap((item) => [item.code, item.title]),
        ...row.frameworks.flatMap((item) => [item.code, item.name]),
        ...row.controls.flatMap((item) => [item.code, item.title]),
        ...row.evidence.flatMap((item) => [item.code, item.title]),
        ...row.risks.flatMap((item) => [item.code, item.title]),
      ].join(" ").toLowerCase().includes(query),
    );
  }, [data?.rows, search]);

  useEffect(() => {
    if (!rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0]?.id ?? "");
    }
  }, [rows, selectedId]);

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];

  const exportCsv = () => {
    if (!data) return;
    const headers = [
      "KPI",
      "Period",
      "Policy",
      "Framework",
      "Rule",
      "Evidence",
      "Control",
      "Target",
      "Actual",
      "RAG",
      "Risk",
      "Declared Framework Mapping",
      "Mapped Nodes",
    ];
    const lines = data.rows.map((row) =>
      [
        `${row.kpi.code} · ${row.kpi.name}`,
        row.targetActual.period,
        row.policies.map((item) => item.code).join(" | "),
        row.frameworks.map((item) => item.code).join(" | "),
        row.rules.map((item) => item.code).join(" | "),
        row.evidence.map((item) => item.code).join(" | "),
        row.controls.map((item) => item.code).join(" | "),
        row.targetActual.targetValue,
        row.targetActual.actualValue,
        row.targetActual.ragStatus ?? "",
        row.risks.map((item) => item.code).join(" | "),
        row.kpi.frameworkMapping ?? "",
        `${row.completeness.mappedNodes}/${row.completeness.totalNodes}`,
      ].map(csvCell).join(","),
    );
    const blob = new Blob([[headers.map(csvCell).join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "kpi-compliance-traceability.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page kpi-traceability-page" data-testid="kpi-traceability-page">
      <PageHeader
        title="KPI Mapping & Compliance Traceability"
        section="KPI Management"
        description="KPI performance and linked compliance records."
        connected
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={exportCsv} disabled={!data?.rows.length}>
              <Download size={15} /> Export CSV
            </button>
            <Link className="btn btn-primary" to="/evidence">
              <GitMerge size={15} /> Manage Source Links
            </Link>
          </>
        }
      />

      {resource.loading ? (
        <LoadingState label="Loading KPI compliance traceability…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : data ? (
        <>
          <div className="cards kpi-trace-summary" data-testid="kpi-trace-summary">
            <MetricCard label="KPI Actuals" value={data.summary.actuals} note="latest 100 in Company scope" icon={CircleGauge} tone="blue" to="/kpi/analytics" />
            <MetricCard label="Complete Chains" value={data.summary.completeChains} note="all eight nodes linked" icon={GitMerge} tone="green" />
            <MetricCard label="Missing Evidence" value={data.summary.missingEvidence} note="actuals without an active Evidence link" icon={Archive} tone="amber" to="/evidence" />
            <MetricCard label="Risk Linked" value={data.summary.riskLinked} note="actuals with a linked Risk" icon={ShieldAlert} tone="red" to="/compliance/risks" />
            <MetricCard label="Unlinked References" value={data.summary.declaredWithoutChain} note="workbook reference without a Control mapping" icon={GitMerge} tone="amber" />
          </div>

          <div className="toolbar kpi-trace-toolbar">
            <label className="filter-search">
              <span className="sr-only">Search traceability</span>
              <input className="control" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search KPI, policy, framework, control or risk…" aria-label="Search traceability" />
            </label>
            <label className="toolbar-select kpi-trace-select">
              <span className="sr-only">Selected KPI actual</span>
              <select className="control" value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)} aria-label="Selected KPI actual">
                {rows.map((row) => <option value={row.id} key={row.id}>{row.kpi.code} · {row.targetActual.period} · {row.targetActual.actualCode}</option>)}
              </select>
            </label>
            <span className="filter-meta">{rows.length} traceability chain(s)</span>
          </div>

          {selected ? (
            <TraceabilityChain row={selected} />
          ) : (
            <section className="card empty-state" data-testid="kpi-traceability-empty">
              <GitMerge size={32} />
              <strong>No KPI traceability chain matches this view</strong>
              <span>No actual or evidence linked.</span>
            </section>
          )}

        </>
      ) : null}
    </div>
  );
}

function TraceabilityChain({ row }: { row: KpiTraceabilityRow }) {
  const policy = first(row.policies);
  const framework = first(row.frameworks);
  const rule = first(row.rules);
  const evidence = first(row.evidence);
  const control = first(row.controls);
  const risk = first(row.risks);
  const nodes: TraceNodeData[] = [
    {
      label: "Policy",
      primary: policy ? `${policy.code}${additional(row.policies)}` : "Not linked",
      secondary: displayName(policy),
      status: policy?.status ?? "Missing",
      tone: "blue",
      icon: BookOpenCheck,
      to: policy ? `/compliance/policies/${policy.id}` : undefined,
      missing: !policy,
    },
    {
      label: "Framework",
      primary: framework ? `${framework.code}${additional(row.frameworks)}` : "Not linked",
      secondary: framework ? `${framework.name} · ${framework.version}` : "No active Control mapping",
      status: framework?.scopeStatus ?? (framework ? "Mapped" : "Missing"),
      tone: "green",
      icon: Landmark,
      to: framework ? `/master/frameworks/${framework.id}/rules` : undefined,
      missing: !framework,
    },
    {
      label: "Rule",
      primary: rule ? `${rule.code}${additional(row.rules)}` : "Not linked",
      secondary: displayName(rule),
      status: rule ? "Mapped" : "Missing",
      tone: "blue",
      icon: ListChecks,
      missing: !rule,
    },
    {
      label: "Evidence",
      primary: evidence ? `${evidence.code}${additional(row.evidence)}` : "Not linked",
      secondary: displayName(evidence),
      status: evidence?.status ?? "Missing",
      tone: "amber",
      icon: Archive,
      to: evidence ? `/evidence/${evidence.id}` : undefined,
      missing: !evidence,
    },
    {
      label: "Control",
      primary: control ? `${control.code}${additional(row.controls)}` : "Not linked",
      secondary: displayName(control),
      status: control?.status ?? "Missing",
      tone: "blue",
      icon: Shield,
      to: control ? `/compliance/controls/${control.id}` : undefined,
      missing: !control,
    },
    {
      label: "KPI",
      primary: row.kpi.code,
      secondary: `${row.kpi.name} · ${row.kpi.unit}`,
      status: "Configured",
      tone: "green",
      icon: CircleGauge,
      to: "/kpi/configuration",
    },
    {
      label: "Target vs Actual",
      primary: `${row.targetActual.targetValue} → ${row.targetActual.actualValue}`,
      secondary: `${row.targetActual.period} · variance ${row.targetActual.variancePercentage ?? row.targetActual.variance}`,
      status: row.targetActual.ragStatus ?? row.targetActual.approvalStatus,
      tone: row.targetActual.ragStatus === "RED" ? "red" : row.targetActual.ragStatus === "AMBER" ? "amber" : "green",
      icon: Target,
      to: "/kpi/analytics",
    },
    {
      label: "Risk",
      primary: risk ? `${risk.code}${additional(row.risks)}` : "No linked Risk",
      secondary: displayName(risk),
      status: risk?.classification ?? risk?.status ?? "No Risk",
      tone: risk ? "red" : "grey",
      icon: ShieldAlert,
      to: risk ? `/compliance/risks/${risk.id}` : undefined,
      missing: !risk,
    },
  ];

  return (
    <section className="card kpi-traceability-card" data-testid="kpi-traceability-chain">
      <header className="card-head">
        <div>
          <h2>{row.kpi.code} · {row.kpi.name}</h2>
          <p>{row.targetActual.actualCode} · {row.targetActual.period} · {row.configuration.department?.name ?? "No department"} · {row.configuration.owner?.name ?? "Unassigned"}</p>
        </div>
        <Badge tone={row.completeness.complete ? "green" : "amber"}>{row.completeness.mappedNodes}/{row.completeness.totalNodes} nodes linked</Badge>
      </header>
      {row.kpi.frameworkMapping ? (
        <p className="kpi-trace-declared" data-testid="kpi-trace-declared">
          <Landmark size={15} aria-hidden />
          <span>
            <strong>Declared in workbook:</strong> {row.kpi.frameworkMapping}
          </span>
          <Badge tone={row.frameworks.length ? "green" : "amber"}>
            {row.frameworks.length ? "Mapped" : "Not mapped"}
          </Badge>
        </p>
      ) : null}
      <div className="kpi-trace-chain">
        {nodes.map((node, index) => (
          <div className="kpi-trace-step" key={node.label}>
            <TraceNode node={node} />
            {index < nodes.length - 1 ? <ArrowRight className="kpi-trace-arrow" size={20} aria-hidden /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
