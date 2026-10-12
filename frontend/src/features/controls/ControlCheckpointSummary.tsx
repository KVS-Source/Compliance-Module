import { Link } from "react-router-dom";
import { Badge } from "../../components/feedback/Badge";
import { useAuth } from "../../context/AuthContext";

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
  const { hasPermission } = useAuth();
  const canReadCheckpoints = hasPermission("checkpoints:read");

  return (
    <section className="card" data-testid="control-checkpoint-summary">
      <header className="card-head">
        <div>
          <h2>Checkpoint summary</h2>

        </div>
        <Badge>{active} active</Badge>
      </header>
      <div className="card-pad stack">
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
        {canReadCheckpoints ? (
          <Link
            className="btn btn-secondary"
            to="/compliance/checkpoints"
            data-testid="control-open-checkpoints"
          >
            Open Checkpoints
          </Link>
        ) : (
          <p className="muted">
            Checkpoint Register requires checkpoints:read.
          </p>
        )}
      </div>
    </section>
  );
}
