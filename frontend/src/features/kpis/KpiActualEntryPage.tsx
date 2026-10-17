import { CheckCircle2, Send, TriangleAlert } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { KpiActualGrid } from "./KpiActualGrid";
import { kpiApi } from "../../services/kpiApi";
import type { KpiActual, KpiConfiguration, KpiTarget } from "../../types/api";
import {
  kpiActualSubmissionError,
  type FieldErrors,
} from "../../utils/fieldErrors";
import { KpiActualEvidencePanel } from "../evidence/KpiActualEvidencePanel";

const frequencyLabel = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");

const configurationLabel = (configuration: KpiConfiguration) => {
  const scope = [
    configuration.department?.name,
    configuration.orgUnit?.name,
    configuration.orgLocation?.name,
    configuration.productService,
  ]
    .filter(Boolean)
    .join(" · ");
  return scope
    ? `${configuration.kpi.code} · ${configuration.kpi.name} (${scope})`
    : `${configuration.kpi.code} · ${configuration.kpi.name}`;
};

/** Highest approved version for a period, matching submission-time selection. */
const preferredTargetForPeriod = (targets: KpiTarget[], period: string) =>
  targets
    .filter((target) => target.period === period && !target.supersededById)
    .sort((left, right) => right.version - left.version)[0] ??
  targets
    .filter((target) => target.period === period)
    .sort((left, right) => right.version - left.version)[0] ??
  null;

const riskOutcomeCopy = (actual: KpiActual) => {
  if (actual.risk) {
    return {
      tone: "red" as const,
      title: `Risk raised · ${actual.risk.code}`,
      body: `${actual.risk.kpiRiskClass ?? "KPI"} risk (${actual.risk.generalLevel ?? "unclassified"}) was created for this miss.`,
    };
  }
  if (actual.targetMet) {
    return {
      tone: "green" as const,
      title: "No risk",
      body: "The actual meets the approved target. No Risk Register record was created.",
    };
  }
  return {
    tone: "green" as const,
    title: "No risk",
    body: "The miss is within the configured amber tolerance, so the result is GREEN and no Risk Register record was created.",
  };
};

export function KpiActualEntryPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const canWrite = hasPermission("kpi-actual:write");

  const [configurationId, setConfigurationId] = useState("");
  const [period, setPeriod] = useState("");
  const [actualValue, setActualValue] = useState("");
  const [comments, setComments] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"single" | "grid">("single");
  const [result, setResult] = useState<KpiActual | null>(null);

  const configurations = useApiResource(
    () => kpiApi.listActiveConfigurations(),
    [contextVersion, user?.activeCompany.id],
  );

  const targets = useApiResource(
    () =>
      configurationId
        ? kpiApi.listApprovedTargets(configurationId)
        : Promise.resolve([] as KpiTarget[]),
    [configurationId, contextVersion, user?.activeCompany.id],
  );

  const selectedConfiguration = useMemo(
    () =>
      (configurations.data ?? []).find(
        (entry) => entry.id === configurationId,
      ) ?? null,
    [configurationId, configurations.data],
  );

  const periods = useMemo(() => {
    const values = new Set((targets.data ?? []).map((target) => target.period));
    return [...values].sort((left, right) => left.localeCompare(right));
  }, [targets.data]);

  const selectedTarget = useMemo(
    () =>
      period && targets.data
        ? preferredTargetForPeriod(targets.data, period)
        : null,
    [period, targets.data],
  );

  const clearFieldError = (key: string) => {
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const onConfigurationChange = (value: string) => {
    setConfigurationId(value);
    setPeriod("");
    setResult(null);
    setFormError(null);
    clearFieldError("kpiConfigurationId");
    clearFieldError("period");
  };

  const onPeriodChange = (value: string) => {
    setPeriod(value);
    setResult(null);
    setFormError(null);
    clearFieldError("period");
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const submitted = await kpiApi.submitActual({
        kpiConfigurationId: configurationId,
        period,
        actualValue: actualValue.trim(),
        comments: comments.trim() ? comments.trim() : null,
      });
      setResult(submitted);
      showToast(
        submitted.riskRequired ? "warning" : "success",
        submitted.risk
          ? `Actual ${submitted.code} submitted · ${submitted.risk.code}`
          : `Actual ${submitted.code} submitted`,
        submitted.risk
          ? `${submitted.risk.kpiRiskClass} risk raised for ${submitted.period}.`
          : "No Risk Register record was created.",
      );
    } catch (error) {
      const mapped = kpiActualSubmissionError(error);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSubmitting(false);
    }
  };

  if (configurations.loading) return <LoadingState />;
  if (configurations.error) return <ErrorState error={configurations.error} />;

  const riskCopy = result ? riskOutcomeCopy(result) : null;
  const ragTone =
    result?.ragStatus === "GREEN"
      ? "green"
      : result?.ragStatus === "AMBER"
        ? "amber"
        : result?.ragStatus === "RED"
          ? "red"
          : "grey";

  return (
    <div className="page">
      <PageHeader
        title="KPI Actual Entry"
        section="KPI Management"
        description="Record KPI performance against an approved target for the active Company."
        connected
        actions={
          <div className="mode-switch" role="group" aria-label="Entry mode">
            <button
              className={`btn ${mode === "single" ? "btn-primary" : "btn-secondary"}`}
              type="button"
              aria-pressed={mode === "single"}
              onClick={() => setMode("single")}
              data-testid="kpi-entry-mode-single"
            >
              Single
            </button>
            <button
              className={`btn ${mode === "grid" ? "btn-primary" : "btn-secondary"}`}
              type="button"
              aria-pressed={mode === "grid"}
              onClick={() => setMode("grid")}
              data-testid="kpi-entry-mode-grid"
            >
              Grid
            </button>
          </div>
        }
      />

      {mode === "grid" ? (
        <KpiActualGrid
          configurations={configurations.data ?? []}
          canWrite={canWrite}
        />
      ) : (
        <div className="grid-2 kpi-entry-layout">
          <section className="card">
            <header className="card-head">
              <div>
                <h2>Actual Performance</h2>
              </div>
              <Badge tone={canWrite ? "blue" : "grey"}>
                {canWrite ? "Ready" : "Read only"}
              </Badge>
            </header>
            <form
              className="card-pad form-grid"
              onSubmit={(event) => void onSubmit(event)}
            >
              {formError ? (
                <div className="banner warning field-span" role="alert">
                  {formError}
                </div>
              ) : null}

              <div className="field field-span">
                <label htmlFor="actual-kpi">KPI configuration *</label>
                <select
                  id="actual-kpi"
                  className={`control ${fieldErrors.kpiConfigurationId ? "invalid" : ""}`}
                  value={configurationId}
                  onChange={(event) =>
                    onConfigurationChange(event.target.value)
                  }
                  required
                  aria-invalid={Boolean(fieldErrors.kpiConfigurationId)}
                  aria-describedby="actual-kpi-error"
                >
                  <option value="">Select an active KPI configuration</option>
                  {(configurations.data ?? []).map((configuration) => (
                    <option key={configuration.id} value={configuration.id}>
                      {configurationLabel(configuration)}
                    </option>
                  ))}
                </select>
                <div className="error" id="actual-kpi-error" role="alert">
                  {fieldErrors.kpiConfigurationId ?? ""}
                </div>
              </div>

              {selectedConfiguration ? (
                <section
                  className="field-span information-card"
                  aria-label="Selected KPI"
                >
                  <dl className="detail-list">
                    <div>
                      <dt>Code</dt>
                      <dd className="mono">{selectedConfiguration.kpi.code}</dd>
                    </div>
                    <div>
                      <dt>Name</dt>
                      <dd>{selectedConfiguration.kpi.name}</dd>
                    </div>
                    <div>
                      <dt>Unit of measure</dt>
                      <dd>
                        {selectedConfiguration.kpi.unit}
                        {selectedConfiguration.currency
                          ? ` · ${selectedConfiguration.currency}`
                          : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Frequency</dt>
                      <dd>
                        {frequencyLabel(selectedConfiguration.kpi.frequency)}
                      </dd>
                    </div>
                    <div>
                      <dt>Owner</dt>
                      <dd>
                        {selectedConfiguration.owner
                          ? `${selectedConfiguration.owner.name} (${selectedConfiguration.owner.code})`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Department</dt>
                      <dd>
                        {selectedConfiguration.department
                          ? `${selectedConfiguration.department.name} (${selectedConfiguration.department.code})`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </section>
              ) : null}

              <div className="field">
                <label htmlFor="actual-period">Period *</label>
                <select
                  id="actual-period"
                  className={`control ${fieldErrors.period ? "invalid" : ""}`}
                  value={period}
                  onChange={(event) => onPeriodChange(event.target.value)}
                  required
                  disabled={
                    !configurationId ||
                    targets.loading ||
                    (!targets.loading && periods.length === 0)
                  }
                  aria-invalid={Boolean(fieldErrors.period)}
                  aria-describedby="actual-period-error"
                >
                  <option value="">
                    {!configurationId
                      ? "Select a KPI first"
                      : targets.loading
                        ? "Loading approved periods…"
                        : periods.length === 0
                          ? "No approved targets for this KPI"
                          : "Select a period"}
                  </option>
                  {periods.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
                <div className="error" id="actual-period-error" role="alert">
                  {fieldErrors.period ?? ""}
                </div>
                {configurationId &&
                !targets.loading &&
                !targets.error &&
                periods.length === 0 ? (
                  <p className="muted">
                    This KPI has no approved active targets. Approve a target
                    before submitting an actual.
                  </p>
                ) : null}
                {targets.error ? (
                  <p className="error" role="alert">
                    {targets.error.message}
                  </p>
                ) : null}
              </div>

              <div className="field">
                <label htmlFor="actual-value">Actual value *</label>
                <input
                  id="actual-value"
                  className={`control ${fieldErrors.actualValue ? "invalid" : ""}`}
                  name="actualValue"
                  value={actualValue}
                  onChange={(event) => {
                    setActualValue(event.target.value);
                    clearFieldError("actualValue");
                  }}
                  required
                  inputMode="decimal"
                  placeholder="e.g. 95.0000"
                  aria-invalid={Boolean(fieldErrors.actualValue)}
                  aria-describedby="actual-value-error"
                />
                <div className="error" id="actual-value-error" role="alert">
                  {fieldErrors.actualValue ?? ""}
                </div>
              </div>

              <div className="field">
                <label htmlFor="actual-target">Approved target</label>
                <input
                  id="actual-target"
                  className="control"
                  value={
                    selectedTarget
                      ? `${selectedTarget.targetValue}${
                          selectedConfiguration?.kpi.unit
                            ? ` ${selectedConfiguration.kpi.unit}`
                            : ""
                        } · v${selectedTarget.version}`
                      : "—"
                  }
                  readOnly
                />
                {selectedTarget?.minValue != null ||
                selectedTarget?.maxValue != null ? (
                  <p className="muted">
                    Tolerance band: {selectedTarget.minValue ?? "—"} to{" "}
                    {selectedTarget.maxValue ?? "—"}
                  </p>
                ) : null}
              </div>

              <div className="field field-span">
                <label htmlFor="actual-comments">Comments</label>
                <textarea
                  id="actual-comments"
                  className={`control ${fieldErrors.comments ? "invalid" : ""}`}
                  rows={4}
                  value={comments}
                  onChange={(event) => {
                    setComments(event.target.value);
                    clearFieldError("comments");
                  }}
                  placeholder="Describe the result, variance and corrective context."
                  aria-invalid={Boolean(fieldErrors.comments)}
                  aria-describedby="actual-comments-error"
                />
                <div className="error" id="actual-comments-error" role="alert">
                  {fieldErrors.comments ?? ""}
                </div>
              </div>

              <div className="field-span button-row">
                {canWrite ? (
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={
                      submitting ||
                      !configurationId ||
                      !period ||
                      !actualValue.trim()
                    }
                  >
                    <Send size={15} />
                    {submitting ? "Submitting…" : "Submit actual"}
                  </button>
                ) : (
                  <p className="muted" role="status">
                    Your role does not include <code>kpi-actual:write</code>, so
                    submission is unavailable.
                  </p>
                )}
              </div>
            </form>
          </section>

          <div className="stack">
            <section
              className={`card risk-preview ${
                result
                  ? result.risk
                    ? "risk-preview-missed"
                    : "risk-preview-met"
                  : ""
              }`}
              aria-live="polite"
            >
              <header className="card-head">
                <div>
                  <h2>Submission result</h2>
                  <p>
                    {result
                      ? `${result.code}`
                      : "Calculated after a successful submission"}
                  </p>
                </div>
                {result?.ragStatus ? (
                  <Badge tone={ragTone}>{result.ragStatus}</Badge>
                ) : result ? (
                  <Badge tone="grey">Informational</Badge>
                ) : (
                  <Badge tone="grey">Awaiting submit</Badge>
                )}
              </header>
              <div className="card-pad">
                {result && riskCopy ? (
                  <>
                    <span className={`feature-icon tone-${riskCopy.tone}`}>
                      {result.risk ? (
                        <TriangleAlert size={22} />
                      ) : (
                        <CheckCircle2 size={22} />
                      )}
                    </span>
                    <h3>{riskCopy.title}</h3>
                    <p className="muted">{riskCopy.body}</p>
                    <div className="metric-row">
                      <span>Target snapshot</span>
                      <strong>{result.targetValueSnapshot}</strong>
                    </div>
                    <div className="metric-row">
                      <span>Actual</span>
                      <strong>{result.actualValue}</strong>
                    </div>
                    <div className="metric-row">
                      <span>Variance</span>
                      <strong>{result.variance}</strong>
                    </div>
                    <div className="metric-row">
                      <span>Variance %</span>
                      <strong>
                        {result.variancePercentage == null
                          ? "—"
                          : `${result.variancePercentage}%`}
                      </strong>
                    </div>
                    <div className="metric-row">
                      <span>RAG</span>
                      <strong>{result.ragStatus ?? "None"}</strong>
                    </div>
                    <div className="metric-row">
                      <span>Approval status</span>
                      <strong>{result.approvalStatus}</strong>
                    </div>
                    {result.risk ? (
                      <>
                        <div className="metric-row">
                          <span>Risk code</span>
                          <strong className="mono">{result.risk.code}</strong>
                        </div>
                        <div className="metric-row">
                          <span>Risk class</span>
                          <strong>{result.risk.kpiRiskClass ?? "—"}</strong>
                        </div>
                      </>
                    ) : (
                      <div className="metric-row">
                        <span>Risk</span>
                        <strong>No risk</strong>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="muted">
                    Choose a KPI and period, enter the actual value, then
                    submit. The server calculates variance, RAG and any
                    automatic risk.
                  </p>
                )}
              </div>
            </section>

            {result ? (
              <KpiActualEvidencePanel
                kpiActualId={result.id}
                kpiActualCode={result.code}
                period={result.period}
                approvalStatus={result.approvalStatus}
                requiresEvidence={
                  selectedConfiguration?.requiresEvidence ?? false
                }
                returnTo="/kpis/actuals/new"
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
