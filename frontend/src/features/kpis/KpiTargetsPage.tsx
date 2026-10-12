import {
  ArrowLeft,
  CheckCircle2,
  CopyPlus,
  Inbox,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { Modal } from "../../components/feedback/Modal";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { ApiError } from "../../services/apiClient";
import { kpiApi } from "../../services/kpiApi";
import type { KpiTarget, SubmissionStatus } from "../../types/api";
import { kpiTargetDecisionError } from "../../utils/fieldErrors";
import { KpiTargetForm, type TargetFormMode } from "./KpiTargetForm";
import {
  approvalStatusLabel,
  directionDescription,
  directionLabel,
  enumLabel,
  formatDateTime,
  named,
  scopeSummary,
} from "./kpiFormatting";

const PAGE_SIZE = 20;

const statusTone = (status: SubmissionStatus) => {
  switch (status) {
    case "APPROVED":
      return "green" as const;
    case "REJECTED":
      return "red" as const;
    case "PENDING_APPROVAL":
    case "SUBMITTED":
      return "amber" as const;
    default:
      return "grey" as const;
  }
};

export function KpiTargetsPage() {
  const { configurationId = "" } = useParams();
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const canWrite = hasPermission("kpi-target:write");
  const canApprove = hasPermission("kpi-target:approve");

  const [approvalStatus, setApprovalStatus] = useState<SubmissionStatus | "">(
    "",
  );
  const [page, setPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [formMode, setFormMode] = useState<TargetFormMode | null>(null);
  const [formTarget, setFormTarget] = useState<KpiTarget | null>(null);
  const [rejecting, setRejecting] = useState<KpiTarget | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setApprovalStatus("");
    setPage(1);
    setFormMode(null);
    setFormTarget(null);
    setRejecting(null);
    setRejectReason("");
    setRejectError(null);
    setActionError(null);
  }, [contextVersion, user?.activeCompany.id, configurationId]);

  const configuration = useApiResource(
    () => kpiApi.getConfiguration(configurationId),
    [contextVersion, user?.activeCompany.id, configurationId],
  );

  const targets = useApiResource(
    () =>
      kpiApi.listTargets({
        page,
        pageSize: PAGE_SIZE,
        kpiConfigurationId: configurationId,
        approvalStatus: approvalStatus || undefined,
      }),
    [
      contextVersion,
      user?.activeCompany.id,
      configurationId,
      page,
      approvalStatus,
      listVersion,
    ],
  );

  useEffect(() => {
    if (!targets.loading) setRefreshing(false);
  }, [targets.loading]);

  const refresh = () => {
    setRefreshing(true);
    setListVersion((value) => value + 1);
  };

  const runAction = async (
    target: KpiTarget,
    permission: string,
    action: () => Promise<KpiTarget>,
    success: (result: KpiTarget) => { title: string; message: string },
  ) => {
    setBusyId(target.id);
    setActionError(null);
    try {
      const result = await action();
      const copy = success(result);
      showToast("success", copy.title, copy.message);
      refresh();
    } catch (error) {
      setActionError(kpiTargetDecisionError(error, permission));
    } finally {
      setBusyId(null);
    }
  };

  const onSubmitTarget = (target: KpiTarget) =>
    void runAction(
      target,
      "kpi-target:write",
      () => kpiApi.submitTarget(target.id),
      (result) => ({
        title:
          result.approvalStatus === "APPROVED"
            ? `Target ${result.code} approved`
            : `Target ${result.code} submitted`,
        message:
          result.approvalStatus === "APPROVED"
            ? "This configuration does not require approval, so the target was approved immediately."
            : "The target is now pending approval.",
      }),
    );

  const onApproveTarget = (target: KpiTarget) =>
    void runAction(
      target,
      "kpi-target:approve",
      () => kpiApi.approveTarget(target.id),
      (result) => ({
        title: `Target ${result.code} approved`,
        message: `Version ${result.version} is approved and immutable.`,
      }),
    );

  const onRejectTarget = async () => {
    if (!rejecting) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError("A rejection reason is required.");
      return;
    }
    setBusyId(rejecting.id);
    setRejectError(null);
    try {
      const result = await kpiApi.rejectTarget(rejecting.id, reason);
      showToast(
        "warning",
        `Target ${result.code} rejected`,
        "The submitter can edit and resubmit the same version.",
      );
      setRejecting(null);
      setRejectReason("");
      refresh();
    } catch (error) {
      setRejectError(kpiTargetDecisionError(error, "kpi-target:approve"));
    } finally {
      setBusyId(null);
    }
  };

  const onSaved = (target: KpiTarget, mode: TargetFormMode) => {
    setFormMode(null);
    setFormTarget(null);
    refresh();
    showToast(
      "success",
      mode === "version"
        ? `Version ${target.version} created`
        : mode === "edit"
          ? `Target ${target.code} updated`
          : `Target ${target.code} created`,
      mode === "version"
        ? "The new version is a draft. Submit it for approval when ready."
        : "The target is a draft until it is submitted.",
    );
  };

  if (configuration.loading) {
    return <LoadingState label="Loading KPI configuration…" />;
  }

  if (configuration.error) {
    const notFound =
      configuration.error instanceof ApiError &&
      configuration.error.status === 404;
    return notFound ? (
      <section className="card empty-state">
        <Inbox size={28} aria-hidden />
        <h3>KPI configuration not found</h3>
        <p>
          This configuration does not exist in{" "}
          {user?.activeCompany.name ?? "the active Company"}, or it has been
          deleted.
        </p>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => navigate("/kpi/configuration")}
        >
          <ArrowLeft size={15} /> Back to KPI configurations
        </button>
      </section>
    ) : (
      <ErrorState error={configuration.error} />
    );
  }

  const config = configuration.data;
  if (!config) return <LoadingState label="Loading KPI configuration…" />;

  const rows = targets.data?.data ?? [];
  const meta = targets.data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  /**
   * Usability gating only. The backend enforces both rules and its 403 is
   * surfaced verbatim if this misjudges.
   */
  const approvalBlockedReason = (target: KpiTarget) => {
    if (target.submittedBy?.id && target.submittedBy.id === user?.id) {
      return "You submitted this target, so you cannot decide it.";
    }
    if (config.approver && config.approver.id !== user?.id) {
      return `Only ${config.approver.name} may decide this target.`;
    }
    return null;
  };

  const submitBlockedReason = (target: KpiTarget) => {
    if (
      config.requiresApproval &&
      config.approver &&
      config.approver.id === user?.id
    ) {
      return "You are the configured approver, so you cannot submit this target.";
    }
    return target.approvalStatus === "DRAFT" ||
      target.approvalStatus === "REJECTED"
      ? null
      : "Only draft or rejected targets can be submitted.";
  };

  return (
    <div className="page">
      <PageHeader
        title="KPI Targets"
        section="KPI Management"
        description={`${config.kpi.code} · ${config.kpi.name} — ${scopeSummary(config)}`}
        showDescription
        connected
        actions={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => navigate("/kpi/configuration")}
            >
              <ArrowLeft size={15} /> Configurations
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={refresh}
              disabled={targets.loading}
            >
              <RefreshCw size={15} /> Refresh
            </button>
            {canWrite ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  setFormTarget(null);
                  setFormMode("create");
                }}
              >
                <Plus size={15} /> New draft target
              </button>
            ) : null}
          </>
        }
      />

      <section className="card" data-testid="kpi-target-configuration-summary">
        <div className="card-pad">
          <dl className="detail-list">
            <div>
              <dt>Unit of measure</dt>
              <dd>
                {config.kpi.unit}
                {config.currency ? ` · ${config.currency}` : ""}
              </dd>
            </div>
            <div>
              <dt>Review frequency</dt>
              <dd>{enumLabel(config.reviewFrequency)}</dd>
            </div>
            <div>
              <dt>Direction</dt>
              <dd>
                <span>{directionLabel(config.kpi.direction)}</span>
                <small className="detail-help">
                  {directionDescription(config.kpi.direction)}
                </small>
              </dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{named(config.owner, "Not assigned")}</dd>
            </div>
            <div>
              <dt>Approver</dt>
              <dd>
                {named(
                  config.approver,
                  "Any user holding kpi-target:approve",
                )}
              </dd>
            </div>
            <div>
              <dt>Approval</dt>
              <dd>
                {config.requiresApproval
                  ? "Targets require approval"
                  : "Submitting approves immediately"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {!canWrite && !canApprove ? (
        <p className="muted" role="status">
          Your active Company role includes neither{" "}
          <code>kpi-target:write</code> nor <code>kpi-target:approve</code>, so
          targets are read only.
        </p>
      ) : null}

      {actionError ? (
        <div className="banner warning" role="alert" data-testid="target-action-error">
          {actionError}
        </div>
      ) : null}

      <form
        className="filter-bar"
        style={{ flexWrap: "wrap" }}
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="toolbar-select">
          <span className="sr-only">Filter by approval status</span>
          <select
            className="control"
            value={approvalStatus}
            aria-label="Filter by approval status"
            onChange={(event) => {
              setApprovalStatus(event.target.value as SubmissionStatus | "");
              setPage(1);
            }}
          >
            <option value="">All approval statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="PENDING_APPROVAL">PENDING APPROVAL</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
      </form>

      {targets.loading ? (
        <div
          data-testid={
            refreshing ? "kpi-target-refreshing" : "kpi-target-loading"
          }
        >
          <LoadingState
            label={
              refreshing ? "Refreshing KPI targets…" : "Loading KPI targets…"
            }
          />
        </div>
      ) : targets.error ? (
        <ErrorState error={targets.error} />
      ) : rows.length === 0 ? (
        <section className="card empty-state">
          <Inbox size={28} aria-hidden />
          <h3>
            {approvalStatus
              ? "No targets match this filter"
              : "No targets yet"}
          </h3>
          <p>
            {approvalStatus
              ? "No targets were returned for this approval status. Clear the filter and try again."
              : `No targets exist for ${config.kpi.code}.${canWrite ? " Create a draft target to begin the approval workflow." : ""}`}
          </p>
        </section>
      ) : (
        <>
          <section
            className="card table-card kpi-manage-desktop"
            data-testid="kpi-target-table"
          >
            <div className="table-wrap">
              <table className="data-table">
                <caption>
                  KPI targets — {total} result{total === 1 ? "" : "s"} for{" "}
                  {config.kpi.code}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Target</th>
                    <th scope="col">Version</th>
                    <th scope="col">Period</th>
                    <th scope="col">Value</th>
                    <th scope="col">Approval status</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Decided</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((target) => (
                    <tr key={target.id}>
                      <td>
                        <div className="cell-title">
                          <strong className="mono">{target.code}</strong>
                          {target.supersededById ? (
                            <small>Superseded</small>
                          ) : null}
                        </div>
                      </td>
                      <td>v{target.version}</td>
                      <td>
                        <div className="cell-title">
                          <strong>{target.period}</strong>
                          <small>
                            {target.periodStart} to {target.periodEnd}
                          </small>
                        </div>
                      </td>
                      <td>
                        <span className="mono">{target.targetValue}</span>
                        {target.minValue != null || target.maxValue != null ? (
                          <div>
                            <small>
                              Band {target.minValue ?? "—"} to{" "}
                              {target.maxValue ?? "—"}
                            </small>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <Badge tone={statusTone(target.approvalStatus)}>
                          {approvalStatusLabel(target.approvalStatus)}
                        </Badge>
                        {target.rejectionReason ? (
                          <div>
                            <small>Reason: {target.rejectionReason}</small>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <small>
                          {named(target.submittedBy, "Not submitted")}
                          <br />
                          {formatDateTime(target.submittedAt)}
                        </small>
                      </td>
                      <td>
                        <small>
                          {named(target.approvedBy, "No decision")}
                          <br />
                          {formatDateTime(target.approvedAt)}
                        </small>
                      </td>
                      <td>
                        <TargetActions
                          target={target}
                          canWrite={canWrite}
                          canApprove={canApprove}
                          busy={busyId === target.id}
                          approvalBlocked={approvalBlockedReason(target)}
                          submitBlocked={submitBlockedReason(target)}
                          onEdit={() => {
                            setFormTarget(target);
                            setFormMode("edit");
                          }}
                          onVersion={() => {
                            setFormTarget(target);
                            setFormMode("version");
                          }}
                          onSubmit={() => onSubmitTarget(target)}
                          onApprove={() => onApproveTarget(target)}
                          onReject={() => {
                            setRejecting(target);
                            setRejectReason("");
                            setRejectError(null);
                          }}
                        />
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
            aria-label="KPI target cards"
            data-testid="kpi-target-cards"
          >
            {rows.map((target) => (
              <article className="card kpi-manage-card" key={target.id}>
                <header className="card-head">
                  <div>
                    <h2>{target.period}</h2>
                    <p className="mono">
                      {target.code} · v{target.version}
                    </p>
                  </div>
                  <Badge tone={statusTone(target.approvalStatus)}>
                    {approvalStatusLabel(target.approvalStatus)}
                  </Badge>
                </header>
                <div className="card-pad">
                  <p className="mono">
                    Target {target.targetValue} {config.kpi.unit}
                  </p>
                  <p>
                    <span className="sr-only">Submitted by </span>
                    {named(target.submittedBy, "Not submitted")}
                  </p>
                  {target.rejectionReason ? (
                    <p>Reason: {target.rejectionReason}</p>
                  ) : null}
                  <TargetActions
                    target={target}
                    canWrite={canWrite}
                    canApprove={canApprove}
                    busy={busyId === target.id}
                    approvalBlocked={approvalBlockedReason(target)}
                    submitBlocked={submitBlockedReason(target)}
                    labelled
                    onEdit={() => {
                      setFormTarget(target);
                      setFormMode("edit");
                    }}
                    onVersion={() => {
                      setFormTarget(target);
                      setFormMode("version");
                    }}
                    onSubmit={() => onSubmitTarget(target)}
                    onApprove={() => onApproveTarget(target)}
                    onReject={() => {
                      setRejecting(target);
                      setRejectReason("");
                      setRejectError(null);
                    }}
                  />
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

      {formMode ? (
        <KpiTargetForm
          mode={formMode}
          configuration={config}
          target={formTarget}
          onClose={() => {
            setFormMode(null);
            setFormTarget(null);
          }}
          onSaved={onSaved}
        />
      ) : null}

      {rejecting ? (
        <Modal
          title={`Reject target ${rejecting.code}`}
          onClose={() => setRejecting(null)}
          footer={
            <>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setRejecting(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busyId === rejecting.id || !rejectReason.trim()}
                onClick={() => void onRejectTarget()}
              >
                <XCircle size={15} />
                {busyId === rejecting.id ? "Rejecting…" : "Reject target"}
              </button>
            </>
          }
        >
          {rejectError ? (
            <div className="banner warning" role="alert">
              {rejectError}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="reject-reason">Rejection reason *</label>
            <textarea
              id="reject-reason"
              className="control"
              rows={4}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              maxLength={2000}
              required
              placeholder="Explain what must change before this target can be approved."
            />
            <p className="muted">
              The submitter can edit and resubmit the same version after a
              rejection.
            </p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function TargetActions({
  target,
  canWrite,
  canApprove,
  busy,
  approvalBlocked,
  submitBlocked,
  labelled,
  onEdit,
  onVersion,
  onSubmit,
  onApprove,
  onReject,
}: {
  target: KpiTarget;
  canWrite: boolean;
  canApprove: boolean;
  busy: boolean;
  approvalBlocked: string | null;
  submitBlocked: string | null;
  labelled?: boolean;
  onEdit: () => void;
  onVersion: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const approved = target.approvalStatus === "APPROVED";
  const editable =
    target.approvalStatus === "DRAFT" || target.approvalStatus === "REJECTED";
  const pending = target.approvalStatus === "PENDING_APPROVAL";
  const buttonClass = labelled ? "btn btn-secondary" : "tiny-btn";

  return (
    <div className="row-actions">
      {canWrite && editable ? (
        <>
          <button
            className={buttonClass}
            type="button"
            disabled={busy}
            aria-label={`Edit target ${target.code}`}
            onClick={onEdit}
          >
            <Pencil size={15} />
            {labelled ? " Edit" : null}
          </button>
          <button
            className={buttonClass}
            type="button"
            disabled={busy || Boolean(submitBlocked)}
            title={submitBlocked ?? undefined}
            aria-label={`Submit target ${target.code} for approval`}
            onClick={onSubmit}
          >
            <Send size={15} />
            {labelled ? " Submit" : null}
          </button>
        </>
      ) : null}

      {/* An approved target is immutable: offer versioning, never edit. */}
      {canWrite && approved && !target.supersededById ? (
        <button
          className={buttonClass}
          type="button"
          disabled={busy}
          aria-label={`Create new version of target ${target.code}`}
          onClick={onVersion}
        >
          <CopyPlus size={15} />
          {labelled ? " New version" : null}
        </button>
      ) : null}

      {canApprove && pending ? (
        <>
          <button
            className={buttonClass}
            type="button"
            disabled={busy || Boolean(approvalBlocked)}
            title={approvalBlocked ?? undefined}
            aria-label={`Approve target ${target.code}`}
            onClick={onApprove}
          >
            <CheckCircle2 size={15} />
            {labelled ? " Approve" : null}
          </button>
          <button
            className={buttonClass}
            type="button"
            disabled={busy || Boolean(approvalBlocked)}
            title={approvalBlocked ?? undefined}
            aria-label={`Reject target ${target.code}`}
            onClick={onReject}
          >
            <XCircle size={15} />
            {labelled ? " Reject" : null}
          </button>
        </>
      ) : null}

      {approvalBlocked && pending && canApprove ? (
        <small className="muted">{approvalBlocked}</small>
      ) : null}
      {approved ? (
        <small className="muted">Approved targets are immutable.</small>
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
          Previous
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
          Next
        </button>
      </div>
    </div>
  );
}
