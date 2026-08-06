import { BookOpenCheck, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { reportApi } from "../../services/submissionApi";

/**
 * The Report Hub index.
 *
 * A report the signed-in role may not run is listed but not linked, with the
 * permission it needs printed. Hiding it would leave a user unable to tell
 * whether the report is missing or merely closed to them.
 */
export function ReportHubPage() {
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const resource = useApiResource(reportApi.catalogue, [
    contextVersion,
    user?.activeCompany.id,
  ]);
  const reports = resource.data ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Report Hub"
        section="Audit & Reporting"
        description="Tenant-scoped reports built from live PostgreSQL data, each with filters, a table and a safe CSV export."
        connected
      />

      {resource.loading ? (
        <LoadingState label="Loading available reports…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : (
        <>
          <div className="report-grid" data-testid="report-hub-grid">
            {reports.map((report) =>
              report.available ? (
                <Link
                  className="report-tile"
                  to={`/reports/${report.key}`}
                  key={report.key}
                  data-testid={`report-tile-${report.key}`}
                >
                  <span className="feature-icon tone-blue">
                    <BookOpenCheck size={18} />
                  </span>
                  <strong>{report.name}</strong>
                  <span>{report.description}</span>
                  <em>{report.filters.length} filters · CSV export</em>
                </Link>
              ) : (
                <div
                  className="report-tile report-tile-locked"
                  key={report.key}
                  data-testid={`report-tile-${report.key}`}
                >
                  <span className="feature-icon tone-grey">
                    <Lock size={18} />
                  </span>
                  <strong>{report.name}</strong>
                  <span>{report.description}</span>
                  <em>Requires {report.permissions.join(", ")}</em>
                </div>
              ),
            )}
          </div>

          <section className="card information-card">
            <span className="feature-icon tone-blue">
              <BookOpenCheck size={19} />
            </span>
            <div>
              <strong>What these reports are, and are not</strong>
              <p>
                Every report reads this Company's rows through the same
                permissions as the register it summarises, and the CSV is built
                from the same query as the table so the two cannot disagree.
                Scheduled delivery, email and PDF rendering are not part of this
                release and are not offered here.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
