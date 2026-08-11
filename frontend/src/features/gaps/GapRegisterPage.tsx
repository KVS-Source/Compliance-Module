import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Inbox,
  RefreshCw,
  Search,
} from "lucide-react";
import { type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { CsvExportButton } from "../../components/actions/CsvExportButton";
import { SortableTh } from "../../components/tables/SortableTh";
import { SavedViewToolbar } from "../../components/registers/SavedViewToolbar";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import {
  useDebouncedSearchParam,
  useRegisterQueryState,
} from "../../hooks/useRegisterQueryState";
import {
  BulkActionBar,
  type BulkAction,
} from "../../components/tables/BulkActionBar";
import { gapApi } from "../../services/gapApi";
import type { Gap, GapSeverity, GapStatus } from "../../types/api";
import { GapFormModal } from "./GapFormModal";
import { useState } from "react";

const PAGE_SIZE = 20;
const label = (value: string) => value.replaceAll("_", " ");

export function GapRegisterPage() {
  const { user, hasPermission } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const canBulk = hasPermission("gaps:write");
  /**
   * Each action calls the endpoint that already governs that change, so the
   * per-record permission, validation and audit event are preserved. Closing is
   * offered only with `gaps:close`, which is a separate permission from write.
   */
  const bulkActions: BulkAction[] = [
    {
      key: "owner",
      label: "Reassign owner",
      prompt: {
        label: "Owner user id",
        placeholder: "User id",
        required: true,
      },
      run: (id, value) => gapApi.assignOwner(id, value),
    },
    {
      key: "due-date",
      label: "Set due date",
      prompt: { label: "Due date", placeholder: "YYYY-MM-DD", required: true },
      run: (id, value) => gapApi.update(id, { dueDate: value }),
    },
    ...(hasPermission("gaps:close")
      ? [
          {
            key: "close",
            label: "Close",
            prompt: {
              label: "Closure note",
              placeholder: "Why these gaps are closed",
              required: true,
            },
            run: (id: string, value: string) => gapApi.close(id, value),
          },
        ]
      : []),
  ];
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);

  const {
    values,
    page,
    orderBy,
    order,
    updateParams,
    setPage,
    toggleSort,
    viewQuery,
    applyView,
  } = useRegisterQueryState({
      keys: ["q", "status", "severity", "overdue", "ownerId"],
    });
  const search = values.q ?? "";
  const status = (values.status ?? "") as GapStatus | "";
  const severity = (values.severity ?? "") as GapSeverity | "";
  const overdue = values.overdue === "true";
  const ownerId = values.ownerId ?? "";
  const { draftSearch, setDraftSearch } = useDebouncedSearchParam(
    search,
    updateParams,
  );

  const resource = useApiResource(
    () =>
      gapApi.list({
        page,
        pageSize: PAGE_SIZE,
        q: search || undefined,
        status: status || undefined,
        severity: severity || undefined,
        overdue: overdue || undefined,
        ownerId: ownerId || undefined,
        orderBy: orderBy || undefined,
        order: orderBy ? order : undefined,
      }),
    [
      contextVersion,
      user?.activeCompany.id,
      page,
      search,
      status,
      severity,
      overdue,
      ownerId,
      orderBy,
      order,
      version,
    ],
  );
  const rows = resource.data?.data ?? [];
  const meta = resource.data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const filtered = Boolean(search || status || severity || overdue || ownerId);

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    updateParams({ q: draftSearch.trim() });
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
        actions={
          <>
            {hasPermission("exports:read") ? (
              <CsvExportButton module="gaps" />
            ) : null}
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setVersion((value) => value + 1)}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </>
        }
      />

      <SavedViewToolbar
        registerKey="GAPS"
        currentQuery={viewQuery}
        onApply={applyView}
      />

      <form className="filter-bar deadline-filter-bar" onSubmit={applySearch}>
        <label className="filter-search">
          <span className="sr-only">Search Gaps</span>
          <Search className="icon" size={16} aria-hidden />
          <input
            className="control"
            type="search"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search code or title…"
            maxLength={100}
          />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Gap status</span>
          <select
            className="control"
            value={status}
            onChange={(event) => updateParams({ status: event.target.value })}
          >
            <option value="">All statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN PROGRESS</option>
            <option value="CLOSED">CLOSED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Gap severity</span>
          <select
            className="control"
            value={severity}
            onChange={(event) => updateParams({ severity: event.target.value })}
          >
            <option value="">All severities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="MAJOR">MAJOR</option>
            <option value="MINOR">MINOR</option>
            <option value="OBSERVATION">OBSERVATION</option>
            <option value="OFI">OFI</option>
          </select>
        </label>
        <label className="deadline-check">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(event) =>
              updateParams({ overdue: event.target.checked ? "true" : "" })
            }
          />{" "}
          Overdue only
        </label>
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
      </form>

      {resource.loading ? (
        <LoadingState label="Loading Gap Register…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : rows.length === 0 ? (
        <section className="card empty-state" id="page-content">
          <Inbox size={28} />
          <h3>{filtered ? "No Gaps match these filters" : "No Gaps yet"}</h3>
          <p>
            {filtered
              ? "Adjust the server-side filters and try again."
              : `No Gap records were returned for ${user?.activeCompany.name ?? "the active Company"}.`}
          </p>
        </section>
      ) : (
        <>
          <section
            className="card table-card deadline-register-desktop"
            id="page-content"
            data-testid="gap-register-table"
          >
            {canBulk ? (
              <BulkActionBar
                selectedIds={selected}
                actions={bulkActions}
                onClear={() => setSelected([])}
                onCompleted={({ done, refused }) => {
                  setSelected([]);
                  setVersion((current) => current + 1);
                  showToast(
                    refused === 0 ? "success" : "warning",
                    refused === 0
                      ? `${done} gap${done === 1 ? "" : "s"} updated`
                      : `${done} updated, ${refused} refused`,
                    refused === 0
                      ? "The register has been reloaded."
                      : "Records you may not change were left untouched.",
                  );
                }}
              />
            ) : null}
            <div className="table-wrap">
              <table className="data-table">
                <caption>
                  Gap Register — {total} result{total === 1 ? "" : "s"}
                </caption>
                <thead>
                  <tr>
                    {canBulk ? (
                      <th className="select-cell">
                        <input
                          type="checkbox"
                          checked={
                            rows.length > 0 && selected.length === rows.length
                          }
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? rows.map((gap) => gap.id)
                                : [],
                            )
                          }
                          aria-label="Select all gaps on this page"
                          data-testid="gap-select-all"
                        />
                      </th>
                    ) : null}
                    <SortableTh
                      column="title"
                      label="Gap"
                      orderBy={orderBy}
                      order={order}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      column="status"
                      label="Status"
                      orderBy={orderBy}
                      order={order}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      column="severity"
                      label="Severity"
                      orderBy={orderBy}
                      order={order}
                      onSort={toggleSort}
                    />
                    <th>Owner</th>
                    <th>Department</th>
                    <SortableTh
                      column="dueDate"
                      label="Due date"
                      orderBy={orderBy}
                      order={order}
                      onSort={toggleSort}
                    />
                    <th>
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((gap) => (
                    <tr
                      key={gap.id}
                      className={gap.overdue ? "register-row-overdue" : undefined}
                      data-overdue={gap.overdue ? "true" : "false"}
                    >
                      {canBulk ? (
                        <td className="select-cell">
                          <input
                            type="checkbox"
                            checked={selected.includes(gap.id)}
                            onChange={(event) =>
                              setSelected((current) =>
                                event.target.checked
                                  ? [...current, gap.id]
                                  : current.filter((id) => id !== gap.id),
                              )
                            }
                            aria-label={`Select ${gap.code}`}
                            data-testid={`gap-select-${gap.code}`}
                          />
                        </td>
                      ) : null}
                      <td>
                        <div className="cell-title">
                          <strong>{gap.title}</strong>
                          <small className="mono">{gap.code}</small>
                        </div>
                      </td>
                      <td>
                        <Badge>{label(gap.status)}</Badge>
                      </td>
                      <td>
                        <Badge>{gap.severity}</Badge>
                      </td>
                      <td>
                        {gap.owner?.name ?? gap.sourceOwnerRef ?? "Unassigned"}
                      </td>
                      <td>{gap.department?.name ?? "—"}</td>
                      <td>
                        {gap.dueDate ? (
                          <span
                            className={gap.overdue ? "deadline-overdue" : ""}
                          >
                            {gap.dueDate}
                            {gap.overdue ? " · Overdue" : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <button
                          className="tiny-btn"
                          type="button"
                          aria-label={`View ${gap.code}`}
                          onClick={() => open(gap)}
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={page}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </section>
          <section
            className="deadline-register-mobile"
            aria-label="Gap cards"
            data-testid="gap-register-cards"
          >
            {rows.map((gap) => (
              <article
                className={`card deadline-register-card${gap.overdue ? " register-row-overdue" : ""}`}
                key={gap.id}
                data-overdue={gap.overdue ? "true" : "false"}
              >
                <header className="card-head">
                  <div>
                    <h2>{gap.title}</h2>
                    <p className="mono">{gap.code}</p>
                  </div>
                  <Badge>{label(gap.status)}</Badge>
                </header>
                <div className="card-pad">
                  <p>
                    <Badge>{gap.severity}</Badge>
                  </p>
                  <p>{gap.owner?.name ?? gap.sourceOwnerRef ?? "Unassigned"}</p>
                  <p className={gap.overdue ? "deadline-overdue" : ""}>
                    {gap.dueDate ?? "No due date"}
                    {gap.overdue ? " · Overdue" : ""}
                  </p>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => open(gap)}
                  >
                    <Eye size={15} /> View detail
                  </button>
                </div>
              </article>
            ))}
            <Pager
              page={page}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </section>
        </>
      )}
      {creating ? (
        <GapFormModal
          onClose={() => setCreating(false)}
          onSaved={(gap) => {
            setCreating(false);
            showToast(
              "success",
              "Gap created",
              `${gap.code} is ready for remediation.`,
            );
            navigate(`/compliance/gaps/${gap.id}`);
          }}
        />
      ) : null}
    </div>
  );
}

function Pager({
  page,
  total,
  totalPages,
  onPageChange,
}: {
  page: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="table-foot">
      <span>
        Showing {total ? (page - 1) * PAGE_SIZE + 1 : 0}–
        {Math.min(page * PAGE_SIZE, total)} of {total}
      </span>
      <div className="pagination">
        <button
          className="page-btn"
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={15} />
        </button>
        <span>
          Page {page} of {Math.max(1, totalPages)}
        </span>
        <button
          className="page-btn"
          type="button"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
