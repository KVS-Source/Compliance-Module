import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Inbox,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { evidenceApi } from "../../services/evidenceApi";
import type { EvidenceReviewQueueItem } from "../../types/api";
import {
  EvidenceReviewModal,
  type EvidenceReviewKind,
} from "./EvidenceReviewModal";
import {
  evidenceStatusLabel,
  evidenceStatusTone,
  formatEvidenceDate,
  formatEvidenceDateTime,
  named,
} from "./evidenceFormatting";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const isIsoDate = (value: string | null): value is string =>
  value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function EvidenceReviewQueuePage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const canReview = hasPermission("evidence:review");
  const activeCompanyId = user?.activeCompany.id;

  const rawPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const appliedSearch = searchParams.get("q") ?? "";
  const expiresAfterParam = searchParams.get("expiresAfter");
  const expiresAfter = isIsoDate(expiresAfterParam) ? expiresAfterParam : "";
  const expiresBeforeParam = searchParams.get("expiresBefore");
  const expiresBefore = isIsoDate(expiresBeforeParam) ? expiresBeforeParam : "";

  const [draftSearch, setDraftSearch] = useState(appliedSearch);
  const [listVersion, setListVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{
    kind: EvidenceReviewKind;
    item: EvidenceReviewQueueItem;
  } | null>(null);

  const updateParams = useCallback(
    (changes: Record<string, string>, options: { resetPage?: boolean } = {}) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          if (options.resetPage !== false) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const tenantKeyRef = useRef(`${activeCompanyId}:${contextVersion}`);
  useEffect(() => {
    const key = `${activeCompanyId}:${contextVersion}`;
    if (tenantKeyRef.current === key) return;
    tenantKeyRef.current = key;
    setDraftSearch("");
    setSearchParams(new URLSearchParams(), { replace: true });
    setReviewTarget(null);
    setActionError(null);
  }, [activeCompanyId, contextVersion, setSearchParams]);

  useEffect(() => {
    setDraftSearch((current) =>
      current.trim() === appliedSearch ? current : appliedSearch,
    );
  }, [appliedSearch]);

  useEffect(() => {
    if (draftSearch.trim() === appliedSearch) return;
    const timer = window.setTimeout(() => {
      updateParams({ q: draftSearch.trim() });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [appliedSearch, draftSearch, updateParams]);

  const resource = useApiResource(
    () =>
      evidenceApi.listEvidenceReviewQueue({
        page,
        pageSize: PAGE_SIZE,
        q: appliedSearch || undefined,
        expiresAfter: expiresAfter || undefined,
        expiresBefore: expiresBefore || undefined,
      }),
    [
      contextVersion,
      activeCompanyId,
      page,
      appliedSearch,
      expiresAfter,
      expiresBefore,
      listVersion,
    ],
  );

  useEffect(() => {
    if (!resource.loading) setRefreshing(false);
  }, [resource.loading]);

  const rows = resource.data?.data ?? [];
  const meta = resource.data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = Math.max(1, meta?.totalPages ?? 1);

  const hasFilters = useMemo(
    () => Boolean(appliedSearch || expiresAfter || expiresBefore),
    [appliedSearch, expiresAfter, expiresBefore],
  );

  const refresh = () => {
    setRefreshing(true);
    setListVersion((value) => value + 1);
  };

  const goToPage = (next: number) => {
    updateParams({ page: next > 1 ? String(next) : "" }, { resetPage: false });
  };

  const selfReviewHint = (item: EvidenceReviewQueueItem) => {
    const actorId = user?.id;
    if (!actorId) return false;
    return (
      item.createdBy?.id === actorId || item.submittedBy?.id === actorId
    );
  };

  const onReviewCompleted = () => {
    const kind = reviewTarget?.kind;
    const code = reviewTarget?.item.code ?? "Evidence";
    setReviewTarget(null);
    showToast(
      "success",
      kind === "approve" ? "Evidence approved" : "Evidence rejected",
      `${code} was updated.`,
    );
    refresh();
  };

  const onReviewConflict = (message: string) => {
    setReviewTarget(null);
    setActionError(message);
    refresh();
  };

  return (
    <div className="page">
      <PageHeader
        title="Evidence Review"
        section="Evidence Management"
        description="SUBMITTED Evidence awaiting a human decision. The queue is inherently Pending review only."
        connected
        actions={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={resource.loading}
              onClick={refresh}
            >
              <RefreshCw size={15} /> Refresh
            </button>
            <Link className="btn btn-secondary" to="/evidence">
              <ArrowLeft size={15} /> Back to Library
            </Link>
          </>
        }
      />

      {actionError ? (
        <div
          className="banner warning"
          role="alert"
          data-testid="evidence-review-queue-error"
        >
          {actionError}
        </div>
      ) : null}

      <form
        className="filter-bar"
        style={{ flexWrap: "wrap" }}
        onSubmit={(event) => {
          event.preventDefault();
          updateParams({ q: draftSearch.trim() });
        }}
      >
        <label className="filter-search">
          <span className="sr-only">Search review queue</span>
          <Search className="icon" size={16} aria-hidden />
          <input
            className="control"
            type="search"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search code or title…"
            maxLength={100}
            aria-label="Search Evidence review queue"
          />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Expires on or after</span>
          <input
            className="control"
            type="date"
            value={expiresAfter}
            aria-label="Expires on or after"
            onChange={(event) =>
              updateParams({ expiresAfter: event.target.value })
            }
          />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Expires on or before</span>
          <input
            className="control"
            type="date"
            value={expiresBefore}
            aria-label="Expires on or before"
            onChange={(event) =>
              updateParams({ expiresBefore: event.target.value })
            }
          />
        </label>
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            setDraftSearch("");
            setSearchParams(new URLSearchParams(), { replace: true });
          }}
        >
          Reset filters
        </button>
      </form>

      {resource.loading ? (
        <div
          data-testid={
            refreshing
              ? "evidence-review-queue-refreshing"
              : "evidence-review-queue-loading"
          }
        >
          <LoadingState
            label={
              refreshing
                ? "Refreshing Evidence Review Queue…"
                : "Loading Evidence Review Queue…"
            }
          />
        </div>
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : rows.length === 0 ? (
        <section
          className="card empty-state"
          id="page-content"
          data-testid="evidence-review-queue-empty"
        >
          <Inbox size={28} aria-hidden />
          <h3>
            {hasFilters
              ? "No Evidence matches these filters"
              : "Review queue is empty"}
          </h3>
          <p>
            {hasFilters
              ? "Adjust the search or expiry filters and try again."
              : "No SUBMITTED Evidence is awaiting review in the active Company."}
          </p>
        </section>
      ) : (
        <>
          <section
            className="card table-card evidence-review-desktop"
            id="page-content"
            data-testid="evidence-review-queue-table"
          >
            <div className="table-wrap">
              <table className="data-table">
                <caption>
                  Evidence Review Queue — {total} item{total === 1 ? "" : "s"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Evidence</th>
                    <th scope="col">Status</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Submitter</th>
                    <th scope="col">Expires</th>
                    <th scope="col">File</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="cell-title">
                          <strong>{item.title}</strong>
                          <small className="mono">{item.code}</small>
                        </div>
                      </td>
                      <td>
                        <Badge tone={evidenceStatusTone(item.lifecycleStatus)}>
                          {evidenceStatusLabel(item.lifecycleStatus)}
                        </Badge>
                      </td>
                      <td>{formatEvidenceDateTime(item.submittedAt)}</td>
                      <td>{named(item.submittedBy, "Unknown")}</td>
                      <td>{formatEvidenceDate(item.expiresAt)}</td>
                      <td>{item.hasFile ? "Uploaded" : "Missing"}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="tiny-btn"
                            type="button"
                            aria-label={`View ${item.code}`}
                            onClick={() => navigate(`/evidence/${item.id}`)}
                          >
                            <Eye size={15} />
                          </button>
                          {canReview ? (
                            <>
                              <button
                                className="btn btn-secondary"
                                type="button"
                                data-testid={`evidence-queue-approve-${item.id}`}
                                onClick={() =>
                                  setReviewTarget({ kind: "approve", item })
                                }
                              >
                                <CheckCircle2 size={14} /> Approve
                              </button>
                              <button
                                className="btn btn-secondary"
                                type="button"
                                data-testid={`evidence-queue-reject-${item.id}`}
                                onClick={() =>
                                  setReviewTarget({ kind: "reject", item })
                                }
                              >
                                <XCircle size={14} /> Reject
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <QueuePager
              page={page}
              total={total}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onPageChange={goToPage}
            />
          </section>

          <section
            className="evidence-review-mobile"
            aria-label="Evidence Review Queue cards"
            data-testid="evidence-review-queue-cards"
          >
            {rows.map((item) => (
              <article className="card evidence-review-card" key={item.id}>
                <header className="card-head">
                  <div>
                    <h2>{item.title}</h2>
                    <p className="mono">{item.code}</p>
                  </div>
                  <Badge tone={evidenceStatusTone(item.lifecycleStatus)}>
                    {evidenceStatusLabel(item.lifecycleStatus)}
                  </Badge>
                </header>
                <div className="card-pad">
                  <p>Submitted {formatEvidenceDateTime(item.submittedAt)}</p>
                  <p>Submitter {named(item.submittedBy, "Unknown")}</p>
                  <p>Expires {formatEvidenceDate(item.expiresAt)}</p>
                  <div className="row-actions">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => navigate(`/evidence/${item.id}`)}
                    >
                      <Eye size={15} /> View detail
                    </button>
                    {canReview ? (
                      <>
                        <button
                          className="btn btn-primary"
                          type="button"
                          data-testid={`evidence-queue-approve-${item.id}`}
                          onClick={() =>
                            setReviewTarget({ kind: "approve", item })
                          }
                        >
                          <CheckCircle2 size={15} /> Approve
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          data-testid={`evidence-queue-reject-${item.id}`}
                          onClick={() =>
                            setReviewTarget({ kind: "reject", item })
                          }
                        >
                          <XCircle size={15} /> Reject
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
            <QueuePager
              page={page}
              total={total}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onPageChange={goToPage}
            />
          </section>
        </>
      )}

      {reviewTarget ? (
        <EvidenceReviewModal
          kind={reviewTarget.kind}
          evidence={reviewTarget.item}
          selfReviewHint={selfReviewHint(reviewTarget.item)}
          onClose={() => setReviewTarget(null)}
          onCompleted={onReviewCompleted}
          onConflict={onReviewConflict}
        />
      ) : null}
    </div>
  );
}

function QueuePager({
  page,
  total,
  totalPages,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
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
          aria-label="Previous page"
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
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
