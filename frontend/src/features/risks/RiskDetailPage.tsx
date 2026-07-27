import { ArrowLeft, Info, ShieldAlert } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { ApiError } from "../../services/apiClient";
import { riskApi } from "../../services/riskApi";
import type { Risk } from "../../types/api";

const statusLabel = (status: string) => status.replaceAll("_", " ");

const display = (value: string | number | null | undefined, fallback: string) =>
  value === null || value === undefined || value === ""
    ? fallback
    : String(value);

const named = (
  value: { code: string; name: string } | null | undefined,
  fallback: string,
) => (value ? `${value.name} (${value.code})` : fallback);

const hasKpiLineage = (risk: Risk) =>
  Boolean(
    risk.source.actual && risk.source.configuration && risk.source.target,
  );

export function RiskDetailPage() {
  const { riskId = "" } = useParams();
  const { user } = useAuth();
  const { contextVersion } = useTenant();

  const resource = useApiResource(
    () => riskApi.get(riskId),
    [riskId, contextVersion, user?.activeCompany.id],
  );

  if (resource.loading) return <LoadingState label="Loading risk detail…" />;
  if (resource.error) {
    const notFound =
      resource.error instanceof ApiError && resource.error.status === 404;
    return (
      <div className="page">
        <PageHeader
          title="Risk detail"
          section="Compliance Management"
          description="Company-scoped risk record."
          connected
        />
        {notFound ? (
          <section className="card state-panel state-error" role="alert">
            <ShieldAlert size={24} aria-hidden />
            <div>
              <strong>Risk not found</strong>
              <p>
                This risk is not available in{" "}
                {user?.activeCompany.name ?? "the active Company"}. It may
                belong to another Company context.
              </p>
            </div>
            <Link className="btn btn-secondary" to="/compliance/risks">
              <ArrowLeft size={15} /> Back to register
            </Link>
          </section>
        ) : (
          <ErrorState error={resource.error} />
        )}
      </div>
    );
  }

  const risk = resource.data;
  if (!risk) return <LoadingState label="Loading risk detail…" />;

  const configuration = risk.source.configuration;
  const actual = risk.source.actual;
  const automatic = hasKpiLineage(risk);

  return (
    <div className="page">
      <PageHeader
        title={risk.title}
        section="Compliance Management"
        description={`${risk.code} · ${user?.activeCompany.name ?? "Active Company"}`}
        connected
        actions={
          <Link className="btn btn-secondary" to="/compliance/risks">
            <ArrowLeft size={15} /> Back to register
          </Link>
        }
      />

      <p className="sr-only">
        Risk code {risk.code}. Status {statusLabel(risk.status)}.
      </p>

      {automatic ? (
        <div
          className="banner banner-info"
          role="status"
          data-testid="risk-automatic-origin"
        >
          <Info size={16} aria-hidden />
          <div>
            <strong>
              This risk was raised automatically because a KPI target was
              missed.
            </strong>
            <p style={{ margin: "2px 0 0" }}>
              Source KPI {configuration!.kpi.code} ({configuration!.kpi.name})
              for period {actual!.period}. Originating actual code{" "}
              <span className="mono">{actual!.code}</span> is a non-clickable
              reference (no live KPI Actual detail route exists yet).
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <section className="card">
          <header className="card-head">
            <div>
              <h2>Assessment</h2>
              <p>Inherent classification and residual assessment.</p>
            </div>
            <Badge>{statusLabel(risk.status)}</Badge>
          </header>
          <div className="card-pad">
            <dl className="detail-list">
              <div>
                <dt>Code</dt>
                <dd className="mono">{risk.code}</dd>
              </div>
              <div>
                <dt>Title</dt>
                <dd>{risk.title}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge>{statusLabel(risk.status)}</Badge>
                </dd>
              </div>
              <div>
                <dt>KPI risk class</dt>
                <dd>{display(risk.kpiRiskClass, "Not applicable")}</dd>
              </div>
              <div>
                <dt>General level</dt>
                <dd>{display(risk.generalLevel, "Not provided")}</dd>
              </div>
              <div>
                <dt>Inherent likelihood</dt>
                <dd className="mono">{risk.inherentLikelihood}</dd>
              </div>
              <div>
                <dt>Inherent impact</dt>
                <dd className="mono">{risk.inherentImpact}</dd>
              </div>
              <div>
                <dt>Inherent score</dt>
                <dd className="mono">{risk.inherentScore}</dd>
              </div>
              <div>
                <dt>Residual likelihood</dt>
                <dd>
                  {risk.residualLikelihood === null
                    ? "Not yet assessed"
                    : risk.residualLikelihood}
                </dd>
              </div>
              <div>
                <dt>Residual impact</dt>
                <dd>
                  {risk.residualImpact === null
                    ? "Not yet assessed"
                    : risk.residualImpact}
                </dd>
              </div>
              <div>
                <dt>Residual score</dt>
                <dd>
                  {risk.residualScore === null
                    ? "Not yet assessed"
                    : risk.residualScore}
                </dd>
              </div>
              <div>
                <dt>Treatment strategy</dt>
                <dd>{display(risk.treatmentStrategy, "Not yet assessed")}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{named(risk.owner, "Not assigned")}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{new Date(risk.createdAt).toLocaleString("en-GB")}</dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd>{display(risk.description, "Not provided")}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="card">
          <header className="card-head">
            <div>
              <h2>Source and scope</h2>
              <p>
                {automatic
                  ? "KPI lineage and configuration scope for this Company."
                  : "No automatic KPI lineage is attached to this risk."}
              </p>
            </div>
          </header>
          <div className="card-pad">
            <dl className="detail-list">
              <div>
                <dt>KPI</dt>
                <dd>
                  {configuration
                    ? `${configuration.kpi.code} · ${configuration.kpi.name}`
                    : "Not applicable"}
                </dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>{display(actual?.period, "Not applicable")}</dd>
              </div>
              <div>
                <dt>Actual code</dt>
                <dd className="mono">
                  {actual ? actual.code : "Not applicable"}
                </dd>
              </div>
              <div>
                <dt>Actual value</dt>
                <dd className="mono">
                  {display(actual?.actualValue, "Not applicable")}
                </dd>
              </div>
              <div>
                <dt>Target snapshot</dt>
                <dd className="mono">
                  {display(actual?.targetValueSnapshot, "Not applicable")}
                </dd>
              </div>
              <div>
                <dt>Variance</dt>
                <dd className="mono">
                  {display(actual?.variance, "Not applicable")}
                </dd>
              </div>
              <div>
                <dt>RAG</dt>
                <dd>
                  {actual?.ragStatus ? (
                    <Badge>{actual.ragStatus}</Badge>
                  ) : (
                    "Not applicable"
                  )}
                </dd>
              </div>
              <div>
                <dt>Target code</dt>
                <dd className="mono">
                  {risk.source.target
                    ? `${risk.source.target.code} (v${risk.source.target.version})`
                    : "Not applicable"}
                </dd>
              </div>
              <div>
                <dt>BU / Department</dt>
                <dd>{named(configuration?.department, "Not provided")}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{named(configuration?.orgLocation, "Not provided")}</dd>
              </div>
              <div>
                <dt>Product / Service</dt>
                <dd>
                  {display(configuration?.productService, "Not provided")}
                </dd>
              </div>
              <div>
                <dt>Org unit</dt>
                <dd>{named(configuration?.orgUnit, "Not provided")}</dd>
              </div>
              <div>
                <dt>Configuration owner</dt>
                <dd>{named(configuration?.owner, "Not assigned")}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}
