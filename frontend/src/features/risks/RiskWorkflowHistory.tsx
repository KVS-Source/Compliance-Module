import { CornerDownRight, Lock } from "lucide-react";
import { Badge } from "../../components/feedback/Badge";
import type {
  RiskReviewEntry,
  RiskTreatmentEntry,
  RiskTreatmentStatus,
} from "../../types/api";

const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
};

const named = (
  person: { code: string; name: string } | null,
  fallback: string,
) => (person ? `${person.name} (${person.code})` : fallback);

const treatmentTone = (status: RiskTreatmentStatus) => {
  switch (status) {
    case "COMPLETED":
      return "green" as const;
    case "CANCELLED":
      return "red" as const;
    case "IN_PROGRESS":
      return "blue" as const;
    default:
      return "grey" as const;
  }
};

const label = (value: string) =>
  value.charAt(0) + value.slice(1).toLowerCase().replaceAll("_", " ");

function AppendOnlyNote({ table, testId }: { table: string; testId: string }) {
  return (
    <p className="muted" data-testid={testId}>
      <Lock size={13} aria-hidden /> This trail is append-only. Entries cannot
      be edited or deleted — the <code>{table}</code> database trigger rejects
      any update or delete, so each entry stands as written.
    </p>
  );
}

export function RiskReviewHistory({
  reviews,
}: {
  reviews: RiskReviewEntry[];
}) {
  return (
    <section className="card" data-testid="risk-review-history">
      <header className="card-head">
        <div>
          <h2>Review history</h2>
          <AppendOnlyNote
            table="risk_reviews_append_only"
            testId="review-append-only-note"
          />
        </div>
        <Badge tone="grey">
          {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
        </Badge>
      </header>
      <div className="card-pad">
        {reviews.length === 0 ? (
          <p className="muted">
            No reviews have been recorded for this risk yet.
          </p>
        ) : (
          <ol className="approval-history-list">
            {reviews.map((review) => (
              <li key={review.id}>
                <div className="approval-history-row">
                  <strong>{named(review.reviewer, "Reviewer not recorded")}</strong>
                  <time dateTime={review.reviewedAt}>
                    {formatDateTime(review.reviewedAt)}
                  </time>
                  {review.likelihoodAtReview != null &&
                  review.impactAtReview != null ? (
                    <Badge tone="blue">
                      Reassessed {review.likelihoodAtReview}×
                      {review.impactAtReview}
                    </Badge>
                  ) : (
                    <Badge tone="grey">No reassessment</Badge>
                  )}
                </div>
                <p className="approval-history-comment">{review.comments}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export function RiskTreatmentHistory({
  treatments,
  onComplete,
  canTreat,
  busyId,
}: {
  treatments: RiskTreatmentEntry[];
  onComplete: (treatment: RiskTreatmentEntry) => void;
  canTreat: boolean;
  busyId: string | null;
}) {
  const supersededIds = new Set(
    treatments.map((entry) => entry.supersedesId).filter(Boolean) as string[],
  );

  return (
    <section className="card" data-testid="risk-treatment-history">
      <header className="card-head">
        <div>
          <h2>Treatment history</h2>
          <AppendOnlyNote
            table="risk_treatments_append_only"
            testId="treatment-append-only-note"
          />
          <p className="muted" data-testid="treatment-completion-note">
            Completing a treatment adds a <strong>new entry</strong> that
            supersedes the earlier one. Two entries for the same plan are a
            record of the plan and its completion, not a duplicate.
          </p>
        </div>
        <Badge tone="grey">
          {treatments.length} {treatments.length === 1 ? "entry" : "entries"}
        </Badge>
      </header>
      <div className="card-pad">
        {treatments.length === 0 ? (
          <p className="muted">
            No treatments have been recorded for this risk yet.
          </p>
        ) : (
          <ol className="approval-history-list">
            {treatments.map((treatment) => {
              const superseded = supersededIds.has(treatment.id);
              const completable =
                canTreat &&
                !superseded &&
                treatment.status !== "COMPLETED" &&
                treatment.status !== "CANCELLED";
              return (
                <li key={treatment.id}>
                  <div className="approval-history-row">
                    <Badge tone="purple">{label(treatment.strategy)}</Badge>
                    <Badge tone={treatmentTone(treatment.status)}>
                      {label(treatment.status)}
                    </Badge>
                    <span className="sr-only">
                      Treatment status {label(treatment.status)}
                    </span>
                    <time dateTime={treatment.recordedAt}>
                      {formatDateTime(treatment.recordedAt)}
                    </time>
                  </div>
                  {treatment.supersedesId ? (
                    <p className="muted approval-history-comment">
                      <CornerDownRight size={13} aria-hidden /> Completion entry
                      superseding the earlier plan — the original entry is kept
                      unchanged above.
                    </p>
                  ) : null}
                  <p className="approval-history-comment">{treatment.plan}</p>
                  <p className="muted approval-history-comment">
                    Owner {named(treatment.owner, "not assigned")} · Due{" "}
                    {treatment.dueDate ?? "not set"} · Recorded by{" "}
                    {named(treatment.recordedBy, "unknown")}
                    {treatment.completedAt
                      ? ` · Completed ${formatDateTime(treatment.completedAt)}`
                      : ""}
                  </p>
                  {treatment.effectivenessNotes ? (
                    <p className="approval-history-comment">
                      Effectiveness: {treatment.effectivenessNotes}
                    </p>
                  ) : null}
                  {completable ? (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={busyId === treatment.id}
                      aria-label={`Complete treatment recorded ${formatDateTime(treatment.recordedAt)}`}
                      onClick={() => onComplete(treatment)}
                    >
                      Mark complete
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
