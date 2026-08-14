import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import type { CheckpointReview, PageMeta } from "../../types/api";
import {
  display,
  formatCheckpointDate,
  formatCheckpointDateTime,
  named,
  outcomeTone,
  statusLabel,
} from "./checkpointFormatting";

interface CheckpointReviewHistoryProps {
  reviews: CheckpointReview[] | null;
  meta: PageMeta | null;
  loading: boolean;
  error: Error | null;
  page: number;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}

export function CheckpointReviewHistory({
  reviews,
  meta,
  loading,
  error,
  page,
  onPageChange,
  onRetry,
}: CheckpointReviewHistoryProps) {
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;

  return (
    <section className="card" data-testid="checkpoint-review-history">
      <header className="card-head">
        <div>
          <h2>Review history</h2>
          <p>
            Append-only Reviews for this Checkpoint. Observation and
            recommendation are visible to readers; they are never shown on
            Register rows or in audit metadata.
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
          <div data-testid="checkpoint-review-history-loading">
            <LoadingState label="Loading Review history…" />
          </div>
        ) : error ? (
          <div data-testid="checkpoint-review-history-error">
            <ErrorState error={error} />
            <button
              className="btn btn-secondary"
              type="button"
              onClick={onRetry}
            >
              Retry
            </button>
          </div>
        ) : !reviews || reviews.length === 0 ? (
          <p className="muted">No Reviews have been recorded yet.</p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <caption>Checkpoint Review history</caption>
                <thead>
                  <tr>
                    <th scope="col">Period</th>
                    <th scope="col">Review date</th>
                    <th scope="col">Outcome</th>
                    <th scope="col">Reviewer</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Observation</th>
                    <th scope="col">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => (
                    <tr key={review.id} data-testid={`checkpoint-review-row-${review.id}`}>
                      <td className="mono">{review.reviewPeriod}</td>
                      <td>{formatCheckpointDate(review.reviewDate)}</td>
                      <td>
                        <Badge tone={outcomeTone(review.outcome)}>
                          {statusLabel(review.outcome)}
                        </Badge>
                      </td>
                      <td>{named(review.reviewer)}</td>
                      <td>
                        <span className="mono">
                          {formatCheckpointDateTime(review.submittedAt)}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "pre-wrap", maxWidth: 280 }}>
                        {display(review.observation)}
                      </td>
                      <td style={{ whiteSpace: "pre-wrap", maxWidth: 240 }}>
                        {display(review.recommendation)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span>
                Showing {total ? (page - 1) * (meta?.pageSize ?? 20) + 1 : 0}–
                {Math.min(page * (meta?.pageSize ?? 20), total)} of {total}
              </span>
              <div className="pagination">
                <button
                  className="page-btn"
                  type="button"
                  aria-label="Previous review page"
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
                  aria-label="Next review page"
                  disabled={page >= totalPages}
                  onClick={() =>
                    onPageChange(Math.min(totalPages, page + 1))
                  }
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
