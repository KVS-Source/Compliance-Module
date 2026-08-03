import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Inbox,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { CsvExportButton } from "../../components/actions/CsvExportButton";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { gapApi } from "../../services/gapApi";
import type { Gap, GapSeverity, GapStatus } from "../../types/api";
import { GapFormModal } from "./GapFormModal";

const PAGE_SIZE = 20;
const label = (value: string) => value.replaceAll("_", " ");

export function GapRegisterPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<GapStatus | "">("");
  const [severity, setSeverity] = useState<GapSeverity | "">("");
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setDraftSearch("");
    setSearch("");
    setStatus("");
    setSeverity("");
    setOverdue(false);
    setPage(1);
  }, [contextVersion, user?.activeCompany.id]);

  const resource = useApiResource(
    () => gapApi.list({ page, pageSize: PAGE_SIZE, q: search || undefined, status: status || undefined, severity: severity || undefined, overdue: overdue || undefined }),
    [contextVersion, user?.activeCompany.id, page, search, status, severity, overdue, version],
  );
  const rows = resource.data?.data ?? [];
  const meta = resource.data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const filtered = Boolean(search || status || severity || overdue);

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const open = (gap: Gap) => navigate(`/compliance/gaps/${gap.id}`);

  return (
    <div className="page">
      <PageHeader
        title="Gap Register"
        section="Gap & CAPA"
        description="Track identified compliance gaps, ownership, due dates and Evidence-gated closure."
        connected
        primaryLabel={hasPermission("gaps:write") ? "Create Gap" : undefined}
        onPrimary={() => setCreating(true)}
        actions={<>{hasPermission("exports:read") ? <CsvExportButton module="gaps" /> : null}<button className="btn btn-secondary" type="button" onClick={() => setVersion((value) => value + 1)}><RefreshCw size={15} /> Refresh</button></>}
      />

      <form className="filter-bar deadline-filter-bar" onSubmit={applySearch}>
        <label className="filter-search">
          <span className="sr-only">Search Gaps</span>
          <Search className="icon" size={16} aria-hidden />
          <input className="control" type="search" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Search code or title…" maxLength={100} />
        </label>
        <label className="toolbar-select"><span className="sr-only">Gap status</span><select className="control" value={status} onChange={(event) => { setStatus(event.target.value as GapStatus | ""); setPage(1); }}><option value="">All statuses</option><option value="OPEN">OPEN</option><option value="IN_PROGRESS">IN PROGRESS</option><option value="CLOSED">CLOSED</option><option value="CANCELLED">CANCELLED</option></select></label>
        <label className="toolbar-select"><span className="sr-only">Gap severity</span><select className="control" value={severity} onChange={(event) => { setSeverity(event.target.value as GapSeverity | ""); setPage(1); }}><option value="">All severities</option><option value="CRITICAL">CRITICAL</option><option value="MAJOR">MAJOR</option><option value="MINOR">MINOR</option><option value="OBSERVATION">OBSERVATION</option><option value="OFI">OFI</option></select></label>
        <label className="deadline-check"><input type="checkbox" checked={overdue} onChange={(event) => { setOverdue(event.target.checked); setPage(1); }} /> Overdue only</label>
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>

      {resource.loading ? <LoadingState label="Loading Gap Register…" /> : resource.error ? <ErrorState error={resource.error} /> : rows.length === 0 ? (
        <section className="card empty-state" id="page-content"><Inbox size={28} /><h3>{filtered ? "No Gaps match these filters" : "No Gaps yet"}</h3><p>{filtered ? "Adjust the server-side filters and try again." : `No Gap records were returned for ${user?.activeCompany.name ?? "the active Company"}.`}</p></section>
      ) : (
        <>
          <section className="card table-card deadline-register-desktop" id="page-content" data-testid="gap-register-table">
            <div className="table-wrap"><table className="data-table"><caption>Gap Register — {total} result{total === 1 ? "" : "s"}</caption><thead><tr><th>Gap</th><th>Status</th><th>Severity</th><th>Owner</th><th>Department</th><th>Due date</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{rows.map((gap) => <tr key={gap.id}><td><div className="cell-title"><strong>{gap.title}</strong><small className="mono">{gap.code}</small></div></td><td><Badge>{label(gap.status)}</Badge></td><td><Badge>{gap.severity}</Badge></td><td>{gap.owner?.name ?? gap.sourceOwnerRef ?? "Unassigned"}</td><td>{gap.department?.name ?? "—"}</td><td>{gap.dueDate ? <span className={gap.overdue ? "deadline-overdue" : ""}>{gap.dueDate}{gap.overdue ? " · Overdue" : ""}</span> : "—"}</td><td><button className="tiny-btn" type="button" aria-label={`View ${gap.code}`} onClick={() => open(gap)}><Eye size={15} /></button></td></tr>)}</tbody></table></div>
            <Pager page={page} total={total} totalPages={totalPages} onPageChange={setPage} />
          </section>
          <section className="deadline-register-mobile" aria-label="Gap cards" data-testid="gap-register-cards">{rows.map((gap) => <article className="card deadline-register-card" key={gap.id}><header className="card-head"><div><h2>{gap.title}</h2><p className="mono">{gap.code}</p></div><Badge>{label(gap.status)}</Badge></header><div className="card-pad"><p><Badge>{gap.severity}</Badge></p><p>{gap.owner?.name ?? gap.sourceOwnerRef ?? "Unassigned"}</p><p className={gap.overdue ? "deadline-overdue" : ""}>{gap.dueDate ?? "No due date"}{gap.overdue ? " · Overdue" : ""}</p><button className="btn btn-secondary" type="button" onClick={() => open(gap)}><Eye size={15} /> View detail</button></div></article>)}<Pager page={page} total={total} totalPages={totalPages} onPageChange={setPage} /></section>
        </>
      )}
      {creating ? <GapFormModal onClose={() => setCreating(false)} onSaved={(gap) => { setCreating(false); showToast("success", "Gap created", `${gap.code} is ready for remediation.`); navigate(`/compliance/gaps/${gap.id}`); }} /> : null}
    </div>
  );
}

function Pager({ page, total, totalPages, onPageChange }: { page: number; total: number; totalPages: number; onPageChange: (page: number) => void }) {
  return <div className="table-foot"><span>Showing {total ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</span><div className="pagination"><button className="page-btn" type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={15} /></button><span>Page {page} of {Math.max(1, totalPages)}</span><button className="page-btn" type="button" aria-label="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight size={15} /></button></div></div>;
}
