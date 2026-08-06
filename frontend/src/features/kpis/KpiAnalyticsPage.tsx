import { CheckCircle2, CircleGauge, Percent, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChartSection,
  HorizontalBars,
  formatDateTime,
  formatNumber,
} from "../../components/charts/ChartPrimitives";
import { MetricCard } from "../../components/charts/MetricCard";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { masterDataApi } from "../../services/masterDataApi";
import { kpiCatalogueApi } from "../../services/submissionApi";
import type { CompanyUser, Department } from "../../types/api";

const humanise = (code: string) =>
  code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const RAG_COLOURS: Record<string, string> = {
  GREEN: "#16a34a",
  AMBER: "#d97706",
  RED: "#dc2626",
  UNRATED: "#6b7280",
};

const FREQUENCIES = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "ANNUAL",
  "CONTINUOUS",
  "PER_EVENT",
  "ONE_TIME",
];

const number = (value: number | null) =>
  value === null ? "—" : formatNumber(value);

/**
 * KPI Analytics.
 *
 * Every series is grouped from this Company's KPI actuals. Periods come from
 * the rows themselves, so a company with two reporting periods sees two
 * points — there is no fixed twelve-month axis to fill in.
 */
export function KpiAnalyticsPage() {
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const [frequency, setFrequency] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [owners, setOwners] = useState<CompanyUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const resource = useApiResource(
    () =>
      kpiCatalogueApi.analytics({
        frequency: frequency || undefined,
        ownerId: ownerId || undefined,
        departmentId: departmentId || undefined,
      }),
    [contextVersion, user?.activeCompany.id, frequency, ownerId, departmentId],
  );

  // Filter options are best-effort: a role without the master-data read
  // permission still gets the analytics, just without those two selects.
  useEffect(() => {
    let active = true;
    void masterDataApi
      .listUsers()
      .then((rows) => {
        if (active) setOwners(rows);
      })
      .catch(() => {
        if (active) setOwners([]);
      });
    void masterDataApi
      .listDepartments()
      .then((rows) => {
        if (active) setDepartments(rows);
      })
      .catch(() => {
        if (active) setDepartments([]);
      });
    return () => {
      active = false;
    };
  }, [contextVersion, user?.activeCompany.id]);

  const data = resource.data;
  const trendMax = useMemo(
    () => Math.max(1, ...(data?.trend ?? []).map((point) => point.measured)),
    [data],
  );
  const ragTotal = useMemo(
    () =>
      (data?.ragDistribution ?? []).reduce((sum, row) => sum + row.count, 0),
    [data],
  );
  const departmentMax = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.departmentDistribution ?? []).map((row) => row.measured),
      ),
    [data],
  );

  return (
    <div className="page">
      <PageHeader
        title="KPI Analytics"
        section="KPI Management"
        description="Measured KPI performance for this Company, grouped from the actuals themselves."
        connected
        actions={
          <>
            <Link className="btn btn-secondary" to="/kpi/catalogue">
              KPI Catalogue
            </Link>
            <Link className="btn btn-primary" to="/reports/kpi-variance">
              KPI Reports
            </Link>
          </>
        }
      />

      <div className="toolbar" data-testid="kpi-analytics-filters">
        <label className="toolbar-select">
          <span className="sr-only">Frequency</span>
          <select
            className="control"
            value={frequency}
            aria-label="Filter by frequency"
            onChange={(event) => setFrequency(event.target.value)}
          >
            <option value="">All frequencies</option>
            {FREQUENCIES.map((code) => (
              <option key={code} value={code}>
                {humanise(code)}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">KPI owner</span>
          <select
            className="control"
            value={ownerId}
            aria-label="Filter by KPI owner"
            onChange={(event) => setOwnerId(event.target.value)}
          >
            <option value="">All owners</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Department</span>
          <select
            className="control"
            value={departmentId}
            aria-label="Filter by department"
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {resource.loading ? (
        <LoadingState label="Loading KPI analytics…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : data ? (
        <>
          <div className="cards" data-testid="kpi-analytics-cards">
            <MetricCard
              label="Measured KPIs"
              value={formatNumber(data.summary.measured)}
              note="non-informational actuals in scope"
              icon={CircleGauge}
              tone="blue"
            />
            <MetricCard
              label="Meeting Target"
              value={formatNumber(data.summary.meetingTarget)}
              note="target met on the recorded actual"
              icon={CheckCircle2}
              tone="green"
            />
            <MetricCard
              label="Missing Target"
              value={formatNumber(data.summary.missingTarget)}
              note="measured but target missed"
              icon={TriangleAlert}
              tone="red"
            />
            <MetricCard
              label="Achievement Rate"
              value={
                data.summary.achievementRate === null
                  ? "—"
                  : `${data.summary.achievementRate}%`
              }
              note={
                data.summary.achievementRate === null
                  ? "nothing measured in scope"
                  : "share of measured KPIs meeting target"
              }
              icon={Percent}
              tone="purple"
            />
          </div>

          <div className="grid-2 dashboard-secondary-grid">
            <ChartSection
              title="Achievement by reporting period"
              subtitle="Measured KPIs and how many met target, per period recorded in the data."
              source="Periods come from the KPI actuals; no period is drawn without a row behind it."
              testId="kpi-analytics-trend"
              isEmpty={data.trend.length === 0}
              emptyLabel="No KPI actuals match these filters."
            >
              <HorizontalBars
                testId="kpi-analytics-trend-bars"
                rows={data.trend.map((point) => ({
                  key: point.period,
                  label: point.period,
                  caption: `${point.meetingTarget} of ${point.measured} met target${point.achievementRate === null ? "" : ` · ${point.achievementRate}%`}`,
                  value: point.measured,
                  max: trendMax,
                  colour: "#2563eb",
                }))}
              />
            </ChartSection>

            <ChartSection
              title="RAG distribution"
              subtitle="How measured actuals scored against their configured thresholds."
              source={`${formatNumber(ragTotal)} rated actual(s).`}
              testId="kpi-analytics-rag"
              isEmpty={data.ragDistribution.length === 0}
              emptyLabel="No RAG status has been recorded for these filters."
            >
              <HorizontalBars
                testId="kpi-analytics-rag-bars"
                rows={data.ragDistribution.map((row) => ({
                  key: row.status,
                  label: humanise(row.status),
                  value: row.count,
                  max: Math.max(
                    1,
                    ...data.ragDistribution.map((entry) => entry.count),
                  ),
                  colour: RAG_COLOURS[row.status] ?? "#6b7280",
                }))}
              />
            </ChartSection>
          </div>

          <ChartSection
            title="Measured KPIs by department"
            subtitle="Where the measured actuals in scope were recorded."
            testId="kpi-analytics-departments"
            isEmpty={data.departmentDistribution.length === 0}
            emptyLabel="No measured actuals match these filters."
          >
            <HorizontalBars
              testId="kpi-analytics-department-bars"
              rows={data.departmentDistribution.map((row) => ({
                key: row.id ?? "unassigned",
                label: row.name,
                caption: row.code ?? undefined,
                value: row.measured,
                max: departmentMax,
                colour: "#7c3aed",
              }))}
            />
          </ChartSection>

          <section className="card table-card">
            <header className="card-head">
              <div>
                <h2>KPIs missing target</h2>
                <p>
                  {formatNumber(data.missedKpis.length)} of{" "}
                  {formatNumber(data.summary.missingTarget)} missed actual
                  {data.summary.missingTarget === 1 ? "" : "s"} shown.
                </p>
              </div>
            </header>
            {data.missedKpis.length === 0 ? (
              <p className="chart-empty" data-testid="kpi-analytics-missed-empty">
                Every measured KPI in scope met its target.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <caption>
                    KPIs missing target for {user?.activeCompany.name}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">KPI</th>
                      <th scope="col">Period</th>
                      <th scope="col">Target</th>
                      <th scope="col">Actual</th>
                      <th scope="col">Variance</th>
                      <th scope="col">Variance %</th>
                      <th scope="col">RAG</th>
                      <th scope="col">Owner</th>
                      <th scope="col">Department</th>
                    </tr>
                  </thead>
                  <tbody data-testid="kpi-analytics-missed-rows">
                    {data.missedKpis.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">
                          <span className="list-row-copy">
                            <strong>{row.definitionName}</strong>
                            <span className="mono">
                              {row.definitionCode} · {row.unit}
                            </span>
                          </span>
                        </th>
                        <td>{row.period}</td>
                        <td>{number(row.targetValue)}</td>
                        <td>{number(row.actualValue)}</td>
                        <td>{number(row.variance)}</td>
                        <td>
                          {row.variancePercentage === null
                            ? "—"
                            : `${row.variancePercentage}%`}
                        </td>
                        <td>
                          {row.ragStatus ? (
                            <Badge
                              tone={
                                row.ragStatus === "RED"
                                  ? "red"
                                  : row.ragStatus === "AMBER"
                                    ? "amber"
                                    : "green"
                              }
                            >
                              {row.ragStatus}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{row.ownerName ?? "—"}</td>
                        <td>{row.departmentName ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="dashboard-generated">
            Generated {formatDateTime(data.generatedAt)} from live PostgreSQL
            data for {user?.activeCompany.name}.
          </p>
        </>
      ) : null}
    </div>
  );
}
