import { ChevronLeft, ChevronRight, Eye, Inbox, RefreshCw, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { auditApi, type AuditEvent } from "../../services/auditApi";
import { API_BASE_URL } from "../../config/api";
import { getAccessToken } from "../../services/apiClient";

const PAGE_SIZE = 20;

export function AuditTrailPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [source, setSource] = useState<AuditEvent["source"] | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  useEffect(() => {
    setDraftSearch("");
    setSearch("");
    setEntityType("");
    setAction("");
    setSource("");
    setFrom("");
    setTo("");
    setPage(1);
    setSelected(null);
  }, [contextVersion, user?.activeCompany.id]);

  const resource = useApiResource(
    () =>
      auditApi.list({
        page,
        pageSize: PAGE_SIZE,
        q: search || undefined,
        entityType: entityType || undefined,
        action: action || undefined,
        source: source || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
      }),
    [page, search, entityType, action, source, from, to, version, contextVersion, user?.activeCompany.id],
  );

  const rows = resource.data?.data ?? [];
  const total = resource.data?.meta.total ?? 0;
  const totalPages = resource.data?.meta.totalPages ?? 1;

  const exportAudit = async () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (entityType) params.set("entityType", entityType);
    if (action) params.set("action", action);
    if (source) params.set("source", source);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59.999Z`).toISOString());
    const token = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/audit-events/export.csv?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "same-origin",
    });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "genbioca-audit-trail.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <PageHeader
        title="Audit Trail"
        section="Audit & Operations"
        description="Company activity history."
        connected
        actions={
          <>
            {hasPermission("exports:read") ? (
              <button className="btn btn-secondary" type="button" onClick={() => void exportAudit()}>
                Export CSV
              </button>
            ) : null}
            <button className="btn btn-secondary" type="button" onClick={() => setVersion((value) => value + 1)}>
              <RefreshCw size={15} /> Refresh
            </button>
          </>
        }
      />

      <form
        className="filter-bar deadline-filter-bar"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setPage(1);
          setSearch(draftSearch.trim());
        }}
      >
        <label className="filter-search">
          <span className="sr-only">Search audit events</span>
          <Search className="icon" size={16} aria-hidden />
          <input className="control" type="search" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Search action or entity…" maxLength={100} />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Entity type</span>
          <input className="control" value={entityType} onChange={(event) => { setEntityType(event.target.value); setPage(1); }} placeholder="Entity type" maxLength={120} />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Action</span>
          <input className="control" value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }} placeholder="Action" maxLength={120} />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Source</span>
          <select className="control" value={source} onChange={(event) => { setSource(event.target.value as AuditEvent["source"] | ""); setPage(1); }}>
            <option value="">All sources</option>
            <option value="SYSTEM">SYSTEM</option>
            <option value="USER">USER</option>
            <option value="IMPORT">IMPORT</option>
            <option value="EXTERNAL_SYNC">EXTERNAL_SYNC</option>
          </select>
        </label>
        <label>
          <span className="sr-only">From</span>
          <input className="control" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
        </label>
        <label>
          <span className="sr-only">To</span>
          <input className="control" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
        </label>
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>

      {resource.loading ? (
        <LoadingState label="Loading audit trail…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : rows.length === 0 ? (
        <section className="card empty-state" id="page-content">
          <Inbox size={28} />
          <h3>No audit events</h3>
          <p>No events matched the filters for {user?.activeCompany.name ?? "the active Company"}.</p>
        </section>
      ) : (
        <>
          <section className="card table-card deadline-register-desktop" data-testid="audit-trail-table">
            <div className="table-wrap">
              <table className="data-table">
                <caption>Audit Trail — {total} event{total === 1 ? "" : "s"}</caption>
                <thead>
                  <tr>
                    <th>Occurred</th>
                    <th>Source</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Record</th>
                    <th>User</th>
                    <th>Result</th>
                    <th><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.createdAt).toLocaleString()}</td>
                      <td><Badge>{event.source}</Badge></td>
                      <td>{event.action}</td>
                      <td>{event.entityType}</td>
                      <td className="mono">{event.recordCode ?? "—"}</td>
                      <td>{event.user?.name ?? "System"}</td>
                      <td>{event.success ? "Success" : "Failure"}</td>
                      <td>
                        <button className="tiny-btn" type="button" aria-label="View audit detail" onClick={() => setSelected(event)}>
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span>Showing {total ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
              <div className="pagination">
                <button className="page-btn" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
                <span>Page {page} of {Math.max(1, totalPages)}</span>
                <button className="page-btn" type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
              </div>
            </div>
          </section>
          <section className="deadline-register-mobile" data-testid="audit-trail-cards">
            {rows.map((event) => (
              <article className="card deadline-register-card" key={event.id}>
                <header className="card-head">
                  <div>
                    <h2>{event.action}</h2>
                    <p>{new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge>{event.source}</Badge>
                </header>
                <div className="card-pad">
                  <p>{event.entityType} · {event.recordCode ?? "—"}</p>
                  <p>{event.user?.name ?? "System"}</p>
                  <button className="btn btn-secondary" type="button" onClick={() => setSelected(event)}>View detail</button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {selected ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Audit event detail">
          <div className="card modal-card">
            <header className="card-head">
              <div>
                <h2>{selected.action}</h2>
                <p>{selected.entityType}</p>
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => setSelected(null)}>Close</button>
            </header>
            <div className="card-pad">
              <p><strong>Source:</strong> {selected.source}{selected.storedSource === "IMPORT" ? " (imported historical event)" : ""}</p>
              <p><strong>Record:</strong> {selected.recordCode ?? selected.entityId ?? "—"}</p>
              <p><strong>User:</strong> {selected.user?.name ?? "System"}</p>
              <p><strong>Correlation:</strong> {selected.correlationId ?? "—"}</p>
              <p><strong>Request:</strong> {selected.requestId ?? "—"}</p>
              <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(selected.metadata, null, 2)}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
