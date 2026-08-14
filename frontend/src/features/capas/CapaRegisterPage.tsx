import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Inbox,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { CsvExportButton } from "../../components/actions/CsvExportButton";
import {
  BulkActionBar,
  type BulkAction,
} from "../../components/tables/BulkActionBar";
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
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [initialGapId, setInitialGapId] = useState<string | undefined>();
  const canBulk = hasPermission("capa:write");
  const bulkActions: BulkAction[] = [
    {
      key: "owner",
      label: "Reassign owner",
      prompt: {
        label: "Owner user id",
        placeholder: "User id",
        required: true,
      },
      run: (id, value) => capaApi.assignOwner(id, value),
    },
    {
      key: "due-date",
      label: "Set due date",
      prompt: { label: "Due date", placeholder: "YYYY-MM-DD", required: true },
      run: (id, value) => capaApi.update(id, { dueDate: value }),
    },
    ...(hasPermission("capa:close")
      ? [
          {
            key: "close",
            label: "Close",
            prompt: {
              label: "Closure note",
              placeholder: "Why these CAPAs are closed",
              required: true,
            },
            run: (id: string, value: string) => capaApi.close(id, value),
          },
        ]
      : []),
  ];

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
      keys: ["q", "status", "priority", "overdue"],
    });
  const search = values.q ?? "";
  const status = (values.status ?? "") as CapaStatus | "";
  const priority = (values.priority ?? "") as CapaPriority | "";
  const overdue = values.overdue === "true";
  const { draftSearch, setDraftSearch } = useDebouncedSearchParam(
    search,
    updateParams,
  );

  // Deep-link from Gap detail: open create modal with gap pre-selected, then
  // strip gapId so it is not treated as a register filter.
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

  const resource = useApiResource(
    () =>
      capaApi.list({
        page,
        pageSize: PAGE_SIZE,
        q: search || undefined,
        status: status || undefined,
        priority: priority || undefined,
        overdue: overdue || undefined,
        orderBy: orderBy || undefined,
        order: orderBy ? order : undefined,
      }),
    [
      contextVersion,
      user?.activeCompany.id,
      page,
      search,
      status,
      priority,
      overdue,
      orderBy,
      order,
      version,
    ],
  );
  const rows = resource.data?.data ?? [];
  const meta = resource.data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const filtered = Boolean(search || status || priority || overdue);

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    updateParams({ q: draftSearch.trim() });
  };

  return (
    <div className="page">
      <PageHeader
        title="CAPA Register"
        section="Gap & CAPA"
        description="Track corrective and preventive actions, ownership, progress and Evidence-gated closure."
        connected
        primaryLabel={hasPermission("capa:write") ? "Create CAPA" : undefined}
        onPrimary={() => {
          setInitialGapId(undefined);
          setCreating(true);
        }}
        actions={
          <>
            {hasPermission("exports:read") ? (
              <CsvExportButton module="capas" />
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
        registerKey="CAPAS"
        currentQuery={viewQuery}
        onApply={applyView}
      />
      <form className="filter-bar deadline-filter-bar" onSubmit={applySearch}>
        <label className="filter-search">
          <span className="sr-only">Search CAPAs</span>
          <Search className="icon" size={16} aria-hidden />
          <input
            className="control"
            type="search"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search code, title or Gap…"
            maxLength={100}
          />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">CAPA status</span>
          <select
            className="control"
            value={status}
            onChange={(event) => updateParams({ status: event.target.value })}
          >
            <option value="">All statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN PROGRESS</option>
            <option value="PENDING_VERIFICATION">PENDING VERIFICATION</option>
            <option value="CLOSED">CLOSED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">CAPA priority</span>
          <select
            className="control"
            value={priority}
            onChange={(event) => updateParams({ priority: event.target.value })}
          >
            <option value="">All priorities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
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
        <LoadingState label="Loading CAPA Register…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : rows.length === 0 ? (
        <section className="card empty-state" id="page-content">
          <Inbox size={28} />
          <h3>
            {filtered ? "No CAPAs match these filters" : "No CAPAs yet"}
          </h3>
          <p>
            {filtered
              ? "Adjust the server-side filters and try again."
              : `No CAPA records were returned for ${user?.activeCompany.name ?? "the active Company"}.`}
          </p>
        </section>
      ) : (
        <>
          <section
            className="card table-card deadline-register-desktop"
            id="page-content"
            data-testid="capa-register-table"
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
                      ? `${done} CAPA${done === 1 ? "" : "s"} updated`
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
                  CAPA Register — {total} result{total === 1 ? "" : "s"}
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
                                ? rows.map((capa) => capa.id)
                                : [],
                            )
                          }
                          aria-label="Select all CAPAs on this page"
                          data-testid="capa-select-all"
                        />
                      </th>
                    ) : null}
                    <SortableTh
                      column="title"
                      label="CAPA"
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
                      column="priority"
                      label="Priority"
                      orderBy={orderBy}
                      order={order}
                      onSort={toggleSort}
                    />
                    <th>Linked Gap</th>
                    <th>Owner</th>
                    <th>Progress</th>
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
                  {rows.map((capa) => (
                    <tr
                      key={capa.id}
                      className={
                        capa.overdue ? "register-row-overdue" : undefined
                      }
                      data-overdue={capa.overdue ? "true" : "false"}
                    >
                      {canBulk ? (
                        <td className="select-cell">
                          <input
                            type="checkbox"
                            checked={selected.includes(capa.id)}
                            onChange={(event) =>
                              setSelected((current) =>
                                event.target.checked
                                  ? [...current, capa.id]
                                  : current.filter((id) => id !== capa.id),
                              )
                            }
                            aria-label={`Select ${capa.code}`}
                            data-testid={`capa-select-${capa.code}`}
                          />
                        </td>
                      ) : null}
                      <td>
                        <div className="cell-title">
                          <strong>{capa.title}</strong>
                          <small className="mono">{capa.code}</small>
                        </div>
                      </td>
                      <td>
                        <Badge>{capa.status.replaceAll("_", " ")}</Badge>
                      </td>
                      <td>
                        <Badge>{capa.priority}</Badge>
                      </td>
                      <td>
                        {capa.gap
                          ? `${capa.gap.code} · ${capa.gap.title}`
                          : "—"}
                      </td>
                      <td>
                        {capa.owner?.name ??
                          capa.sourceOwnerRef ??
                          "Unassigned"}
                      </td>
                      <td>
                        <span className="mono">
                          {capa.completionPercentage}%
                        </span>
                      </td>
                      <td>
                        {capa.dueDate ? (
                          <span
                            className={capa.overdue ? "deadline-overdue" : ""}
                          >
                            {capa.dueDate}
                            {capa.overdue ? " · Overdue" : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <button
                          className="tiny-btn"
                          type="button"
                          aria-label={`View ${capa.code}`}
                          onClick={() =>
                            navigate(`/compliance/capa/${capa.id}`)
                          }
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
            aria-label="CAPA cards"
            data-testid="capa-register-cards"
          >
            {rows.map((capa) => (
              <article
                className={`card deadline-register-card${capa.overdue ? " register-row-overdue" : ""}`}
                key={capa.id}
                data-overdue={capa.overdue ? "true" : "false"}
              >
                <header className="card-head">
                  <div>
                    <h2>{capa.title}</h2>
                    <p className="mono">{capa.code}</p>
                  </div>
                  <Badge>{capa.status.replaceAll("_", " ")}</Badge>
                </header>
                <div className="card-pad">
                  <p>
                    <Badge>{capa.priority}</Badge> ·{" "}
                    {capa.completionPercentage}% complete
                  </p>
                  <p>
                    {capa.gap
                      ? `${capa.gap.code} · ${capa.gap.title}`
                      : "No linked Gap"}
                  </p>
                  <p className={capa.overdue ? "deadline-overdue" : ""}>
                    {capa.dueDate ?? "No due date"}
                    {capa.overdue ? " · Overdue" : ""}
                  </p>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => navigate(`/compliance/capa/${capa.id}`)}
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
        <CapaFormModal
          initialGapId={initialGapId}
          onClose={() => setCreating(false)}
          onSaved={(capa) => {
            setCreating(false);
            showToast(
              "success",
              "CAPA created",
              `${capa.code} is ready for action.`,
            );
            navigate(`/compliance/capa/${capa.id}`);
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
