import {
  Archive,
  ArrowLeft,
  ClipboardCheck,
  Pencil,
  Power,
  PowerOff,
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
import { checkpointApi } from "../../services/checkpointApi";
import { CheckpointAuditHistory } from "./CheckpointAuditHistory";
import { CheckpointFormModal } from "./CheckpointFormModal";
import { CheckpointLatestReview } from "./CheckpointLatestReview";
import {
  CheckpointLifecycleDialog,
  type CheckpointLifecycleKind,
} from "./CheckpointLifecycleDialog";
import { CheckpointReviewHistory } from "./CheckpointReviewHistory";
import { CheckpointReviewModal } from "./CheckpointReviewModal";
import { CheckpointTraceabilityPanel } from "./CheckpointTraceabilityPanel";
import {
  display,
  formatCheckpointDate,
  formatCheckpointDateTime,
  lifecycleTone,
  named,
  outcomeTone,
  statusLabel,
} from "./checkpointFormatting";

export function CheckpointDetailPage() {
  const { checkpointId = "" } = useParams();
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();

  const canWrite = hasPermission("checkpoints:write");
  const canReview = hasPermission("checkpoints:review");
  const canReadControls = hasPermission("controls:read");

  const [detailVersion, setDetailVersion] = useState(0);
  const [latestVersion, setLatestVersion] = useState(0);
  const [reviewHistoryVersion, setReviewHistoryVersion] = useState(0);
  const [traceVersion, setTraceVersion] = useState(0);
  const [auditVersion, setAuditVersion] = useState(0);
  const [reviewPage, setReviewPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lifecycle, setLifecycle] = useState<CheckpointLifecycleKind | null>(
    null,
  );
  const [reviewing, setReviewing] = useState(false);

  const detail = useApiResource(
    () => checkpointApi.getCheckpoint(checkpointId),
    [checkpointId, contextVersion, user?.activeCompany.id, detailVersion],
  );

  const latestReview = useApiResource(
    () => checkpointApi.getLatestCheckpointReview(checkpointId),
    [checkpointId, contextVersion, user?.activeCompany.id, latestVersion],
  );

  const reviewHistory = useApiResource(
    () =>
      checkpointApi.listCheckpointReviews(checkpointId, {
        page: reviewPage,
        pageSize: 20,
      }),
    [
      checkpointId,
      contextVersion,
      user?.activeCompany.id,
      reviewPage,
      reviewHistoryVersion,
    ],
  );

  const traceability = useApiResource(
    () => checkpointApi.getCheckpointTraceability(checkpointId),
    [checkpointId, contextVersion, user?.activeCompany.id, traceVersion],
  );

  const audit = useApiResource(
    () =>
      checkpointApi.listCheckpointAuditEvents(checkpointId, {
        page: auditPage,
        pageSize: 20,
      }),
    [
      checkpointId,
      contextVersion,
      user?.activeCompany.id,
      auditPage,
      auditVersion,
    ],
  );

  useEffect(() => {
    setEditing(false);
    setLifecycle(null);
    setReviewing(false);
    setReviewPage(1);
    setAuditPage(1);
  }, [contextVersion, user?.activeCompany.id, checkpointId]);

  useEffect(() => {
    if (!detail.loading) setRefreshing(false);
  }, [detail.loading]);

  const refreshAll = () => {
    setRefreshing(true);
    setDetailVersion((value) => value + 1);
    setLatestVersion((value) => value + 1);
    setReviewHistoryVersion((value) => value + 1);
    setTraceVersion((value) => value + 1);
    setAuditVersion((value) => value + 1);
  };

  if (detail.loading && !detail.data) {
    return (
      <div
        data-testid={
          refreshing
            ? "checkpoint-detail-refreshing"
            : "checkpoint-detail-loading"
        }
      >
        <LoadingState
          label={
            refreshing
              ? "Refreshing Checkpoint detail…"
              : "Loading Checkpoint detail…"
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
          title="Checkpoint detail"
          section="Policies & Controls"
          description="Company-scoped Checkpoint record."
          connected
        />
        {notFound ? (
          <section className="card state-panel state-error" role="alert">
            <ShieldAlert size={24} aria-hidden />
            <div>
              <strong>Checkpoint not found</strong>
              <p>
                This Checkpoint is not available in{" "}
                {user?.activeCompany.name ?? "the active Company"}. It may
                belong to another Company context.
              </p>
            </div>
            <Link className="btn btn-secondary" to="/compliance/checkpoints">
              <ArrowLeft size={15} /> Back to register
            </Link>
          </section>
        ) : (
          <ErrorState error={detail.error} />
        )}
      </div>
    );
  }

  const checkpoint = detail.data;
  if (!checkpoint) {
    return <LoadingState label="Loading Checkpoint detail…" />;
  }

  const archived = checkpoint.lifecycleStatus === "ARCHIVED";
  const inactiveControl =
    checkpoint.control?.lifecycleStatus === "INACTIVE";

  return (
    <div className="page">
      <PageHeader
        title={checkpoint.title}
        section="Policies & Controls"
        description={`${checkpoint.code} · ${user?.activeCompany.name ?? "Active Company"}`}
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
            {canReview && checkpoint.lifecycleStatus === "ACTIVE" ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setReviewing(true)}
                data-testid="checkpoint-review-open"
              >
                <ClipboardCheck size={15} /> Submit Review
              </button>
            ) : null}
            {canWrite && !archived ? (
              <>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setEditing(true)}
                  data-testid="checkpoint-edit-open"
                >
                  <Pencil size={15} /> Edit Checkpoint
                </button>
                {checkpoint.lifecycleStatus === "INACTIVE" ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setLifecycle("activate")}
                    data-testid="checkpoint-activate-open"
                  >
                    <Power size={15} /> Activate
                  </button>
                ) : null}
                {checkpoint.lifecycleStatus === "ACTIVE" ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setLifecycle("deactivate")}
                    data-testid="checkpoint-deactivate-open"
                  >
                    <PowerOff size={15} /> Deactivate
                  </button>
                ) : null}
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setLifecycle("archive")}
                  data-testid="checkpoint-archive-open"
                >
                  <Archive size={15} /> Archive
                </button>
              </>
            ) : null}
            <Link className="btn btn-secondary" to="/compliance/checkpoints">
              <ArrowLeft size={15} /> Back to register
            </Link>
          </>
        }
      />

      <p className="sr-only">
        Checkpoint code {checkpoint.code}. Lifecycle{" "}
        {statusLabel(checkpoint.lifecycleStatus)}.
      </p>

      {archived ? (
        <div
          className="banner warning"
          role="status"
          data-testid="checkpoint-archived-banner"
        >
          <Archive size={16} aria-hidden />
          <div>
            <strong>This Checkpoint is archived and read-only.</strong>
            <p style={{ margin: "2px 0 0" }}>
              Review and audit history remain readable. There is no unarchive
              action.
            </p>
          </div>
        </div>
      ) : null}

      {inactiveControl ? (
        <div
          className="banner warning"
          role="status"
          data-testid="checkpoint-inactive-control-banner"
        >
          <TriangleAlert size={16} aria-hidden />
          <div>
            Parent Control is INACTIVE. An ACTIVE Checkpoint under an INACTIVE
            Control is allowed.
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <section className="card" data-testid="checkpoint-summary">
          <header className="card-head">
            <div>
              <h2>Summary</h2>
            </div>
            <Badge tone={lifecycleTone(checkpoint.lifecycleStatus)}>
              {statusLabel(checkpoint.lifecycleStatus)}
            </Badge>
          </header>
          <div className="card-pad">
            <dl className="detail-list">
              <div>
                <dt>Code</dt>
                <dd className="mono">{checkpoint.code}</dd>
              </div>
              <div>
                <dt>Title</dt>
                <dd>{checkpoint.title}</dd>
              </div>
              <div>
                <dt>Description</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>
                  {display(checkpoint.description)}
                </dd>
              </div>
              <div>
                <dt>Parent Control</dt>
                <dd data-testid="checkpoint-parent-control">
                  {checkpoint.control ? (
                    canReadControls ? (
                      <Link
                        to={`/compliance/controls/${checkpoint.control.id}`}
                      >
                        {checkpoint.control.code} · {checkpoint.control.title}
                      </Link>
                    ) : (
                      <>
                        <span className="mono">{checkpoint.control.code}</span>{" "}
                        · {checkpoint.control.title}
                      </>
                    )
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{named(checkpoint.owner)}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{named(checkpoint.department)}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatCheckpointDateTime(checkpoint.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatCheckpointDateTime(checkpoint.updatedAt)}</dd>
              </div>
              {checkpoint.archivedAt ? (
                <div>
                  <dt>Archived</dt>
                  <dd>{formatCheckpointDateTime(checkpoint.archivedAt)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>

        <section className="card" data-testid="checkpoint-schedule">
          <header className="card-head">
            <div>
              <h2>Schedule and expected result</h2>
            </div>
            {checkpoint.latestOutcome ? (
              <Badge tone={outcomeTone(checkpoint.latestOutcome)}>
                {statusLabel(checkpoint.latestOutcome)}
              </Badge>
            ) : null}
          </header>
          <div className="card-pad stack">
            <dl className="detail-list">
              <div>
                <dt>Verification frequency</dt>
                <dd>{statusLabel(checkpoint.verificationFrequency)}</dd>
              </div>
              <div>
                <dt>Evidence required</dt>
                <dd>{checkpoint.evidenceRequired ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Initial review date</dt>
                <dd>{formatCheckpointDate(checkpoint.initialReviewDate)}</dd>
              </div>
              <div>
                <dt>Next review date</dt>
                <dd>{formatCheckpointDate(checkpoint.nextReviewDate)}</dd>
              </div>
              <div>
                <dt>Last reviewed</dt>
                <dd>{formatCheckpointDateTime(checkpoint.lastReviewedAt)}</dd>
              </div>
              <div>
                <dt>Total Reviews</dt>
                <dd>{checkpoint.totalReviewCount}</dd>
              </div>
              <div>
                <dt>Active Control mappings</dt>
                <dd>
                  Policies {checkpoint.activePolicyVersionMappingCount} ·
                  Frameworks {checkpoint.activeFrameworkMappingCount} · Rules{" "}
                  {checkpoint.activeFrameworkRuleMappingCount}
                </dd>
              </div>
            </dl>
            <div>
              <h3>Expected result</h3>
              <pre
                className="policy-plain-text"
                style={{ whiteSpace: "pre-wrap", margin: 0 }}
              >
                {checkpoint.expectedResult}
              </pre>
            </div>
          </div>
        </section>
      </div>

      <div className="stack" style={{ gap: 16, marginTop: 16 }}>
        <CheckpointLatestReview
          review={latestReview.data ?? null}
          loading={latestReview.loading}
          error={latestReview.error}
          onRetry={() => setLatestVersion((value) => value + 1)}
        />

        <CheckpointReviewHistory
          reviews={reviewHistory.data?.data ?? null}
          meta={reviewHistory.data?.meta ?? null}
          loading={reviewHistory.loading}
          error={reviewHistory.error}
          page={reviewPage}
          onPageChange={setReviewPage}
          onRetry={() => setReviewHistoryVersion((value) => value + 1)}
        />

        <CheckpointTraceabilityPanel
          data={traceability.data}
          loading={traceability.loading}
          error={traceability.error}
          onRetry={() => setTraceVersion((value) => value + 1)}
        />

        <CheckpointAuditHistory
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
        <CheckpointFormModal
          mode="edit"
          checkpoint={checkpoint}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refreshAll();
            showToast(
              "success",
              "Checkpoint updated",
              "Metadata changes were saved.",
            );
          }}
        />
      ) : null}

      {lifecycle ? (
        <CheckpointLifecycleDialog
          kind={lifecycle}
          checkpoint={checkpoint}
          onClose={() => setLifecycle(null)}
          onCompleted={() => {
            const kind = lifecycle;
            setLifecycle(null);
            refreshAll();
            showToast(
              "success",
              kind === "activate"
                ? "Checkpoint activated"
                : kind === "deactivate"
                  ? "Checkpoint deactivated"
                  : "Checkpoint archived",
              kind === "archive"
                ? "The Checkpoint is now read-only."
                : "Lifecycle status was updated.",
            );
          }}
        />
      ) : null}

      {reviewing ? (
        <CheckpointReviewModal
          checkpoint={checkpoint}
          onClose={() => setReviewing(false)}
          onSubmitted={() => {
            setReviewing(false);
            refreshAll();
            showToast(
              "success",
              "Review submitted",
              "The Checkpoint Review was recorded.",
            );
          }}
        />
      ) : null}
    </div>
  );
}
