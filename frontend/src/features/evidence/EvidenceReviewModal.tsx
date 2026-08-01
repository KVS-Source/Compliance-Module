import { CheckCircle2, TriangleAlert, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/feedback/Modal";
import { ApiError } from "../../services/apiClient";
import { evidenceApi } from "../../services/evidenceApi";
import type { EvidenceDetail } from "../../types/api";
import { evidenceWorkflowError } from "../../utils/fieldErrors";

export type EvidenceReviewKind = "approve" | "reject";

const REASON_MIN = 2;
const REASON_MAX = 2000;

interface EvidenceReviewModalProps {
  kind: EvidenceReviewKind;
  evidence: { id: string; code: string; title: string };
  /** Proactive hint only; the API is the authority on maker-checker. */
  selfReviewHint?: boolean;
  onClose: () => void;
  onCompleted: (detail: EvidenceDetail) => void;
  onConflict: (message: string) => void;
}

export function EvidenceReviewModal({
  kind,
  evidence,
  selfReviewHint,
  onClose,
  onCompleted,
  onConflict,
}: EvidenceReviewModalProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const trimmed = text.trim();
    if (kind === "reject" && (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX)) {
      setFieldError(
        `A rejection reason of ${REASON_MIN}–${REASON_MAX} characters is required.`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    setFieldError(null);
    try {
      // Exactly one mutation, awaited before any success is reported.
      const detail =
        kind === "approve"
          ? await evidenceApi.approveEvidence(evidence.id, {
              ...(trimmed ? { comment: trimmed } : {}),
            })
          : await evidenceApi.rejectEvidence(evidence.id, { reason: trimmed });
      onCompleted(detail);
    } catch (caught) {
      const mapped = evidenceWorkflowError(caught, "evidence:review");
      if (mapped.fieldErrors.reason) {
        setFieldError(mapped.fieldErrors.reason);
        setBusy(false);
        return;
      }
      const message =
        mapped.formError ?? "The review decision could not be recorded.";
      const stale =
        caught instanceof ApiError &&
        (caught.code === "EVIDENCE_INVALID_STATE" ||
          caught.code === "EVIDENCE_ARCHIVED" ||
          caught.code === "EVIDENCE_NOT_FOUND");
      if (stale) {
        // The queue row is out of date; close and let the caller reload.
        onConflict(message);
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={kind === "approve" ? "Approve Evidence" : "Reject Evidence"}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="evidence-review-form"
            disabled={busy}
            data-testid={`evidence-review-${kind}-confirm`}
          >
            {busy ? (
              "Working…"
            ) : kind === "approve" ? (
              <>
                <CheckCircle2 size={15} /> Approve Evidence
              </>
            ) : (
              <>
                <XCircle size={15} /> Reject Evidence
              </>
            )}
          </button>
        </>
      }
    >
      <form
        id="evidence-review-form"
        className="stack"
        onSubmit={(event) => void onSubmit(event)}
      >
        {error ? (
          <div
            className="banner warning"
            role="alert"
            data-testid="evidence-review-error"
          >
            {error}
          </div>
        ) : null}

        {selfReviewHint ? (
          <div
            className="banner warning"
            role="status"
            data-testid="evidence-self-review-hint"
          >
            <TriangleAlert size={15} aria-hidden /> You created, uploaded or
            submitted this Evidence. The API enforces maker-checker and will
            reject this decision.
          </div>
        ) : null}

        <p>
          <strong>
            {evidence.code} · {evidence.title}
          </strong>
        </p>

        {kind === "approve" ? (
          <div className="field">
            <label htmlFor="evidence-approve-comment">Comment (optional)</label>
            <textarea
              id="evidence-approve-comment"
              className="control"
              rows={3}
              maxLength={REASON_MAX}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <p className="muted">
              Approving makes this Evidence available as approved compliance
              Evidence. A comment must be 2–2000 characters when provided.
            </p>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="evidence-reject-reason">
              Rejection reason (required)
            </label>
            <textarea
              id="evidence-reject-reason"
              className={`control ${fieldError ? "invalid" : ""}`}
              rows={4}
              required
              minLength={REASON_MIN}
              maxLength={REASON_MAX}
              value={text}
              aria-invalid={Boolean(fieldError)}
              aria-describedby="evidence-reject-reason-error"
              onChange={(event) => {
                setText(event.target.value);
                setFieldError(null);
              }}
              data-testid="evidence-reject-reason"
            />
            <div
              className="error"
              id="evidence-reject-reason-error"
              role="alert"
            >
              {fieldError ?? ""}
            </div>
            <p className="muted">
              Rejection returns the Evidence to an editable REJECTED state. There
              is no resubmit transition — a replacement Evidence supersedes it.
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}
