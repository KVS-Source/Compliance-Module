import {
  ArrowLeft,
  CheckCircle2,
  Info,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UserRoundCog,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { Modal } from "../../components/feedback/Modal";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { ApiError } from "../../services/apiClient";
import { masterDataApi } from "../../services/masterDataApi";
import { riskApi } from "../../services/riskApi";
import type {
  CompanyUser,
  Risk,
  RiskTreatmentEntry,
  RiskTreatmentStrategy,
} from "../../types/api";
import { riskWorkflowError, type FieldErrors } from "../../utils/fieldErrors";
import {
  RiskReviewHistory,
  RiskTreatmentHistory,
} from "./RiskWorkflowHistory";
import { RecordCommentsPanel } from "../comments/RecordCommentsPanel";

const STRATEGIES: RiskTreatmentStrategy[] = [
  "AVOID",
  "MITIGATE",
  "TRANSFER",
  "ACCEPT",
];

const ASSESSMENT_VALUES = [1, 2, 3, 4, 5];

type ActionKind = "review" | "treat" | "complete" | "owner" | "close" | "reopen";

const ACTION_TITLES: Record<ActionKind, string> = {
  review: "Record review",
  treat: "Record treatment",
  complete: "Complete treatment",
  owner: "Assign owner",
  close: "Close risk",
  reopen: "Reopen risk",
};

const statusLabel = (status: string) => status.replaceAll("_", " ");

const display = (value: string | number | null | undefined, fallback: string) =>
  value === null || value === undefined || value === ""
    ? fallback
    : String(value);

const named = (
  value: { code: string; name: string } | null | undefined,
  fallback: string,
) => (value ? `${value.name} (${value.code})` : fallback);

const hasKpiLineage = (risk: Risk) =>
  Boolean(
    risk.source.actual && risk.source.configuration && risk.source.target,
  );

export function RiskDetailPage() {
  const { riskId = "" } = useParams();
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const canTreat = hasPermission("risk:treat");
  const canClose = hasPermission("risk:close");

  const [detailVersion, setDetailVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [treatmentTarget, setTreatmentTarget] =
    useState<RiskTreatmentEntry | null>(null);
  const [comments, setComments] = useState("");
  const [plan, setPlan] = useState("");
  const [strategy, setStrategy] = useState<RiskTreatmentStrategy>("MITIGATE");
  const [ownerId, setOwnerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [likelihood, setLikelihood] = useState("");
  const [impact, setImpact] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyTreatmentId, setBusyTreatmentId] = useState<string | null>(null);

  const resource = useApiResource(
    () => riskApi.get(riskId),
    [riskId, contextVersion, user?.activeCompany.id, detailVersion],
  );

  // Only the treat and owner dialogs need the user list, so it is fetched when
  // one of them opens rather than on every risk detail view. That avoids a
  // needless request, and a spurious 403 for roles without users:read.
  const needsUsers = action === "treat" || action === "owner";
  const users = useApiResource<CompanyUser[]>(
    () =>
      needsUsers
        ? masterDataApi.listUsers().catch(() => [])
        : Promise.resolve([]),
    [contextVersion, user?.activeCompany.id, needsUsers],
  );

  // A Company switch must drop any open dialog and its half-entered content.
  useEffect(() => {
    setAction(null);
    setTreatmentTarget(null);
    setFormError(null);
    setFieldErrors({});
  }, [contextVersion, user?.activeCompany.id, riskId]);

  useEffect(() => {
    if (!resource.loading) setRefreshing(false);
  }, [resource.loading]);

  const refresh = () => {
    setRefreshing(true);
    setDetailVersion((value) => value + 1);
  };

  const openAction = (kind: ActionKind, treatment?: RiskTreatmentEntry) => {
    setAction(kind);
    setTreatmentTarget(treatment ?? null);
    setComments("");
    setPlan("");
    setStrategy("MITIGATE");
    setOwnerId("");
    setDueDate("");
    setLikelihood("");
    setImpact("");
    setFieldErrors({});
    setFormError(null);
  };

  const closeAction = () => {
    setAction(null);
    setTreatmentTarget(null);
  };

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    if (treatmentTarget) setBusyTreatmentId(treatmentTarget.id);
    setFormError(null);
    setFieldErrors({});
    const permission = action === "close" || action === "reopen"
      ? "risk:close"
      : "risk:treat";
    try {
      if (action === "review") {
        await riskApi.recordReview(riskId, {
          comments: comments.trim(),
          likelihoodAtReview: likelihood ? Number(likelihood) : null,
          impactAtReview: impact ? Number(impact) : null,
        });
        showToast(
          "success",
          "Review recorded",
          "The review is written to the append-only trail.",
        );
      } else if (action === "treat") {
        await riskApi.recordTreatment(riskId, {
          strategy,
          plan: plan.trim(),
          ownerId: ownerId || null,
          dueDate: dueDate || null,
        });
        showToast(
          "success",
          "Treatment recorded",
          "The risk is now marked as treated.",
        );
      } else if (action === "complete" && treatmentTarget) {
        await riskApi.completeTreatment(
          riskId,
          treatmentTarget.id,
          comments.trim() || null,
        );
        showToast(
          "success",
          "Treatment completed",
          "A new completion entry was added; the original entry is unchanged.",
        );
      } else if (action === "owner") {
        await riskApi.assignOwner(riskId, ownerId || null);
        showToast(
          "success",
          ownerId ? "Owner assigned" : "Owner cleared",
          "The change is recorded in the audit trail.",
        );
      } else if (action === "close") {
        await riskApi.close(riskId, comments.trim());
        showToast(
          "success",
          "Risk closed",
          "The closure reason is recorded and audited.",
        );
      } else if (action === "reopen") {
        await riskApi.reopen(riskId, comments.trim());
        showToast(
          "success",
          "Risk reopened",
          "The risk is back under review.",
        );
      }
      closeAction();
      refresh();
    } catch (error) {
      const mapped = riskWorkflowError(error, permission);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setBusy(false);
      setBusyTreatmentId(null);
    }
  };

  if (resource.loading) {
    return (
      <div
        data-testid={refreshing ? "risk-detail-refreshing" : "risk-detail-loading"}
      >
        <LoadingState
          label={refreshing ? "Refreshing risk detail…" : "Loading risk detail…"}
        />
      </div>
    );
  }
  if (resource.error) {
    const notFound =
      resource.error instanceof ApiError && resource.error.status === 404;
    return (
      <div className="page">
        <PageHeader
          title="Risk detail"
          section="Compliance Management"
          description="Company-scoped risk record."
          connected
        />
        {notFound ? (
          <section className="card state-panel state-error" role="alert">
            <ShieldAlert size={24} aria-hidden />
            <div>
              <strong>Risk not found</strong>
              <p>
                This risk is not available in{" "}
                {user?.activeCompany.name ?? "the active Company"}. It may
                belong to another Company context.
              </p>
            </div>
            <Link className="btn btn-secondary" to="/compliance/risks">
              <ArrowLeft size={15} /> Back to register
            </Link>
          </section>
        ) : (
          <ErrorState error={resource.error} />
        )}
      </div>
    );
  }

  const risk = resource.data;
  if (!risk) return <LoadingState label="Loading risk detail…" />;

  const configuration = risk.source.configuration;
  const actual = risk.source.actual;
  const automatic = hasKpiLineage(risk);
  const isClosed = risk.status === "CLOSED" || risk.status === "ARCHIVED";
  const requiresReason =
    action === "close" || action === "reopen" || action === "review";

  return (
    <div className="page">
      <PageHeader
        title={risk.title}
        section="Compliance Management"
        description={`${risk.code} · ${user?.activeCompany.name ?? "Active Company"}`}
        showDescription
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
            {canTreat && !isClosed ? (
              <>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => openAction("review")}
                >
                  <ShieldCheck size={15} /> Record review
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => openAction("treat")}
                >
                  <CheckCircle2 size={15} /> Record treatment
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => openAction("owner")}
                >
                  <UserRoundCog size={15} /> Assign owner
                </button>
              </>
            ) : null}
            {canClose && !isClosed ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => openAction("close")}
              >
                <ShieldAlert size={15} /> Close risk
              </button>
            ) : null}
            {canClose && risk.status === "CLOSED" ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => openAction("reopen")}
              >
                <RotateCcw size={15} /> Reopen risk
              </button>
            ) : null}
            <Link className="btn btn-secondary" to="/compliance/risks">
              <ArrowLeft size={15} /> Back to register
            </Link>
          </>
        }
      />

      <p className="sr-only">
        Risk code {risk.code}. Status {statusLabel(risk.status)}.
      </p>

      {automatic ? (
        <div
          className="banner banner-info"
          role="status"
          data-testid="risk-automatic-origin"
        >
          <Info size={16} aria-hidden />
          <div>
            <strong>
              This risk was raised automatically because a KPI target was
              missed.
            </strong>
            <p style={{ margin: "2px 0 0" }}>
              Source KPI {configuration!.kpi.code} ({configuration!.kpi.name})
              for period {actual!.period}. Originating actual code{" "}
              <span className="mono">{actual!.code}</span> is a non-clickable
              reference (no live KPI Actual detail route exists yet).
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <div>
              <h2>Assessment</h2>
              <p>Inherent classification and residual assessment.</p>
            </div>
            <Badge>{statusLabel(risk.status)}</Badge>
          </header>
          <div className="card-pad">
            <dl className="detail-list">
              <div>
                <dt>Code</dt>
                <dd className="mono">{risk.code}</dd>
              </div>
              <div>
                <dt>Title</dt>
                <dd>{risk.title}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge>{statusLabel(risk.status)}</Badge>
                </dd>
              </div>
              <div>
                <dt>KPI risk class</dt>
                <dd>{display(risk.kpiRiskClass, "Not applicable")}</dd>
              </div>
              <div>
                <dt>General level</dt>
                <dd>{display(risk.generalLevel, "Not provided")}</dd>
              </div>
              <div>
                <dt>Inherent likelihood</dt>
                <dd className="mono">{risk.inherentLikelihood}</dd>
              </div>
              <div>
                <dt>Inherent impact</dt>
                <dd className="mono">{risk.inherentImpact}</dd>
              </div>
              <div>
                <dt>Inherent score</dt>
                <dd className="mono">{risk.inherentScore}</dd>
              </div>
              <div>
                <dt>Residual likelihood</dt>
                <dd>
                  {risk.residualLikelihood === null
                    ? "Not yet assessed"
                    : risk.residualLikelihood}
                </dd>
              </div>
              <div>
                <dt>Residual impact</dt>
                <dd>
                  {risk.residualImpact === null
                    ? "Not yet assessed"
                    : risk.residualImpact}
                </dd>
              </div>
              <div>
                <dt>Residual score</dt>
                <dd>
                  {risk.residualScore === null
                    ? "Not yet assessed"
                    : risk.residualScore}
                </dd>
              </div>
              <div>
                <dt>Treatment strategy</dt>
                <dd>{display(risk.treatmentStrategy, "Not yet assessed")}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{named(risk.owner, "Not assigned")}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{new Date(risk.createdAt).toLocaleString("en-GB")}</dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd>{display(risk.description, "Not provided")}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="card">
          <header className="card-head">
            <div>
              <h2>Source and scope</h2>
              <p>
                {automatic
                  ? "KPI lineage and configuration scope for this Company."
                  : "No automatic KPI lineage is attached to this risk."}
              </p>
            </div>
          </header>
          <div className="card-pad">
            <dl className="detail-list">
              <div>
                <dt>KPI</dt>
                <dd>
                  {configuration
                    ? `${configuration.kpi.code} · ${configuration.kpi.name}`
                    : "Not applicable"}
                </dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>{display(actual?.period, "Not applicable")}</dd>
              </div>
              <div>
                <dt>Actual code</dt>
                <dd className="mono">
                  {actual ? actual.code : "Not applicable"}
                </dd>
              </div>
              <div>
                <dt>Actual value</dt>
                <dd className="mono">
                  {display(actual?.actualValue, "Not applicable")}
                </dd>
              </div>
              <div>
                <dt>Target snapshot</dt>
                <dd className="mono">
                  {display(actual?.targetValueSnapshot, "Not applicable")}
                </dd>
              </div>
              <div>
                <dt>Variance</dt>
                <dd className="mono">
                  {display(actual?.variance, "Not applicable")}
                </dd>
              </div>
              <div>
                <dt>RAG</dt>
                <dd>
                  {actual?.ragStatus ? (
                    <Badge>{actual.ragStatus}</Badge>
                  ) : (
                    "Not applicable"
                  )}
                </dd>
              </div>
              <div>
                <dt>Target code</dt>
                <dd className="mono">
                  {risk.source.target
                    ? `${risk.source.target.code} (v${risk.source.target.version})`
                    : "Not applicable"}
                </dd>
              </div>
              <div>
                <dt>BU / Department</dt>
                <dd>{named(configuration?.department, "Not provided")}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{named(configuration?.orgLocation, "Not provided")}</dd>
              </div>
              <div>
                <dt>Product / Service</dt>
                <dd>
                  {display(configuration?.productService, "Not provided")}
                </dd>
              </div>
              <div>
                <dt>Org unit</dt>
                <dd>{named(configuration?.orgUnit, "Not provided")}</dd>
              </div>
              <div>
                <dt>Configuration owner</dt>
                <dd>{named(configuration?.owner, "Not assigned")}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>

      {isClosed ? (
        <div className="banner info" role="note" data-testid="risk-closed-note">
          <Info size={15} aria-hidden /> This risk is {statusLabel(risk.status)}
          {risk.closureReason ? ` — ${risk.closureReason}` : ""}. Reviews and
          treatments cannot be recorded until it is reopened.
        </div>
      ) : null}

      {!canTreat && !canClose ? (
        <p className="muted" role="status">
          Your active Company role includes neither <code>risk:treat</code> nor{" "}
          <code>risk:close</code>, so this risk is read only.
        </p>
      ) : null}

      <div className="stack">
        {/* Default to empty so a response missing either ledger renders the
            empty state rather than white-screening the whole detail page. */}
        <RiskReviewHistory reviews={risk.reviews ?? []} />
        <RiskTreatmentHistory
          treatments={risk.treatments ?? []}
          canTreat={canTreat && !isClosed}
          busyId={busyTreatmentId}
          onComplete={(treatment) => openAction("complete", treatment)}
        />
      </div>

      <RecordCommentsPanel
        entityType="RISK"
        entityId={risk.id}
        recordCode={risk.code}
      />

      {action ? (
        <Modal
          title={ACTION_TITLES[action]}
          onClose={closeAction}
          footer={
            <>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={closeAction}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={
                  busy ||
                  (requiresReason && !comments.trim()) ||
                  (action === "treat" && !plan.trim())
                }
                onClick={() => void runAction()}
              >
                {busy ? "Working…" : ACTION_TITLES[action]}
              </button>
            </>
          }
        >
          {formError ? (
            <div
              className="banner warning"
              role="alert"
              data-testid="risk-action-error"
            >
              {formError}
            </div>
          ) : null}

          {action === "treat" ? (
            <>
              <div className="field">
                <label htmlFor="treatment-strategy">Strategy *</label>
                <select
                  id="treatment-strategy"
                  className="control"
                  value={strategy}
                  onChange={(event) =>
                    setStrategy(event.target.value as RiskTreatmentStrategy)
                  }
                >
                  {STRATEGIES.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="treatment-plan">Plan *</label>
                <textarea
                  id="treatment-plan"
                  className="control"
                  rows={4}
                  value={plan}
                  onChange={(event) => setPlan(event.target.value)}
                  maxLength={4000}
                  required
                  placeholder="What will be done, by whom, and how it reduces the risk."
                />
              </div>
              <div className="field">
                <label htmlFor="treatment-due">Due date</label>
                <input
                  id="treatment-due"
                  className="control"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            </>
          ) : null}

          {action === "treat" || action === "owner" ? (
            <div className="field">
              <label htmlFor="risk-owner">
                {action === "owner" ? "Risk owner" : "Treatment owner"}
              </label>
              <select
                id="risk-owner"
                className={`control ${fieldErrors.ownerId ? "invalid" : ""}`}
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                aria-invalid={Boolean(fieldErrors.ownerId)}
                aria-describedby="risk-owner-error"
              >
                <option value="">Not assigned</option>
                {(users.data ?? []).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.code} · {entry.name}
                  </option>
                ))}
              </select>
              <div className="error" id="risk-owner-error" role="alert">
                {fieldErrors.ownerId ?? ""}
              </div>
            </div>
          ) : null}

          {action === "review" ? (
            <>
              <div className="field">
                <label htmlFor="review-likelihood">
                  Revised likelihood (1–5)
                </label>
                <select
                  id="review-likelihood"
                  className="control"
                  value={likelihood}
                  onChange={(event) => setLikelihood(event.target.value)}
                >
                  <option value="">No reassessment</option>
                  {ASSESSMENT_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="review-impact">Revised impact (1–5)</label>
                <select
                  id="review-impact"
                  className="control"
                  value={impact}
                  onChange={(event) => setImpact(event.target.value)}
                >
                  <option value="">No reassessment</option>
                  {ASSESSMENT_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <p className="muted">
                Give both values or neither. The server calculates the residual
                score and risk level from them.
              </p>
            </>
          ) : null}

          {action === "complete" ? (
            <p className="muted" data-testid="complete-supersede-note">
              This adds a <strong>new completion entry</strong> to the treatment
              trail. The original entry is kept unchanged, because the trail is
              append-only.
            </p>
          ) : null}

          {action !== "treat" && action !== "owner" ? (
            <div className="field">
              <label htmlFor="risk-action-comments">
                {action === "close"
                  ? "Closure reason *"
                  : action === "reopen"
                    ? "Reason for reopening *"
                    : action === "review"
                      ? "Review comments *"
                      : "Notes (optional)"}
              </label>
              <textarea
                id="risk-action-comments"
                className="control"
                rows={4}
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                maxLength={2000}
                required={requiresReason}
              />
              <p className="muted">
                Recorded permanently and cannot be edited or removed
                afterwards.
              </p>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
