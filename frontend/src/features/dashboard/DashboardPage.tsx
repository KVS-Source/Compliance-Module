import {
  Archive,
  BadgeCheck,
  CheckCircle2,
  CircleGauge,
  Database,
  FileSearch,
  Gauge,
  History,
  ListChecks,
  NotebookTabs,
  Settings2,
  ShieldAlert,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChartSection,
  EVIDENCE_STATUS_ORDER,
  GroupedBarChart,
  HorizontalBars,
  ListRow,
  RiskHeatMap,
  STATUS_COLOURS,
  StatusDonut,
  formatDate,
  formatDateTime,
  formatNumber,
} from "../../components/charts/ChartPrimitives";
import { MetricCard } from "../../components/charts/MetricCard";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { dashboardApi } from "../../services/dashboardApi";

/** A card whose source section the API withheld prints `—`, never `0`. */
const value = (count: number | null | undefined) =>
  count === null || count === undefined ? "—" : formatNumber(count);

const note = (count: number | null | undefined, text: string) =>
  count === null || count === undefined ? "permission restricted" : text;

const titleCase = (text: string) =>
  text
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function DashboardPage() {
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const navigate = useNavigate();
  const resource = useApiResource(
    () => dashboardApi.summary(),
    [contextVersion, user?.activeCompany.id],
  );
  const data = resource.data;
  const analytics = data?.analytics ?? null;
  const cards = analytics?.cards;
  const trend = analytics?.kpiTrend ?? null;
  const evidenceStatus = analytics?.evidenceStatus ?? null;
  const frameworkCompliance = analytics?.frameworkCompliance ?? null;
  const heatMap = analytics?.riskHeatMap ?? null;
  const capaAging = analytics?.capaAging ?? null;
  const recentKpiRisks = analytics?.recentKpiRisks ?? null;
  const capasDueSoon = analytics?.capasDueSoon ?? null;
  const policyReview = analytics?.policiesDueForReview ?? null;
  const actionQueue = analytics?.actionQueue ?? [];
  const genrac = analytics?.genrac ?? null;
  const recentActivity = data?.recentActivity ?? null;

  const evidenceTotal =
    evidenceStatus?.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const capaAgingTotal =
    capaAging?.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const capaAgingMax = Math.max(1, ...(capaAging ?? []).map((row) => row.count));

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        section="Overview"
        description="Live Company-scoped compliance, KPI, Evidence and Risk analytics computed from PostgreSQL."
        connected
        actions={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => navigate("/kpi/analytics")}
            >
              <Gauge size={16} /> KPI Analytics
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => navigate("/kpi/actual-entry")}
            >
              <CircleGauge size={16} /> Record KPI Actual
            </button>
          </>
        }
      />

      {resource.loading ? (
        <LoadingState label="Loading live dashboard analytics…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : data ? (
        <>
          <div className="cards dashboard-cards" data-testid="dashboard-cards">
            <MetricCard
              label="Total KPI Definitions"
              value={value(cards?.kpiDefinitions)}
              note={note(cards?.kpiDefinitions, "active in the catalogue")}
              icon={ListChecks}
              tone="grey"
              to="/kpi/catalogue"
            />
            <MetricCard
              label="Active KPI Configurations"
              value={value(cards?.activeKpiConfigurations)}
              note={note(
                cards?.activeKpiConfigurations,
                "enabled in this Company",
              )}
              icon={Settings2}
              tone="blue"
              to="/kpi/configuration"
            />
            <MetricCard
              label="Measured KPIs"
              value={value(cards?.measuredKpis)}
              note={note(cards?.measuredKpis, "non-informational actuals")}
              icon={CircleGauge}
              tone="blue"
              to="/kpi/analytics"
            />
            <MetricCard
              label="KPIs Meeting Target"
              value={value(cards?.kpisMeetingTarget)}
              note={note(cards?.kpisMeetingTarget, "target met on the actual")}
              icon={CheckCircle2}
              tone="green"
              to="/kpi/analytics"
            />
            <MetricCard
              label="KPIs Missing Target"
              value={value(cards?.kpisMissingTarget)}
              note={note(cards?.kpisMissingTarget, "measured but target missed")}
              icon={TriangleAlert}
              tone="red"
              to="/kpi/analytics"
            />
            <MetricCard
              label="Pending Evidence"
              value={value(cards?.pendingEvidence)}
              note={note(cards?.pendingEvidence, "submitted, awaiting review")}
              icon={FileSearch}
              tone="purple"
              to="/evidence/review"
            />
            <MetricCard
              label="Open Risks"
              value={value(cards?.openRisks)}
              note={note(cards?.openRisks, "not closed or archived")}
              icon={ShieldAlert}
              tone="red"
              to="/compliance/risks"
            />
            <MetricCard
              label="Open Gaps"
              value={value(cards?.openGaps)}
              note={note(cards?.openGaps, "awaiting remediation")}
              icon={TriangleAlert}
              tone="amber"
              to="/compliance/gaps"
            />
            <MetricCard
              label="Open CAPAs"
              value={value(cards?.openCapas)}
              note={note(cards?.openCapas, "corrective actions active")}
              icon={Wrench}
              tone="blue"
              to="/compliance/capa"
            />
            <MetricCard
              label="Policies Due for Review"
              value={value(cards?.policiesDueForReview)}
              note={note(
                cards?.policiesDueForReview,
                `review date within ${policyReview?.horizonDays ?? 90} days`,
              )}
              icon={NotebookTabs}
              tone="amber"
              to="/compliance/policy-register"
            />
          </div>

          <ChartSection
            title="Action Queue"
            subtitle="Outstanding work derived from the registers below — nothing here is stored as a task."
            testId="dashboard-action-queue"
            isEmpty={actionQueue.length === 0}
            emptyLabel="No outstanding actions. Every register this role can read is clear."
          >
            <div className="action-queue">
              {actionQueue.map((item) => (
                <Link
                  className={`action-queue-item tone-${item.tone}`}
                  to={item.to}
                  key={item.key}
                  data-testid={`action-queue-${item.key}`}
                >
                  <strong>{formatNumber(item.count)}</strong>
                  <span className="action-queue-label">{item.label}</span>
                  <span className="action-queue-note">{item.description}</span>
                </Link>
              ))}
            </div>
          </ChartSection>

          <div className="grid-2 dashboard-secondary-grid">
            <ChartSection
              title="KPI target versus actual"
              subtitle="Measured KPIs and the number that met target, by reporting period."
              source="Reporting periods come from the KPI actuals themselves. Both series count KPIs, so they share one scale; target and actual values are not summed across different units."
              testId="dashboard-kpi-trend"
              restricted={trend === null}
              isEmpty={(trend ?? []).length === 0}
              emptyLabel="No KPI actuals recorded yet. Record an actual against an approved target to build this trend."
              action={
                <Link className="btn btn-secondary" to="/kpi/analytics">
                  KPI Analytics
                </Link>
              }
            >
              <GroupedBarChart
                testId="kpi-trend-chart"
                seriesLabels={["Measured", "Meeting target"]}
                rows={(trend ?? []).map((row) => ({
                  label: row.period,
                  values: [row.measured, row.meetingTarget],
                }))}
              />
            </ChartSection>

            <ChartSection
              title="Evidence status"
              subtitle="Lifecycle distribution of every Evidence record in this Company."
              source="Counted from the Evidence lifecycle status column."
              testId="dashboard-evidence-status"
              restricted={evidenceStatus === null}
              isEmpty={(evidenceStatus ?? []).length === 0}
              emptyLabel="No Evidence records yet."
              action={
                <Link className="btn btn-secondary" to="/evidence">
                  Evidence Library
                </Link>
              }
            >
              <StatusDonut
                testId="evidence-status-donut"
                total={evidenceTotal}
                totalLabel={`${evidenceTotal} Evidence records by lifecycle status`}
                slices={EVIDENCE_STATUS_ORDER.filter((status) =>
                  (evidenceStatus ?? []).some((row) => row.status === status),
                ).map((status) => ({
                  key: status,
                  label: titleCase(status),
                  count:
                    (evidenceStatus ?? []).find((row) => row.status === status)
                      ?.count ?? 0,
                  colour: STATUS_COLOURS[status] ?? "#6b7280",
                }))}
              />
            </ChartSection>
          </div>

          <div className="grid-2 dashboard-secondary-grid">
            <ChartSection
              title="Framework compliance"
              subtitle="Share of this Company's mapped Controls recorded as implemented, per framework."
              source="Framework Rules state the requirement; Controls are this Company's implementation. A framework with no mapped Control has no percentage to report and says so."
              testId="dashboard-framework-compliance"
              restricted={frameworkCompliance === null}
              isEmpty={(frameworkCompliance ?? []).length === 0}
              emptyLabel="No active frameworks in scope."
              action={
                <Link className="btn btn-secondary" to="/master/frameworks">
                  Frameworks
                </Link>
              }
            >
              <HorizontalBars
                testId="framework-compliance-bars"
                suffix="%"
                rows={(frameworkCompliance ?? []).map((row) => ({
                  key: row.id,
                  label: `${row.code} ${row.version}`,
                  caption: `${formatNumber(row.ruleCount)} rules · ${formatNumber(row.mappedControls)} mapped controls · ${formatNumber(row.openGaps)} open gaps`,
                  value: row.compliancePercentage,
                  max: 100,
                  note: "No mapped Control",
                  colour:
                    row.compliancePercentage === null
                      ? undefined
                      : row.compliancePercentage >= 80
                        ? "#16a34a"
                        : row.compliancePercentage >= 50
                          ? "#d97706"
                          : "#dc2626",
                }))}
              />
            </ChartSection>

            <ChartSection
              title="Risk heat map"
              subtitle="Open risks by inherent likelihood and impact."
              source="Axis bounds are taken from the recorded scores, so the grid never shows a band this Company does not use."
              testId="dashboard-risk-heatmap"
              restricted={heatMap === null}
              isEmpty={(heatMap?.cells.length ?? 0) === 0}
              emptyLabel="No open risks recorded."
              action={
                <Link className="btn btn-secondary" to="/compliance/risks">
                  Risk Register
                </Link>
              }
            >
              <RiskHeatMap
                testId="risk-heatmap"
                cells={heatMap?.cells ?? []}
                maxLikelihood={heatMap?.maxLikelihood ?? 0}
                maxImpact={heatMap?.maxImpact ?? 0}
              />
            </ChartSection>
          </div>

          <div className="grid-2 dashboard-secondary-grid">
            <ChartSection
              title="CAPA aging"
              subtitle={`Open corrective actions bucketed by how far past their due date they are.`}
              source={`${formatNumber(capaAgingTotal)} open CAPA(s) in scope.`}
              testId="dashboard-capa-aging"
              restricted={capaAging === null}
              isEmpty={capaAgingTotal === 0}
              emptyLabel="No open CAPAs."
              action={
                <Link className="btn btn-secondary" to="/compliance/capa">
                  CAPA Register
                </Link>
              }
            >
              <HorizontalBars
                testId="capa-aging-bars"
                rows={(capaAging ?? []).map((row) => ({
                  key: row.key,
                  label: row.label,
                  value: row.count,
                  max: capaAgingMax,
                  colour: row.key.startsWith("OVERDUE")
                    ? "#dc2626"
                    : row.key === "DUE_SOON"
                      ? "#d97706"
                      : "#2563eb",
                }))}
              />
            </ChartSection>

            <ChartSection
              title="CAPAs due soon"
              subtitle="Open corrective actions falling due in the next 30 days."
              testId="dashboard-capas-due-soon"
              restricted={capasDueSoon === null}
              isEmpty={(capasDueSoon ?? []).length === 0}
              emptyLabel="No CAPAs fall due in the next 30 days."
            >
              <div className="chart-list">
                {(capasDueSoon ?? []).map((capa) => (
                  <ListRow
                    key={capa.id}
                    to={`/compliance/capa/${capa.id}`}
                    primary={`${capa.code} · ${capa.title}`}
                    secondary={`${titleCase(capa.priority)} priority · ${capa.completionPercentage}% complete · ${capa.ownerName ?? "Unassigned"}`}
                    trailing={formatDate(capa.dueDate)}
                  />
                ))}
              </div>
            </ChartSection>
          </div>

          <div className="grid-2 dashboard-secondary-grid">
            <ChartSection
              title="Recent KPI-linked Risk activity"
              subtitle="Risks raised automatically from a KPI actual breaching its threshold."
              testId="dashboard-recent-kpi-risks"
              restricted={recentKpiRisks === null}
              isEmpty={(recentKpiRisks ?? []).length === 0}
              emptyLabel="No KPI-linked risks have been raised in this Company."
            >
              <div className="chart-list">
                {(recentKpiRisks ?? []).map((risk) => (
                  <ListRow
                    key={risk.id}
                    to={`/compliance/risks/${risk.id}`}
                    primary={`${risk.code} · ${risk.title}`}
                    secondary={
                      risk.kpi
                        ? `${risk.kpi.definitionCode} · ${risk.kpi.period} · ${risk.kpi.ragStatus ?? "no RAG"} · ${risk.kpiRiskClass ?? "Enterprise"}`
                        : `${risk.kpiRiskClass ?? "Enterprise"} · score ${risk.inherentScore}`
                    }
                    trailing={formatDate(risk.raisedAt)}
                  />
                ))}
              </div>
            </ChartSection>

            <ChartSection
              title="Policies due for review"
              subtitle={`Approved Policy Versions whose recorded review date falls within ${policyReview?.horizonDays ?? 90} days.`}
              source={
                policyReview
                  ? `${formatNumber(policyReview.overdue)} already past the review date.`
                  : undefined
              }
              testId="dashboard-policies-due"
              restricted={policyReview === null}
              isEmpty={(policyReview?.items.length ?? 0) === 0}
              emptyLabel="No approved Policy Version records a review date inside the horizon."
              action={
                <Link
                  className="btn btn-secondary"
                  to="/compliance/policy-register"
                >
                  Policy Register
                </Link>
              }
            >
              <div className="chart-list">
                {(policyReview?.items ?? []).map((policy) => (
                  <ListRow
                    key={policy.policyId}
                    to={`/compliance/policies/${policy.policyId}`}
                    primary={`${policy.code} · ${policy.title}`}
                    secondary={`v${policy.version} · ${titleCase(policy.lifecycleStatus)} · ${policy.ownerName ?? "Unassigned"}`}
                    trailing={formatDate(policy.reviewDate)}
                  />
                ))}
              </div>
            </ChartSection>
          </div>

          <div className="grid-2 dashboard-secondary-grid">
            <ChartSection
              title="Recent Audit activity"
              subtitle="Governed activity recorded on this platform, from the append-only audit trail."
              source="Replayed workbook history is excluded: it is not activity on this platform."
              testId="dashboard-recent-activity"
              restricted={recentActivity === null}
              isEmpty={(recentActivity ?? []).length === 0}
              emptyLabel="No platform activity recorded yet."
              action={
                <Link className="btn btn-secondary" to="/audit-trail">
                  Audit Trail
                </Link>
              }
            >
              <div className="chart-list">
                {(recentActivity ?? []).map((event) => (
                  <ListRow
                    key={event.id}
                    primary={`${event.action} · ${event.entityType}`}
                    secondary={event.actor?.name ?? "System"}
                    trailing={formatDateTime(event.at)}
                  />
                ))}
              </div>
            </ChartSection>

            <ChartSection
              title="GenRAC status"
              subtitle="Configuration-driven connector state. Live access is never claimed while unconfigured."
              testId="dashboard-genrac"
              restricted={genrac === null}
              isEmpty={false}
              emptyLabel=""
              action={
                <Link
                  className="btn btn-secondary"
                  to="/data/genrac-integration"
                >
                  GenRAC Integration
                </Link>
              }
            >
              <div className="genrac-status" data-testid="dashboard-genrac-body">
                <p className="genrac-state">
                  <Database size={18} />
                  <strong data-testid="dashboard-genrac-state">
                    {genrac?.configured ? titleCase(genrac.status) : "Not configured"}
                  </strong>
                </p>
                <dl className="genrac-facts">
                  <div>
                    <dt>Mapped records</dt>
                    <dd>{formatNumber(genrac?.mappingCount ?? 0)}</dd>
                  </div>
                  <div>
                    <dt>Last sync attempt</dt>
                    <dd>{formatDateTime(genrac?.lastAttemptedSyncAt ?? null)}</dd>
                  </div>
                  <div>
                    <dt>Last successful sync</dt>
                    <dd>
                      {formatDateTime(genrac?.lastSuccessfulSyncAt ?? null)}
                    </dd>
                  </div>
                  <div>
                    <dt>Live access</dt>
                    <dd>{genrac?.liveAccess ? "Yes" : "No"}</dd>
                  </div>
                </dl>
                {genrac && !genrac.configured ? (
                  <p className="chart-source">
                    Live GenRAC synchronization remains Not Configured pending
                    environment access, credentials and approved master-data
                    mappings.
                  </p>
                ) : null}
              </div>
            </ChartSection>
          </div>

          <div className="grid-2 dashboard-secondary-grid">
            <ChartSection
              title="Operational registers"
              subtitle="Imported audit, training, incident, vendor and action records held for this Company."
              testId="dashboard-registers"
              restricted={data.registers === null || data.registers === undefined}
              isEmpty={(data.registers ?? []).length === 0}
              emptyLabel="No operational registers are active for this Company."
              action={
                <Link
                  className="btn btn-secondary"
                  to="/compliance/operational-registers"
                >
                  Operational Registers
                </Link>
              }
            >
              <HorizontalBars
                testId="register-bars"
                rows={(data.registers ?? []).map((register) => ({
                  key: register.code,
                  label: register.name,
                  value: register.recordCount,
                  max: Math.max(
                    1,
                    ...(data.registers ?? []).map((row) => row.recordCount),
                  ),
                  colour: "#2563eb",
                }))}
              />
            </ChartSection>

            <ChartSection
              title="Latest data import"
              subtitle="The most recent reviewed import batch for this Company."
              testId="dashboard-latest-import"
              restricted={false}
              isEmpty={!data.latestImport}
              emptyLabel="No import batch has been committed for this Company yet."
              action={
                <Link className="btn btn-secondary" to="/data/import-history">
                  Import History
                </Link>
              }
            >
              {data.latestImport ? (
                <dl className="genrac-facts">
                  <div>
                    <dt>File</dt>
                    <dd>{data.latestImport.originalFilename}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{titleCase(data.latestImport.status)}</dd>
                  </div>
                  <div>
                    <dt>Created / updated</dt>
                    <dd>
                      {formatNumber(data.latestImport.createdCount)} /{" "}
                      {formatNumber(data.latestImport.updatedCount)}
                    </dd>
                  </div>
                  <div>
                    <dt>Completed</dt>
                    <dd>{formatDateTime(data.latestImport.completedAt)}</dd>
                  </div>
                </dl>
              ) : null}
            </ChartSection>
          </div>

          <p className="dashboard-generated" data-testid="dashboard-generated">
            <History size={13} /> Generated {formatDateTime(data.generatedAt ?? null)}{" "}
            from live PostgreSQL data for {user?.activeCompany.name}.
            <Link to="/evidence">
              <Archive size={13} /> Evidence Library
            </Link>
            <Link to="/kpi/approval">
              <BadgeCheck size={13} /> KPI Approval
            </Link>
          </p>
        </>
      ) : null}
    </div>
  );
}
