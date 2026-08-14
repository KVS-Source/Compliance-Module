import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Pencil,
  Plus,
  RefreshCw,
  Target,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { Modal } from "../../components/feedback/Modal";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { kpiApi } from "../../services/kpiApi";
import { masterDataApi } from "../../services/masterDataApi";
import type {
  KpiConfiguration,
  KpiDefinition,
  RecordStatus,
} from "../../types/api";
import { ApiError } from "../../services/apiClient";
import { KpiConfigurationForm } from "./KpiConfigurationForm";
import {
  directionLabel,
  enumLabel,
  named,
  scopeSummary,
} from "./kpiFormatting";

const PAGE_SIZE = 20;

export function KpiConfigurationPage({
  mode = "configuration",
}: {
  mode?: "configuration" | "targets";
}) {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const canWrite = hasPermission("kpi-config:write");
  const selectingTargets = mode === "targets";

  const [definitionId, setDefinitionId] = useState("");
  const [status, setStatus] = useState<RecordStatus | "">("");
  const [enabled, setEnabled] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<KpiConfiguration | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<KpiConfiguration | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // A Company switch must clear filters, paging and any open detail at once.
  useEffect(() => {
    setDefinitionId("");
    setStatus("");
    setEnabled("");
    setPage(1);
    setEditing(null);
    setCreating(false);
    setDeleting(null);
    setDeleteError(null);
  }, [contextVersion, user?.activeCompany.id]);

  const resource = useApiResource(
    () =>
      kpiApi.listConfigurations({
        page,
        pageSize: PAGE_SIZE,
        kpiDefinitionId: definitionId || undefined,
        status: status || undefined,
        ...(enabled === "" ? {} : { enabled: enabled === "true" }),
      }),
    [
      contextVersion,
      user?.activeCompany.id,
      page,
      definitionId,
      status,
      enabled,
      listVersion,
    ],
  );

  const definitions = useApiResource<KpiDefinition[]>(
    () => masterDataApi.listKpiDefinitions().catch(() => []),
    [contextVersion, user?.activeCompany.id],
  );

  useEffect(() => {
    if (!resource.loading) setRefreshing(false);
  }, [resource.loading]);

  const refresh = () => {
    setRefreshing(true);
    setListVersion((value) => value + 1);
  };

  const rows = resource.data?.data ?? [];
  const meta = resource.data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const hasFilters = Boolean(definitionId) || Boolean(status) || enabled !== "";

  const onSaved = (configuration: KpiConfiguration, created: boolean) => {
    setCreating(false);
    setEditing(null);
    refresh();
    showToast(
      "success",
      created ? "KPI configuration created" : "KPI configuration updated",
      `${configuration.kpi.code} · ${scopeSummary(configuration)}`,
    );
  };

  const onDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await kpiApi.deleteConfiguration(deleting.id);
      showToast(
        "success",
        "KPI configuration deleted",
        `${deleting.kpi.code} was soft-deleted and will no longer accept targets.`,
      );
      setDeleting(null);
      refresh();
    } catch (error) {
      setDeleteError(
        error instanceof ApiError
          ? error.status === 403
            ? "Your active Company role does not include kpi-config:write."
            : error.message
          : "Request failed",
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={selectingTargets ? "KPI Targets" : "KPI Configuration"}
        section="KPI Management"
        description={
          selectingTargets
            ? "Choose a KPI configuration to manage its live target lifecycle."
            : "Configure how shared KPI definitions operate inside the active Company: scope, ownership, approval and thresholds."
        }
        connected
        actions={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={refresh}
              disabled={resource.loading}
            >
              <RefreshCw size={15} /> Refresh
            </button>
            {canWrite && !selectingTargets ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setCreating(true)}
              >
                <Plus size={15} /> New configuration
              </button>
            ) : null}
          </>
        }
      />

      {!canWrite ? (
        <p className="muted" role="status">
          Your active Company role does not include <code>kpi-config:write</code>
          , so configurations are read only.
        </p>
      ) : null}

      <form
        className="filter-bar"
        style={{ flexWrap: "wrap" }}
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="toolbar-select">
          <span className="sr-only">Filter by KPI definition</span>
          <select
            className="control"
            value={definitionId}
            aria-label="Filter by KPI definition"
            onChange={(event) => {
              setDefinitionId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All KPI definitions</option>
            {(definitions.data ?? []).map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.code} · {definition.name}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Filter by record status</span>
          <select
            className="control"
            value={status}
            aria-label="Filter by record status"
            onChange={(event) => {
              setStatus(event.target.value as RecordStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DISABLED">DISABLED</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Filter by enabled</span>
          <select
            className="control"
            value={enabled}
            aria-label="Filter by enabled state"
            onChange={(event) => {
              setEnabled(event.target.value as "" | "true" | "false");
              setPage(1);
            }}
          >
            <option value="">Enabled and disabled</option>
            <option value="true">Enabled only</option>
            <option value="false">Disabled only</option>
          </select>
        </label>
      </form>

      {resource.loading ? (
        <div
          data-testid={
            refreshing
              ? "kpi-configuration-refreshing"
              : "kpi-configuration-loading"
          }
        >
          <LoadingState
            label={
              refreshing
                ? "Refreshing KPI configurations…"
                : "Loading KPI configurations…"
            }
          />
        </div>
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : rows.length === 0 ? (
        <section className="card empty-state">
          <Inbox size={28} aria-hidden />
          <h3>
            {hasFilters
              ? "No configurations match these filters"
              : "No KPI configurations yet"}
          </h3>
          <p>
            {hasFilters
              ? "Server-side filters returned no rows for the active Company. Adjust the filters and try again."
              : `No KPI configurations were returned for ${user?.activeCompany.name ?? "the active Company"}.${canWrite ? " Create one to start the KPI workflow." : ""}`}
          </p>
        </section>
      ) : (
        <>
          <section
            className="card table-card kpi-manage-desktop"
            data-testid="kpi-configuration-table"
          >
            <div className="table-wrap">
              <table className="data-table">
                <caption>
                  KPI configurations — {total} result{total === 1 ? "" : "s"}
                  {user?.activeCompany.name
                    ? ` for ${user.activeCompany.name}`
                    : ""}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">KPI</th>
                    <th scope="col">Unit</th>
                    <th scope="col">Frequency</th>
                    <th scope="col">Scope</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Approver</th>
                    <th scope="col">Thresholds</th>
                    <th scope="col">State</th>
                    <th scope="col">Effective</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((configuration) => (
                    <tr key={configuration.id}>
                      <td>
                        <div className="cell-title">
                          <strong>{configuration.kpi.name}</strong>
                          <small className="mono">
                            {configuration.kpi.code}
                          </small>
                          <small>
                            {directionLabel(configuration.kpi.direction)}
                          </small>
                        </div>
                      </td>
                      <td>
                        {configuration.kpi.unit}
                        {configuration.currency
                          ? ` · ${configuration.currency}`
                          : ""}
                      </td>
                      <td>{enumLabel(configuration.reviewFrequency)}</td>
                      <td>
                        <small>{scopeSummary(configuration)}</small>
                      </td>
                      <td>{named(configuration.owner, "Not assigned")}</td>
                      <td>{named(configuration.approver, "Any approver")}</td>
                      <td>
                        <small>
                          {configuration.amberThresholdPct == null &&
                          configuration.redThresholdPct == null
                            ? "Company default"
                            : `Amber ${configuration.amberThresholdPct ?? "default"} · Red ${configuration.redThresholdPct ?? "default"}`}
                        </small>
                      </td>
                      <td>
                        <Badge tone={configuration.enabled ? "blue" : "grey"}>
                          {configuration.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <div>
                          <small>
                            {configuration.status}
                            {configuration.requiresApproval
                              ? " · Approval"
                              : " · Auto-approve"}
                            {configuration.requiresEvidence
                              ? " · Evidence"
                              : ""}
                          </small>
                        </div>
                      </td>
                      <td>
                        <small>
                          {configuration.effectiveFrom} to{" "}
                          {configuration.effectiveTo ?? "open"}
                        </small>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="tiny-btn"
                            type="button"
                            aria-label={`Manage targets for ${configuration.kpi.code}`}
                            onClick={() =>
                              navigate(
                                `/kpi/configuration/${configuration.id}/targets`,
                              )
                            }
                          >
                            <Target size={15} />
                          </button>
                          {canWrite ? (
                            <>
                              <button
                                className="tiny-btn"
                                type="button"
                                aria-label={`Edit ${configuration.kpi.code}`}
                                onClick={() => setEditing(configuration)}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                className="tiny-btn"
                                type="button"
                                aria-label={`Delete ${configuration.kpi.code}`}
                                onClick={() => {
                                  setDeleting(configuration);
                                  setDeleteError(null);
                                }}
                              >
                                <Trash2 size={15} />
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
            <Pager
              page={page}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </section>

          <section
            className="kpi-manage-mobile"
            aria-label="KPI configuration cards"
            data-testid="kpi-configuration-cards"
          >
            {rows.map((configuration) => (
              <article className="card kpi-manage-card" key={configuration.id}>
                <header className="card-head">
                  <div>
                    <h2>{configuration.kpi.name}</h2>
                    <p className="mono">{configuration.kpi.code}</p>
                  </div>
                  <Badge tone={configuration.enabled ? "blue" : "grey"}>
                    {configuration.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </header>
                <div className="card-pad">
                  <p>
                    <span className="sr-only">Unit of measure </span>
                    {configuration.kpi.unit} ·{" "}
                    {enumLabel(configuration.reviewFrequency)}
                  </p>
                  <p>
                    <span className="sr-only">Direction </span>
                    {directionLabel(configuration.kpi.direction)}
                  </p>
                  <p>
                    <span className="sr-only">Scope </span>
                    {scopeSummary(configuration)}
                  </p>
                  <p>
                    <span className="sr-only">Owner </span>
                    {named(configuration.owner, "Not assigned")}
                  </p>
                  <p>
                    {configuration.amberThresholdPct == null &&
                    configuration.redThresholdPct == null
                      ? "Thresholds: Company default"
                      : `Thresholds: amber ${configuration.amberThresholdPct ?? "default"}, red ${configuration.redThresholdPct ?? "default"}`}
                  </p>
                  <div className="row-actions">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      aria-label={`Manage targets for ${configuration.kpi.code}`}
                      onClick={() =>
                        navigate(
                          `/kpi/configuration/${configuration.id}/targets`,
                        )
                      }
                    >
                      <Target size={15} /> Targets
                    </button>
                    {canWrite ? (
                      <button
                        className="btn btn-secondary"
                        type="button"
                        aria-label={`Edit ${configuration.kpi.code}`}
                        onClick={() => setEditing(configuration)}
                      >
                        <Pencil size={15} /> Edit
                      </button>
                    ) : null}
                  </div>
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

      {creating || editing ? (
        <KpiConfigurationForm
          configuration={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={onSaved}
        />
      ) : null}

      {deleting ? (
        <Modal
          title="Delete KPI configuration"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={deleteBusy}
                onClick={() => void onDelete()}
              >
                <Trash2 size={15} />
                {deleteBusy ? "Deleting…" : "Delete configuration"}
              </button>
            </>
          }
        >
          {deleteError ? (
            <div className="banner warning" role="alert">
              {deleteError}
            </div>
          ) : null}
          <p>
            Soft-delete the configuration for{" "}
            <strong>
              {deleting.kpi.code} · {deleting.kpi.name}
            </strong>{" "}
            ({scopeSummary(deleting)})?
          </p>
          <p className="muted">
            Existing targets and actuals are retained. The configuration stops
            accepting new targets and no longer appears in this list.
          </p>
        </Modal>
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
