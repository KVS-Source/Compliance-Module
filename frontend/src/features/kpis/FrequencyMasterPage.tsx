import { Link } from "react-router-dom";
import { HorizontalBars } from "../../components/charts/ChartPrimitives";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { kpiCatalogueApi } from "../../services/submissionApi";

const label = (code: string) =>
  code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

/**
 * Frequency Master.
 *
 * The measurement frequencies the KPI definitions actually use. There is no
 * separate frequency table in the schema and this page does not pretend to
 * maintain one: it reports what the definitions and this Company's
 * configurations say, so the list can never drift out of step with them.
 */
export function FrequencyMasterPage() {
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const resource = useApiResource(kpiCatalogueApi.frequencies, [
    contextVersion,
    user?.activeCompany.id,
  ]);
  const rows = resource.data ?? [];
  const max = Math.max(1, ...rows.map((row) => row.definitionCount));

  return (
    <div className="page">
      <PageHeader
        title="Frequency Master"
        section="Master Data"
        description="KPI measurement frequencies and usage."
        connected
        actions={
          <Link className="btn btn-secondary" to="/kpi/catalogue">
            KPI Catalogue
          </Link>
        }
      />

      {resource.loading ? (
        <LoadingState label="Loading frequencies…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : (
        <>

          {rows.length === 0 ? (
            <p className="chart-empty" data-testid="frequency-master-empty">
              No KPI definitions carry a frequency yet.
            </p>
          ) : (
            <>
              <section className="card frequency-chart-card">
                <header className="card-head">
                  <div>
                    <h2>KPI definitions by frequency</h2>
                    <p>{rows.length} distinct frequencies in use.</p>
                  </div>
                </header>
                <HorizontalBars
                  testId="frequency-bars"
                  rows={rows.map((row) => ({
                    key: row.code,
                    label: label(row.code),
                    caption: `${row.configurationCount} Company configuration${row.configurationCount === 1 ? "" : "s"} · ${row.activeConfigurationCount} active`,
                    value: row.definitionCount,
                    max,
                    colour: "var(--accent)",
                  }))}
                />
              </section>

              <section className="card table-card">
                <div className="table-wrap">
                  <table className="data-table">
                    <caption>
                      Frequency Master — {rows.length} frequencies for{" "}
                      {user?.activeCompany.name}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Frequency</th>
                        <th scope="col">Code</th>
                        <th scope="col">KPI definitions</th>
                        <th scope="col">Company configurations</th>
                        <th scope="col">Active configurations</th>
                      </tr>
                    </thead>
                    <tbody data-testid="frequency-master-rows">
                      {rows.map((row) => (
                        <tr key={row.code}>
                          <th scope="row">{label(row.code)}</th>
                          <td>
                            <span className="mono">{row.code}</span>
                          </td>
                          <td>{row.definitionCount}</td>
                          <td>{row.configurationCount}</td>
                          <td>{row.activeConfigurationCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
