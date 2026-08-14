import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import type { PolicyAuditEvent, PageMeta } from "../../types/api";
import {
  auditActionLabel,
  formatPolicyDateTime,
  safeAuditMetadataEntries,
} from "./policyFormatting";

interface PolicyAuditHistoryProps {
  events: PolicyAuditEvent[] | null;
  meta: PageMeta | null;
  loading: boolean;
  error: Error | null;
  page: number;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}

export function PolicyAuditHistory({
  events,
  meta,
  loading,
  error,
  page,
  onPageChange,
  onRetry,
}: PolicyAuditHistoryProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  return (
    <section className="card" data-testid="policy-audit-history">
      <header className="card-head">
        <div>
          <h2>Audit history</h2>
          <p>
            Append-only Policy and Policy Version events. Content, purpose,
            scope and approval comments are never shown.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onRetry}
          disabled={loading}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>
      <div className="card-pad">
        {loading ? (
          <div data-testid="policy-audit-loading">
            <LoadingState label="Loading audit history…" />
          </div>
        ) : error ? (
          <div data-testid="policy-audit-error">
            <ErrorState error={error} />
            <button
              className="btn btn-secondary"
              type="button"
              onClick={onRetry}
            >
              Retry
            </button>
          </div>
        ) : !events || events.length === 0 ? (
          <p className="muted">No audit events returned for this Policy.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <caption>Policy audit events</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Action</th>
                    <th scope="col">Entity</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const entries = safeAuditMetadataEntries(event.metadata);
                    const fromStatus = entries.find(
                      ([key]) => key === "fromStatus",
                    )?.[1];
                    const toStatus = entries.find(
                      ([key]) => key === "toStatus",
                    )?.[1];
                    const changed = entries.find(
                      ([key]) => key === "changedFields",
                    )?.[1];
                    return (
                      <tr key={event.id}>
                        <td>
                          <span className="mono">
                            {formatPolicyDateTime(event.createdAt)}
                          </span>
                        </td>
                        <td>{auditActionLabel(event.action)}</td>
                        <td>
                          {event.entityType}
                          <br />
                          <small className="mono">{event.entityId}</small>
                        </td>
                        <td>
                          <span className="mono">
                            {event.userId ?? "System"}
                          </span>
                        </td>
                        <td>
                          {fromStatus || toStatus ? (
                            <div>
                              {fromStatus ?? "—"} → {toStatus ?? "—"}
                            </div>
                          ) : null}
                          {changed ? (
                            <div>
                              <small>Changed: {changed}</small>
                            </div>
                          ) : null}
                          {entries.length > 0 ? (
                            <details
                              open={openId === event.id}
                              onToggle={(toggleEvent) => {
                                const el = toggleEvent.currentTarget;
                                setOpenId(el.open ? event.id : null);
                              }}
                            >
                              <summary>Safe metadata</summary>
                              <ul>
                                {entries.map(([key, value]) => (
                                  <li key={key}>
                                    <strong>{key}</strong>: {value}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span>
                Showing {total ? (page - 1) * (meta?.pageSize ?? 20) + 1 : 0}–
                {Math.min(page * (meta?.pageSize ?? 20), total)} of {total}
              </span>
              <div className="pagination">
                <button
                  className="page-btn"
                  type="button"
                  aria-label="Previous audit page"
                  disabled={page <= 1}
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                >
                  <ChevronLeft size={15} />
                </button>
                <span>
                  Page {page} of {Math.max(1, totalPages)}
                </span>
                <button
                  className="page-btn"
                  type="button"
                  aria-label="Next audit page"
                  disabled={page >= totalPages}
                  onClick={() =>
                    onPageChange(Math.min(totalPages, page + 1))
                  }
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
