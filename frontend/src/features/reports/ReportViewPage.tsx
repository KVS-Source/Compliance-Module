import { ArrowLeft, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  HorizontalBars,
  STATUS_COLOURS,
  StatusDonut,
  formatDateTime,
  formatNumber,
} from "../../components/charts/ChartPrimitives";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { masterDataApi } from "../../services/masterDataApi";
import { frameworkApi } from "../../services/frameworkApi";
import { reportApi } from "../../services/submissionApi";
import type { Department, Framework } from "../../types/api";

/** Filter vocabularies. Values must match the API's enums exactly. */
const STATUS_OPTIONS: Record<string, string[]> = {
  "evidence-status": ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ARCHIVED"],
  risks: ["OPEN", "ASSESSED", "TREATED", "CLOSED", "ARCHIVED"],
  gaps: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "CANCELLED"],
  "capa-aging": [
    "OPEN",
    "IN_PROGRESS",
    "PENDING_VERIFICATION",
    "CLOSED",
    "CANCELLED",
  ],
};
const SEVERITY_OPTIONS = ["CRITICAL", "MAJOR", "MODERATE", "MINOR"];
const PRIORITY_OPTIONS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const humanise = (code: string) =>
  code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const cell = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return formatNumber(value);
  return String(value);
};

/**
 * A single report: filters, a chart where one is meaningful, the table, and a
 * CSV of exactly the rows on screen.
 *
 * Filters live in the URL so a report a colleague is asked to check reproduces
 * the same rows when the link is opened.
 */
export function ReportViewPage() {
  const { reportKey = "" } = useParams();
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [downloading, setDownloading] = useState(false);

  const filters = useMemo(
    () => ({
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      frameworkId: searchParams.get("frameworkId") ?? undefined,
      departmentId: searchParams.get("departmentId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      severity: searchParams.get("severity") ?? undefined,
      priority: searchParams.get("priority") ?? undefined,
      period: searchParams.get("period") ?? undefined,
    }),
    [searchParams],
  );

  const catalogue = useApiResource(reportApi.catalogue, [
    contextVersion,
    user?.activeCompany.id,
  ]);
  const definition = (catalogue.data ?? []).find(
    (report) => report.key === reportKey,
  );

  const resource = useApiResource(
    () => reportApi.run(reportKey, filters),
    [contextVersion, user?.activeCompany.id, reportKey, searchParams.toString()],
  );

  useEffect(() => {
    let active = true;
    void masterDataApi
      .listDepartments()
      .then((rows) => {
        if (active) setDepartments(rows);
      })
      .catch(() => {
        if (active) setDepartments([]);
      });
    void frameworkApi
      .list()
      .then((rows) => {
        if (active) setFrameworks(rows);
      })
      .catch(() => {
        if (active) setFrameworks([]);
      });
    return () => {
      active = false;
    };
  }, [contextVersion, user?.activeCompany.id]);

  const update = (key: string, value: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const result = await reportApi.downloadCsv(reportKey, filters);
      const objectUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = result.fileName;
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      showToast("success", "CSV ready", `${result.fileName} was downloaded.`);
    } catch (error) {
      showToast(
        "error",
        "Export failed",
        error instanceof Error
          ? error.message
          : "Unable to download the report CSV.",
      );
    } finally {
      setDownloading(false);
    }
  };

  const data = resource.data;
  const available = definition?.filters ?? [];
  const chartMax = Math.max(
    1,
    ...(data?.chart?.series ?? []).map((point) => point.value ?? 0),
  );

  return (
    <div className="page">
      <PageHeader
        title={definition?.name ?? data?.name ?? "Report"}
        section="Audit & Reporting"
        description={
          definition?.description ??
          "Tenant-scoped report built from live PostgreSQL data."
        }
        connected
        actions={
          <>
            <Link className="btn btn-secondary" to="/reports">
              <ArrowLeft size={15} /> Report Hub
            </Link>
            <button
              className="btn btn-primary"
              type="button"
              disabled={downloading || !data}
              onClick={() => void download()}
            >
              <Download size={15} />{" "}
              {downloading ? "Exporting…" : "Export CSV"}
            </button>
          </>
        }
      />

      {available.length > 0 ? (
        <div className="toolbar" data-testid="report-filters">
          {available.includes("from") ? (
            <label className="toolbar-select">
              <span className="sr-only">From date</span>
              <input
                className="control"
                type="date"
                value={filters.from ?? ""}
                aria-label="Filter from date"
                onChange={(event) => update("from", event.target.value)}
              />
            </label>
          ) : null}
          {available.includes("to") ? (
            <label className="toolbar-select">
              <span className="sr-only">To date</span>
              <input
                className="control"
                type="date"
                value={filters.to ?? ""}
                aria-label="Filter to date"
                onChange={(event) => update("to", event.target.value)}
              />
            </label>
          ) : null}
          {available.includes("period") ? (
            <label className="toolbar-select">
              <span className="sr-only">Reporting period</span>
              <input
                className="control"
                type="text"
                value={filters.period ?? ""}
                placeholder="Reporting period…"
                maxLength={48}
                aria-label="Filter by reporting period"
                onChange={(event) => update("period", event.target.value)}
              />
            </label>
          ) : null}
          {available.includes("status") ? (
            <label className="toolbar-select">
              <span className="sr-only">Status</span>
              <select
                className="control"
                value={filters.status ?? ""}
                aria-label="Filter by status"
                onChange={(event) => update("status", event.target.value)}
              >
                <option value="">All statuses</option>
                {(STATUS_OPTIONS[reportKey] ?? []).map((option) => (
                  <option key={option} value={option}>
                    {humanise(option)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {available.includes("severity") ? (
            <label className="toolbar-select">
              <span className="sr-only">Severity</span>
              <select
                className="control"
                value={filters.severity ?? ""}
                aria-label="Filter by severity"
                onChange={(event) => update("severity", event.target.value)}
              >
                <option value="">All severities</option>
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {humanise(option)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {available.includes("priority") ? (
            <label className="toolbar-select">
              <span className="sr-only">Priority</span>
              <select
                className="control"
                value={filters.priority ?? ""}
                aria-label="Filter by priority"
                onChange={(event) => update("priority", event.target.value)}
              >
                <option value="">All priorities</option>
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {humanise(option)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {available.includes("departmentId") ? (
            <label className="toolbar-select">
              <span className="sr-only">Department</span>
              <select
                className="control"
                value={filters.departmentId ?? ""}
                aria-label="Filter by department"
                onChange={(event) => update("departmentId", event.target.value)}
              >
                <option value="">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {available.includes("frameworkId") ? (
            <label className="toolbar-select">
              <span className="sr-only">Framework</span>
              <select
                className="control"
                value={filters.frameworkId ?? ""}
                aria-label="Filter by framework"
                onChange={(event) => update("frameworkId", event.target.value)}
              >
                <option value="">All frameworks</option>
                {frameworks.map((framework) => (
                  <option key={framework.id} value={framework.id}>
                    {framework.code} {framework.version}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {resource.loading ? (
        <LoadingState label="Running report…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : data ? (
        <>
          <div className="cards" data-testid="report-summary">
            {data.summary.map((entry) => (
              <article className="summary-card" key={entry.label}>
                <div className="card-label">
                  <span>{entry.label}</span>
                </div>
                <div className="card-value">{entry.value}</div>
              </article>
            ))}
          </div>

          {data.chart && data.chart.series.length > 0 ? (
            <section className="card chart-card" data-testid="report-chart">
              <header className="card-head">
                <div>
                  <h2>{data.name}</h2>
                  <p>Computed from the rows in the table below.</p>
                </div>
              </header>
              {data.chart.kind === "donut" ? (
                <StatusDonut
                  testId="report-donut"
                  total={data.chart.series.reduce(
                    (sum, point) => sum + (point.value ?? 0),
                    0,
                  )}
                  totalLabel={`${data.name} distribution`}
                  slices={data.chart.series.map((point) => ({
                    key: point.label,
                    label: humanise(point.label),
                    count: point.value ?? 0,
                    colour: STATUS_COLOURS[point.label] ?? "#2563eb",
                  }))}
                />
              ) : (
                <HorizontalBars
                  testId="report-bars"
                  suffix={data.chart.valueSuffix}
                  rows={data.chart.series.map((point) => ({
                    key: point.label,
                    label: point.label,
                    caption: point.caption,
                    value: point.value,
                    max: data.chart!.valueSuffix === "%" ? 100 : chartMax,
                    note: "Not available",
                    colour: "#2563eb",
                  }))}
                />
              )}
            </section>
          ) : null}

          <section className="card table-card">
            <header className="card-head">
              <div>
                <h2>Report rows</h2>
                <p>
                  {formatNumber(data.rows.length)} row
                  {data.rows.length === 1 ? "" : "s"} for{" "}
                  {user?.activeCompany.name}.
                  {data.truncated
                    ? ` Capped at ${formatNumber(data.rowLimit)}; narrow the filters to see the rest.`
                    : ""}
                </p>
              </div>
            </header>
            {data.rows.length === 0 ? (
              <p className="chart-empty" data-testid="report-empty">
                No rows match these filters.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <caption>
                    {data.name} — generated{" "}
                    {formatDateTime(data.generatedAt)}
                  </caption>
                  <thead>
                    <tr>
                      {data.columns.map((column) => (
                        <th scope="col" key={column.key}>
                          {column.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody data-testid="report-rows">
                    {data.rows.slice(0, 200).map((row, index) => (
                      <tr key={`${String(row[data.columns[0]!.key])}-${index}`}>
                        {data.columns.map((column) => (
                          <td
                            key={column.key}
                            className={column.numeric ? "numeric" : undefined}
                          >
                            {cell(row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.rows.length > 200 ? (
              <p className="chart-source">
                Showing the first 200 rows on screen. The CSV export contains
                every row in scope, up to {formatNumber(data.rowLimit)}.
              </p>
            ) : null}
          </section>

          <p className="dashboard-generated" data-testid="report-generated">
            Generated {formatDateTime(data.generatedAt)} from live PostgreSQL
            data for {user?.activeCompany.name}.
          </p>
        </>
      ) : null}
    </div>
  );
}
