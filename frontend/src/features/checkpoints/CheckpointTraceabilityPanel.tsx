import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { useAuth } from "../../context/AuthContext";
import type { CheckpointTraceability } from "../../types/api";
import { versionStatusTone } from "../policies/policyFormatting";
import {
  formatCheckpointDate,
  lifecycleTone,
  named,
  outcomeTone,
  statusLabel,
} from "./checkpointFormatting";

interface CheckpointTraceabilityPanelProps {
  data: CheckpointTraceability | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}

export function CheckpointTraceabilityPanel({
  data,
  loading,
  error,
  onRetry,
}: CheckpointTraceabilityPanelProps) {
  const { hasPermission } = useAuth();
  const canReadControls = hasPermission("controls:read");
  const canReadPolicies = hasPermission("policies:read");

  return (
    <section className="card" data-testid="checkpoint-traceability">
      <header className="card-head">
        <div>
          <h2>Traceability</h2>
          <p>
            Parent Control and inherited Policy / Framework mappings. Evidence,
            Gap and CAPA links are not fabricated here.
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
      <div className="card-pad stack">
        {loading ? (
          <div data-testid="checkpoint-traceability-loading">
            <LoadingState label="Loading traceability…" />
          </div>
        ) : error ? (
          <div data-testid="checkpoint-traceability-error">
            <ErrorState error={error} />
            <button
              className="btn btn-secondary"
              type="button"
              onClick={onRetry}
            >
              Retry
            </button>
          </div>
        ) : !data ? (
          <p className="muted">No traceability data returned.</p>
        ) : (
          <>
            <div>
              <h3>Checkpoint</h3>
              <p>
                <span className="mono">{data.checkpoint.code}</span>{" "}
                <Badge tone={lifecycleTone(data.checkpoint.lifecycleStatus)}>
                  {statusLabel(data.checkpoint.lifecycleStatus)}
                </Badge>
                {" · "}
                {statusLabel(data.checkpoint.verificationFrequency)}
              </p>
            </div>

            <div>
              <h3>Parent Control</h3>
              {data.control ? (
                <p data-testid="checkpoint-traceability-control">
                  {canReadControls ? (
                    <Link to={`/compliance/controls/${data.control.id}`}>
                      {data.control.code}
                    </Link>
                  ) : (
                    <strong className="mono">{data.control.code}</strong>
                  )}{" "}
                  · {data.control.title}{" "}
                  <Badge tone={lifecycleTone(data.control.lifecycleStatus)}>
                    {statusLabel(data.control.lifecycleStatus)}
                  </Badge>
                </p>
              ) : (
                <p className="muted">No parent Control returned.</p>
              )}
              {data.control?.lifecycleStatus === "INACTIVE" ? (
                <p
                  className="muted"
                  data-testid="checkpoint-inactive-control-note"
                >
                  Parent Control is INACTIVE. An ACTIVE Checkpoint under an
                  INACTIVE Control is allowed.
                </p>
              ) : null}
            </div>

            <div>
              <h3>Latest Review summary</h3>
              {data.latestReview ? (
                <p>
                  Period{" "}
                  <span className="mono">{data.latestReview.reviewPeriod}</span>{" "}
                  ·{" "}
                  <Badge tone={outcomeTone(data.latestReview.outcome)}>
                    {statusLabel(data.latestReview.outcome)}
                  </Badge>{" "}
                  · Review date{" "}
                  {formatCheckpointDate(data.latestReview.reviewDate)} ·
                  Reviewer {named(data.latestReview.reviewer)}
                </p>
              ) : (
                <p className="muted">No latest Review.</p>
              )}
              <p className="muted">Total Reviews: {data.totalReviewCount}</p>
            </div>

            <div>
              <h3>Policy Version mappings</h3>
              {data.policyVersionMappings.active.length === 0 &&
              data.policyVersionMappings.historical.length === 0 ? (
                <p className="muted">No Policy Version mappings.</p>
              ) : (
                <ul data-testid="checkpoint-traceability-policies">
                  {[
                    ...data.policyVersionMappings.active,
                    ...data.policyVersionMappings.historical,
                  ].map((mapping) => (
                    <li key={mapping.id}>
                      {canReadPolicies ? (
                        <Link to={`/compliance/policies/${mapping.policyId}`}>
                          {mapping.policy.code}
                        </Link>
                      ) : (
                        <strong className="mono">{mapping.policy.code}</strong>
                      )}{" "}
                      · {mapping.policy.title} · v
                      <span className="mono">
                        {mapping.policyVersion.version}
                      </span>{" "}
                      <Badge
                        tone={versionStatusTone(mapping.policyVersion.status)}
                      >
                        {statusLabel(mapping.policyVersion.status)}
                      </Badge>{" "}
                      ({mapping.isActive ? "Active" : "Historical"})
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3>Framework mappings</h3>
              {data.frameworkMappings.active.length === 0 ? (
                <p className="muted">No active Framework mappings.</p>
              ) : (
                <ul>
                  {data.frameworkMappings.active.map((mapping) => (
                    <li key={mapping.id}>
                      {mapping.framework
                        ? `${mapping.framework.code} · ${mapping.framework.name}`
                        : mapping.frameworkId}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3>Framework Rule mappings</h3>
              {data.frameworkRuleMappings.active.length === 0 ? (
                <p className="muted">No active Framework Rule mappings.</p>
              ) : (
                <ul>
                  {data.frameworkRuleMappings.active.map((mapping) => (
                    <li key={mapping.id}>
                      {mapping.frameworkRule.code} ·{" "}
                      {mapping.frameworkRule.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
