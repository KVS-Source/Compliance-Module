import {
  BookOpenCheck,
  ChartLine,
  Download,
  LayoutDashboard,
  Lock,
  SlidersHorizontal,
} from "lucide-react";
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
  const availableReports = reports.filter((report) => report.available);
  const filterCount = new Set(reports.flatMap((report) => report.filters)).size;

  return (
    <div className="page">
      <PageHeader
        title="Analytics & Reports"
        section="Analytics & Reports"
        description="Company-scoped KPI analytics and ten live PostgreSQL reports with reproducible filters, charts, tables and safe CSV export."
        connected
      />

      {resource.loading ? (
        <LoadingState label="Loading available reports…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : (
        <>
          <div className="cards analytics-report-summary" data-testid="report-hub-summary">
            <article className="summary-card">
              <div className="card-label"><BookOpenCheck size={17} /><span>Report catalogue</span></div>
              <div className="card-value">{reports.length}</div>
              <p>live Company-scoped reports</p>
            </article>
            <article className="summary-card">
              <div className="card-label"><LayoutDashboard size={17} /><span>Available to you</span></div>
              <div className="card-value">{availableReports.length}</div>
              <p>based on your active role</p>
            </article>
            <article className="summary-card">
              <div className="card-label"><SlidersHorizontal size={17} /><span>Filter dimensions</span></div>
              <div className="card-value">{filterCount}</div>
              <p>reproducible URL-backed filters</p>
            </article>
            <article className="summary-card">
              <div className="card-label"><Download size={17} /><span>Export format</span></div>
              <div className="card-value report-format-value">CSV</div>
              <p>same query as the visible table</p>
            </article>
          </div>

          <section className="analytics-launch-grid" aria-label="Analytics views">
            <Link className="card analytics-launch-card" to="/kpi/analytics">
              <span className="feature-icon tone-blue"><ChartLine size={20} /></span>
              <span>
                <strong>KPI Analytics</strong>
                <small>Achievement, RAG status, missed KPIs and department performance.</small>
              </span>
            </Link>
            <Link className="card analytics-launch-card" to="/dashboard">
              <span className="feature-icon tone-green"><LayoutDashboard size={20} /></span>
              <span>
                <strong>Executive Dashboard</strong>
                <small>Compliance, Evidence, Risk, CAPA and action-queue analytics.</small>
              </span>
            </Link>
          </section>

          <div className="section-heading">
            <div>
              <h2>Report catalogue</h2>
              <p>Open a report to apply its authoritative filters and export the resulting rows.</p>
            </div>
          </div>
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
                  <em>
                    {report.filters.length} {report.filters.length === 1 ? "filter" : "filters"} · CSV export
                  </em>
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

          <section className="card information-card report-contract-card">
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
