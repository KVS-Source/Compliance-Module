import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import type {
  EvidenceAuditEvent,
  EvidenceReviewDecision,
  PageMeta,
} from "../../types/api";
import {
  auditActionLabel,
  evidenceDecisionTone,
  formatEvidenceDateTime,
  named,
  safeEvidenceAuditEntries,
} from "./evidenceFormatting";

interface PagerProps {
  page: number;
  meta: PageMeta | null;
  label: string;
  onPageChange: (page: number) => void;
}

function HistoryPager({ page, meta, label, onPageChange }: PagerProps) {
  const total = meta?.total ?? 0;
  const pageSize = meta?.pageSize ?? 20;
  const totalPages = Math.max(1, meta?.totalPages ?? 1);
  return (
    <div className="table-foot">
      <span>
        Showing {total ? (page - 1) * pageSize + 1 : 0}–
        {Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="pagination">
        <button
          className="page-btn"
          type="button"
          aria-label={`Previous ${label} page`}
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft size={15} />
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          className="page-btn"
          type="button"
          aria-label={`Next ${label} page`}
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

interface ReviewDecisionHistoryProps {
  decisions: EvidenceReviewDecision[] | null;
  meta: PageMeta | null;
  loading: boolean;
  error: Error | null;
  page: number;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}

/** Append-only decision trail. Reasons are shown here and nowhere else. */
export function EvidenceReviewDecisionHistory({
  decisions,
  meta,
  loading,
  error,
  page,
  onPageChange,
  onRetry,
}: ReviewDecisionHistoryProps) {
  return (
    <section className="card" data-testid="evidence-review-decisions">
      <header className="card-head">
        <div>
          <h2>Review decisions</h2>
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
          <div data-testid="evidence-review-decisions-loading">
            <LoadingState label="Loading review decisions…" />
          </div>
        ) : error ? (
          <div data-testid="evidence-review-decisions-error">
            <ErrorState error={error} />
          </div>
        ) : !decisions || decisions.length === 0 ? (
          <p className="muted">
            No review decision has been recorded for this Evidence yet.
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <caption>Evidence review decisions</caption>
                <thead>
                  <tr>
                    <th scope="col">Decided</th>
                    <th scope="col">Decision</th>
                    <th scope="col">Reviewer</th>
                    <th scope="col">Reason or comment</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((decision) => (
                    <tr key={decision.id}>
                      <td>
                        <span className="mono">
                          {formatEvidenceDateTime(decision.decidedAt)}
                        </span>
                      </td>
                      <td>
                        <Badge tone={evidenceDecisionTone(decision.decision)}>
                          {decision.decision}
                        </Badge>
                      </td>
                      <td>{named(decision.actedBy, "Not recorded")}</td>
                      <td style={{ whiteSpace: "pre-wrap" }}>
                        {decision.reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <HistoryPager
              page={page}
              meta={meta}
              label="review decision"
              onPageChange={onPageChange}
            />
          </>
        )}
      </div>
    </section>
  );
}

interface AuditHistoryProps {
  events: EvidenceAuditEvent[] | null;
  meta: PageMeta | null;
  loading: boolean;
  error: Error | null;
  page: number;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}

export function EvidenceAuditHistory({
  events,
  meta,
  loading,
  error,
  page,
  onPageChange,
  onRetry,
}: AuditHistoryProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="card" data-testid="evidence-audit-history">
      <header className="card-head">
        <div>
          <h2>Audit history</h2>
          <p>
            Append-only Evidence events. Storage keys, content hashes, file
            paths and free-text fields are never shown.
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
          <div data-testid="evidence-audit-loading">
            <LoadingState label="Loading audit history…" />
          </div>
        ) : error ? (
          <div data-testid="evidence-audit-error">
            <ErrorState error={error} />
          </div>
        ) : !events || events.length === 0 ? (
          <p className="muted">No audit events returned for this Evidence.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <caption>Evidence audit events</caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Action</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const entries = safeEvidenceAuditEntries(event.metadata);
                    const fromStatus = entries.find(
                      ([key]) => key === "fromStatus",
                    )?.[1];
                    const toStatus = entries.find(
                      ([key]) => key === "toStatus",
                    )?.[1];
                    return (
                      <tr key={event.id}>
                        <td>
                          <span className="mono">
                            {formatEvidenceDateTime(event.createdAt)}
                          </span>
                        </td>
                        <td>{auditActionLabel(event.action)}</td>
                        <td>
                          <span className="mono">{event.userId ?? "System"}</span>
                        </td>
                        <td>
                          {fromStatus || toStatus ? (
                            <div>
                              {fromStatus ?? "—"} → {toStatus ?? "—"}
                            </div>
                          ) : null}
                          {entries.length > 0 ? (
                            <details
                              open={openId === event.id}
                              onToggle={(toggleEvent) => {
                                const element = toggleEvent.currentTarget;
                                setOpenId(element.open ? event.id : null);
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
            <HistoryPager
              page={page}
              meta={meta}
              label="audit"
              onPageChange={onPageChange}
            />
          </>
        )}
      </div>
    </section>
  );
}
