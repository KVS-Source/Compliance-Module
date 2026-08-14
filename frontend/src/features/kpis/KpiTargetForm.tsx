import { Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/feedback/Modal";
import { kpiApi } from "../../services/kpiApi";
import type {
  CreateKpiTargetInput,
  KpiConfiguration,
  KpiTarget,
} from "../../types/api";
import { kpiTargetError, type FieldErrors } from "../../utils/fieldErrors";
import { suggestedTargetCode } from "./kpiFormatting";

export type TargetFormMode = "create" | "edit" | "version";

interface FormState {
  code: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  targetValue: string;
  minValue: string;
  maxValue: string;
  effectiveFrom: string;
  effectiveTo: string;
}

const emptyState = (): FormState => ({
  code: "",
  period: "",
  periodStart: "",
  periodEnd: "",
  targetValue: "",
  minValue: "",
  maxValue: "",
  effectiveFrom: "",
  effectiveTo: "",
});

const stateFrom = (target: KpiTarget): FormState => ({
  code: target.code,
  period: target.period,
  periodStart: target.periodStart,
  periodEnd: target.periodEnd,
  targetValue: target.targetValue,
  minValue: target.minValue ?? "",
  maxValue: target.maxValue ?? "",
  effectiveFrom: target.effectiveFrom,
  effectiveTo: target.effectiveTo ?? "",
});

const orNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const TITLES: Record<TargetFormMode, string> = {
  create: "New draft target",
  edit: "Edit target",
  version: "Create new target version",
};

interface Props {
  mode: TargetFormMode;
  configuration: KpiConfiguration;
  target: KpiTarget | null;
  onClose: () => void;
  onSaved: (target: KpiTarget, mode: TargetFormMode) => void;
}

export function KpiTargetForm({
  mode,
  configuration,
  target,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(() => {
    if (mode === "edit" && target) return stateFrom(target);
    if (mode === "version" && target) {
      // Inherit the approved numbers; the code must be new and unique.
      return { ...stateFrom(target), code: "" };
    }
    return emptyState();
  });
  const [codeTouched, setCodeTouched] = useState(mode === "edit");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const exactTarget = configuration.kpi.direction === "TARGET_EXACT";

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  /**
   * The API requires a client-supplied target code. Rather than leave a
   * required field empty, suggest a consistent one from the KPI and period
   * until the user edits it themselves.
   */
  const onPeriodChange = (value: string) => {
    setForm((current) => ({
      ...current,
      period: value,
      code: codeTouched
        ? current.code
        : suggestedTargetCode(configuration.kpi.code, value),
    }));
    setFieldErrors((current) => {
      if (!current.period && !current.code) return current;
      const next = { ...current };
      delete next.period;
      delete next.code;
      return next;
    });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      let saved: KpiTarget;
      if (mode === "create") {
        const payload: CreateKpiTargetInput = {
          kpiConfigurationId: configuration.id,
          code: form.code.trim(),
          period: form.period.trim(),
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          targetValue: form.targetValue.trim(),
          minValue: exactTarget ? orNull(form.minValue) : null,
          maxValue: exactTarget ? orNull(form.maxValue) : null,
          effectiveFrom: form.effectiveFrom,
          effectiveTo: orNull(form.effectiveTo),
        };
        saved = await kpiApi.createTarget(payload);
      } else if (mode === "edit" && target) {
        saved = await kpiApi.updateTarget(target.id, {
          code: form.code.trim(),
          period: form.period.trim(),
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          targetValue: form.targetValue.trim(),
          minValue: exactTarget ? orNull(form.minValue) : null,
          maxValue: exactTarget ? orNull(form.maxValue) : null,
          effectiveFrom: form.effectiveFrom,
          effectiveTo: orNull(form.effectiveTo),
        });
      } else if (target) {
        saved = await kpiApi.createTargetVersion(target.id, {
          code: form.code.trim(),
          period: form.period.trim(),
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          targetValue: form.targetValue.trim(),
          minValue: exactTarget ? orNull(form.minValue) : null,
          maxValue: exactTarget ? orNull(form.maxValue) : null,
          effectiveFrom: form.effectiveFrom,
          effectiveTo: orNull(form.effectiveTo),
        });
      } else {
        throw new Error("No target selected");
      }
      onSaved(saved, mode);
    } catch (error) {
      const mapped = kpiTargetError(error);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSaving(false);
    }
  };

  const errorFor = (key: string) => fieldErrors[key] ?? "";

  return (
    <Modal
      title={TITLES[mode]}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="kpi-target-form"
            disabled={
              saving ||
              !form.code.trim() ||
              !form.period.trim() ||
              !form.periodStart ||
              !form.periodEnd ||
              !form.targetValue.trim() ||
              !form.effectiveFrom
            }
          >
            <Save size={15} />
            {saving ? "Saving…" : TITLES[mode]}
          </button>
        </>
      }
    >
      <form
        id="kpi-target-form"
        className="form-grid"
        onSubmit={(event) => void onSubmit(event)}
      >
        {formError ? (
          <div className="banner warning field-span" role="alert">
            {formError}
          </div>
        ) : null}

        {mode === "version" ? (
          <p className="field-span muted">
            Approved targets are immutable. This creates version{" "}
            {(target?.version ?? 1) + 1} as a new draft and marks version{" "}
            {target?.version} superseded. The original numbers are preserved.
          </p>
        ) : null}

        <div className="field field-span">
          <label htmlFor="target-kpi">KPI configuration</label>
          <input
            id="target-kpi"
            className="control"
            value={`${configuration.kpi.code} · ${configuration.kpi.name} (${configuration.kpi.unit})`}
            readOnly
          />
        </div>

        <div className="field">
          <label htmlFor="target-period">Period *</label>
          <input
            id="target-period"
            className={`control ${errorFor("period") ? "invalid" : ""}`}
            value={form.period}
            onChange={(event) => onPeriodChange(event.target.value)}
            required
            maxLength={64}
            placeholder="e.g. FY26-27 Q1"
            aria-invalid={Boolean(errorFor("period"))}
            aria-describedby="target-period-error"
          />
          <div className="error" id="target-period-error" role="alert">
            {errorFor("period")}
          </div>
        </div>

        <div className="field">
          <label htmlFor="target-code">Target code *</label>
          <input
            id="target-code"
            className={`control ${errorFor("code") ? "invalid" : ""}`}
            value={form.code}
            onChange={(event) => {
              setCodeTouched(true);
              set("code", event.target.value);
            }}
            required
            maxLength={64}
            aria-invalid={Boolean(errorFor("code"))}
            aria-describedby="target-code-error target-code-help"
          />
          <div className="error" id="target-code-error" role="alert">
            {errorFor("code")}
          </div>
          <p className="muted" id="target-code-help">
            Suggested from the KPI and period, and unique within this Company.
            Edit it if your Company uses a different scheme.
          </p>
        </div>

        <div className="field">
          <label htmlFor="target-period-start">Period start *</label>
          <input
            id="target-period-start"
            className={`control ${errorFor("periodStart") ? "invalid" : ""}`}
            type="date"
            value={form.periodStart}
            onChange={(event) => set("periodStart", event.target.value)}
            required
            aria-invalid={Boolean(errorFor("periodStart"))}
            aria-describedby="target-period-start-error"
          />
          <div className="error" id="target-period-start-error" role="alert">
            {errorFor("periodStart")}
          </div>
        </div>

        <div className="field">
          <label htmlFor="target-period-end">Period end *</label>
          <input
            id="target-period-end"
            className={`control ${errorFor("periodEnd") ? "invalid" : ""}`}
            type="date"
            value={form.periodEnd}
            onChange={(event) => set("periodEnd", event.target.value)}
            required
            aria-invalid={Boolean(errorFor("periodEnd"))}
            aria-describedby="target-period-end-error"
          />
          <div className="error" id="target-period-end-error" role="alert">
            {errorFor("periodEnd")}
          </div>
        </div>

        <div className="field">
          <label htmlFor="target-value">
            Target value * <span className="muted">({configuration.kpi.unit})</span>
          </label>
          <input
            id="target-value"
            className={`control ${errorFor("targetValue") ? "invalid" : ""}`}
            value={form.targetValue}
            onChange={(event) => set("targetValue", event.target.value)}
            required
            inputMode="decimal"
            placeholder="e.g. 95.0000"
            aria-invalid={Boolean(errorFor("targetValue"))}
            aria-describedby="target-value-error"
          />
          <div className="error" id="target-value-error" role="alert">
            {errorFor("targetValue")}
          </div>
        </div>

        {exactTarget ? (
          <>
            <div className="field">
              <label htmlFor="target-min">Minimum acceptable value</label>
              <input
                id="target-min"
                className={`control ${errorFor("minValue") ? "invalid" : ""}`}
                value={form.minValue}
                onChange={(event) => set("minValue", event.target.value)}
                inputMode="decimal"
                aria-invalid={Boolean(errorFor("minValue"))}
                aria-describedby="target-min-error"
              />
              <div className="error" id="target-min-error" role="alert">
                {errorFor("minValue")}
              </div>
            </div>
            <div className="field">
              <label htmlFor="target-max">Maximum acceptable value</label>
              <input
                id="target-max"
                className={`control ${errorFor("maxValue") ? "invalid" : ""}`}
                value={form.maxValue}
                onChange={(event) => set("maxValue", event.target.value)}
                inputMode="decimal"
                aria-invalid={Boolean(errorFor("maxValue"))}
                aria-describedby="target-max-error"
              />
              <div className="error" id="target-max-error" role="alert">
                {errorFor("maxValue")}
              </div>
            </div>
            <p className="field-span muted">
              This KPI uses an exact target. Set both bounds for a tolerance
              band, or leave both empty to require exact equality.
            </p>
          </>
        ) : null}

        <div className="field">
          <label htmlFor="target-effective-from">Effective from *</label>
          <input
            id="target-effective-from"
            className={`control ${errorFor("effectiveFrom") ? "invalid" : ""}`}
            type="date"
            value={form.effectiveFrom}
            onChange={(event) => set("effectiveFrom", event.target.value)}
            required
            aria-invalid={Boolean(errorFor("effectiveFrom"))}
            aria-describedby="target-effective-from-error"
          />
          <div className="error" id="target-effective-from-error" role="alert">
            {errorFor("effectiveFrom")}
          </div>
        </div>

        <div className="field">
          <label htmlFor="target-effective-to">Effective to</label>
          <input
            id="target-effective-to"
            className={`control ${errorFor("effectiveTo") ? "invalid" : ""}`}
            type="date"
            value={form.effectiveTo}
            onChange={(event) => set("effectiveTo", event.target.value)}
            aria-invalid={Boolean(errorFor("effectiveTo"))}
            aria-describedby="target-effective-to-error"
          />
          <div className="error" id="target-effective-to-error" role="alert">
            {errorFor("effectiveTo")}
          </div>
        </div>
      </form>
    </Modal>
  );
}
