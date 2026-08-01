import { CheckCircle2, TriangleAlert, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/feedback/Modal";
import { policyApi } from "../../services/policyApi";
import type { Policy, PolicyVersion } from "../../types/api";
import { policyDecisionError } from "../../utils/fieldErrors";
import {
  display,
  formatPolicyDate,
  named,
} from "./policyFormatting";
import { POLICY_EVIDENCE_GATE_HINT } from "../../utils/evidenceGateMessages";

export type PolicyDecisionKind = "submit" | "approve" | "reject" | "archive";

interface PolicyDecisionModalProps {
  kind: PolicyDecisionKind;
  policy: Pick<Policy, "id" | "code" | "title" | "lifecycleStatus">;
  version?: PolicyVersion | null;
  onClose: () => void;
  onCompleted: () => void;
}

const TITLES: Record<PolicyDecisionKind, string> = {
  submit: "Submit Policy Version",
  approve: "Approve Policy Version",
  reject: "Reject Policy Version",
  archive: "Archive Policy",
};

export function PolicyDecisionModal({
  kind,
  policy,
  version,
  onClose,
  onCompleted,
}: PolicyDecisionModalProps) {
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const permission =
    kind === "archive"
      ? "policies:write"
      : kind === "submit"
        ? "policies:submit"
        : "policies:approve";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setFieldError(null);
    try {
      if (kind === "archive") {
        await policyApi.archivePolicy(policy.id);
      } else if (!version) {
        setError("No Policy Version is selected for this action.");
        return;
      } else if (kind === "submit") {
        await policyApi.submitPolicyVersion(version.id);
      } else if (kind === "approve") {
        const trimmed = comments.trim();
        await policyApi.approvePolicyVersion(
          version.id,
          trimmed ? { comments: trimmed } : {},
        );
      } else {
        const trimmed = comments.trim();
        if (trimmed.length < 2) {
          setFieldError("Comments must be between 2 and 2000 characters.");
          return;
        }
        await policyApi.rejectPolicyVersion(version.id, {
          comments: trimmed,
        });
      }
      onCompleted();
    } catch (caught) {
      setError(policyDecisionError(caught, permission));
    } finally {
      setBusy(false);
    }
  };

  const isResubmit = kind === "submit" && version?.status === "REJECTED";

  return (
    <Modal
      title={
        isResubmit ? "Resubmit Policy Version" : TITLES[kind]
      }
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
            form="policy-decision-form"
            disabled={busy}
            data-testid={`policy-decision-${kind}-confirm`}
          >
            {busy ? (
              "Working…"
            ) : kind === "approve" ? (
              <>
                <CheckCircle2 size={15} /> Approve
              </>
            ) : kind === "reject" ? (
              <>
                <XCircle size={15} /> Reject
              </>
            ) : kind === "archive" ? (
              "Archive Policy"
            ) : isResubmit ? (
              "Resubmit"
            ) : (
              "Submit"
            )}
          </button>
        </>
      }
    >
      <form
        id="policy-decision-form"
        className="stack"
        onSubmit={(event) => void onSubmit(event)}
      >
        {error ? (
          <div
            className="banner warning"
            role="alert"
            data-testid="policy-decision-error"
          >
            {error}
          </div>
        ) : null}

        <p>
          <strong>
            {policy.code} · {policy.title}
          </strong>
        </p>

        {kind === "archive" ? (
          <div className="banner warning" role="status">
            <TriangleAlert size={15} aria-hidden /> Archival is terminal. Historical
            Versions remain readable. A Version still in SUBMITTED status may
            block archival. There is no unarchive action.
          </div>
        ) : null}

        {version && kind !== "archive" ? (
          <dl className="detail-list">
            <div>
              <dt>Version</dt>
              <dd className="mono">{version.version}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{version.status}</dd>
            </div>
            <div>
              <dt>Effective date</dt>
              <dd>{formatPolicyDate(version.effectiveDate)}</dd>
            </div>
            <div>
              <dt>Review date</dt>
              <dd>{formatPolicyDate(version.reviewDate)}</dd>
            </div>
            <div>
              <dt>Requested approver</dt>
              <dd>{named(version.requestedApprover, "Any eligible approver")}</dd>
            </div>
            <div>
              <dt>Requires Evidence</dt>
              <dd>{version.requiresEvidence ? "Yes" : "No"}</dd>
            </div>
          </dl>
        ) : null}

        {kind === "submit" ? (
          <p className="muted">
            After {isResubmit ? "resubmission" : "submission"}, Version content
            becomes locked. Further edits require rejection first
            {version?.requestedApprover
              ? `. The requested approver is ${named(version.requestedApprover)}.`
              : "."}
          </p>
        ) : null}

        {kind === "approve" ? (
          <>
            <p className="muted">
              Approving makes this Version the current approved Version and
              supersedes any previously approved Version.
            </p>
            {version?.requiresEvidence ? (
              <div
                className="banner warning"
                role="alert"
                data-testid="policy-evidence-gate-warning"
              >
                <TriangleAlert size={15} aria-hidden /> {POLICY_EVIDENCE_GATE_HINT}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="policy-approve-comments">
                Comments (optional)
              </label>
              <textarea
                id="policy-approve-comments"
                className="control"
                rows={3}
                maxLength={2000}
                value={comments}
                onChange={(event) => setComments(event.target.value)}
              />
            </div>
          </>
        ) : null}

        {kind === "reject" ? (
          <div className="field">
            <label htmlFor="policy-reject-comments">
              Rejection comments (required)
            </label>
            <textarea
              id="policy-reject-comments"
              className={`control ${fieldError ? "invalid" : ""}`}
              rows={4}
              minLength={2}
              maxLength={2000}
              required
              value={comments}
              onChange={(event) => {
                setComments(event.target.value);
                setFieldError(null);
              }}
              aria-invalid={Boolean(fieldError)}
              aria-describedby="policy-reject-comments-error"
            />
            <div
              className="error"
              id="policy-reject-comments-error"
              role="alert"
            >
              {fieldError ?? ""}
            </div>
            <p className="muted">
              Comments must be 2–2000 characters. Rejecting{" "}
              {display(version?.version, "this Version")} returns it to an
              editable REJECTED state.
            </p>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
