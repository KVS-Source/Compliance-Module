import { ChevronLeft, ChevronRight, Eye, Inbox, RefreshCw, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { capaApi } from "../../services/capaApi";
import type { CapaPriority, CapaStatus } from "../../types/api";
import { CapaFormModal } from "./CapaFormModal";

const PAGE_SIZE = 20;

export function CapaRegisterPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CapaStatus | "">("");
  const [priority, setPriority] = useState<CapaPriority | "">("");
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [initialGapId, setInitialGapId] = useState<string | undefined>();

  useEffect(() => {
    const gapId = searchParams.get("gapId");
    if (gapId && hasPermission("capa:write")) {
      setInitialGapId(gapId);
      setCreating(true);
      const next = new URLSearchParams(searchParams);
      next.delete("gapId");
      setSearchParams(next, { replace: true });
    }
  }, [hasPermission, searchParams, setSearchParams]);

  useEffect(() => {
    setDraftSearch("");
    setSearch("");
    setStatus("");
    setPriority("");
    setOverdue(false);
    setPage(1);
  }, [contextVersion, user?.activeCompany.id]);

  const resource = useApiResource(
    () => capaApi.list({ page, pageSize: PAGE_SIZE, q: search || undefined, status: status || undefined, priority: priority || undefined, overdue: overdue || undefined }),
    [contextVersion, user?.activeCompany.id, page, search, status, priority, overdue, version],
  );
  const rows = resource.data?.data ?? [];
  const meta = resource.data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const filtered = Boolean(search || status || priority || overdue);
  const applySearch = (event: FormEvent) => { event.preventDefault(); setPage(1); setSearch(draftSearch.trim()); };

  return (
    <div className="page">
      <PageHeader title="CAPA Register" section="Gap & CAPA" description="Track corrective and preventive actions, ownership, progress and Evidence-gated closure." connected primaryLabel={hasPermission("capa:write") ? "Create CAPA" : undefined} onPrimary={() => { setInitialGapId(undefined); setCreating(true); }} actions={<button className="btn btn-secondary" type="button" onClick={() => setVersion((value) => value + 1)}><RefreshCw size={15} /> Refresh</button>} />
      <form className="filter-bar deadline-filter-bar" onSubmit={applySearch}>
        <label className="filter-search"><span className="sr-only">Search CAPAs</span><Search className="icon" size={16} aria-hidden /><input className="control" type="search" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Search code, title or Gap…" maxLength={100} /></label>
        <label className="toolbar-select"><span className="sr-only">CAPA status</span><select className="control" value={status} onChange={(event) => { setStatus(event.target.value as CapaStatus | ""); setPage(1); }}><option value="">All statuses</option><option value="OPEN">OPEN</option><option value="IN_PROGRESS">IN PROGRESS</option><option value="PENDING_VERIFICATION">PENDING VERIFICATION</option><option value="CLOSED">CLOSED</option><option value="CANCELLED">CANCELLED</option></select></label>
        <label className="toolbar-select"><span className="sr-only">CAPA priority</span><select className="control" value={priority} onChange={(event) => { setPriority(event.target.value as CapaPriority | ""); setPage(1); }}><option value="">All priorities</option><option value="CRITICAL">CRITICAL</option><option value="HIGH">HIGH</option><option value="MEDIUM">MEDIUM</option><option value="LOW">LOW</option></select></label>
        <label className="deadline-check"><input type="checkbox" checked={overdue} onChange={(event) => { setOverdue(event.target.checked); setPage(1); }} /> Overdue only</label>
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>
      {resource.loading ? <LoadingState label="Loading CAPA Register…" /> : resource.error ? <ErrorState error={resource.error} /> : rows.length === 0 ? <section className="card empty-state" id="page-content"><Inbox size={28} /><h3>{filtered ? "No CAPAs match these filters" : "No CAPAs yet"}</h3><p>{filtered ? "Adjust the server-side filters and try again." : `No CAPA records were returned for ${user?.activeCompany.name ?? "the active Company"}.`}</p></section> : <>
        <section className="card table-card deadline-register-desktop" id="page-content" data-testid="capa-register-table"><div className="table-wrap"><table className="data-table"><caption>CAPA Register — {total} result{total === 1 ? "" : "s"}</caption><thead><tr><th>CAPA</th><th>Status</th><th>Priority</th><th>Linked Gap</th><th>Owner</th><th>Progress</th><th>Due date</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{rows.map((capa) => <tr key={capa.id}><td><div className="cell-title"><strong>{capa.title}</strong><small className="mono">{capa.code}</small></div></td><td><Badge>{capa.status.replaceAll("_", " ")}</Badge></td><td><Badge>{capa.priority}</Badge></td><td>{capa.gap ? `${capa.gap.code} · ${capa.gap.title}` : "—"}</td><td>{capa.owner?.name ?? capa.sourceOwnerRef ?? "Unassigned"}</td><td><span className="mono">{capa.completionPercentage}%</span></td><td>{capa.dueDate ? <span className={capa.overdue ? "deadline-overdue" : ""}>{capa.dueDate}{capa.overdue ? " · Overdue" : ""}</span> : "—"}</td><td><button className="tiny-btn" type="button" aria-label={`View ${capa.code}`} onClick={() => navigate(`/compliance/capa/${capa.id}`)}><Eye size={15} /></button></td></tr>)}</tbody></table></div><Pager page={page} total={total} totalPages={totalPages} onPageChange={setPage} /></section>
        <section className="deadline-register-mobile" aria-label="CAPA cards" data-testid="capa-register-cards">{rows.map((capa) => <article className="card deadline-register-card" key={capa.id}><header className="card-head"><div><h2>{capa.title}</h2><p className="mono">{capa.code}</p></div><Badge>{capa.status.replaceAll("_", " ")}</Badge></header><div className="card-pad"><p><Badge>{capa.priority}</Badge> · {capa.completionPercentage}% complete</p><p>{capa.gap ? `${capa.gap.code} · ${capa.gap.title}` : "No linked Gap"}</p><p className={capa.overdue ? "deadline-overdue" : ""}>{capa.dueDate ?? "No due date"}{capa.overdue ? " · Overdue" : ""}</p><button className="btn btn-secondary" type="button" onClick={() => navigate(`/compliance/capa/${capa.id}`)}><Eye size={15} /> View detail</button></div></article>)}<Pager page={page} total={total} totalPages={totalPages} onPageChange={setPage} /></section>
      </>}
      {creating ? <CapaFormModal initialGapId={initialGapId} onClose={() => setCreating(false)} onSaved={(capa) => { setCreating(false); showToast("success", "CAPA created", `${capa.code} is ready for action.`); navigate(`/compliance/capa/${capa.id}`); }} /> : null}
    </div>
  );
}

function Pager({ page, total, totalPages, onPageChange }: { page: number; total: number; totalPages: number; onPageChange: (page: number) => void }) {
  return <div className="table-foot"><span>Showing {total ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</span><div className="pagination"><button className="page-btn" type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={15} /></button><span>Page {page} of {Math.max(1, totalPages)}</span><button className="page-btn" type="button" aria-label="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight size={15} /></button></div></div>;
}
