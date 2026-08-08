import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Inbox,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { CsvExportButton } from "../../components/actions/CsvExportButton";
import { SortableTh } from "../../components/tables/SortableTh";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import {
  useDebouncedSearchParam,
  useRegisterQueryState,
} from "../../hooks/useRegisterQueryState";
import { riskApi } from "../../services/riskApi";
import type {
  GeneralRiskLevel,
  KpiRiskClass,
  Risk,
  RiskLifecycle,
  RiskStatus,
} from "../../types/api";
import { RiskCreateModal } from "./RiskCreateModal";

const PAGE_SIZE = 20;

const statusLabel = (status: RiskStatus) => status.replaceAll("_", " ");

const display = (value: string | null | undefined, fallback: string) =>
  value && value.trim() ? value : fallback;

const named = (
  value: { code: string; name: string } | null | undefined,
  fallback: string,
) => (value ? `${value.name} (${value.code})` : fallback);

export function RiskRegisterPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [listVersion, setListVersion] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const { values, page, orderBy, order, updateParams, setPage, toggleSort } =
    useRegisterQueryState({
      keys: ["q", "lifecycle", "status", "kpiRiskClass", "generalLevel"],
      defaults: { lifecycle: "active" },
    });
  const appliedSearch = values.q ?? "";
  const lifecycle = (values.lifecycle || "active") as RiskLifecycle;
  const status = (values.status ?? "") as RiskStatus | "";
  const kpiRiskClass = (values.kpiRiskClass ?? "") as KpiRiskClass | "";
  const generalLevel = (values.generalLevel ?? "") as GeneralRiskLevel | "";
  const { draftSearch, setDraftSearch } = useDebouncedSearchParam(
    appliedSearch,
    updateParams,
  );

  const resource = useApiResource(
    () =>
      riskApi.list({
        page,
        pageSize: PAGE_SIZE,
        q: appliedSearch || undefined,
        lifecycle,
        status: status || undefined,
        kpiRiskClass: kpiRiskClass || undefined,
        generalLevel: generalLevel || undefined,
        orderBy: orderBy || undefined,
        order: orderBy ? order : undefined,
      }),
    [
      contextVersion,
      user?.activeCompany.id,
      page,
      appliedSearch,
      lifecycle,
      status,
      kpiRiskClass,
      generalLevel,
      orderBy,
      order,
      listVersion,
    ],
  );

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    updateParams({ q: draftSearch.trim() });
  };

  const rows = resource.data?.data ?? [];
  const meta = resource.data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;
  // Default register view is lifecycle=active; that alone is not a "filter".
  const hasFilters =
    Boolean(appliedSearch) ||
    Boolean(status) ||
    Boolean(kpiRiskClass) ||
    Boolean(generalLevel) ||
    lifecycle === "closed";

  return (
    <div className="page">
      <PageHeader
        title="Risk Register"
        section="Compliance Management"
        description="Company-scoped risks raised from KPI misses or recorded manually after enterprise assessment."
        connected
        actions={
          <>
            {hasPermission("risk:write") ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={15} /> Add risk
              </button>
            ) : null}
            {hasPermission("exports:read") ? (
              <CsvExportButton module="risks" />
            ) : null}
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setListVersion((value) => value + 1)}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </>
        }
      />

      <form
        className="filter-bar"
        style={{ flexWrap: "wrap" }}
        onSubmit={applySearch}
      >
        <label className="filter-search">
          <span className="sr-only">Search risks</span>
          <Search className="icon" size={16} aria-hidden />
          <input
            className="control"
            type="search"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search title, risk code, KPI code or name…"
            maxLength={100}
            aria-label="Search risks by title, code or KPI"
          />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Active or historical</span>
          <select
            className="control"
            value={lifecycle}
            aria-label="Active or historical risks"
            onChange={(event) =>
              updateParams({ lifecycle: event.target.value })
            }
          >
            <option value="active">Active</option>
            <option value="closed">Historical</option>
            <option value="all">All lifecycles</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Filter by status</span>
          <select
            className="control"
            value={status}
            aria-label="Filter by risk status"
            onChange={(event) => updateParams({ status: event.target.value })}
          >
            <option value="">All statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="UNDER_REVIEW">UNDER REVIEW</option>
            <option value="TREATED">TREATED</option>
            <option value="CLOSED">CLOSED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Filter by KPI risk class</span>
          <select
            className="control"
            value={kpiRiskClass}
            aria-label="Filter by KPI risk class"
            onChange={(event) =>
              updateParams({ kpiRiskClass: event.target.value })
            }
          >
            <option value="">All KPI classes</option>
            <option value="MAJOR">MAJOR</option>
            <option value="MINOR">MINOR</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Filter by general level</span>
          <select
            className="control"
            value={generalLevel}
            aria-label="Filter by general risk level"
            onChange={(event) =>
              updateParams({ generalLevel: event.target.value })
            }
          >
            <option value="">All levels</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </label>
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
      </form>

      {resource.loading ? (
        <div data-testid="risk-register-loading">
          <LoadingState label="Loading Risk Register…" />
        </div>
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : rows.length === 0 ? (
        <section className="card empty-state" id="page-content">
          <Inbox size={28} aria-hidden />
          <h3>
            {hasFilters ? "No risks match these filters" : "No risks yet"}
          </h3>
          <p>
            {hasFilters
              ? "Server-side filters returned no rows for the active Company. Adjust search or lifecycle and try again."
              : `No Risk Register records were returned for ${user?.activeCompany.name ?? "the active Company"}.`}
          </p>
        </section>
      ) : (
        <>
          <section
            className="card table-card risk-register-desktop"
            id="page-content"
            data-testid="risk-register-table"
          >
            <div className="table-wrap">
              <table className="data-table">
                <caption>
                  Risk Register — {total} result{total === 1 ? "" : "s"}
                  {user?.activeCompany.name
                    ? ` for ${user.activeCompany.name}`
                    : ""}
                </caption>
                <thead>
                  <tr>
                    <SortableTh
                      column="title"
                      label="Risk"
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
                    <th scope="col">KPI class</th>
                    <SortableTh
                      column="generalLevel"
                      label="Level"
                      orderBy={orderBy}
                      order={order}
                      onSort={toggleSort}
                    />
                    <th scope="col">Inherent</th>
                    <th scope="col">Source KPI</th>
                    <th scope="col">Actual</th>
                    <th scope="col">Scope</th>
                    <th scope="col">Owner</th>
                    <th scope="col">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((risk) => (
                    <RiskRow
                      key={risk.id}
                      risk={risk}
                      onOpen={() => navigate(`/compliance/risks/${risk.id}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <RiskPager
              page={page}
              total={total}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </section>

          <section
            className="risk-register-mobile"
            aria-label="Risk Register cards"
            data-testid="risk-register-cards"
          >
            {rows.map((risk) => (
              <article className="card risk-register-card" key={risk.id}>
                <header className="card-head">
                  <div>
                    <h2>{risk.title}</h2>
                    <p className="mono">{risk.code}</p>
                  </div>
                  <Badge>{statusLabel(risk.status)}</Badge>
                </header>
                <div className="card-pad">
                  <p>
                    <span className="sr-only">KPI risk class </span>
                    {risk.kpiRiskClass ?? "Not applicable"}
                    {" · "}
                    <span className="sr-only">General level </span>
                    {risk.generalLevel ?? "Not provided"}
                  </p>
                  <p className="mono">
                    Inherent {risk.inherentLikelihood}×{risk.inherentImpact} ={" "}
                    {risk.inherentScore}
                  </p>
                  <p>
                    {risk.source.configuration
                      ? `${risk.source.configuration.kpi.code} · ${risk.source.configuration.kpi.name}`
                      : "No KPI source"}
                  </p>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    aria-label={`View ${risk.code}`}
                    onClick={() => navigate(`/compliance/risks/${risk.id}`)}
                  >
                    <Eye size={15} /> View detail
                  </button>
                </div>
              </article>
            ))}
            <RiskPager
              page={page}
              total={total}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </section>
        </>
      )}
      {createOpen ? (
        <RiskCreateModal
          onClose={() => setCreateOpen(false)}
          onSaved={(risk) => {
            showToast(
              "success",
              "Risk created",
              `${risk.code} was added to the Risk Register.`,
            );
            setCreateOpen(false);
            updateParams({
              q: "",
              lifecycle: "active",
              status: "",
              kpiRiskClass: "",
              generalLevel: "",
            });
            setListVersion((value) => value + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function RiskPager({
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
          Page {page} of {Math.max(1, totalPages)}
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

function RiskRow({ risk, onOpen }: { risk: Risk; onOpen: () => void }) {
  const configuration = risk.source.configuration;
  const actual = risk.source.actual;
  return (
    <tr>
      <td>
        <div className="cell-title">
          <strong>{risk.title}</strong>
          <small className="mono">{risk.code}</small>
        </div>
      </td>
      <td>
        <Badge>{statusLabel(risk.status)}</Badge>
        <span className="sr-only">Status {statusLabel(risk.status)}</span>
      </td>
      <td>
        {risk.kpiRiskClass ? (
          <Badge>{risk.kpiRiskClass}</Badge>
        ) : (
          "Not applicable"
        )}
      </td>
      <td>
        {risk.generalLevel ? (
          <Badge>{risk.generalLevel}</Badge>
        ) : (
          "Not provided"
        )}
      </td>
      <td>
        <span className="mono">
          {risk.inherentLikelihood}×{risk.inherentImpact} = {risk.inherentScore}
        </span>
      </td>
      <td>
        {configuration ? (
          <div className="cell-title">
            <strong>
              {configuration.kpi.code} · {configuration.kpi.name}
            </strong>
            <small>{display(actual?.period, "Period not provided")}</small>
          </div>
        ) : (
          "Not applicable"
        )}
      </td>
      <td>
        {actual ? (
          <div className="cell-title">
            <span className="mono">{actual.code}</span>
            <small>
              Actual {actual.actualValue} · Target {actual.targetValueSnapshot}{" "}
              · Var {actual.variance}
              {actual.ragStatus ? ` · ${actual.ragStatus}` : ""}
            </small>
          </div>
        ) : (
          "Not applicable"
        )}
      </td>
      <td>
        {configuration ? (
          <small>
            {[
              configuration.department?.name,
              configuration.orgLocation?.name,
              configuration.productService,
              configuration.orgUnit?.name,
            ]
              .filter(Boolean)
              .join(" · ") || "Not provided"}
          </small>
        ) : (
          "Not applicable"
        )}
      </td>
      <td>{named(risk.owner, "Not assigned")}</td>
      <td>
        <button
          className="tiny-btn"
          type="button"
          aria-label={`View ${risk.code}`}
          onClick={onOpen}
        >
          <Eye size={15} />
        </button>
      </td>
    </tr>
  );
}
