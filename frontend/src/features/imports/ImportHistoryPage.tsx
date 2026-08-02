import { ChevronLeft, ChevronRight, Eye, Inbox, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { importApi } from "../../services/importApi";

const PAGE_SIZE = 20;
export function ImportHistoryPage() {
  const { user } = useAuth(); const { contextVersion } = useTenant(); const navigate = useNavigate();
  const [page, setPage] = useState(1); const [version, setVersion] = useState(0);
  useEffect(() => setPage(1), [contextVersion, user?.activeCompany.id]);
  const resource = useApiResource(() => importApi.list(page, PAGE_SIZE), [page, version, contextVersion, user?.activeCompany.id]);
  const rows = resource.data?.data ?? []; const total = resource.data?.meta.total ?? 0; const totalPages = resource.data?.meta.totalPages ?? 1;
  return <div className="page"><PageHeader title="Import History" section="Data Management" description="Auditable workbook batches loaded through the approved backend CLI delivery path." connected actions={<button className="btn btn-secondary" type="button" onClick={() => setVersion((value) => value + 1)}><RefreshCw size={15} /> Refresh</button>} />
    {resource.loading ? <LoadingState label="Loading import history…" /> : resource.error ? <ErrorState error={resource.error} /> : rows.length === 0 ? <section className="card empty-state" id="page-content"><Inbox size={28} /><h3>No imports yet</h3><p>No workbook import batches were returned for {user?.activeCompany.name ?? "the active Company"}.</p></section> : <>
      <section className="card table-card deadline-register-desktop" id="page-content" data-testid="import-history-table"><div className="table-wrap"><table className="data-table"><caption>Import History — {total} batch{total === 1 ? "" : "es"}</caption><thead><tr><th>Workbook</th><th>Status</th><th>Created</th><th>Updated</th><th>Skipped</th><th>Errors</th><th>Started</th><th>Actor</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{rows.map((batch) => <tr key={batch.id}><td><div className="cell-title"><strong>{batch.originalFilename}</strong><small className="mono">{batch.fileChecksum.slice(0, 12)}…</small></div></td><td><Badge>{batch.status}</Badge></td><td>{batch.createdCount}</td><td>{batch.updatedCount}</td><td>{batch.skippedCount}</td><td>{batch.errorCount}</td><td>{new Date(batch.startedAt).toLocaleString()}</td><td>{batch.uploadedBy.fullName}</td><td><button className="tiny-btn" type="button" aria-label={`View import ${batch.originalFilename}`} onClick={() => navigate(`/data/import-history/${batch.id}`)}><Eye size={15} /></button></td></tr>)}</tbody></table></div><Pager page={page} total={total} totalPages={totalPages} onPageChange={setPage} /></section>
      <section className="deadline-register-mobile" data-testid="import-history-cards" aria-label="Import history cards">{rows.map((batch) => <article className="card deadline-register-card" key={batch.id}><header className="card-head"><div><h2>{batch.originalFilename}</h2><p>{new Date(batch.startedAt).toLocaleString()}</p></div><Badge>{batch.status}</Badge></header><div className="card-pad"><p>{batch.createdCount} created · {batch.updatedCount} updated · {batch.skippedCount} skipped</p><p className={batch.errorCount ? "deadline-overdue" : ""}>{batch.errorCount} row errors</p><button className="btn btn-secondary" type="button" onClick={() => navigate(`/data/import-history/${batch.id}`)}><Eye size={15} /> View report</button></div></article>)}<Pager page={page} total={total} totalPages={totalPages} onPageChange={setPage} /></section>
    </>}</div>;
}
function Pager({ page, total, totalPages, onPageChange }: { page: number; total: number; totalPages: number; onPageChange: (page: number) => void }) { return <div className="table-foot"><span>Showing {total ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</span><div className="pagination"><button className="page-btn" type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={15} /></button><span>Page {page} of {Math.max(1, totalPages)}</span><button className="page-btn" type="button" aria-label="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight size={15} /></button></div></div>; }
