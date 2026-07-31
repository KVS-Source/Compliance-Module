import { Badge } from "../../components/feedback/Badge";

interface ControlCheckpointSummaryProps {
  active: number;
  inactive: number;
  archived: number;
}

export function ControlCheckpointSummary({
  active,
  inactive,
  archived,
}: ControlCheckpointSummaryProps) {
  return (
    <section className="card" data-testid="control-checkpoint-summary">
      <header className="card-head">
        <div>
          <h2>Checkpoint summary</h2>
          <p>
            Counts returned by the Control API. Checkpoint UI remains In
            Development, so these values are labels only.
          </p>
        </div>
        <Badge>{active} active</Badge>
      </header>
      <div className="card-pad">
        <dl className="detail-list">
          <div>
            <dt>Active</dt>
            <dd data-testid="control-checkpoint-active">{active}</dd>
          </div>
          <div>
            <dt>Inactive</dt>
            <dd data-testid="control-checkpoint-inactive">{inactive}</dd>
          </div>
          <div>
            <dt>Archived</dt>
            <dd data-testid="control-checkpoint-archived">{archived}</dd>
          </div>
        </dl>
        <p className="muted">
          No Checkpoint links or mutations are available in this slice.
        </p>
      </div>
    </section>
  );
}
