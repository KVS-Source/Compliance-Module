import {
  Archive,
  ArrowLeft,
  Pencil,
  Power,
  PowerOff,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { ApiError } from "../../services/apiClient";
import { controlApi } from "../../services/controlApi";
import { ControlAuditHistory } from "./ControlAuditHistory";
import { ControlCheckpointSummary } from "./ControlCheckpointSummary";
import { ControlFormModal } from "./ControlFormModal";
import { ControlFrameworkMapping } from "./ControlFrameworkMapping";
import { ControlFrameworkRuleMapping } from "./ControlFrameworkRuleMapping";
import {
  ControlLifecycleDialog,
  type ControlLifecycleKind,
} from "./ControlLifecycleDialog";
import { ControlPolicyVersionMapping } from "./ControlPolicyVersionMapping";
import { ControlTraceabilityPanel } from "./ControlTraceabilityPanel";
import {
  display,
  EVIDENCE_UNAVAILABLE_MESSAGE,
  formatControlDate,
  formatControlDateTime,
  implementationTone,
  lifecycleTone,
  named,
  statusLabel,
} from "./controlFormatting";

export function ControlDetailPage() {
  const { controlId = "" } = useParams();
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();

  const canWrite = hasPermission("controls:write");

  const [detailVersion, setDetailVersion] = useState(0);
  const [traceVersion, setTraceVersion] = useState(0);
  const [auditVersion, setAuditVersion] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lifecycle, setLifecycle] = useState<ControlLifecycleKind | null>(null);

  const detail = useApiResource(
    () => controlApi.getControl(controlId),
    [controlId, contextVersion, user?.activeCompany.id, detailVersion],
  );

  const traceability = useApiResource(
    () => controlApi.getControlTraceability(controlId),
    [controlId, contextVersion, user?.activeCompany.id, traceVersion],
  );

  const audit = useApiResource(
    () =>
      controlApi.listControlAuditEvents(controlId, {
        page: auditPage,
        pageSize: 20,
      }),
    [
      controlId,
      contextVersion,
      user?.activeCompany.id,
      auditPage,
      auditVersion,
    ],
  );

  useEffect(() => {
    setEditing(false);
    setLifecycle(null);
    setAuditPage(1);
  }, [contextVersion, user?.activeCompany.id, controlId]);

  useEffect(() => {
    if (!detail.loading) setRefreshing(false);
  }, [detail.loading]);

  const refreshAll = () => {
    setRefreshing(true);
    setDetailVersion((value) => value + 1);
    setTraceVersion((value) => value + 1);
    setAuditVersion((value) => value + 1);
  };

  const activeRuleFrameworkIds = useMemo(
    () =>
      (traceability.data?.frameworkRuleMappings ?? [])
        .filter((mapping) => mapping.isActive)
        .map((mapping) => mapping.frameworkId),
    [traceability.data],
  );

  if (detail.loading && !detail.data) {
    return (
      <div
        data-testid={
          refreshing ? "control-detail-refreshing" : "control-detail-loading"
        }
      >
        <LoadingState
          label={
            refreshing
              ? "Refreshing Control detail…"
              : "Loading Control detail…"
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
          title="Control detail"
          section="Policies & Controls"
          description="Company-scoped Control record."
          connected
        />
        {notFound ? (
          <section className="card state-panel state-error" role="alert">
            <ShieldAlert size={24} aria-hidden />
            <div>
              <strong>Control not found</strong>
              <p>
                This Control is not available in{" "}
                {user?.activeCompany.name ?? "the active Company"}. It may
                belong to another Company context.
              </p>
            </div>
            <Link className="btn btn-secondary" to="/compliance/controls">
              <ArrowLeft size={15} /> Back to register
            </Link>
          </section>
        ) : (
          <ErrorState error={detail.error} />
        )}
      </div>
    );
  }

  const control = detail.data;
  if (!control) return <LoadingState label="Loading Control detail…" />;

  const archived = control.lifecycleStatus === "ARCHIVED";
  const checkpointActive =
    traceability.data?.checkpointCounts.active ?? control.activeCheckpointCount;
  const checkpointInactive =
    traceability.data?.checkpointCounts.inactive ??
    control.inactiveCheckpointCount;
  const checkpointArchived =
    traceability.data?.checkpointCounts.archived ??
    control.archivedCheckpointCount;

  return (
    <div className="page">
      <PageHeader
        title={control.title}
        section="Policies & Controls"
        description={`${control.code} · ${user?.activeCompany.name ?? "Active Company"}`}
        showDescription
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
                  onClick={() => setEditing(true)}
                  data-testid="control-edit-open"
                >
                  <Pencil size={15} /> Edit Control
                </button>
                {control.lifecycleStatus === "INACTIVE" ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setLifecycle("activate")}
                    data-testid="control-activate-open"
                  >
                    <Power size={15} /> Activate
                  </button>
                ) : null}
                {control.lifecycleStatus === "ACTIVE" ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setLifecycle("deactivate")}
                    data-testid="control-deactivate-open"
                  >
                    <PowerOff size={15} /> Deactivate
                  </button>
                ) : null}
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setLifecycle("archive")}
                  data-testid="control-archive-open"
                >
                  <Archive size={15} /> Archive
                </button>
              </>
            ) : null}
            <Link className="btn btn-secondary" to="/compliance/controls">
              <ArrowLeft size={15} /> Back to register
            </Link>
          </>
        }
      />

      <p className="sr-only">
        Control code {control.code}. Lifecycle{" "}
        {statusLabel(control.lifecycleStatus)}.
      </p>

      {archived ? (
        <div
          className="banner warning"
          role="status"
          data-testid="control-archived-banner"
        >
          <Archive size={16} aria-hidden />
          <div>
            <strong>This Control is archived and read-only.</strong>
            <p style={{ margin: "2px 0 0" }}>
              Mapping history remains readable. There is no unarchive action.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <section className="card" data-testid="control-summary">
          <header className="card-head">
            <div>
              <h2>Summary</h2>
              <p>Stable Control identity and ownership.</p>
            </div>
            <Badge tone={lifecycleTone(control.lifecycleStatus)}>
              {statusLabel(control.lifecycleStatus)}
            </Badge>
          </header>
          <div className="card-pad">
            <dl className="detail-list">
              <div>
                <dt>Code</dt>
                <dd className="mono">{control.code}</dd>
              </div>
              <div>
                <dt>Title</dt>
                <dd>{control.title}</dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>
                  {display(control.description)}
                </dd>
              </div>
              <div>
                <dt>Objective</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{control.objective}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{named(control.owner)}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{named(control.department)}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatControlDateTime(control.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatControlDateTime(control.updatedAt)}</dd>
              </div>
              {control.archivedAt ? (
                <div>
                  <dt>Archived</dt>
                  <dd>{formatControlDateTime(control.archivedAt)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>

        <section className="card" data-testid="control-lifecycle-implementation">
          <header className="card-head">
            <div>
              <h2>Lifecycle and implementation</h2>
              <p>Operational status and verification details.</p>
            </div>
            <Badge tone={implementationTone(control.implementationStatus)}>
              {statusLabel(control.implementationStatus)}
            </Badge>
          </header>
          <div className="card-pad stack">
            <dl className="detail-list">
              <div>
                <dt>Control type</dt>
                <dd>{statusLabel(control.controlType)}</dd>
              </div>
              <div>
                <dt>Frequency</dt>
                <dd>{statusLabel(control.frequency)}</dd>
              </div>
              <div>
                <dt>Requires Evidence</dt>
                <dd>{control.requiresEvidence ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Last review</dt>
                <dd>{formatControlDate(control.lastReviewDate)}</dd>
              </div>
              <div>
                <dt>Next review</dt>
                <dd>{formatControlDate(control.nextReviewDate)}</dd>
              </div>
              <div>
                <dt>Active mappings</dt>
                <dd>
                  Policies {control.activePolicyVersionMappingCount} · Frameworks{" "}
                  {control.activeFrameworkMappingCount} · Rules{" "}
                  {control.activeFrameworkRuleMappingCount}
                </dd>
              </div>
            </dl>
            {control.requiresEvidence ? (
              <div
                className="banner warning"
                role="status"
                data-testid="control-evidence-warning"
              >
                <TriangleAlert size={15} aria-hidden />{" "}
                {EVIDENCE_UNAVAILABLE_MESSAGE}
              </div>
            ) : null}
            <div>
              <h3>Verification method</h3>
              <pre
                className="policy-plain-text"
                style={{ whiteSpace: "pre-wrap", margin: 0 }}
              >
                {control.verificationMethod}
              </pre>
            </div>
            <div>
              <h3>Implementation notes</h3>
              <pre
                className="policy-plain-text"
                style={{ whiteSpace: "pre-wrap", margin: 0 }}
              >
                {display(control.implementationNotes)}
              </pre>
            </div>
          </div>
        </section>
      </div>

      <div className="stack" style={{ gap: 16, marginTop: 16 }}>
        <ControlPolicyVersionMapping
          control={control}
          mappings={traceability.data?.policyVersionMappings ?? []}
          canWrite={canWrite}
          onUpdated={() => {
            refreshAll();
            showToast(
              "success",
              "Policy Version mappings updated",
              "Active Policy Version mappings were saved.",
            );
          }}
        />

        <ControlFrameworkMapping
          control={control}
          mappings={traceability.data?.frameworkMappings ?? []}
          activeRuleFrameworkIds={activeRuleFrameworkIds}
          canWrite={canWrite}
          onUpdated={() => {
            refreshAll();
            showToast(
              "success",
              "Framework mappings updated",
              "Active Framework mappings were saved.",
            );
          }}
        />

        <ControlFrameworkRuleMapping
          control={control}
          mappings={traceability.data?.frameworkRuleMappings ?? []}
          frameworkMappings={traceability.data?.frameworkMappings ?? []}
          canWrite={canWrite}
          onUpdated={() => {
            refreshAll();
            showToast(
              "success",
              "Framework Rule mappings updated",
              "Active Framework Rule mappings were saved.",
            );
          }}
        />

        <ControlCheckpointSummary
          active={checkpointActive}
          inactive={checkpointInactive}
          archived={checkpointArchived}
        />

        <ControlTraceabilityPanel
          data={traceability.data}
          loading={traceability.loading}
          error={traceability.error}
          onRetry={() => setTraceVersion((value) => value + 1)}
        />

        <ControlAuditHistory
          events={audit.data?.data ?? null}
          meta={audit.data?.meta ?? null}
          loading={audit.loading}
          error={audit.error}
          page={auditPage}
          onPageChange={setAuditPage}
          onRetry={() => setAuditVersion((value) => value + 1)}
        />
      </div>

      {editing ? (
        <ControlFormModal
          mode="edit"
          control={control}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refreshAll();
            showToast(
              "success",
              "Control updated",
              "Metadata changes were saved.",
            );
          }}
        />
      ) : null}

      {lifecycle ? (
        <ControlLifecycleDialog
          kind={lifecycle}
          control={control}
          onClose={() => setLifecycle(null)}
          onCompleted={() => {
            const kind = lifecycle;
            setLifecycle(null);
            refreshAll();
            showToast(
              "success",
              kind === "activate"
                ? "Control activated"
                : kind === "deactivate"
                  ? "Control deactivated"
                  : "Control archived",
              kind === "archive"
                ? "The Control is now read-only."
                : "Lifecycle status was updated.",
            );
          }}
        />
      ) : null}
    </div>
  );
}
