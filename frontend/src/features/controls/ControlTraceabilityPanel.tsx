import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { useAuth } from "../../context/AuthContext";
import type { ControlTraceability } from "../../types/api";
import { versionStatusTone } from "../policies/policyFormatting";
import { named, statusLabel } from "./controlFormatting";

interface ControlTraceabilityPanelProps {
  data: ControlTraceability | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}

export function ControlTraceabilityPanel({
  data,
  loading,
  error,
  onRetry,
}: ControlTraceabilityPanelProps) {
  const { hasPermission } = useAuth();
  const canReadPolicies = hasPermission("policies:read");

  return (
    <section className="card" data-testid="control-traceability">
      <header className="card-head">
        <div>
          <h2>Traceability</h2>

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
          <div data-testid="control-traceability-loading">
            <LoadingState label="Loading traceability…" />
          </div>
        ) : error ? (
          <div data-testid="control-traceability-error">
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
              <h3>Control</h3>
              <p>
                <span className="mono">{data.control.code}</span>{" "}
                <Badge>{statusLabel(data.control.lifecycleStatus)}</Badge>
                {" · "}
                Owner {named(data.control.owner)}
              </p>
            </div>

            <div>
              <h3>Policy Version mappings</h3>
              {data.policyVersionMappings.length === 0 ? (
                <p className="muted">No Policy Version mappings.</p>
              ) : (
                <ul data-testid="control-traceability-policies">
                  {data.policyVersionMappings.map((mapping) => (
                    <li key={mapping.id}>
                      {canReadPolicies ? (
                        <Link to={`/compliance/policies/${mapping.policyId}`}>
                          {mapping.policy.code}
                        </Link>
                      ) : (
                        <strong className="mono">{mapping.policy.code}</strong>
                      )}{" "}
                      · {mapping.policy.title} · v
                      <span className="mono">{mapping.policyVersion.version}</span>{" "}
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
              {data.frameworkMappings.filter((m) => m.isActive).length === 0 ? (
                <p className="muted">No active Framework mappings.</p>
              ) : (
                <ul>
                  {data.frameworkMappings
                    .filter((mapping) => mapping.isActive)
                    .map((mapping) => (
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
              {data.frameworkRuleMappings.filter((m) => m.isActive).length ===
              0 ? (
                <p className="muted">No active Framework Rule mappings.</p>
              ) : (
                <ul>
                  {data.frameworkRuleMappings
                    .filter((mapping) => mapping.isActive)
                    .map((mapping) => (
                      <li key={mapping.id}>
                        {mapping.frameworkRule.code} ·{" "}
                        {mapping.frameworkRule.title}
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <div>
              <h3>Checkpoint counts</h3>
              <p>
                Active {data.checkpointCounts.active} · Inactive{" "}
                {data.checkpointCounts.inactive} · Archived{" "}
                {data.checkpointCounts.archived}
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
