import { RefreshCw } from "lucide-react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import type { CheckpointReview } from "../../types/api";
import {
  display,
  formatCheckpointDate,
  formatCheckpointDateTime,
  named,
  outcomeTone,
  statusLabel,
} from "./checkpointFormatting";

interface CheckpointLatestReviewProps {
  review: CheckpointReview | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}

export function CheckpointLatestReview({
  review,
  loading,
  error,
  onRetry,
}: CheckpointLatestReviewProps) {
  return (
    <section className="card" data-testid="checkpoint-latest-review">
      <header className="card-head">
        <div>
          <h2>Latest Review</h2>
          <p>
            Authoritative latest Review from GET …/latest-review. Observation
            and recommendation are visible here for readers with
            checkpoints:read.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onRetry}
          disabled={loading}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>
      <div className="card-pad">
        {loading ? (
          <div data-testid="checkpoint-latest-review-loading">
            <LoadingState label="Loading latest Review…" />
          </div>
        ) : error ? (
          <div data-testid="checkpoint-latest-review-error">
            <ErrorState error={error} />
            <button
              className="btn btn-secondary"
              type="button"
              onClick={onRetry}
            >
              Retry
            </button>
          </div>
        ) : !review ? (
          <p className="muted" data-testid="checkpoint-latest-review-empty">
            No Reviews have been submitted for this Checkpoint yet.
          </p>
        ) : (
          <dl className="detail-list" data-testid="checkpoint-latest-review-body">
            <div>
              <dt>Period</dt>
              <dd className="mono">{review.reviewPeriod}</dd>
            </div>
            <div>
              <dt>Review date</dt>
              <dd>{formatCheckpointDate(review.reviewDate)}</dd>
            </div>
            <div>
              <dt>Outcome</dt>
              <dd>
                <Badge tone={outcomeTone(review.outcome)}>
                  {statusLabel(review.outcome)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>Reviewer</dt>
              <dd>{named(review.reviewer)}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>{formatCheckpointDateTime(review.submittedAt)}</dd>
            </div>
            <div>
              <dt>Next review date</dt>
              <dd>{formatCheckpointDate(review.nextReviewDate)}</dd>
            </div>
            <div>
              <dt>Observation</dt>
              <dd style={{ whiteSpace: "pre-wrap" }}>
                {display(review.observation)}
              </dd>
            </div>
            <div>
              <dt>Recommendation</dt>
              <dd style={{ whiteSpace: "pre-wrap" }}>
                {display(review.recommendation)}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
