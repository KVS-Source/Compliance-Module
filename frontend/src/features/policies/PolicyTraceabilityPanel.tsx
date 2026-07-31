import { RefreshCw } from "lucide-react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import type { PolicyTraceability } from "../../types/api";
import {
  display,
  named,
  statusLabel,
  versionStatusTone,
} from "./policyFormatting";

interface PolicyTraceabilityPanelProps {
  data: PolicyTraceability | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}

export function PolicyTraceabilityPanel({
  data,
  loading,
  error,
  onRetry,
}: PolicyTraceabilityPanelProps) {
  return (
    <section className="card" data-testid="policy-traceability">
      <header className="card-head">
        <div>
          <h2>Traceability</h2>
          <p>
            Focus Version, Framework mappings and linked Controls returned by
            the Policy API. Control UI routes remain In Development.
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
          <div data-testid="policy-traceability-loading">
            <LoadingState label="Loading traceability…" />
          </div>
        ) : error ? (
          <div data-testid="policy-traceability-error">
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
              <h3>Focus Version</h3>
              {data.focusVersion ? (
                <p>
                  <span className="mono">{data.focusVersion.version}</span>{" "}
                  <Badge tone={versionStatusTone(data.focusVersion.status)}>
                    {statusLabel(data.focusVersion.status)}
                  </Badge>
                  {" · "}
                  Owner {named(data.policy.owner)}
                </p>
              ) : (
                <p className="muted">No focus Version available.</p>
              )}
            </div>

            <div>
              <h3>Framework mappings on focus Version</h3>
              {data.focusVersion &&
              data.focusVersion.frameworks.filter((m) => m.isActive).length >
                0 ? (
                <ul>
                  {data.focusVersion.frameworks
                    .filter((mapping) => mapping.isActive)
                    .map((mapping) => (
                      <li key={mapping.id}>
                        {mapping.framework
                          ? `${mapping.framework.code} · ${mapping.framework.name}`
                          : mapping.frameworkId}
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="muted">No active Framework mappings.</p>
              )}
            </div>

            <div>
              <h3>Linked Controls</h3>
              {data.controlMappings.length === 0 ? (
                <p className="muted">
                  No active Control mappings on the focus Version.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <caption>Controls linked to the focus Version</caption>
                    <thead>
                      <tr>
                        <th scope="col">Control</th>
                        <th scope="col">Lifecycle</th>
                        <th scope="col">Mapping</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.controlMappings.map((mapping) => (
                        <tr key={mapping.id}>
                          <td>
                            <strong className="mono">
                              {mapping.control.code}
                            </strong>
                            <div>{mapping.control.title}</div>
                          </td>
                          <td>
                            <Badge>
                              {statusLabel(mapping.control.lifecycleStatus)}
                            </Badge>
                          </td>
                          <td>
                            {mapping.isActive ? "Active" : "Historical"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted">
                Control codes are plain labels until the Control UI is
                promoted. Evidence, Gap, CAPA, KPI and Risk links are not
                fabricated here.
              </p>
            </div>

            <div>
              <h3>Version lineage pointers</h3>
              <dl className="detail-list">
                <div>
                  <dt>Latest Version</dt>
                  <dd className="mono">
                    {display(data.policy.latestVersion?.version, "—")}
                  </dd>
                </div>
                <div>
                  <dt>Current approved Version</dt>
                  <dd className="mono">
                    {display(
                      data.policy.currentApprovedVersion?.version,
                      "None",
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
