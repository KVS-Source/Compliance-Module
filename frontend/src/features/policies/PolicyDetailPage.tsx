import {
  Archive,
  ArrowLeft,
  FilePlus2,
  Pencil,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { ApiError } from "../../services/apiClient";
import { policyApi } from "../../services/policyApi";
import type { PolicyVersion } from "../../types/api";
import { PolicyAuditHistory } from "./PolicyAuditHistory";
import {
  PolicyDecisionModal,
  type PolicyDecisionKind,
} from "./PolicyDecisionModal";
import { PolicyFormModal } from "./PolicyFormModal";
import { PolicyFrameworkMapping } from "./PolicyFrameworkMapping";
import { PolicyTraceabilityPanel } from "./PolicyTraceabilityPanel";
import { PolicyVersionFormModal } from "./PolicyVersionFormModal";
import { PolicyVersionHistory } from "./PolicyVersionHistory";
import {
  display,
  EVIDENCE_UNAVAILABLE_MESSAGE,
  formatPolicyDate,
  formatPolicyDateTime,
  lifecycleTone,
  named,
  statusLabel,
  versionStatusTone,
} from "./policyFormatting";

export function PolicyDetailPage() {
  const { policyId = "" } = useParams();
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();

  const canWrite = hasPermission("policies:write");
  const canSubmit = hasPermission("policies:submit");
  const canApprove = hasPermission("policies:approve");

  const [detailVersion, setDetailVersion] = useState(0);
  const [versionsVersion, setVersionsVersion] = useState(0);
  const [traceVersion, setTraceVersion] = useState(0);
  const [auditVersion, setAuditVersion] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedVersion, setSelectedVersion] = useState<PolicyVersion | null>(
    null,
  );
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [editingVersion, setEditingVersion] = useState<PolicyVersion | null>(
    null,
  );
  const [decision, setDecision] = useState<{
    kind: PolicyDecisionKind;
    version?: PolicyVersion | null;
  } | null>(null);

  const detail = useApiResource(
    () => policyApi.getPolicy(policyId),
    [policyId, contextVersion, user?.activeCompany.id, detailVersion],
  );

  const versions = useApiResource(
    () => policyApi.listPolicyVersions(policyId),
    [policyId, contextVersion, user?.activeCompany.id, versionsVersion],
  );

  const traceability = useApiResource(
    () => policyApi.getPolicyTraceability(policyId),
    [policyId, contextVersion, user?.activeCompany.id, traceVersion],
  );

  const audit = useApiResource(
    () =>
      policyApi.listPolicyAuditEvents(policyId, {
        page: auditPage,
        pageSize: 20,
      }),
    [
      policyId,
      contextVersion,
      user?.activeCompany.id,
      auditPage,
      auditVersion,
    ],
  );

  useEffect(() => {
    setSelectedVersion(null);
    setEditingPolicy(false);
    setCreatingVersion(false);
    setEditingVersion(null);
    setDecision(null);
    setAuditPage(1);
  }, [contextVersion, user?.activeCompany.id, policyId]);

  useEffect(() => {
    if (!detail.loading) setRefreshing(false);
  }, [detail.loading]);

  useEffect(() => {
    if (!versions.data || versions.data.length === 0) return;
    setSelectedVersion((current) => {
      if (current) {
        const refreshed = versions.data!.find(
          (entry) => entry.id === current.id,
        );
        if (refreshed) return refreshed;
      }
      const policy = detail.data;
      const preferredId =
        policy?.latestVersion?.id ??
        policy?.currentApprovedVersion?.id ??
        versions.data![0]!.id;
      return (
        versions.data!.find((entry) => entry.id === preferredId) ??
        versions.data![0]!
      );
    });
  }, [versions.data, detail.data]);

  const refreshAll = () => {
    setRefreshing(true);
    setDetailVersion((value) => value + 1);
    setVersionsVersion((value) => value + 1);
    setTraceVersion((value) => value + 1);
    setAuditVersion((value) => value + 1);
  };

  const onDecisionCompleted = () => {
    const kind = decision?.kind;
    setDecision(null);
    refreshAll();
    if (kind === "approve") {
      showToast("success", "Version approved", "The Policy Version is now approved.");
    } else if (kind === "reject") {
      showToast("success", "Version rejected", "The Policy Version was rejected.");
    } else if (kind === "submit") {
      showToast("success", "Version submitted", "The Policy Version was submitted.");
    } else if (kind === "archive") {
      showToast("success", "Policy archived", "The Policy is now read-only.");
    }
  };

  if (detail.loading && !detail.data) {
    return (
      <div
        data-testid={
          refreshing ? "policy-detail-refreshing" : "policy-detail-loading"
        }
      >
        <LoadingState
          label={
            refreshing ? "Refreshing Policy detail…" : "Loading Policy detail…"
          }
        />
      </div>
    );
  }

  if (detail.error && !detail.data) {
    const notFound =
      detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <div className="page">
        <PageHeader
          title="Policy detail"
          section="Policies & Controls"
          description="Company-scoped Policy record."
          connected
        />
        {notFound ? (
          <section className="card state-panel state-error" role="alert">
            <ShieldAlert size={24} aria-hidden />
            <div>
              <strong>Policy not found</strong>
              <p>
                This Policy is not available in{" "}
                {user?.activeCompany.name ?? "the active Company"}. It may
                belong to another Company context.
              </p>
            </div>
            <Link className="btn btn-secondary" to="/compliance/policy-register">
              <ArrowLeft size={15} /> Back to register
            </Link>
          </section>
        ) : (
          <ErrorState error={detail.error} />
        )}
      </div>
    );
  }

  const policy = detail.data;
  if (!policy) return <LoadingState label="Loading Policy detail…" />;

  const archived = policy.lifecycleStatus === "ARCHIVED";
  const focusVersion =
    selectedVersion ??
    policy.latestVersion ??
    policy.currentApprovedVersion;

  return (
    <div className="page">
      <PageHeader
        title={policy.title}
        section="Policies & Controls"
        description={`${policy.code} · ${user?.activeCompany.name ?? "Active Company"}`}
        connected
        actions={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={refreshAll}
              disabled={detail.loading}
            >
              <RefreshCw size={15} /> Refresh
            </button>
            {canWrite && !archived ? (
              <>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setEditingPolicy(true)}
                  data-testid="policy-edit-open"
                >
                  <Pencil size={15} /> Edit Policy
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setCreatingVersion(true)}
                  data-testid="policy-version-create-open"
                >
                  <FilePlus2 size={15} /> Create Version
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setDecision({ kind: "archive" })}
                  data-testid="policy-archive-open"
                >
                  <Archive size={15} /> Archive
                </button>
              </>
            ) : null}
            <Link
              className="btn btn-secondary"
              to="/compliance/policy-register"
            >
              <ArrowLeft size={15} /> Back to register
            </Link>
          </>
        }
      />

      <p className="sr-only">
        Policy code {policy.code}. Lifecycle {statusLabel(policy.lifecycleStatus)}.
      </p>

      {archived ? (
        <div
          className="banner warning"
          role="status"
          data-testid="policy-archived-banner"
        >
          <Archive size={16} aria-hidden />
          <div>
            <strong>This Policy is archived and read-only.</strong>
            <p style={{ margin: "2px 0 0" }}>
              Historical Versions remain readable. There is no unarchive action.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <section className="card" data-testid="policy-summary">
          <header className="card-head">
            <div>
              <h2>Summary</h2>
            </div>
            <Badge tone={lifecycleTone(policy.lifecycleStatus)}>
              {statusLabel(policy.lifecycleStatus)}
            </Badge>
          </header>
          <div className="card-pad">
            <dl className="detail-list">
              <div>
                <dt>Code</dt>
                <dd className="mono">{policy.code}</dd>
              </div>
              <div>
                <dt>Title</dt>
                <dd>{policy.title}</dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>
                  {display(policy.description)}
                </dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{named(policy.owner)}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{named(policy.department)}</dd>
              </div>
              <div>
                <dt>Latest Version</dt>
                <dd className="mono">
                  {policy.latestVersion
                    ? `${policy.latestVersion.version} (${statusLabel(policy.latestVersion.status)})`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Current approved Version</dt>
                <dd className="mono">
                  {policy.currentApprovedVersion
                    ? policy.currentApprovedVersion.version
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatPolicyDateTime(policy.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatPolicyDateTime(policy.updatedAt)}</dd>
              </div>
              {policy.archivedAt ? (
                <div>
                  <dt>Archived</dt>
                  <dd>{formatPolicyDateTime(policy.archivedAt)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>

        <section className="card" data-testid="policy-focus-version">
          <header className="card-head">
            <div>
              <h2>Selected Version</h2>
            </div>
            {focusVersion ? (
              <Badge tone={versionStatusTone(focusVersion.status)}>
                {statusLabel(focusVersion.status)}
              </Badge>
            ) : null}
          </header>
          <div className="card-pad stack">
            {focusVersion ? (
              <>
                <dl className="detail-list">
                  <div>
                    <dt>Version</dt>
                    <dd className="mono">{focusVersion.version}</dd>
                  </div>
                  <div>
                    <dt>Effective / review</dt>
                    <dd>
                      {formatPolicyDate(focusVersion.effectiveDate)} ·{" "}
                      {formatPolicyDate(focusVersion.reviewDate)}
                    </dd>
                  </div>
                  <div>
                    <dt>Requested approver</dt>
                    <dd>
                      {named(
                        focusVersion.requestedApprover,
                        "Any eligible approver",
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Requires Evidence</dt>
                    <dd>{focusVersion.requiresEvidence ? "Yes" : "No"}</dd>
                  </div>
                </dl>
                {focusVersion.requiresEvidence ? (
                  <div
                    className="banner warning"
                    role="status"
                    data-testid="policy-detail-evidence-warning"
                  >
                    <TriangleAlert size={15} aria-hidden />{" "}
                    {EVIDENCE_UNAVAILABLE_MESSAGE}
                  </div>
                ) : null}
                <div>
                  <h3>Content</h3>
                  <pre
                    className="policy-plain-text"
                    style={{ whiteSpace: "pre-wrap", margin: 0 }}
                  >
                    {focusVersion.content}
                  </pre>
                </div>
                <div>
                  <h3>Purpose</h3>
                  <pre
                    className="policy-plain-text"
                    style={{ whiteSpace: "pre-wrap", margin: 0 }}
                  >
                    {display(focusVersion.purpose)}
                  </pre>
                </div>
                <div>
                  <h3>Scope</h3>
                  <pre
                    className="policy-plain-text"
                    style={{ whiteSpace: "pre-wrap", margin: 0 }}
                  >
                    {display(focusVersion.scope)}
                  </pre>
                </div>
                <div>
                  <h3>Change summary</h3>
                  <pre
                    className="policy-plain-text"
                    style={{ whiteSpace: "pre-wrap", margin: 0 }}
                  >
                    {display(focusVersion.changeSummary)}
                  </pre>
                </div>
              </>
            ) : (
              <p className="muted">No Version is available for this Policy.</p>
            )}
          </div>
        </section>
      </div>

      <div className="stack" style={{ gap: 16, marginTop: 16 }}>
        <PolicyVersionHistory
          versions={versions.data}
          loading={versions.loading}
          error={versions.error}
          latestVersionId={policy.latestVersion?.id ?? null}
          currentApprovedVersionId={policy.currentApprovedVersion?.id ?? null}
          selectedVersionId={selectedVersion?.id ?? null}
          canWrite={canWrite}
          canSubmit={canSubmit}
          canApprove={canApprove}
          archived={archived}
          onSelect={setSelectedVersion}
          onRetry={() => setVersionsVersion((value) => value + 1)}
          onEdit={setEditingVersion}
          onSubmit={(version) => setDecision({ kind: "submit", version })}
          onApprove={(version) => setDecision({ kind: "approve", version })}
          onReject={(version) => setDecision({ kind: "reject", version })}
        />

        <PolicyFrameworkMapping
          version={selectedVersion}
          canWrite={canWrite && !archived}
          onUpdated={(updated) => {
            setSelectedVersion(updated);
            refreshAll();
            showToast(
              "success",
              "Framework mappings updated",
              `Active mappings on Version ${updated.version} were saved.`,
            );
          }}
        />

        <PolicyTraceabilityPanel
          data={traceability.data}
          loading={traceability.loading}
          error={traceability.error}
          onRetry={() => setTraceVersion((value) => value + 1)}
        />

        <PolicyAuditHistory
          events={audit.data?.data ?? null}
          meta={audit.data?.meta ?? null}
          loading={audit.loading}
          error={audit.error}
          page={auditPage}
          onPageChange={setAuditPage}
          onRetry={() => setAuditVersion((value) => value + 1)}
        />
      </div>

      {editingPolicy ? (
        <PolicyFormModal
          mode="edit"
          policy={policy}
          onClose={() => setEditingPolicy(false)}
          onSaved={() => {
            setEditingPolicy(false);
            refreshAll();
            showToast(
              "success",
              "Policy updated",
              "Metadata changes were saved.",
            );
          }}
        />
      ) : null}

      {creatingVersion ? (
        <PolicyVersionFormModal
          mode="create"
          policyId={policy.id}
          latestVersion={policy.latestVersion}
          onClose={() => setCreatingVersion(false)}
          onSaved={(version) => {
            setCreatingVersion(false);
            setSelectedVersion(version);
            refreshAll();
            showToast(
              "success",
              "Version created",
              `Version ${version.version} is ready as ${version.status}.`,
            );
          }}
        />
      ) : null}

      {editingVersion ? (
        <PolicyVersionFormModal
          mode="edit"
          policyId={policy.id}
          latestVersion={policy.latestVersion}
          version={editingVersion}
          onClose={() => setEditingVersion(null)}
          onSaved={(version) => {
            setEditingVersion(null);
            setSelectedVersion(version);
            refreshAll();
            showToast(
              "success",
              "Version updated",
              `Version ${version.version} was saved.`,
            );
          }}
        />
      ) : null}

      {decision ? (
        <PolicyDecisionModal
          kind={decision.kind}
          policy={policy}
          version={decision.version}
          onClose={() => setDecision(null)}
          onCompleted={onDecisionCompleted}
        />
      ) : null}
    </div>
  );
}
