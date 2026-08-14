import { Save, TriangleAlert } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/feedback/Modal";
import { useTenant } from "../../context/TenantContext";
import { checkpointApi } from "../../services/checkpointApi";
import type {
  CheckpointDetail,
  CheckpointOutcome,
  CheckpointReview,
} from "../../types/api";
import {
  checkpointReviewError,
  type FieldErrors,
} from "../../utils/fieldErrors";
import { CHECKPOINT_EVIDENCE_GATE_HINT } from "../../utils/evidenceGateMessages";
import {
  OUTCOME_OPTIONS,
  reviewPeriodFormatHelp,
} from "./checkpointFormatting";

interface CheckpointReviewModalProps {
  checkpoint: CheckpointDetail;
  onClose: () => void;
  onSubmitted: (review: CheckpointReview) => void;
}

interface FormState {
  reviewPeriod: string;
  reviewDate: string;
  outcome: CheckpointOutcome;
  observation: string;
  recommendation: string;
  nextReviewDate: string;
}

const emptyForm = (): FormState => ({
  reviewPeriod: "",
  reviewDate: "",
  outcome: "PASS",
  observation: "",
  recommendation: "",
  nextReviewDate: "",
});

const optionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const optionalId = (value: string) => (value.trim() ? value.trim() : null);

export function CheckpointReviewModal({
  checkpoint,
  onClose,
  onSubmitted,
}: CheckpointReviewModalProps) {
  const { contextVersion } = useTenant();
  const [values, setValues] = useState<FormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues(emptyForm());
    setFieldErrors({});
    setFormError(null);
  }, [contextVersion]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const requestClose = () => {
    if (saving) return;
    const hasText =
      values.reviewPeriod.trim() ||
      values.observation.trim() ||
      values.recommendation.trim() ||
      values.reviewDate ||
      values.nextReviewDate;
    if (hasText && !window.confirm("Discard unsaved Review?")) return;
    onClose();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFieldErrors({});
    setFormError(null);

    if (checkpoint.lifecycleStatus !== "ACTIVE") {
      setFormError(
        "Checkpoint Reviews require an ACTIVE Checkpoint. Activate the Checkpoint before submitting a Review.",
      );
      setSaving(false);
      return;
    }
    if (!values.reviewPeriod.trim()) {
      setFieldErrors({ reviewPeriod: "Review period is required." });
      setSaving(false);
      return;
    }
    if (!values.reviewDate.trim()) {
      setFieldErrors({ reviewDate: "Review date is required." });
      setSaving(false);
      return;
    }
    if (
      (values.outcome === "PARTIAL" || values.outcome === "FAIL") &&
      values.observation.trim().length < 2
    ) {
      setFieldErrors({
        observation:
          "PARTIAL and FAIL Reviews require an observation of at least 2 characters.",
      });
      setSaving(false);
      return;
    }
    if (
      values.nextReviewDate &&
      values.nextReviewDate <= values.reviewDate
    ) {
      setFieldErrors({
        nextReviewDate: "nextReviewDate must be a real date after reviewDate.",
      });
      setSaving(false);
      return;
    }

    try {
      const created = await checkpointApi.createCheckpointReview(checkpoint.id, {
        reviewPeriod: values.reviewPeriod.trim(),
        reviewDate: values.reviewDate.trim(),
        outcome: values.outcome,
        observation: optionalText(values.observation),
        recommendation: optionalText(values.recommendation),
        nextReviewDate: optionalId(values.nextReviewDate),
      });
      onSubmitted(created);
    } catch (error) {
      const mapped = checkpointReviewError(error, "checkpoints:review");
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
      // Preserve form values on duplicate-period and other field errors.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Submit Checkpoint Review"
      onClose={requestClose}
      wide
      footer={
        <>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={requestClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="checkpoint-review-form"
            disabled={saving}
            data-testid="checkpoint-review-save"
          >
            <Save size={15} /> {saving ? "Submitting…" : "Submit Review"}
          </button>
        </>
      }
    >
      <form
        id="checkpoint-review-form"
        className="stack"
        onSubmit={(event) => void onSubmit(event)}
      >
        {formError ? (
          <div
            className="banner warning"
            role="alert"
            data-testid="checkpoint-review-error"
          >
            {formError}
          </div>
        ) : null}

        <div className="banner warning" role="status">
          <TriangleAlert size={15} aria-hidden /> Reviews are append-only.
          Duplicate review periods are rejected. Observation and recommendation
          are never written to audit metadata or toast messages.
        </div>

        <p className="muted">
          Checkpoint <span className="mono">{checkpoint.code}</span> · Frequency{" "}
          {checkpoint.verificationFrequency}.
        </p>

        {checkpoint.evidenceRequired ? (
          <div
            className="banner warning"
            role="status"
            data-testid="checkpoint-evidence-gate-hint"
          >
            <TriangleAlert size={15} aria-hidden /> {CHECKPOINT_EVIDENCE_GATE_HINT}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="checkpoint-review-period">Review period</label>
          <input
            id="checkpoint-review-period"
            className={`control ${fieldErrors.reviewPeriod ? "invalid" : ""}`}
            value={values.reviewPeriod}
            maxLength={48}
            required
            onChange={(event) => setField("reviewPeriod", event.target.value)}
            aria-invalid={Boolean(fieldErrors.reviewPeriod)}
            data-testid="checkpoint-review-period"
          />
          <p className="muted">
            {reviewPeriodFormatHelp(checkpoint.verificationFrequency)}
          </p>
          {fieldErrors.reviewPeriod ? (
            <div className="error" role="alert">
              {fieldErrors.reviewPeriod}
            </div>
          ) : null}
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="checkpoint-review-date">Review date</label>
            <input
              id="checkpoint-review-date"
              className={`control ${fieldErrors.reviewDate ? "invalid" : ""}`}
              type="date"
              value={values.reviewDate}
              required
              onChange={(event) => setField("reviewDate", event.target.value)}
              aria-invalid={Boolean(fieldErrors.reviewDate)}
              data-testid="checkpoint-review-date"
            />
            {fieldErrors.reviewDate ? (
              <div className="error" role="alert">
                {fieldErrors.reviewDate}
              </div>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="checkpoint-review-outcome">Outcome</label>
            <select
              id="checkpoint-review-outcome"
              className="control"
              value={values.outcome}
              onChange={(event) =>
                setField("outcome", event.target.value as CheckpointOutcome)
              }
              data-testid="checkpoint-review-outcome"
            >
              {OUTCOME_OPTIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="checkpoint-review-observation">
            Observation
            {values.outcome === "PARTIAL" || values.outcome === "FAIL"
              ? " (required)"
              : " (optional)"}
          </label>
          <textarea
            id="checkpoint-review-observation"
            className={`control ${fieldErrors.observation ? "invalid" : ""}`}
            rows={4}
            maxLength={10000}
            value={values.observation}
            onChange={(event) => setField("observation", event.target.value)}
            aria-invalid={Boolean(fieldErrors.observation)}
            data-testid="checkpoint-review-observation"
          />
          {fieldErrors.observation ? (
            <div className="error" role="alert">
              {fieldErrors.observation}
            </div>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="checkpoint-review-recommendation">
            Recommendation (optional)
          </label>
          <textarea
            id="checkpoint-review-recommendation"
            className={`control ${fieldErrors.recommendation ? "invalid" : ""}`}
            rows={3}
            maxLength={5000}
            value={values.recommendation}
            onChange={(event) => setField("recommendation", event.target.value)}
            data-testid="checkpoint-review-recommendation"
          />
        </div>

        <div className="field">
          <label htmlFor="checkpoint-review-next">
            Next review date (optional)
          </label>
          <input
            id="checkpoint-review-next"
            className={`control ${fieldErrors.nextReviewDate ? "invalid" : ""}`}
            type="date"
            value={values.nextReviewDate}
            onChange={(event) => setField("nextReviewDate", event.target.value)}
            data-testid="checkpoint-review-next"
          />
          {fieldErrors.nextReviewDate ? (
            <div className="error" role="alert">
              {fieldErrors.nextReviewDate}
            </div>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
