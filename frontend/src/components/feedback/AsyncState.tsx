import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";

export function LoadingState({ label = "Loading Company data…" }: { label?: string }) {
  return (
    <div className="state-panel" role="status">
      <LoaderCircle className="spin" size={24} />
      <div><strong>{label}</strong><p>Secure API data is being prepared.</p></div>
    </div>
  );
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <div className="state-panel state-error" role="alert">
      <AlertTriangle size={24} />
      <div><strong>Data could not be loaded</strong><p>{error.message}</p></div>
      <button className="btn btn-secondary" type="button" onClick={() => window.location.reload()}>
        <RefreshCw size={15} /> Retry
      </button>
    </div>
  );
}
