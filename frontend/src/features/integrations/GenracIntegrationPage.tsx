import { Database, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { ApiError } from "../../services/apiClient";
import { genracApi } from "../../services/genracApi";

export function GenracIntegrationPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [previewCounts, setPreviewCounts] = useState<{
    create: number;
    update: number;
    conflict: number;
    invalid: number;
    skip: number;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const resource = useApiResource(
    () => genracApi.status(),
    [contextVersion, user?.activeCompany.id, version],
  );
  const history = useApiResource(
    () => genracApi.history(1, 10),
    [contextVersion, user?.activeCompany.id, version],
  );

  const status = resource.data;
  const configured = status?.connection.status === "CONFIGURED";
  const canWrite = hasPermission("integrations:write");

  const run = async (action: "test" | "preview" | "sync") => {
    if (!canWrite || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      if (action === "test") {
        const result = await genracApi.testConnection();
        showToast(result.ok ? "success" : "error", "Connection test", result.message);
      } else if (action === "preview") {
        const result = await genracApi.preview();
        setPreviewCounts(result.counts);
        showToast("success", "Preview ready", `${result.changeCount} change(s) evaluated`);
      } else {
        const counts = await genracApi.sync();
        setPreviewCounts(counts);
        showToast("success", "Sync finished", `${counts.create} created · ${counts.update} updated`);
      }
      setVersion((value) => value + 1);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Action failed";
      setActionError(message);
      showToast("error", "GenRAC action failed", message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="GenRAC Integration"
        section="Data Management"
        description="Connection status and synchronization history."
        connected
        actions={
          <button className="btn btn-secondary" type="button" onClick={() => setVersion((value) => value + 1)}>
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />

      {resource.loading ? (
        <LoadingState label="Loading GenRAC status…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : status ? (
        <section className="card card-pad" data-testid="genrac-status">
          <div className="card-head">
            <div>
              <h2>{status.connection.displayName}</h2>
              <p>Connector type: {status.connection.connectorType}</p>
            </div>
            <Badge>
              {status.connection.status === "NOT_CONFIGURED"
                ? "Not configured"
                : status.connection.status}
            </Badge>
          </div>
          <p><strong>Live GenRAC access:</strong> {status.liveAccess ? "Available" : "Not available"}</p>
          <p><strong>Last successful sync:</strong> {status.connection.lastSuccessfulSyncAt ? new Date(status.connection.lastSuccessfulSyncAt).toLocaleString() : "Never"}</p>
          <p><strong>Last attempted sync:</strong> {status.connection.lastAttemptedSyncAt ? new Date(status.connection.lastAttemptedSyncAt).toLocaleString() : "Never"}</p>
          <p><strong>Mapping records:</strong> {status.mappingCount}</p>
          <p><strong>Adapters:</strong> CSV {status.adapters.csvFile ? "ready" : "not configured"}</p>

          <div className="filter-bar" style={{ marginTop: 16 }}>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!canWrite || busy || !configured}
              title={!configured ? "Configure the CSV adapter before testing" : undefined}
              onClick={() => void run("test")}
            >
              Test Connection
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!canWrite || busy || !configured}
              title={!configured ? "Not configured — preview requires a CSV adapter path" : undefined}
              onClick={() => void run("preview")}
            >
              Preview Changes
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!canWrite || busy || !configured}
              title={!configured ? "Not configured — sync requires approved configuration" : undefined}
              onClick={() => void run("sync")}
            >
              Run Sync
            </button>
          </div>
          {actionError ? <p className="form-error">{actionError}</p> : null}
          {previewCounts ? (
            <p data-testid="genrac-preview-counts">
              Create {previewCounts.create} · Update {previewCounts.update} · Conflict {previewCounts.conflict} · Invalid {previewCounts.invalid} · Skip {previewCounts.skip}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="card empty-state">
          <Database size={28} />
          <h3>GenRAC status unavailable</h3>
        </section>
      )}

      <section className="card table-card" style={{ marginTop: 16 }}>
        <div className="card-pad"><h2>Sync history</h2></div>
        {history.loading ? (
          <LoadingState label="Loading sync history…" />
        ) : history.error ? (
          <ErrorState error={history.error} />
        ) : (history.data?.data.length ?? 0) === 0 ? (
          <div className="card-pad"><p>No synchronization history.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Create</th>
                  <th>Update</th>
                  <th>Conflict</th>
                  <th>Invalid</th>
                </tr>
              </thead>
              <tbody>
                {history.data?.data.map((run) => (
                  <tr key={run.id}>
                    <td>{new Date(run.startedAt).toLocaleString()}</td>
                    <td>{run.mode}</td>
                    <td><Badge>{run.status}</Badge></td>
                    <td>{run.createCount}</td>
                    <td>{run.updateCount}</td>
                    <td>{run.conflictCount}</td>
                    <td>{run.invalidCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
