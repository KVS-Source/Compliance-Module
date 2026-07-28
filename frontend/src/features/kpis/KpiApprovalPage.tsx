import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Inbox,
  RefreshCw,
  Send,
  ShieldAlert,
  TriangleAlert,
  XCircle,
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
  KpiActualRecord,
  KpiDefinition,
  SubmissionStatus,
} from "../../types/api";
import { kpiActualDecisionError } from "../../utils/fieldErrors";
import { KpiApprovalHistory } from "./KpiApprovalHistory";
import { approvalStatusLabel, formatDateTime, named } from "./kpiFormatting";

const PAGE_SIZE = 20;

type DecisionKind = "approve" | "reject" | "resubmit";

const DECISION_TITLES: Record<DecisionKind, string> = {
  approve: "Approve KPI actual",
  reject: "Reject KPI actual",
  resubmit: "Resubmit KPI actual",
};

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

const ragTone = (rag: string | null) => {
  switch (rag) {
    case "GREEN":
      return "green" as const;
    case "AMBER":
      return "amber" as const;
    case "RED":
      return "red" as const;
    default:
      return "grey" as const;
  }
};

export function KpiApprovalPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const canApprove = hasPermission("kpi-actual:approve");
  const canWrite = hasPermission("kpi-actual:write");

  const [approvalStatus, setApprovalStatus] = useState<SubmissionStatus | "">(
    "",
  );
  const [definitionId, setDefinitionId] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [decision, setDecision] = useState<{
    kind: DecisionKind;
    actual: KpiActualRecord;
  } | null>(null);
  const [decisionText, setDecisionText] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A Company switch must clear the list, filters, paging and any open detail.
  useEffect(() => {
    setApprovalStatus("");
    setDefinitionId("");
    setMineOnly(false);
    setPage(1);
    setExpanded(null);
    setDecision(null);
    setDecisionText("");
    setDecisionError(null);
  }, [contextVersion, user?.activeCompany.id]);

  const resource = useApiResource(
    () =>
      kpiApi.listActuals({
        page,
        pageSize: PAGE_SIZE,
        approvalStatus: approvalStatus || undefined,
        kpiDefinitionId: definitionId || undefined,
        ...(mineOnly ? { awaitingMyDecision: true } : {}),
      }),
    [
      contextVersion,
      user?.activeCompany.id,
      page,
      approvalStatus,
      definitionId,
      mineOnly,
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
  const hasFilters = Boolean(approvalStatus) || Boolean(definitionId) || mineOnly;

  /**
   * Usability gating that mirrors `KpiActualService.assertDecisionActor`,
   * including the fallback where a configuration's approver is also the
   * submitter and the approver restriction is waived. The backend remains
   * authoritative and its 403 is surfaced verbatim if this misjudges.
   */
  const decisionBlockedReason = (actual: KpiActualRecord) => {
    const pending =
      actual.approvalStatus === "SUBMITTED" ||
      actual.approvalStatus === "PENDING_APPROVAL";
    if (!pending) return "Only submitted actuals awaiting approval can be decided.";
    if (actual.submittedBy?.id && actual.submittedBy.id === user?.id) {
      return "You submitted this actual, so you cannot decide it.";
    }
    const approver = actual.configuration.approver;
    const approverIsSubmitter =
      approver?.id != null && approver.id === actual.submittedBy?.id;
    if (approver && !approverIsSubmitter && approver.id !== user?.id) {
      return `Only ${approver.name} may decide this actual.`;
    }
    return null;
  };

  const resubmitBlockedReason = (actual: KpiActualRecord) => {
    if (actual.approvalStatus !== "REJECTED") {
      return "Only rejected actuals can be resubmitted.";
    }
    if (actual.submittedBy?.id && actual.submittedBy.id !== user?.id) {
      return "Only the original submitter may resubmit this actual.";
    }
    return null;
  };

  const evidenceBlocked = (actual: KpiActualRecord) =>
    actual.configuration.requiresEvidence;

  const openDecision = (kind: DecisionKind, actual: KpiActualRecord) => {
    setDecision({ kind, actual });
    setDecisionText("");
    setDecisionError(null);
  };

  const submitDecision = async () => {
    if (!decision) return;
    const { kind, actual } = decision;
    const text = decisionText.trim();
    if (kind === "reject" && !text) {
      setDecisionError("A rejection reason is required.");
      return;
    }
    setBusy(true);
    setDecisionError(null);
    try {
      if (kind === "approve") {
        const result = await kpiApi.approveActual(actual.id, text || null);
        showToast(
          "success",
          `Actual ${result.code} approved`,
          actual.risk
            ? `Linked risk ${actual.risk.code} is unchanged by this decision.`
            : "No linked risk exists for this actual.",
        );
      } else if (kind === "reject") {
        const result = await kpiApi.rejectActual(actual.id, text);
        showToast(
          "warning",
          `Actual ${result.code} rejected`,
          actual.risk
            ? `Linked risk ${actual.risk.code} is unchanged by this decision.`
            : "The submitter can resubmit this actual.",
        );
      } else {
        const result = await kpiApi.resubmitActual(actual.id, text || null);
        showToast(
          "success",
          `Actual ${result.code} resubmitted`,
          result.approvalStatus === "APPROVED"
            ? "This configuration does not require approval, so it was approved immediately."
            : "The actual is pending approval again.",
        );
      }
      setDecision(null);
      setDecisionText("");
      refresh();
    } catch (error) {
      setDecisionError(
        kpiActualDecisionError(
          error,
          kind === "resubmit" ? "kpi-actual:write" : "kpi-actual:approve",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="KPI Approval"
        section="KPI Management"
        description="Review KPI actuals submitted in the active Company, and record an append-only approval decision."
        connected
        actions={
          <button
            className="btn btn-secondary"
            type="button"
            onClick={refresh}
            disabled={resource.loading}
          >
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />

      {!canApprove && !canWrite ? (
        <p className="muted" role="status">
          Your active Company role includes neither{" "}
          <code>kpi-actual:approve</code> nor <code>kpi-actual:write</code>, so
          actuals are read only.
        </p>
      ) : null}

      <div className="banner info" role="note" data-testid="risk-unchanged-note">
        <ShieldAlert size={15} aria-hidden /> Approving or rejecting an actual
        does <strong>not</strong> change any risk it raised. Automatic risk
        creation happens once, at submission. Review, treatment, closure and
        reopening are handled separately in the Risk Register.
      </div>

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
            <option value="SUBMITTED">SUBMITTED</option>
            <option value="PENDING_APPROVAL">PENDING APPROVAL</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Filter by KPI</span>
          <select
            className="control"
            value={definitionId}
            aria-label="Filter by KPI"
            onChange={(event) => {
              setDefinitionId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All KPIs</option>
            {(definitions.data ?? []).map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.code} · {definition.name}
              </option>
            ))}
          </select>
        </label>
        {canApprove ? (
          <label className="checkbox-row" htmlFor="awaiting-my-decision">
            <input
              id="awaiting-my-decision"
              type="checkbox"
              checked={mineOnly}
              onChange={(event) => {
                setMineOnly(event.target.checked);
                setPage(1);
              }}
            />
            <span>Only actuals awaiting my decision</span>
          </label>
        ) : null}
      </form>

      {resource.loading ? (
        <div
          data-testid={
            refreshing ? "kpi-approval-refreshing" : "kpi-approval-loading"
          }
        >
          <LoadingState
            label={
              refreshing ? "Refreshing KPI actuals…" : "Loading KPI actuals…"
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
              ? "No actuals match these filters"
              : "No KPI actuals yet"}
          </h3>
          <p>
            {hasFilters
              ? "Server-side filters returned no rows for the active Company. Adjust the filters and try again."
              : `No KPI actuals have been submitted in ${user?.activeCompany.name ?? "the active Company"}.`}
          </p>
        </section>
      ) : (
        <>
          <section
            className="card table-card kpi-manage-desktop"
            data-testid="kpi-approval-table"
          >
            <div className="table-wrap">
              <table className="data-table">
                <caption>
                  KPI actuals — {total} result{total === 1 ? "" : "s"}
                  {user?.activeCompany.name
                    ? ` for ${user.activeCompany.name}`
                    : ""}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Actual</th>
                    <th scope="col">KPI</th>
                    <th scope="col">Period</th>
                    <th scope="col">Target</th>
                    <th scope="col">Actual value</th>
                    <th scope="col">Variance</th>
                    <th scope="col">RAG</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Status</th>
                    <th scope="col">Linked risk</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((actual) => {
                    const blocked = decisionBlockedReason(actual);
                    const open = expanded === actual.id;
                    return [
                      <tr key={actual.id}>
                        <td>
                          <div className="cell-title">
                            <strong className="mono">{actual.code}</strong>
                            {blocked === null && canApprove ? (
                              <Badge tone="amber">Yours to decide</Badge>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div className="cell-title">
                            <strong>{actual.configuration.kpi.name}</strong>
                            <small className="mono">
                              {actual.configuration.kpi.code}
                            </small>
                          </div>
                        </td>
                        <td>{actual.period}</td>
                        <td className="mono">{actual.targetValueSnapshot}</td>
                        <td className="mono">{actual.actualValue}</td>
                        <td>
                          <span className="mono">{actual.variance}</span>
                          {actual.variancePercentage != null ? (
                            <div>
                              <small>{actual.variancePercentage}%</small>
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {actual.ragStatus ? (
                            <Badge tone={ragTone(actual.ragStatus)}>
                              {actual.ragStatus}
                            </Badge>
                          ) : (
                            <span>Informational</span>
                          )}
                        </td>
                        <td>
                          <small>
                            {named(actual.submittedBy, "Not recorded")}
                            <br />
                            {formatDateTime(actual.submittedAt)}
                          </small>
                        </td>
                        <td>
                          <Badge tone={statusTone(actual.approvalStatus)}>
                            {approvalStatusLabel(actual.approvalStatus)}
                          </Badge>
                        </td>
                        <td>
                          {actual.risk ? (
                            <button
                              className="link-button"
                              type="button"
                              onClick={() =>
                                navigate(`/compliance/risks/${actual.risk!.id}`)
                              }
                            >
                              <span className="mono">{actual.risk.code}</span>{" "}
                              {actual.risk.kpiRiskClass ?? ""}
                            </button>
                          ) : (
                            <small>No risk</small>
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="tiny-btn"
                              type="button"
                              aria-expanded={open}
                              aria-label={`${open ? "Hide" : "Show"} approval history for ${actual.code}`}
                              onClick={() =>
                                setExpanded(open ? null : actual.id)
                              }
                            >
                              {open ? (
                                <ChevronDown size={15} />
                              ) : (
                                <ChevronRight size={15} />
                              )}
                            </button>
                            <RowActions
                              actual={actual}
                              canApprove={canApprove}
                              canWrite={canWrite}
                              blocked={blocked}
                              resubmitBlocked={resubmitBlockedReason(actual)}
                              evidenceBlocked={evidenceBlocked(actual)}
                              onDecision={openDecision}
                            />
                          </div>
                        </td>
                      </tr>,
                      open ? (
                        <tr key={`${actual.id}-history`}>
                          <td colSpan={11}>
                            <KpiApprovalHistory
                              approvals={actual.approvals}
                              actualCode={actual.code}
                            />
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
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
            aria-label="KPI actual cards"
            data-testid="kpi-approval-cards"
          >
            {rows.map((actual) => {
              const blocked = decisionBlockedReason(actual);
              const open = expanded === actual.id;
              return (
                <article className="card kpi-manage-card" key={actual.id}>
                  <header className="card-head">
                    <div>
                      <h2>{actual.configuration.kpi.name}</h2>
                      <p className="mono">
                        {actual.code} · {actual.configuration.kpi.code}
                      </p>
                    </div>
                    <Badge tone={statusTone(actual.approvalStatus)}>
                      {approvalStatusLabel(actual.approvalStatus)}
                    </Badge>
                  </header>
                  <div className="card-pad">
                    {blocked === null && canApprove ? (
                      <Badge tone="amber">Yours to decide</Badge>
                    ) : null}
                    <p>{actual.period}</p>
                    <p className="mono">
                      Target {actual.targetValueSnapshot} · Actual{" "}
                      {actual.actualValue} · Var {actual.variance}
                      {actual.variancePercentage != null
                        ? ` (${actual.variancePercentage}%)`
                        : ""}
                    </p>
                    <p>
                      <span className="sr-only">RAG status </span>
                      {actual.ragStatus ?? "Informational"}
                    </p>
                    <p>
                      <span className="sr-only">Submitted by </span>
                      {named(actual.submittedBy, "Not recorded")} ·{" "}
                      {formatDateTime(actual.submittedAt)}
                    </p>
                    <p>
                      {actual.risk ? (
                        <button
                          className="link-button"
                          type="button"
                          onClick={() =>
                            navigate(`/compliance/risks/${actual.risk!.id}`)
                          }
                        >
                          Linked risk {actual.risk.code}
                        </button>
                      ) : (
                        "No linked risk"
                      )}
                    </p>
                    <div className="row-actions">
                      <button
                        className="btn btn-secondary"
                        type="button"
                        aria-expanded={open}
                        aria-label={`${open ? "Hide" : "Show"} approval history for ${actual.code}`}
                        onClick={() => setExpanded(open ? null : actual.id)}
                      >
                        {open ? "Hide history" : "Show history"}
                      </button>
                      <RowActions
                        actual={actual}
                        canApprove={canApprove}
                        canWrite={canWrite}
                        blocked={blocked}
                        resubmitBlocked={resubmitBlockedReason(actual)}
                        evidenceBlocked={evidenceBlocked(actual)}
                        labelled
                        onDecision={openDecision}
                      />
                    </div>
                    {open ? (
                      <KpiApprovalHistory
                        approvals={actual.approvals}
                        actualCode={actual.code}
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}
            <Pager
              page={page}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </section>
        </>
      )}

      {decision ? (
        <Modal
          title={`${DECISION_TITLES[decision.kind]} ${decision.actual.code}`}
          onClose={() => setDecision(null)}
          footer={
            <>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setDecision(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={
                  busy || (decision.kind === "reject" && !decisionText.trim())
                }
                onClick={() => void submitDecision()}
              >
                {busy ? "Working…" : DECISION_TITLES[decision.kind]}
              </button>
            </>
          }
        >
          {decisionError ? (
            <div
              className="banner warning"
              role="alert"
              data-testid="decision-error"
            >
              {decisionError}
            </div>
          ) : null}

          {decision.kind !== "resubmit" &&
          evidenceBlocked(decision.actual) ? (
            <div
              className="banner warning"
              role="alert"
              data-testid="evidence-gate-warning"
            >
              <TriangleAlert size={15} aria-hidden /> This KPI configuration
              has <strong>Requires evidence</strong> switched on, and the
              Evidence domain is not implemented yet. This decision will fail
              with <code>501 EVIDENCE_GATE_NOT_IMPLEMENTED</code> and nothing
              will be saved.
            </div>
          ) : null}

          {decision.actual.risk ? (
            <p className="muted" data-testid="decision-risk-note">
              Linked risk <span className="mono">{decision.actual.risk.code}</span>{" "}
              will <strong>not</strong> change. Risk closure is a separate
              workflow.
            </p>
          ) : null}

          <div className="field">
            <label htmlFor="decision-text">
              {decision.kind === "reject"
                ? "Rejection reason *"
                : "Comments (optional)"}
            </label>
            <textarea
              id="decision-text"
              className="control"
              rows={4}
              value={decisionText}
              onChange={(event) => setDecisionText(event.target.value)}
              maxLength={2000}
              required={decision.kind === "reject"}
              placeholder={
                decision.kind === "reject"
                  ? "Explain what must change before this actual can be approved."
                  : "Recorded permanently in the approval history."
              }
            />
            <p className="muted">
              This is written to the append-only approval history and cannot be
              edited or removed afterwards.
            </p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function RowActions({
  actual,
  canApprove,
  canWrite,
  blocked,
  resubmitBlocked,
  evidenceBlocked,
  labelled,
  onDecision,
}: {
  actual: KpiActualRecord;
  canApprove: boolean;
  canWrite: boolean;
  blocked: string | null;
  resubmitBlocked: string | null;
  evidenceBlocked: boolean;
  labelled?: boolean;
  onDecision: (kind: DecisionKind, actual: KpiActualRecord) => void;
}) {
  const pending =
    actual.approvalStatus === "SUBMITTED" ||
    actual.approvalStatus === "PENDING_APPROVAL";
  const buttonClass = labelled ? "btn btn-secondary" : "tiny-btn";
  const evidenceHint = evidenceBlocked
    ? " Evidence is required for this KPI and is not implemented yet, so the decision will fail."
    : "";

  return (
    <>
      {canApprove && pending ? (
        <>
          <button
            className={buttonClass}
            type="button"
            disabled={Boolean(blocked)}
            title={blocked ? blocked : `Approve ${actual.code}.${evidenceHint}`}
            aria-label={`Approve actual ${actual.code}`}
            onClick={() => onDecision("approve", actual)}
          >
            <CheckCircle2 size={15} />
            {labelled ? " Approve" : null}
          </button>
          <button
            className={buttonClass}
            type="button"
            disabled={Boolean(blocked)}
            title={blocked ?? `Reject ${actual.code}`}
            aria-label={`Reject actual ${actual.code}`}
            onClick={() => onDecision("reject", actual)}
          >
            <XCircle size={15} />
            {labelled ? " Reject" : null}
          </button>
        </>
      ) : null}

      {canWrite && actual.approvalStatus === "REJECTED" ? (
        <button
          className={buttonClass}
          type="button"
          disabled={Boolean(resubmitBlocked)}
          title={resubmitBlocked ?? `Resubmit ${actual.code}`}
          aria-label={`Resubmit actual ${actual.code}`}
          onClick={() => onDecision("resubmit", actual)}
        >
          <Send size={15} />
          {labelled ? " Resubmit" : null}
        </button>
      ) : null}

      {canApprove && pending && blocked ? (
        <small className="muted">{blocked}</small>
      ) : null}
    </>
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
