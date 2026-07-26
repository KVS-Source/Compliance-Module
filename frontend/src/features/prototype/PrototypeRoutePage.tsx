import {
  Archive,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  CircleGauge,
  ClipboardCheck,
  CloudUpload,
  Download,
  FileBarChart,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Gauge,
  GitMerge,
  Info,
  Landmark,
  ListChecks,
  LockKeyhole,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  UploadCloud,
  UserRoundCog,
  Users,
  XCircle,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { routeByPath } from "../../app/routeDefinitions";
import { Badge } from "../../components/feedback/Badge";
import { Modal } from "../../components/feedback/Modal";
import { PageHeader } from "../../components/feedback/PageHeader";
import { DataTable, type Column } from "../../components/tables/DataTable";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  evidenceRows,
  kpiRows,
  prototypeTableConfigs,
  type PrototypeRow,
  type PrototypeTableConfig,
} from "./prototypeRouteData";

const trace = [
  "Policy",
  "Framework",
  "Rule",
  "Evidence",
  "Control",
  "KPI",
  "Target vs Actual",
  "Risk",
];

const statusKeys = new Set([
  "status",
  "approval",
  "evidence",
  "level",
  "severity",
  "result",
  "kpiClass",
  "scope",
  "deal",
]);

const textOf = (value: PrototypeRow[string]) => String(value ?? "—");

function usePrototypeToast() {
  const { showToast } = useToast();
  return (
    tone: Parameters<typeof showToast>[0],
    title: string,
    message: string,
  ) =>
    showToast(
      tone,
      `Prototype simulation — ${title}`,
      `${message} No PostgreSQL data was changed.`,
    );
}

function PrototypeModuleBanner() {
  return (
    <div
      className="banner warning prototype-module-banner"
      role="status"
      data-testid="prototype-module-banner"
    >
      <Info size={18} />
      <strong>
        Prototype module — demonstration data only. Changes are not saved.
      </strong>
    </div>
  );
}

function PrototypeFilterBar({
  search,
  onSearch,
  status,
  onStatus,
  placeholder,
  statuses,
}: {
  search: string;
  onSearch: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
  placeholder: string;
  statuses: string[];
}) {
  return (
    <div className="filter-bar prototype-filter-bar">
      <label className="filter-search">
        <span className="sr-only">Search records</span>
        <Search size={16} />
        <input
          className="control"
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={placeholder}
        />
      </label>
      <label className="prototype-filter-select">
        <span className="sr-only">Department</span>
        <select className="control">
          <option>All Departments</option>
          <option>Compliance</option>
          <option>Quality</option>
          <option>Operations</option>
        </select>
      </label>
      <label className="prototype-filter-select">
        <span className="sr-only">Owner</span>
        <select className="control">
          <option>All Owners</option>
          <option>User 001</option>
          <option>User 002</option>
          <option>User 003</option>
        </select>
      </label>
      <label className="prototype-filter-select">
        <span className="sr-only">Status</span>
        <select
          className="control"
          value={status}
          onChange={(event) => onStatus(event.target.value)}
        >
          <option>All Statuses</option>
          {statuses.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <button
        className="btn btn-ghost filter-clear"
        type="button"
        onClick={() => {
          onSearch("");
          onStatus("All Statuses");
        }}
      >
        × Clear
      </button>
      <div className="filter-meta">
        <span>Company-scoped data</span>
      </div>
      <div className="filter-chips">
        <span className="chip">Company 001</span>
        <span className="chip">All Records</span>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: ReactNode;
  tone?: "blue" | "green" | "amber" | "red" | "purple" | "grey";
}) {
  return (
    <article className="summary-card">
      <div className="card-label">
        <span className={`card-icon tone-${tone}`}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="card-value">{value}</div>
      <div className="card-sub">{sub}</div>
    </article>
  );
}

function cell(key: string, row: PrototypeRow) {
  const value = row[key];
  if (statusKeys.has(key)) return <Badge>{textOf(value)}</Badge>;
  if (key === "enabled")
    return (
      <label className="check">
        <input
          type="checkbox"
          defaultChecked={value === true || value === "Yes"}
        />
        <span>{textOf(value)}</span>
      </label>
    );
  if (key === "id" || key === "code" || key === "record" || key === "kpi")
    return <span className="mono link-text">{textOf(value)}</span>;
  if (key === "name" || key === "title" || key === "policy")
    return (
      <div className="cell-title">
        <strong>{textOf(value)}</strong>
        <small className="mono">{row.id}</small>
      </div>
    );
  return textOf(value);
}

function columnsFor(config: PrototypeTableConfig): Column<PrototypeRow>[] {
  return config.columns.map(([key, label]) => ({
    key,
    label,
    render: (row) => cell(key, row),
  }));
}

function GenericPrototypePage({ config }: { config: PrototypeTableConfig }) {
  const location = useLocation();
  const route = routeByPath.get(location.pathname)!;
  const { user } = useAuth();
  const showToast = usePrototypeToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Statuses");
  const [editor, setEditor] = useState<{
    mode: "create" | "view" | "edit";
    row?: PrototypeRow;
  } | null>(null);
  const rows = useMemo<PrototypeRow[]>(
    () =>
      config.rows
        .map((row): PrototypeRow =>
          row.company
            ? { ...row, company: user?.activeCompany.name ?? row.company }
            : { ...row },
        )
        .filter((row) => {
          const queryMatch =
            !search ||
            Object.values(row).some((value) =>
              textOf(value).toLowerCase().includes(search.toLowerCase()),
            );
          const rowStatus = textOf(row.status ?? row.approval ?? row.evidence);
          return (
            queryMatch && (status === "All Statuses" || rowStatus === status)
          );
        }),
    [config.rows, search, status, user?.activeCompany.name],
  );
  const statuses = useMemo(
    () => [
      ...new Set(
        config.rows
          .map((row) => textOf(row.status ?? row.approval ?? row.evidence))
          .filter((value) => value !== "—"),
      ),
    ],
    [config.rows],
  );
  const exportRows = () => {
    const headers = config.columns.map(([key]) => key);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((key) => `"${textOf(row[key]).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `genbioca-${route.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast(
      "success",
      "CSV exported",
      `${rows.length} visible Company-scoped records prepared.`,
    );
  };
  const primaryIsExport = /^Export/.test(config.primary);
  return (
    <div className="page">
      <PageHeader
        title={route.title}
        section={route.section}
        description={route.description}
        primaryLabel={config.primary}
        onPrimary={
          primaryIsExport ? exportRows : () => setEditor({ mode: "create" })
        }
        actions={
          <button
            className="btn btn-secondary"
            type="button"
            onClick={exportRows}
          >
            <Download size={15} /> Export CSV
          </button>
        }
      />
      {config.banner ? (
        <div
          className={`banner ${/requires|blocked|cannot|separate/i.test(config.banner) ? "warning" : "info"}`}
        >
          <Info size={18} />
          <span>{config.banner}</span>
        </div>
      ) : null}
      <PrototypeFilterBar
        search={search}
        onSearch={setSearch}
        status={status}
        onStatus={setStatus}
        placeholder={`Search ${route.title.toLowerCase()}…`}
        statuses={statuses}
      />
      <DataTable
        rows={rows}
        columns={columnsFor(config)}
        caption={route.title}
        companyName={user?.activeCompany.name}
        selectable={route.path === "/master/kpis"}
        onView={(row) => setEditor({ mode: "view", row })}
        onEdit={(row) => setEditor({ mode: "edit", row })}
        onMore={(row) =>
          showToast(
            "info",
            `${row.id} workflow actions`,
            "Relationships, evidence, comments and audit history are available from this record workflow.",
          )
        }
      />
      {editor ? (
        <RecordModal
          title={route.title}
          editor={editor}
          config={config}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}

function RecordModal({
  title,
  editor,
  config,
  onClose,
}: {
  title: string;
  editor: { mode: "create" | "view" | "edit"; row?: PrototypeRow };
  config: PrototypeTableConfig;
  onClose: () => void;
}) {
  const showToast = usePrototypeToast();
  const editable = editor.mode !== "view";
  return (
    <Modal
      title={`${editor.mode === "create" ? "Add" : editor.mode === "edit" ? "Edit" : "View"} ${title}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          {editable ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                showToast(
                  "success",
                  "Workflow preview complete",
                  "The form matches the approved workflow; persistence requires its Company-scoped write API.",
                );
                onClose();
              }}
            >
              <Save size={15} /> Save
            </button>
          ) : null}
        </>
      }
    >
      <div className="banner info">
        <LockKeyhole size={17} />
        <span>
          Company context, evidence gates and permissions are enforced by the
          backend before persistence.
        </span>
      </div>
      <div className="form-grid">
        {config.columns.slice(0, 8).map(([key, label]) => (
          <div className="field" key={key}>
            <label htmlFor={`prototype-${key}`}>{label}</label>
            <input
              id={`prototype-${key}`}
              className="control"
              defaultValue={textOf(editor.row?.[key] ?? "")}
              readOnly={!editable}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}

function RolesPage() {
  const route = routeByPath.get("/admin/roles")!;
  const showToast = usePrototypeToast();
  const roles = [
    "Super Admin",
    "Company Admin",
    "Compliance Manager",
    "KPI Owner",
    "Evidence Reviewer",
    "Auditor",
    "Viewer",
  ];
  const modules = [
    "Dashboard",
    "KPI Master",
    "KPI Mapping",
    "KPI Actual Entry",
    "KPI Approval",
    "Evidence Upload",
    "Evidence Approval",
    "Policy Register",
    "Gap Register",
    "CAPA",
    "Risks",
    "Reports",
    "Audit Trail",
    "Settings",
  ];
  return (
    <div className="page">
      <PageHeader
        title={route.title}
        section={route.section}
        description={route.description}
        primaryLabel="Save Changes"
        onPrimary={() =>
          showToast(
            "success",
            "Permission matrix reviewed",
            "Changes require the roles write API before they become authoritative.",
          )
        }
        actions={
          <button className="btn btn-secondary" type="button">
            <SlidersHorizontal size={15} /> Compare Roles
          </button>
        }
      />
      <div className="banner info">
        <ShieldCheck size={18} />
        <span>
          Module permissions remain explicit. Approval, upload, export and
          deletion rights are reviewed independently.
        </span>
      </div>
      <div className="cards role-cards">
        {roles.map((role, index) => (
          <SummaryCard
            key={role}
            label={role}
            value={role === "Viewer" ? 14 : 38 + index * 3}
            sub={`permissions · ${index + 2} assigned users`}
            icon={<UserRoundCog size={17} />}
            tone={index === 0 ? "purple" : index > 4 ? "grey" : "blue"}
          />
        ))}
      </div>
      <section className="card">
        <div className="table-wrap">
          <table className="data-table role-matrix">
            <caption>Role permission matrix</caption>
            <thead>
              <tr>
                <th>Module</th>
                {roles.map((role) => (
                  <th key={role}>{role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((module, moduleIndex) => (
                <tr key={module}>
                  <td className="sticky-cell">
                    <strong>{module}</strong>
                  </td>
                  {roles.map((role, roleIndex) => (
                    <td key={role}>
                      <div className="permission-chips">
                        {["View", "Add", "Edit", "Approve", "Export"]
                          .filter(
                            (_, permissionIndex) =>
                              permissionIndex === 0 ||
                              (roleIndex < 5 &&
                                (moduleIndex + permissionIndex + roleIndex) %
                                  3 !==
                                  0),
                          )
                          .map((permission) => (
                            <label className="chip" key={permission}>
                              <input
                                type="checkbox"
                                defaultChecked={
                                  permission === "View" || roleIndex < 2
                                }
                              />{" "}
                              {permission}
                            </label>
                          ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>No unsaved changes</span>
          <div className="button-row">
            <button className="btn btn-secondary" type="button">
              Reset
            </button>
            <button className="btn btn-primary" type="button">
              <Save size={15} /> Save Changes
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiMappingPage() {
  const route = routeByPath.get("/kpi/mapping")!;
  const showToast = usePrototypeToast();
  const mappings: PrototypeRow[] = kpiRows.map((row, index) => ({
    id: `MAP-${String(index + 1).padStart(3, "0")}`,
    kpi: `${row.id} · ${row.name}`,
    policy:
      index === 1 ? "Information Security Policy" : "Quality Management Policy",
    framework: row.framework,
    rule: index === 1 ? "RUL-002" : "RUL-004",
    evidence: index === 2 ? "Pending" : "Approved",
    control: index === 1 ? "CTL-002" : "CTL-001",
    target: index === 1 ? "≤ 48 Hours" : "≥ 90%",
    risk: index === 0 ? "Major" : "No Risk",
    status: "Active",
  }));
  const config: PrototypeTableConfig = {
    primary: "Create Mapping",
    columns: [
      ["id", "Mapping ID"],
      ["kpi", "KPI"],
      ["policy", "Policy"],
      ["framework", "Framework"],
      ["rule", "Rule"],
      ["evidence", "Evidence"],
      ["control", "Control"],
      ["target", "Target"],
      ["risk", "Risk Result"],
      ["status", "Status"],
    ],
    rows: mappings,
  };
  return (
    <div className="page">
      <PageHeader
        title={route.title}
        section={route.section}
        description={route.description}
        primaryLabel="Create Mapping"
        onPrimary={() =>
          showToast(
            "info",
            "Mapping builder opened",
            "Select each traceability node to preview a complete relationship.",
          )
        }
        actions={
          <button className="btn btn-secondary" type="button">
            <Download size={15} /> Export CSV
          </button>
        }
      />
      <div className="banner info">
        <GitMerge size={18} />
        <span>
          The accepted traceability order is preserved. Evidence is evaluated
          before KPI approval and resulting risk.
        </span>
      </div>
      <section className="card traceability-card">
        <header className="card-head">
          <div>
            <h2>Compliance Traceability Builder</h2>
            <p>
              Policy → Framework → Rule → Evidence → Control → KPI → Target vs
              Actual → Risk
            </p>
          </div>
          <Badge tone="purple">8 linked nodes</Badge>
        </header>
        <div className="trace-ribbon prototype-trace">
          {trace.map((item, index) => (
            <div key={item}>
              <span className="trace-node">
                <span
                  className={`card-icon tone-${index === 3 ? "amber" : index === 7 ? "red" : "blue"}`}
                >
                  {index === 3 ? (
                    <Archive size={15} />
                  ) : index === 7 ? (
                    <TriangleAlert size={15} />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}
                </span>
                {item}
              </span>
              {index < trace.length - 1 ? <ArrowRight size={15} /> : null}
            </div>
          ))}
        </div>
      </section>
      <PrototypeFilterBar
        search=""
        onSearch={() => undefined}
        status="All Statuses"
        onStatus={() => undefined}
        placeholder="Search KPI mappings…"
        statuses={["Active", "Draft"]}
      />
      <DataTable
        rows={mappings}
        columns={columnsFor(config)}
        caption="KPI Compliance Mappings"
        selectable
        onView={(row) =>
          showToast(
            "info",
            row.id,
            "The relationship drawer includes evidence, comments and audit history.",
          )
        }
        onEdit={(row) =>
          showToast(
            "info",
            `Edit ${row.id}`,
            "Mapping edits remain evidence and permission gated.",
          )
        }
        onMore={(row) =>
          showToast(
            "info",
            row.id,
            "Additional relationship actions are available.",
          )
        }
      />
    </div>
  );
}

function KpiApprovalPage() {
  const route = routeByPath.get("/kpi/approval")!;
  const rows: PrototypeRow[] = [
    {
      id: "ACT-001",
      kpi: "KPI-001",
      name: "Customer Satisfaction Score",
      period: "Q2 2026",
      target: "90%",
      actual: "87%",
      variance: "-3%",
      result: "Not Achieved",
      evidence: "Approved",
      risk: "Major",
      owner: "User 003",
      status: "Pending Approval",
    },
    {
      id: "ACT-002",
      kpi: "KPI-002",
      name: "Incident Closure Time",
      period: "Jun 2026",
      target: "≤ 48 h",
      actual: "41 h",
      variance: "+7 h",
      result: "Achieved",
      evidence: "Approved",
      risk: "No Risk",
      owner: "IT Head",
      status: "Pending Approval",
    },
    {
      id: "ACT-003",
      kpi: "KPI-003",
      name: "Training Completion",
      period: "Jun 2026",
      target: "95%",
      actual: "93%",
      variance: "-2%",
      result: "Not Achieved",
      evidence: "Pending",
      risk: "Minor",
      owner: "HR Head",
      status: "Evidence Review",
    },
  ];
  const config: PrototypeTableConfig = {
    primary: "Review Selected",
    columns: [
      ["id", "Actual ID"],
      ["kpi", "KPI"],
      ["name", "KPI Name"],
      ["period", "Period"],
      ["target", "Target"],
      ["actual", "Actual"],
      ["variance", "Variance"],
      ["result", "Result"],
      ["evidence", "Evidence"],
      ["risk", "Risk"],
      ["owner", "Owner"],
      ["status", "Status"],
    ],
    rows,
  };
  const showToast = usePrototypeToast();
  return (
    <div className="page">
      <PageHeader
        title={route.title}
        section={route.section}
        description={route.description}
        primaryLabel="Review Selected"
        onPrimary={() =>
          showToast(
            "info",
            "Approval review",
            "Only records with approved evidence can be approved.",
          )
        }
        actions={
          <button className="btn btn-secondary" type="button">
            <Download size={15} /> Export CSV
          </button>
        }
      />
      <div className="cards">
        <SummaryCard
          label="Pending Approval"
          value={2}
          sub="ready for review"
          icon={<BadgeCheck size={17} />}
          tone="blue"
        />
        <SummaryCard
          label="Evidence Blocked"
          value={1}
          sub="awaiting evidence review"
          icon={<Archive size={17} />}
          tone="amber"
        />
        <SummaryCard
          label="Targets Achieved"
          value={1}
          sub="No Risk"
          icon={<CheckCircle2 size={17} />}
          tone="green"
        />
        <SummaryCard
          label="Risks Required"
          value={2}
          sub="Major or Minor"
          icon={<TriangleAlert size={17} />}
          tone="red"
        />
      </div>
      <div className="banner warning">
        <Archive size={18} />
        <span>
          KPI approval is blocked until linked evidence has Approved status.
        </span>
      </div>
      <PrototypeFilterBar
        search=""
        onSearch={() => undefined}
        status="All Statuses"
        onStatus={() => undefined}
        placeholder="Search KPI approvals…"
        statuses={["Pending Approval", "Evidence Review"]}
      />
      <DataTable
        rows={rows}
        columns={columnsFor(config)}
        caption="KPI Approval Queue"
        selectable
        onView={(row) =>
          showToast(
            "info",
            row.id,
            "Approval detail includes evidence, calculation, risk preview and audit history.",
          )
        }
        onEdit={(row) =>
          showToast(
            row.evidence === "Approved" ? "success" : "warning",
            row.evidence === "Approved"
              ? "Approval gate passed"
              : "Approval blocked",
            row.evidence === "Approved"
              ? "This KPI actual can proceed to reviewer approval."
              : "Approve the linked evidence first.",
          )
        }
        onMore={(row) =>
          showToast(
            "info",
            row.id,
            "Clarification and rejection actions are available.",
          )
        }
      />
    </div>
  );
}

function ComplianceFrameworksPage() {
  const route = routeByPath.get("/compliance/frameworks")!;
  const frameworks = [
    "ISO 9001",
    "ISO 14001",
    "ISO 27001",
    "ISO 45001",
    "ISO 13485",
    "SA 8000",
    "EU MDR",
    "21 CFR Part 11",
    "GxP",
  ];
  const rows: PrototypeRow[] = frameworks.map((framework, index) => ({
    id: `FW-${index + 1}`,
    framework,
    version: framework.startsWith("ISO") ? "2025" : "Current",
    total: 24 + index * 3,
    compliant: 18 + index,
    partial: 4 + (index % 3),
    noncompliant: 2 + (index % 2),
    gaps: 2 + (index % 4),
    percent: `${Math.max(62, 94 - index * 3)}%`,
    owner: index % 2 ? "User 002" : "User 001",
    last: "30 Jun 2026",
    status: index > 6 ? "Partially Compliant" : "Compliant",
  }));
  const config: PrototypeTableConfig = {
    primary: "View Compliance Report",
    columns: [
      ["framework", "Framework"],
      ["version", "Version"],
      ["total", "Total Controls"],
      ["compliant", "Compliant"],
      ["partial", "Partially Compliant"],
      ["noncompliant", "Non-Compliant"],
      ["gaps", "Open Gaps"],
      ["percent", "Compliance %"],
      ["owner", "Owner"],
      ["last", "Last Review"],
      ["status", "Status"],
    ],
    rows,
  };
  return (
    <div className="page">
      <PageHeader
        title={route.title}
        section={route.section}
        description={route.description}
        primaryLabel="View Compliance Report"
        actions={
          <button className="btn btn-secondary" type="button">
            <Download size={15} /> Export CSV
          </button>
        }
      />
      <PrototypeFilterBar
        search=""
        onSearch={() => undefined}
        status="All Statuses"
        onStatus={() => undefined}
        placeholder="Search frameworks…"
        statuses={["Compliant", "Partially Compliant"]}
      />
      <div className="cards framework-cards">
        {rows.map((row) => (
          <article className="summary-card framework-card" key={row.id}>
            <div className="card-label">
              <span
                className={`card-icon tone-${row.status === "Compliant" ? "green" : "amber"}`}
              >
                <Landmark size={17} />
              </span>
              {row.framework}
            </div>
            <div className="framework-score">
              <strong>{row.percent}</strong>
              <Badge>{row.status}</Badge>
            </div>
            <div className="progress">
              <span style={{ width: String(row.percent) }} />
            </div>
            <div className="card-sub">
              {row.compliant} compliant · {row.partial} partial · {row.gaps}{" "}
              gaps
            </div>
          </article>
        ))}
      </div>
      <DataTable
        rows={rows}
        columns={columnsFor(config)}
        caption="Active Compliance Frameworks"
        onView={() => undefined}
        onEdit={() => undefined}
        onMore={() => undefined}
      />
    </div>
  );
}

function EvidenceReviewPage() {
  const route = routeByPath.get("/evidence/review")!;
  const showToast = usePrototypeToast();
  const pending = evidenceRows.filter((row) => row.status === "Pending");
  const [selected, setSelected] = useState<PrototypeRow>(pending[0]!);
  return (
    <div className="page">
      <PageHeader
        title={route.title}
        section={route.section}
        description={route.description}
        primaryLabel="Review Next"
        onPrimary={() =>
          setSelected(
            pending[(pending.indexOf(selected) + 1) % pending.length]!,
          )
        }
        actions={
          <button className="btn btn-secondary" type="button">
            <ListChecks size={15} /> Review Guide
          </button>
        }
      />
      <div className="banner warning">
        <Archive size={18} />
        <span>
          Approving evidence unlocks linked KPI, policy, gap, CAPA or
          risk-treatment workflows.
        </span>
      </div>
      <div className="review-layout">
        <section className="card review-queue">
          <header className="card-head">
            <div>
              <h2>Pending Review Queue</h2>
              <p>{pending.length} items require attention</p>
            </div>
            <Badge tone="amber">{pending.length} pending</Badge>
          </header>
          <div className="queue-search">
            <Search size={15} />
            <input className="control" placeholder="Search evidence queue…" />
          </div>
          {pending.map((row) => (
            <button
              className={`review-item ${selected.id === row.id ? "active" : ""}`}
              type="button"
              key={row.id}
              onClick={() => setSelected(row)}
            >
              <span className="card-icon tone-amber">
                <Archive size={16} />
              </span>
              <span>
                <strong>{row.title}</strong>
                <small>
                  {row.id} · {row.module} · {row.record}
                </small>
              </span>
              <Badge>{row.status}</Badge>
            </button>
          ))}
        </section>
        <section className="card evidence-detail">
          <header className="card-head">
            <div>
              <span className="mono link-text">{selected.id}</span>
              <h2>{selected.title}</h2>
              <p>
                {selected.type} · uploaded {selected.date}
              </p>
            </div>
            <Badge>{selected.status}</Badge>
          </header>
          <div className="card-pad">
            <div className="evidence-preview">
              <FileCheck2 size={42} />
              <strong>Evidence preview</strong>
              <span>Integrity hash {selected.hash}</span>
              <button className="btn btn-secondary" type="button">
                <FileText size={15} /> Open Document
              </button>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Linked module</dt>
                <dd>{selected.module}</dd>
              </div>
              <div>
                <dt>Linked record</dt>
                <dd className="mono">{selected.record}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{selected.owner}</dd>
              </div>
              <div>
                <dt>Reviewer</dt>
                <dd>{selected.reviewer}</dd>
              </div>
            </dl>
            <div className="field">
              <label htmlFor="review-comment">Reviewer comment</label>
              <textarea
                id="review-comment"
                className="control"
                rows={4}
                defaultValue="Evidence reviewed against the linked record and approval requirements."
              />
            </div>
            <div className="button-row evidence-actions">
              <button
                className="btn btn-danger"
                type="button"
                onClick={() =>
                  showToast(
                    "error",
                    "Evidence rejected",
                    "A reason and replacement request are required.",
                  )
                }
              >
                <XCircle size={15} /> Reject
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() =>
                  showToast(
                    "info",
                    "More evidence requested",
                    "The owner will receive the reviewer note.",
                  )
                }
              >
                Ask for More
              </button>
              <button
                className="btn btn-success"
                type="button"
                onClick={() =>
                  showToast(
                    "success",
                    "Evidence approved",
                    `Linked ${selected.module} workflow unlocked.`,
                  )
                }
              >
                <CheckCircle2 size={15} /> Approve Evidence
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

const uploadMeta: Record<
  string,
  { title: string; formats: string; fields: string[] }
> = {
  "/upload/policy-master": {
    title: "Policy Master",
    formats: "CSV or XLSX",
    fields: ["Framework", "Owner", "Effective Date", "Reviewer"],
  },
  "/upload/evidence-master": {
    title: "Evidence Master",
    formats: "PDF, DOCX, XLSX, PNG or JPG",
    fields: [
      "Evidence Title",
      "Evidence Type",
      "Linked Module",
      "Linked Record",
      "Owner",
      "Reviewer",
    ],
  },
  "/upload/kpi-data": {
    title: "KPI Data",
    formats: "CSV or XLSX",
    fields: ["Data Type", "Period", "Owner", "Reviewer"],
  },
  "/upload/customer-data": {
    title: "Customer Data",
    formats: "CSV or XLSX",
    fields: ["Source", "Attribution", "Owner", "Review Date"],
  },
  "/upload/audit-reports": {
    title: "Audit Reports",
    formats: "PDF, DOCX or XLSX",
    fields: ["Audit Type", "Framework", "Auditor", "Report Date", "Reviewer"],
  },
};

function UploadPage({ path }: { path: string }) {
  const route = routeByPath.get(path)!;
  const meta = uploadMeta[path]!;
  const showToast = usePrototypeToast();
  const [fileName, setFileName] = useState("");
  return (
    <div className="page">
      <PageHeader
        title={route.title}
        section={route.section}
        description={route.description}
        primaryLabel="Submit Upload"
        onPrimary={() =>
          showToast(
            fileName ? "success" : "warning",
            fileName ? "Upload submitted" : "No file selected",
            fileName
              ? `${fileName} passed the prototype metadata review.`
              : "Choose and validate a supported file first.",
          )
        }
        actions={
          <button className="btn btn-secondary" type="button">
            <Download size={15} /> Download Template
          </button>
        }
      />
      <div className="banner info">
        <UploadCloud size={18} />
        <span>
          Files remain Company-scoped and require validation, reviewer
          assignment and audit history.
        </span>
      </div>
      <div className="grid-2 upload-layout">
        <section className="card">
          <header className="card-head">
            <div>
              <h2>{meta.title} File</h2>
              <p>Supported formats · {meta.formats}</p>
            </div>
          </header>
          <div className="card-pad">
            <label className={`upload-zone ${fileName ? "has-file" : ""}`}>
              <CloudUpload size={34} />
              <strong>{fileName || "Drop a file here or browse"}</strong>
              <span>
                {fileName
                  ? "Ready for validation"
                  : `Accepted: ${meta.formats}`}
              </span>
              <input
                className="sr-only"
                type="file"
                onChange={(event) =>
                  setFileName(event.target.files?.[0]?.name ?? "")
                }
              />
            </label>
            <div className="upload-toolbar">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setFileName("")}
              >
                <XCircle size={15} /> Remove
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() =>
                  showToast(
                    fileName ? "success" : "warning",
                    fileName ? "Validation complete" : "Choose a file",
                    fileName
                      ? "Required columns, format and metadata are valid."
                      : "A supported file is required before validation.",
                  )
                }
              >
                <FileSpreadsheet size={15} /> Validate File
              </button>
            </div>
          </div>
        </section>
        <section className="card">
          <header className="card-head">
            <div>
              <h2>Required Metadata</h2>
              <p>Complete before validation and submission</p>
            </div>
            <Badge tone="purple">{meta.fields.length} fields</Badge>
          </header>
          <div className="card-pad form-grid">
            {meta.fields.map((field) => (
              <div className="field" key={field}>
                <label htmlFor={`upload-${field}`}>{field} *</label>
                {/Date|Period/.test(field) ? (
                  <input
                    id={`upload-${field}`}
                    className="control"
                    type="date"
                  />
                ) : (
                  <input
                    id={`upload-${field}`}
                    className="control"
                    placeholder={`Select or enter ${field.toLowerCase()}`}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="card upload-history">
        <header className="card-head">
          <div>
            <h2>Recent Upload Activity</h2>
            <p>Validation and reviewer status</p>
          </div>
        </header>
        <div className="empty-state">
          <span className="card-icon tone-blue">
            <UploadCloud size={18} />
          </span>
          <h3>No recent {meta.title.toLowerCase()} uploads</h3>
          <p>Validated submissions will appear here with their audit status.</p>
        </div>
      </section>
    </div>
  );
}

const reportNames: Record<string, string[]> = {
  "/reports": [
    "Compliance Executive Summary",
    "Evidence Status & Aging",
    "KPI Performance & Risk",
    "Gap and CAPA Status",
    "Policy Review Calendar",
    "Audit Activity Summary",
  ],
  "/reports/compliance": [
    "Framework Compliance",
    "Control Effectiveness",
    "Gap Register",
    "CAPA Aging",
    "Policy Compliance",
    "Risk Register",
  ],
  "/reports/evidence": [
    "Evidence Status",
    "Evidence Aging",
    "Expiring Evidence",
    "Evidence Linkage",
    "Reviewer Workload",
    "Rejected Evidence",
  ],
  "/reports/audit": [
    "Audit Coverage",
    "Audit Findings",
    "User Activity",
    "Approval History",
    "Change History",
    "Access Review",
  ],
  "/reports/attribution": [
    "Attribution Overview",
    "Source Performance",
    "Campaign Conversion",
    "Attribution Completeness",
  ],
  "/reports/deals": ["Deals Won", "Deals Lost", "Win Rate", "Outcome Drivers"],
  "/reports/customer-outcomes": [
    "Customers Won",
    "Customers Lost",
    "Retention",
    "Net Growth",
  ],
};

function ReportsPage({ path }: { path: string }) {
  const route = routeByPath.get(path)!;
  const showToast = usePrototypeToast();
  const names = reportNames[path] ?? reportNames["/reports"]!;
  return (
    <div className="page">
      <PageHeader
        title={route.title}
        section={route.section}
        description={route.description}
        primaryLabel="Generate Report"
        onPrimary={() =>
          showToast(
            "success",
            "Report generated",
            "The active Company and page filters were applied.",
          )
        }
        actions={
          <button className="btn btn-secondary" type="button">
            <Settings2 size={15} /> Schedule
          </button>
        }
      />
      <PrototypeFilterBar
        search=""
        onSearch={() => undefined}
        status="All Statuses"
        onStatus={() => undefined}
        placeholder="Search reports…"
        statuses={["Available", "Scheduled"]}
      />
      <div className="grid-3 report-grid">
        {names.map((name, index) => (
          <article className="card report-card" key={name}>
            <span
              className={`feature-icon tone-${index % 3 === 0 ? "blue" : index % 3 === 1 ? "purple" : "green"}`}
            >
              <FileBarChart size={21} />
            </span>
            <h3>{name}</h3>
            <p>
              Company-scoped output using active filters, evidence status and
              workflow records.
            </p>
            <div className="format-badges">
              <span className="format-badge">PDF</span>
              <span className="format-badge">XLSX</span>
              <span className="format-badge">CSV</span>
            </div>
            <div className="button-row">
              <button className="btn btn-secondary" type="button">
                Preview
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() =>
                  showToast(
                    "success",
                    `${name} generated`,
                    "The report is available in recent report activity.",
                  )
                }
              >
                Generate
              </button>
            </div>
          </article>
        ))}
      </div>
      <section className="card">
        <header className="card-head">
          <div>
            <h2>Recent Report Activity</h2>
            <p>Generated and scheduled outputs</p>
          </div>
        </header>
        <div className="empty-state">
          <FileBarChart size={25} />
          <h3>No reports generated in this session</h3>
          <p>
            Generated reports appear here with their Company, filters and
            status.
          </p>
        </div>
      </section>
    </div>
  );
}

function AnalyticsPage({ path }: { path: string }) {
  const route = routeByPath.get(path)!;
  const customers = path === "/analytics/customers";
  const showToast = usePrototypeToast();
  const metrics = customers
    ? ([
        ["Customers Acquired", 146, "blue"],
        ["Deals Won", 34, "green"],
        ["Deals Lost", 12, "red"],
        ["Win Rate", "74%", "purple"],
      ] as const)
    : ([
        ["Active KPIs", 3, "blue"],
        ["Targets Achieved", 1, "green"],
        ["Targets Missed", 2, "red"],
        ["Average Performance", "87%", "purple"],
      ] as const);
  return (
    <div className="page">
      <PageHeader
        title={route.title}
        section={route.section}
        description={route.description}
        primaryLabel="Export Dashboard"
        onPrimary={() =>
          showToast(
            "success",
            "Dashboard exported",
            "The active analytics view was prepared for export.",
          )
        }
        actions={
          <button className="btn btn-secondary" type="button">
            <SlidersHorizontal size={15} /> Configure View
          </button>
        }
      />
      <PrototypeFilterBar
        search=""
        onSearch={() => undefined}
        status="All Statuses"
        onStatus={() => undefined}
        placeholder={
          customers
            ? "Search customers and attribution…"
            : "Search KPI analytics…"
        }
        statuses={["Active", "Won", "Lost"]}
      />
      <div className="cards">
        {metrics.map(([label, value, tone], index) => (
          <SummaryCard
            key={label}
            label={label}
            value={value}
            sub={
              customers
                ? [
                    "last 6 months",
                    "closed outcomes",
                    "recorded outcomes",
                    "won opportunities",
                  ][index]!
                : [
                    "in current scope",
                    "approved targets",
                    "require attention",
                    "across active KPIs",
                  ][index]!
            }
            icon={customers ? <Users size={17} /> : <Gauge size={17} />}
            tone={tone}
          />
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <header className="card-head">
            <div>
              <h2>
                {customers
                  ? "Acquisition & Deal Trend"
                  : "KPI Target vs Actual"}
              </h2>
              <p>February to July</p>
            </div>
            <button className="tiny-btn" type="button">
              <BarChart3 size={15} />
            </button>
          </header>
          <div className="card-pad">
            <div className="line-chart">
              <div className="line-bars">
                {["Feb", "Mar", "Apr", "May", "Jun", "Jul"].map(
                  (month, index) => (
                    <div className="month-col" key={month}>
                      <span
                        className="vbar trend-target"
                        style={{ height: `${72 + index * 3}%` }}
                      />
                      <span
                        className="vbar trend-actual"
                        style={{
                          height: `${customers ? 58 + index * 6 : 82 + index}%`,
                        }}
                      />
                      <span className="month-label">{month}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </section>
        <section className="card">
          <header className="card-head">
            <div>
              <h2>{customers ? "Outcome Mix" : "Achievement Status"}</h2>
              <p>Current Company scope</p>
            </div>
          </header>
          <div className="card-pad donut-wrap">
            <div
              className="donut"
              style={{
                background:
                  "conic-gradient(var(--green-600) 0 58%, var(--amber-600) 58% 82%, var(--red-600) 82% 100%)",
              }}
              data-total={customers ? 46 : 3}
            />
            <div className="legend">
              <span className="legend-row">
                <i
                  className="legend-dot"
                  style={{ background: "var(--green-600)" }}
                />
                Achieved <strong>58%</strong>
              </span>
              <span className="legend-row">
                <i
                  className="legend-dot"
                  style={{ background: "var(--amber-600)" }}
                />
                In progress <strong>24%</strong>
              </span>
              <span className="legend-row">
                <i
                  className="legend-dot"
                  style={{ background: "var(--red-600)" }}
                />
                Attention <strong>18%</strong>
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function KpiDashboardPage() {
  return <AnalyticsPage path="/kpi/dashboard" />;
}

function SettingsPage() {
  const route = routeByPath.get("/settings")!;
  const showToast = usePrototypeToast();
  const sections = [
    [
      "Organisation",
      "Company profile, locations and operating context",
      Landmark,
      "blue",
    ],
    [
      "Security",
      "Authentication, session and access policies",
      ShieldCheck,
      "purple",
    ],
    [
      "Evidence Rules",
      "Approval gates, retention and integrity controls",
      Archive,
      "amber",
    ],
    [
      "KPI Rules",
      "Risk generation, approvals and calculation settings",
      CircleGauge,
      "green",
    ],
    [
      "Notifications",
      "Workflow alerts, reminders and escalation",
      ClipboardCheck,
      "blue",
    ],
    [
      "Integrations",
      "Approved API connections and export destinations",
      Settings2,
      "grey",
    ],
  ] as const;
  return (
    <div className="page">
      <PageHeader
        title={route.title}
        section={route.section}
        description={route.description}
      />
      <div className="banner info">
        <LockKeyhole size={18} />
        <span>
          Settings are Company-scoped. Security and evidence-gate changes
          require elevated permission and audit history.
        </span>
      </div>
      <div className="grid-3 settings-grid">
        {sections.map(([title, description, Icon, tone]) => (
          <section className="card setting-card" key={title}>
            <div className="card-pad">
              <span className={`feature-icon tone-${tone}`}>
                <Icon size={21} />
              </span>
              <h2>{title}</h2>
              <p>{description}</p>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() =>
                  showToast(
                    "info",
                    `${title} settings`,
                    "The approved configuration form is ready for its Company-scoped write API.",
                  )
                }
              >
                <Settings2 size={15} /> Configure
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function FallbackVisualPage() {
  const location = useLocation();
  const route = routeByPath.get(location.pathname)!;
  const Icon = route.icon;
  const config: PrototypeTableConfig = {
    primary: `Add ${route.title.replace(/ Register$| Upload$| Reports$/, "")}`,
    banner: `${route.title} remains Company-scoped and follows the approved evidence, permission and audit rules.`,
    columns: [
      ["id", "Record ID"],
      ["name", "Record Name"],
      ["owner", "Owner"],
      ["department", "Department"],
      ["updated", "Last Updated"],
      ["status", "Status"],
    ],
    rows: [
      {
        id: `${route.title.slice(0, 3).toUpperCase()}-001`,
        name: `${route.title} Record 001`,
        owner: "User 001",
        department: "Compliance",
        updated: "11 Jul 2026",
        status: "Active",
      },
      {
        id: `${route.title.slice(0, 3).toUpperCase()}-002`,
        name: `${route.title} Record 002`,
        owner: "User 002",
        department: "Quality",
        updated: "10 Jul 2026",
        status: "Pending Review",
      },
    ],
  };
  return (
    <>
      <div className="prototype-route-icon sr-only">
        <Icon />
      </div>
      <GenericPrototypePage config={config} />
    </>
  );
}

export function PrototypeRoutePage() {
  const { pathname } = useLocation();
  let page: ReactNode;
  if (pathname === "/admin/roles") page = <RolesPage />;
  else if (pathname === "/kpi/mapping") page = <KpiMappingPage />;
  else if (pathname === "/kpi/approval") page = <KpiApprovalPage />;
  else if (pathname === "/kpi/dashboard") page = <KpiDashboardPage />;
  else if (pathname === "/compliance/frameworks")
    page = <ComplianceFrameworksPage />;
  else if (pathname === "/evidence/review") page = <EvidenceReviewPage />;
  else if (pathname.startsWith("/upload/"))
    page = <UploadPage path={pathname} />;
  else if (
    pathname === "/analytics/customers" ||
    pathname === "/analytics/kpis"
  )
    page = <AnalyticsPage path={pathname} />;
  else if (pathname === "/reports" || pathname.startsWith("/reports/"))
    page = <ReportsPage path={pathname} />;
  else if (pathname === "/settings") page = <SettingsPage />;
  else {
    const config = prototypeTableConfigs[pathname];
    page = config ? (
      <GenericPrototypePage config={config} />
    ) : (
      <FallbackVisualPage />
    );
  }
  return (
    <div className="prototype-route-shell">
      <PrototypeModuleBanner />
      {page}
    </div>
  );
}
