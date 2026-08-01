import { FilePlus2, RefreshCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { kpiApi } from "../../services/kpiApi";
import { buildReturnToSearch } from "../../utils/returnTo";
import { evidenceStatusLabel } from "./evidenceFormatting";

interface KpiActualEvidencePanelProps {
  kpiActualId: string;
  kpiActualCode?: string;
  period?: string;
  approvalStatus?: string;
  requiresEvidence?: boolean;
  /** Current page path used as returnTo when creating Evidence. */
  returnTo: string;
  heading?: string;
}

export function KpiActualEvidencePanel({
  kpiActualId,
  kpiActualCode,
  period,
  approvalStatus,
  requiresEvidence = false,
  returnTo,
  heading = "Evidence links",
}: KpiActualEvidencePanelProps) {
  const { hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const canReadEvidence = hasPermission("evidence:read");
  const canWriteEvidence = hasPermission("evidence:write");
  const canReadActual = hasPermission("kpi-actual:read");
  const [version, setVersion] = useState(0);

  const links = useApiResource(
    () =>
      canReadActual && canReadEvidence
        ? kpiApi.listActualEvidenceLinks(kpiActualId, { pageSize: 20 })
        : Promise.resolve({ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } }),
    [kpiActualId, contextVersion, version, canReadActual, canReadEvidence],
  );

  useEffect(() => {
    setVersion(0);
  }, [contextVersion, kpiActualId]);

  if (!canReadActual || !canReadEvidence) return null;

  const createHref = `/evidence/new${buildReturnToSearch(returnTo, kpiActualId)}`;
  const mutable =
    approvalStatus !== "APPROVED" && approvalStatus !== undefined;
  const showCreate = canWriteEvidence && mutable;

  return (
    <section className="card" data-testid="kpi-actual-evidence-panel">
      <header className="card-head">
        <div>
          <h2>{heading}</h2>
          <p>
            Evidence linked to{" "}
            <span className="mono">{kpiActualCode ?? kpiActualId}</span>
            {period ? ` · ${period}` : ""}.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={links.loading}
          data-testid="kpi-actual-evidence-refresh"
          onClick={() => setVersion((value) => value + 1)}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>
      <div className="card-pad">
        {requiresEvidence ? (
          <p className="muted" role="status" data-testid="kpi-actual-evidence-required">
            This KPI configuration requires qualifying approved Evidence before
            approval can succeed.
          </p>
        ) : null}

        {links.loading && !links.data ? (
          <LoadingState label="Loading Evidence links…" />
        ) : null}
        {links.error && !links.data ? (
          <div className="stack">
            <ErrorState error={links.error} />
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setVersion((value) => value + 1)}
            >
              Retry
            </button>
          </div>
        ) : null}

        {links.data && links.data.data.length === 0 ? (
          <p className="muted" data-testid="kpi-actual-evidence-empty">
            No Evidence is linked to this KPI actual yet.
          </p>
        ) : null}

        {links.data && links.data.data.length > 0 ? (
          <ul className="link-list" data-testid="kpi-actual-evidence-list">
            {links.data.data
              .filter((entry) => entry.isActive)
              .map((entry) => (
                <li
                  key={entry.id}
                  data-testid={`kpi-actual-evidence-${entry.evidence.id}`}
                >
                  <div>
                    <Link to={`/evidence/${entry.evidence.id}`}>
                      {entry.evidence.code} · {entry.evidence.title}
                    </Link>
                    <p className="muted">
                      {evidenceStatusLabel(entry.evidence.lifecycleStatus)} ·
                      linked {new Date(entry.linkedAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        ) : null}

        {showCreate ? (
          <div className="button-row evidence-actions">
            <Link
              className="btn btn-primary"
              to={createHref}
              data-testid="kpi-actual-create-evidence"
            >
              <FilePlus2 size={15} /> Create Evidence for this actual
            </Link>
          </div>
        ) : approvalStatus === "APPROVED" ? (
          <p className="muted" role="status">
            Approved KPI actuals cannot receive new Evidence links.
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function KpiActualEvidencePanelPlaceholder({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <section className="card" data-testid="kpi-actual-evidence-panel">
      {children}
    </section>
  );
}
