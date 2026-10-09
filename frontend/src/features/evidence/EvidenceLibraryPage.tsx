import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Inbox,
  Plus,
  RefreshCw,
  ScanSearch,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { CsvExportButton } from "../../components/actions/CsvExportButton";
import { SortableTh } from "../../components/tables/SortableTh";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import type { SortOrder } from "../../hooks/useRegisterQueryState";
import { ApiError } from "../../services/apiClient";
import { evidenceApi } from "../../services/evidenceApi";
import { masterDataApi } from "../../services/masterDataApi";
import type {
  CompanyUser,
  Department,
  Evidence,
  EvidenceLifecycleStatus,
} from "../../types/api";
import {
  EVIDENCE_LIFECYCLE_OPTIONS,
  evidenceStatusLabel,
  evidenceStatusTone,
  formatEvidenceDate,
  named,
} from "./evidenceFormatting";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
/** Matches backend expiringSoon window (90 days). */
const EXPIRING_SOON_DAYS = 90;

type MasterState<T> =
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "forbidden" }
  | { status: "error"; message: string };

const loadMaster = async <T,>(
  loader: () => Promise<T[]>,
): Promise<MasterState<T>> => {
  try {
    return { status: "ready", items: await loader() };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { status: "forbidden" };
    }
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Supporting data could not be loaded.",
    };
  }
};

const isLifecycleStatus = (
  value: string | null,
): value is EvidenceLifecycleStatus =>
  value !== null &&
  (EVIDENCE_LIFECYCLE_OPTIONS as string[]).includes(value);

const isIsoDate = (value: string | null): value is string =>
  value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * The Evidence Library.
 *
 * `fixedStatus` powers the Approved and Rejected navigation entries: they are
 * this same page with one filter pinned, not a second implementation. The
 * pinned value overrides the URL, so a shared link cannot smuggle a different
 * status into a page whose heading promises one.
 */
export function EvidenceLibraryPage({
  fixedStatus,
  title,
  description,
}: {
  fixedStatus?: EvidenceLifecycleStatus;
  title?: string;
  description?: string;
} = {}) {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const canWrite = hasPermission("evidence:write");
  const canReview = hasPermission("evidence:review");
  const activeCompanyId = user?.activeCompany.id;

  // The URL is the single source of truth for every server-side filter, so a
  // shared or reloaded Library link reproduces the same query.
  const rawPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const appliedSearch = searchParams.get("q") ?? "";
  const lifecycleParam = searchParams.get("lifecycleStatus");
  const lifecycleStatus =
    fixedStatus ?? (isLifecycleStatus(lifecycleParam) ? lifecycleParam : "");
  const ownerId = searchParams.get("ownerId") ?? "";
  const departmentId = searchParams.get("departmentId") ?? "";
  const expiresAfterParam = searchParams.get("expiresAfter");
  const expiresAfter = isIsoDate(expiresAfterParam) ? expiresAfterParam : "";
  const expiresBeforeParam = searchParams.get("expiresBefore");
  const expiresBefore = isIsoDate(expiresBeforeParam) ? expiresBeforeParam : "";
  const expiringSoon = searchParams.get("expiringSoon") === "true";
  const orderBy = searchParams.get("orderBy") ?? "";
  const orderParam = searchParams.get("order");
  const order: SortOrder =
    orderParam === "desc" || orderParam === "asc" ? orderParam : "asc";

  const [draftSearch, setDraftSearch] = useState(appliedSearch);
  const [listVersion, setListVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<MasterState<CompanyUser>>({
    status: "loading",
  });
  const [departments, setDepartments] = useState<MasterState<Department>>({
    status: "loading",
  });

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

  // Company switch drops every filter so no query survives a tenant change.
  const tenantKeyRef = useRef(`${activeCompanyId}:${contextVersion}`);
  useEffect(() => {
    const key = `${activeCompanyId}:${contextVersion}`;
    if (tenantKeyRef.current === key) return;
    tenantKeyRef.current = key;
    setDraftSearch("");
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [activeCompanyId, contextVersion, setSearchParams]);

  // Keep the input aligned when the query string changes from outside typing
  // (compatibility redirect, browser history, tenant reset).
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

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadMaster(() => masterDataApi.listUsers()),
      loadMaster(() => masterDataApi.listDepartments()),
    ]).then(([userState, departmentState]) => {
      if (!active) return;
      setUsers(userState);
      setDepartments(departmentState);
    });
    return () => {
      active = false;
    };
  }, [contextVersion, activeCompanyId]);

  const toggleSort = useCallback(
    (column: string) => {
      if (orderBy === column) {
        if (order === "asc") {
          updateParams({ orderBy: column, order: "desc" });
        } else {
          updateParams({ orderBy: "", order: "" });
        }
      } else {
        updateParams({ orderBy: column, order: "asc" });
      }
    },
    [order, orderBy, updateParams],
  );

  const resource = useApiResource(
    () =>
      evidenceApi.listEvidence({
        page,
        pageSize: PAGE_SIZE,
        q: appliedSearch || undefined,
        lifecycleStatus: lifecycleStatus || undefined,
        ownerId: ownerId || undefined,
        departmentId: departmentId || undefined,
        expiresAfter: expiresAfter || undefined,
        expiresBefore: expiresBefore || undefined,
        expiringSoon: expiringSoon || undefined,
        orderBy: orderBy || undefined,
        order: orderBy ? order : undefined,
      }),
    [
      contextVersion,
      activeCompanyId,
      page,
      appliedSearch,
      lifecycleStatus,
      ownerId,
      departmentId,
      expiresAfter,
      expiresBefore,
      expiringSoon,
      orderBy,
      order,
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
    () =>
      Boolean(
        appliedSearch ||
          lifecycleStatus ||
          ownerId ||
          departmentId ||
          expiresAfter ||
          expiresBefore ||
          expiringSoon,
      ),
    [
      appliedSearch,
      departmentId,
      expiresAfter,
      expiresBefore,
      expiringSoon,
      lifecycleStatus,
      ownerId,
    ],
  );

  const resetFilters = () => {
    setDraftSearch("");
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const goToPage = (next: number) => {
    updateParams({ page: next > 1 ? String(next) : "" }, { resetPage: false });
  };

  return (
    <div className="page">
      <PageHeader
        title={title ?? "Evidence Library"}
        section="Evidence Management"
        description={
          description ??
          "Compliance documents, review status and linked records."
        }
        connected
        actions={
          <>
            {hasPermission("exports:read") ? <CsvExportButton module="evidence" /> : null}
            <button
              className="btn btn-secondary"
              type="button"
              disabled={resource.loading}
              onClick={() => {
                setRefreshing(true);
                setListVersion((value) => value + 1);
              }}
            >
              <RefreshCw size={15} /> Refresh
            </button>
            {canReview ? (
              <button
                className="btn btn-secondary"
                type="button"
                data-testid="evidence-review-queue-link"
                onClick={() => navigate("/evidence/review")}
              >
                <ScanSearch size={15} /> Review Queue
              </button>
            ) : null}
            {canWrite ? (
              <button
                className="btn btn-primary"
                type="button"
                data-testid="evidence-create-open"
                onClick={() => navigate("/evidence/new")}
              >
                <Plus size={15} /> Create Evidence
              </button>
            ) : null}
          </>
        }
      />

      <form
        className="filter-bar"
        style={{ flexWrap: "wrap" }}
        onSubmit={(event) => {
          event.preventDefault();
          updateParams({ q: draftSearch.trim() });
        }}
      >
        <label className="filter-search">
          <span className="sr-only">Search Evidence</span>
          <Search className="icon" size={16} aria-hidden />
          <input
            className="control"
            type="search"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search code or title…"
            maxLength={100}
            aria-label="Search Evidence by code or title"
          />
        </label>
        {fixedStatus ? (
          <span className="toolbar-fixed-filter" data-testid="evidence-fixed-status">
            <Badge tone={evidenceStatusTone(fixedStatus)}>
              {evidenceStatusLabel(fixedStatus)}
            </Badge>
            <Link to="/evidence">Show all statuses</Link>
          </span>
        ) : (
          <label className="toolbar-select">
            <span className="sr-only">Lifecycle status</span>
            <select
              className="control"
              value={lifecycleStatus}
              aria-label="Filter by lifecycle status"
              onChange={(event) =>
                updateParams({ lifecycleStatus: event.target.value })
              }
            >
              <option value="">All statuses</option>
              {EVIDENCE_LIFECYCLE_OPTIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {evidenceStatusLabel(entry)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="toolbar-select">
          <span className="sr-only">Owner</span>
          <select
            className="control"
            value={ownerId}
            aria-label="Filter by owner"
            disabled={users.status !== "ready"}
            onChange={(event) => updateParams({ ownerId: event.target.value })}
          >
            <option value="">
              {users.status === "forbidden"
                ? "Owner filter unavailable"
                : "All owners"}
            </option>
            {users.status === "ready"
              ? users.items.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))
              : null}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Department</span>
          <select
            className="control"
            value={departmentId}
            aria-label="Filter by department"
            disabled={departments.status !== "ready"}
            onChange={(event) =>
              updateParams({ departmentId: event.target.value })
            }
          >
            <option value="">
              {departments.status === "forbidden"
                ? "Department filter unavailable"
                : "All departments"}
            </option>
            {departments.status === "ready"
              ? departments.items.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))
              : null}
          </select>
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
        <label className="deadline-check">
          <input
            type="checkbox"
            checked={expiringSoon}
            aria-label="Expiring within 90 days"
            onChange={(event) =>
              updateParams({
                expiringSoon: event.target.checked ? "true" : "",
              })
            }
          />{" "}
          Expiring soon (90 days)
        </label>
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={resetFilters}
        >
          Reset filters
        </button>
      </form>

      {users.status === "forbidden" || departments.status === "forbidden" ? (
        <div className="banner warning" role="status">
          Some filter selectors are unavailable because supporting master-data
          permissions are missing. Evidence rows still load when evidence:read is
          present.
        </div>
      ) : null}

      {resource.loading ? (
        <div
          data-testid={
            refreshing ? "evidence-library-refreshing" : "evidence-library-loading"
          }
        >
          <LoadingState
            label={
              refreshing ? "Refreshing Evidence Library…" : "Loading Evidence Library…"
            }
          />
        </div>
      ) : resource.error ? (
        <div data-testid="evidence-library-error">
          <ErrorState error={resource.error} />
        </div>
      ) : rows.length === 0 ? (
        <section
          className="card empty-state"
          id="page-content"
          data-testid="evidence-library-empty"
        >
          <Inbox size={28} aria-hidden />
          <h3>{hasFilters ? "No Evidence matches these filters" : "No Evidence yet"}</h3>
          <p>
            {hasFilters
              ? "Server-side filters returned no rows for the active Company. Adjust the search or filters and try again."
              : `No Evidence records were returned for ${user?.activeCompany.name ?? "the active Company"}.`}
          </p>
        </section>
      ) : (
        <>
          <section
            className="card table-card evidence-library-desktop"
            id="page-content"
            data-testid="evidence-library-table"
          >
            <div className="table-wrap">
              <table className="data-table">
                <caption>
                  Evidence Library — {total} result{total === 1 ? "" : "s"}
                  {user?.activeCompany.name
                    ? ` for ${user.activeCompany.name}`
                    : ""}
                </caption>
                <thead>
                  <tr>
                    <SortableTh
                      column="title"
                      label="Evidence"
                      orderBy={orderBy}
                      order={order}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      column="lifecycleStatus"
                      label="Status"
                      orderBy={orderBy}
                      order={order}
                      onSort={toggleSort}
                    />
                    <th scope="col">Owner</th>
                    <th scope="col">Department</th>
                    <th scope="col">Issued</th>
                    <SortableTh
                      column="expiresAt"
                      label="Expires"
                      orderBy={orderBy}
                      order={order}
                      onSort={toggleSort}
                    />
                    <th scope="col">File</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((evidence) => (
                    <EvidenceRow
                      key={evidence.id}
                      evidence={evidence}
                      onView={() => navigate(`/evidence/${evidence.id}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <EvidencePager
              page={page}
              total={total}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onPageChange={goToPage}
            />
          </section>

          <section
            className="evidence-library-mobile"
            aria-label="Evidence Library cards"
            data-testid="evidence-library-cards"
          >
            {rows.map((evidence) => {
              const expiry = classifyExpiry(evidence.expiresAt);
              return (
                <article
                  className={`card evidence-library-card${expiry.rowClass ? ` ${expiry.rowClass}` : ""}`}
                  key={evidence.id}
                >
                  <header className="card-head">
                    <div>
                      <h2>{evidence.title}</h2>
                      <p className="mono">{evidence.code}</p>
                    </div>
                    <Badge tone={evidenceStatusTone(evidence.lifecycleStatus)}>
                      {evidenceStatusLabel(evidence.lifecycleStatus)}
                    </Badge>
                  </header>
                  <div className="card-pad">
                    <p>Owner {named(evidence.owner)}</p>
                    <p>
                      Department {named(evidence.department, "Not assigned")}
                    </p>
                    <p>
                      Expires {formatEvidenceDate(evidence.expiresAt)}
                      {expiry.marker ? (
                        <>
                          {" "}
                          <span className={`expiry-marker ${expiry.markerClass}`}>
                            {expiry.marker}
                          </span>
                        </>
                      ) : null}
                    </p>
                    <p>File {evidence.hasFile ? "Uploaded" : "Not uploaded"}</p>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      aria-label={`View ${evidence.code}`}
                      onClick={() => navigate(`/evidence/${evidence.id}`)}
                    >
                      <Eye size={15} /> View detail
                    </button>
                  </div>
                </article>
              );
            })}
            <EvidencePager
              page={page}
              total={total}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onPageChange={goToPage}
            />
          </section>
        </>
      )}
    </div>
  );
}

function EvidencePager({
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

function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseExpiryDay(value: string): number | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    return Date.UTC(year, month - 1, day);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  return startOfUtcDay(parsed);
}

function classifyExpiry(expiresAt: string | null | undefined): {
  rowClass: string;
  marker: string;
  markerClass: string;
} {
  if (!expiresAt) {
    return { rowClass: "", marker: "", markerClass: "" };
  }
  const expiryDay = parseExpiryDay(expiresAt);
  if (expiryDay === null) {
    return { rowClass: "", marker: "", markerClass: "" };
  }
  const today = startOfUtcDay(new Date());
  const soonLimit = today + EXPIRING_SOON_DAYS * 86_400_000;
  if (expiryDay < today) {
    return {
      rowClass: "row-expired",
      marker: "Expired",
      markerClass: "expired",
    };
  }
  if (expiryDay <= soonLimit) {
    return {
      rowClass: "row-expiring",
      marker: "Expiring soon",
      markerClass: "expiring",
    };
  }
  return { rowClass: "", marker: "", markerClass: "" };
}

function EvidenceRow({
  evidence,
  onView,
}: {
  evidence: Evidence;
  onView: () => void;
}) {
  const expiry = classifyExpiry(evidence.expiresAt);
  return (
    <tr className={expiry.rowClass || undefined}>
      <td>
        <div className="cell-title">
          <strong>{evidence.title}</strong>
          <small className="mono">{evidence.code}</small>
        </div>
      </td>
      <td>
        <Badge tone={evidenceStatusTone(evidence.lifecycleStatus)}>
          {evidenceStatusLabel(evidence.lifecycleStatus)}
        </Badge>
      </td>
      <td>{named(evidence.owner)}</td>
      <td>{named(evidence.department, "Not assigned")}</td>
      <td>{formatEvidenceDate(evidence.issueDate)}</td>
      <td>
        {formatEvidenceDate(evidence.expiresAt)}
        {expiry.marker ? (
          <>
            {" "}
            <span className={`expiry-marker ${expiry.markerClass}`}>
              {expiry.marker}
            </span>
          </>
        ) : null}
      </td>
      <td>{evidence.hasFile ? "Uploaded" : "Not uploaded"}</td>
      <td>
        <button
          className="tiny-btn"
          type="button"
          aria-label={`View ${evidence.code}`}
          onClick={onView}
        >
          <Eye size={15} />
        </button>
      </td>
    </tr>
  );
}
