import { Lock } from "lucide-react";
import { Badge } from "../../components/feedback/Badge";
import type { ApprovalDecision, KpiApprovalEntry } from "../../types/api";
import { formatDateTime, named } from "./kpiFormatting";

const decisionTone = (decision: ApprovalDecision) => {
  switch (decision) {
    case "APPROVED":
      return "green" as const;
    case "REJECTED":
      return "red" as const;
    default:
      return "blue" as const;
  }
};

const decisionLabel = (decision: ApprovalDecision) =>
  decision.charAt(0) + decision.slice(1).toLowerCase();

export function KpiApprovalHistory({
  approvals,
  actualCode,
}: {
  approvals: KpiApprovalEntry[];
  actualCode: string;
}) {
  return (
    <section
      className="approval-history"
      aria-label={`Approval history for ${actualCode}`}
      data-testid="kpi-approval-history"
    >
      <header className="approval-history-head">
        <h3>Approval history</h3>
        <p className="muted">
          <Lock size={13} aria-hidden />{" "}
          <span data-testid="approval-history-append-only">
            This decision trail is append-only. Entries cannot be edited or
            deleted — the <code>kpi_approvals_append_only</code> database
            trigger rejects any update or delete, so the record stands as
            written.
          </span>
        </p>
      </header>

      {approvals.length === 0 ? (
        <p className="muted">
          No decisions have been recorded yet. This actual has been submitted
          but not yet approved or rejected.
        </p>
      ) : (
        <ol className="approval-history-list">
          {approvals.map((entry) => (
            <li key={entry.id}>
              <div className="approval-history-row">
                <Badge tone={decisionTone(entry.decision)}>
                  {decisionLabel(entry.decision)}
                </Badge>
                <span className="sr-only">
                  Decision {decisionLabel(entry.decision)}
                </span>
                <strong>{named(entry.reviewer, "Reviewer not recorded")}</strong>
                <time dateTime={entry.decidedAt}>
                  {formatDateTime(entry.decidedAt)}
                </time>
              </div>
              {entry.comments ? (
                <p className="approval-history-comment">{entry.comments}</p>
              ) : (
                <p className="muted approval-history-comment">
                  No comments recorded.
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
