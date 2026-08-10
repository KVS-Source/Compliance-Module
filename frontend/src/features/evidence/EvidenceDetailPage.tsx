import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Download,
  Pencil,
  RefreshCw,
  Send,
  ShieldAlert,
  TriangleAlert,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { Modal } from "../../components/feedback/Modal";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { ApiError } from "../../services/apiClient";
import { evidenceApi } from "../../services/evidenceApi";
import { masterDataApi } from "../../services/masterDataApi";
import type {
  CompanyUser,
  Department,
  EvidenceDetail,
  UpdateEvidenceInput,
} from "../../types/api";
import {
  evidenceActionError,
  evidenceWorkflowError,
  type FieldErrors,
} from "../../utils/fieldErrors";
import {
  EvidenceFileUpload,
  useEvidenceUpload,
} from "./EvidenceFileUpload";
import {
  EvidenceAuditHistory,
  EvidenceReviewDecisionHistory,
} from "./EvidenceHistoryPanels";
import { EvidenceLinkSections } from "./EvidenceLinkSections";
import {
  EvidenceReviewModal,
  type EvidenceReviewKind,
} from "./EvidenceReviewModal";
import {
  display,
  evidenceStatusLabel,
  evidenceStatusTone,
  formatEvidenceDate,
  formatEvidenceDateTime,
  formatFileSize,
  isEvidenceId,
  named,
} from "./evidenceFormatting";

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 5_000;
const HISTORY_PAGE_SIZE = 20;

type MasterState<T> =
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "unavailable" };

const loadMaster = async <T,>(
  loader: () => Promise<T[]>,
): Promise<MasterState<T>> => {
  try {
    return { status: "ready", items: await loader() };
  } catch {
    return { status: "unavailable" };
  }
};

type LifecycleConfirm = "submit" | "archive";

const EMPTY_PAGE_META = {
  page: 1,
  pageSize: HISTORY_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

export function EvidenceDetailPage() {
  const { evidenceId = "" } = useParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();

  const canWrite = hasPermission("evidence:write");
  const canReview = hasPermission("evidence:review");
  const canDownload =
    hasPermission("evidence:read") && hasPermission("evidence:download");

  const [detailVersion, setDetailVersion] = useState(0);
  const [decisionsVersion, setDecisionsVersion] = useState(0);
  const [auditVersion, setAuditVersion] = useState(0);
  const [decisionsPage, setDecisionsPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lifecycleConfirm, setLifecycleConfirm] =
    useState<LifecycleConfirm | null>(null);
  const [reviewKind, setReviewKind] = useState<EvidenceReviewKind | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [preview, setPreview] = useState<{
    objectUrl: string;
    contentType: string;
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    ownerId: "",
    departmentId: "",
    issueDate: "",
    expiresAt: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [editBusy, setEditBusy] = useState(false);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const upload = useEvidenceUpload();

  const [users, setUsers] = useState<MasterState<CompanyUser>>({
    status: "loading",
  });
  const [departments, setDepartments] = useState<MasterState<Department>>({
    status: "loading",
  });

  const validId = isEvidenceId(evidenceId);

  const detail = useApiResource(
    () =>
      validId
        ? evidenceApi.getEvidence(evidenceId)
        : Promise.reject(new ApiError("Invalid Evidence ID", 404, "NOT_FOUND")),
    [evidenceId, contextVersion, user?.activeCompany.id, detailVersion, validId],
  );

  const decisions = useApiResource(
    () =>
      validId
        ? evidenceApi.listEvidenceReviewDecisions(evidenceId, {
            page: decisionsPage,
            pageSize: HISTORY_PAGE_SIZE,
          })
        : Promise.resolve({ data: [], meta: EMPTY_PAGE_META }),
    [
      evidenceId,
      contextVersion,
      user?.activeCompany.id,
      decisionsPage,
      decisionsVersion,
      validId,
    ],
  );

  const audit = useApiResource(
    () =>
      validId
        ? evidenceApi.listEvidenceAuditEvents(evidenceId, {
            page: auditPage,
            pageSize: HISTORY_PAGE_SIZE,
          })
        : Promise.resolve({ data: [], meta: EMPTY_PAGE_META }),
    [
      evidenceId,
      contextVersion,
      user?.activeCompany.id,
      auditPage,
      auditVersion,
      validId,
    ],
  );

  useEffect(() => {
    setEditing(false);
    setLifecycleConfirm(null);
    setReviewKind(null);
    setActionError(null);
    setUploadFile(null);
    setFieldErrors({});
    setDecisionsPage(1);
    setAuditPage(1);
  }, [contextVersion, user?.activeCompany.id, evidenceId]);

  useEffect(() => {
    if (!detail.loading) setRefreshing(false);
  }, [detail.loading]);

  useEffect(() => {
    let active = true;
    if (!editing) return;
    void Promise.all([
      loadMaster(() => masterDataApi.listUsers()),
      loadMaster(() => masterDataApi.listDepartments()),
    ]).then(([userState, departmentState]) => {
      if (!active) return;
      setUsers(userState);
      setDepartments(departmentState);
    });
    return () => {
      active = false;
    };
  }, [editing, contextVersion, user?.activeCompany.id]);

  const refreshAll = () => {
    setRefreshing(true);
    setDetailVersion((value) => value + 1);
    setDecisionsVersion((value) => value + 1);
    setAuditVersion((value) => value + 1);
  };

  const populateEditForm = (evidence: EvidenceDetail) => {
    setEditForm({
      title: evidence.title,
      description: evidence.description ?? "",
      ownerId: evidence.owner?.id ?? "",
      departmentId: evidence.department?.id ?? "",
      issueDate: evidence.issueDate ?? "",
      expiresAt: evidence.expiresAt ?? "",
    });
    setFieldErrors({});
  };

  const startEditing = (evidence: EvidenceDetail) => {
    populateEditForm(evidence);
    setEditing(true);
    setActionError(null);
  };

  const validateEdit = (): FieldErrors => {
    const errors: FieldErrors = {};
    const title = editForm.title.trim();
    if (title.length < 2) {
      errors.title = "Enter a title of at least 2 characters.";
    } else if (title.length > TITLE_MAX) {
      errors.title = `Title must be ${TITLE_MAX} characters or fewer.`;
    }
    if (editForm.description.trim().length > DESCRIPTION_MAX) {
      errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
    }
    if (
      editForm.issueDate &&
      editForm.expiresAt &&
      editForm.expiresAt < editForm.issueDate
    ) {
      errors.expiresAt = "Expiry date must not be before the issue date.";
    }
    return errors;
  };

  const saveMetadata = async (event: FormEvent) => {
    event.preventDefault();
    if (editBusy) return;
    const errors = validateEdit();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const input: UpdateEvidenceInput = {
      title: editForm.title.trim(),
      description: editForm.description.trim()
        ? editForm.description.trim()
        : null,
      ownerId: editForm.ownerId || null,
      departmentId: editForm.departmentId || null,
      issueDate: editForm.issueDate || null,
      expiresAt: editForm.expiresAt || null,
    };

    setEditBusy(true);
    setActionError(null);
    try {
      await evidenceApi.updateEvidence(evidenceId, input);
      setEditing(false);
      showToast("success", "Evidence updated", "Metadata was saved.");
      refreshAll();
    } catch (error) {
      const mapped = evidenceWorkflowError(error, "evidence:write");
      setFieldErrors(mapped.fieldErrors);
      setActionError(mapped.formError);
    } finally {
      setEditBusy(false);
    }
  };

  const runLifecycle = async (kind: LifecycleConfirm) => {
    setLifecycleBusy(true);
    setActionError(null);
    try {
      if (kind === "submit") {
        await evidenceApi.submitEvidence(evidenceId);
        showToast(
          "success",
          "Evidence submitted",
          "The Evidence is now pending review.",
        );
      } else {
        await evidenceApi.archiveEvidence(evidenceId);
        showToast(
          "success",
          "Evidence archived",
          "The Evidence is now read-only.",
        );
      }
      setLifecycleConfirm(null);
      refreshAll();
    } catch (error) {
      setActionError(evidenceActionError(error, "evidence:write"));
      refreshAll();
    } finally {
      setLifecycleBusy(false);
    }
  };

  const runUpload = async () => {
    if (!uploadFile) return;
    setActionError(null);
    try {
      await upload.upload(evidenceId, uploadFile);
      setUploadFile(null);
      showToast("success", "File uploaded", "The Evidence file was stored.");
      refreshAll();
    } catch (error) {
      setActionError(evidenceActionError(error, "evidence:write"));
    }
  };

  const runDownload = async (evidence: EvidenceDetail) => {
    setDownloadBusy(true);
    setActionError(null);
    try {
      const result = await evidenceApi.downloadEvidenceFile(
        evidenceId,
        evidence.file?.originalFileName,
      );
      showToast(
        "success",
        "Download started",
        `${result.fileName} (${formatFileSize(result.byteSize)})`,
      );
    } catch (error) {
      setActionError(evidenceActionError(error, "evidence:download"));
    } finally {
      setDownloadBusy(false);
    }
  };

  const runPreview = async (evidence: EvidenceDetail) => {
    const mime = evidence.file?.detectedMimeType ?? evidence.file?.mimeType ?? "";
    const previewable =
      mime.startsWith("image/") || mime === "application/pdf";
    if (!previewable) {
      showToast(
        "info",
        "Preview unavailable",
        "Only PDF and image Evidence can be previewed inline. Use Download for other types.",
      );
      return;
    }
    setPreviewBusy(true);
    setActionError(null);
    try {
      if (preview) URL.revokeObjectURL(preview.objectUrl);
      const result = await evidenceApi.previewEvidenceFile(evidenceId);
      setPreview({
        objectUrl: result.objectUrl,
        contentType: result.contentType,
      });
    } catch (error) {
      setActionError(evidenceActionError(error, "evidence:download"));
    } finally {
      setPreviewBusy(false);
    }
  };

  const selfReviewHint = (evidence: EvidenceDetail) => {
    const actorId = user?.id;
    if (!actorId) return false;
    return (
      evidence.createdById === actorId ||
      evidence.submittedById === actorId ||
      evidence.file?.uploadedBy?.id === actorId
    );
  };

  if (!validId) {
    return (
      <div className="page">
        <PageHeader
          title="Evidence detail"
          section="Evidence Management"
          description="Company-scoped Evidence record."
          connected
        />
        <section className="card state-panel state-error" role="alert">
          <ShieldAlert size={24} aria-hidden />
          <div>
            <strong>Evidence not found</strong>
            <p>The URL does not identify a valid Evidence record.</p>
          </div>
          <Link className="btn btn-secondary" to="/evidence">
            <ArrowLeft size={15} /> Back to Library
          </Link>
        </section>
      </div>
    );
  }

  if (detail.loading && !detail.data) {
    return (
      <div
        data-testid={
          refreshing ? "evidence-detail-refreshing" : "evidence-detail-loading"
        }
      >
        <LoadingState
          label={
            refreshing ? "Refreshing Evidence detail…" : "Loading Evidence detail…"
          }
        />
      </div>
    );
  }

  if (detail.error && !detail.data) {
    const notFound =
      detail.error instanceof ApiError &&
      (detail.error.status === 404 || detail.error.code === "EVIDENCE_NOT_FOUND");
    return (
      <div className="page">
        <PageHeader
          title="Evidence detail"
          section="Evidence Management"
          description="Company-scoped Evidence record."
          connected
        />
        {notFound ? (
          <section
            className="card state-panel state-error"
            role="alert"
            data-testid="evidence-detail-not-found"
          >
            <ShieldAlert size={24} aria-hidden />
            <div>
              <strong>Evidence not found</strong>
              <p>
                This Evidence is not available in{" "}
                {user?.activeCompany.name ?? "the active Company"}.
              </p>
            </div>
            <Link className="btn btn-secondary" to="/evidence">
              <ArrowLeft size={15} /> Back to Library
            </Link>
          </section>
        ) : (
          <ErrorState error={detail.error} />
        )}
      </div>
    );
  }

  const evidence = detail.data;
  if (!evidence) return <LoadingState label="Loading Evidence detail…" />;

  const status = evidence.lifecycleStatus;
  const archived = status === "ARCHIVED";
  const metadataMutable =
    !archived && (status === "DRAFT" || status === "REJECTED");
  const canSubmit =
    canWrite && status === "DRAFT" && evidence.hasFile && !upload.uploading;
  const canArchive =
    canWrite &&
    !archived &&
    (status === "DRAFT" || status === "REJECTED" || status === "APPROVED");
  const canUploadFile =
    canWrite && status === "DRAFT" && !evidence.hasFile && !upload.uploading;
  const canDecide = canReview && status === "SUBMITTED";
  const showSupersede =
    status === "REJECTED" && canWrite && !archived;

  return (
    <div className="page">
      <PageHeader
        title={evidence.title}
        section="Evidence Management"
        description={`${evidence.code} · ${user?.activeCompany.name ?? "Active Company"}`}
        connected
        actions={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={refreshAll}
              disabled={detail.loading}
              data-testid="evidence-detail-refresh"
            >
              <RefreshCw size={15} /> Refresh
            </button>
            {metadataMutable && canWrite && !editing ? (
              <button
                className="btn btn-secondary"
                type="button"
                data-testid="evidence-edit-open"
                onClick={() => startEditing(evidence)}
              >
                <Pencil size={15} /> Edit metadata
              </button>
            ) : null}
            {canSubmit ? (
              <button
                className="btn btn-primary"
                type="button"
                data-testid="evidence-submit-open"
                onClick={() => setLifecycleConfirm("submit")}
              >
                <Send size={15} /> Submit for review
              </button>
            ) : null}
            {canDecide ? (
              <>
                <button
                  className="btn btn-primary"
                  type="button"
                  data-testid="evidence-approve-open"
                  onClick={() => setReviewKind("approve")}
                >
                  <CheckCircle2 size={15} /> Approve
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  data-testid="evidence-reject-open"
                  onClick={() => setReviewKind("reject")}
                >
                  <XCircle size={15} /> Reject
                </button>
              </>
            ) : null}
            {showSupersede ? (
              <button
                className="btn btn-secondary"
                type="button"
                data-testid="evidence-supersedes-nav"
                onClick={() =>
                  navigate("/evidence/new", {
                    state: { supersedesEvidenceId: evidence.id },
                  })
                }
              >
                Create superseding Evidence
              </button>
            ) : null}
            {canArchive ? (
              <button
                className="btn btn-secondary"
                type="button"
                data-testid="evidence-archive-open"
                onClick={() => setLifecycleConfirm("archive")}
              >
                <Archive size={15} /> Archive
              </button>
            ) : null}
            <Link className="btn btn-secondary" to="/evidence">
              <ArrowLeft size={15} /> Back to Library
            </Link>
          </>
        }
      />

      {actionError ? (
        <div
          className="banner warning"
          role="alert"
          data-testid="evidence-detail-action-error"
        >
          {actionError}
        </div>
      ) : null}

      {canDecide && selfReviewHint(evidence) ? (
        <div
          className="banner warning"
          role="status"
          data-testid="evidence-detail-self-review-hint"
        >
          <TriangleAlert size={15} aria-hidden /> You created, uploaded or
          submitted this Evidence. The API enforces maker-checker and will reject
          your review decision.
        </div>
      ) : null}

      {status === "REJECTED" && evidence.latestReviewDecision?.reason ? (
        <div className="banner warning" role="status">
          <strong>Latest rejection</strong>
          <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
            {evidence.latestReviewDecision.reason}
          </p>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Rejected Evidence cannot be resubmitted. Create a superseding record
            instead.
          </p>
        </div>
      ) : null}

      <div className="stack evidence-detail" id="page-content">
        <section className="card" data-testid="evidence-overview">
          <header className="card-head">
            <div>
              <h2>Overview</h2>
              <p>Safe metadata returned by the Evidence API.</p>
            </div>
            <Badge tone={evidenceStatusTone(status)}>
              {evidenceStatusLabel(status)}
            </Badge>
          </header>
          <div className="card-pad">
            {editing ? (
              <form className="stack" onSubmit={(event) => void saveMetadata(event)}>
                <div className="field">
                  <label htmlFor="evidence-edit-title">Title</label>
                  <input
                    id="evidence-edit-title"
                    className={`control ${fieldErrors.title ? "invalid" : ""}`}
                    type="text"
                    required
                    minLength={2}
                    maxLength={TITLE_MAX}
                    value={editForm.title}
                    aria-invalid={Boolean(fieldErrors.title)}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                  {fieldErrors.title ? (
                    <div className="error" role="alert">
                      {fieldErrors.title}
                    </div>
                  ) : null}
                </div>
                <div className="field">
                  <label htmlFor="evidence-edit-description">Description</label>
                  <textarea
                    id="evidence-edit-description"
                    className={`control ${fieldErrors.description ? "invalid" : ""}`}
                    rows={4}
                    maxLength={DESCRIPTION_MAX}
                    value={editForm.description}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                  {fieldErrors.description ? (
                    <div className="error" role="alert">
                      {fieldErrors.description}
                    </div>
                  ) : null}
                </div>
                <div className="field">
                  <label htmlFor="evidence-edit-owner">Owner</label>
                  <select
                    id="evidence-edit-owner"
                    className="control"
                    value={editForm.ownerId}
                    disabled={users.status !== "ready"}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        ownerId: event.target.value,
                      }))
                    }
                  >
                    <option value="">No owner</option>
                    {users.status === "ready"
                      ? users.items.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name} ({entry.code})
                          </option>
                        ))
                      : null}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="evidence-edit-department">Department</label>
                  <select
                    id="evidence-edit-department"
                    className="control"
                    value={editForm.departmentId}
                    disabled={departments.status !== "ready"}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        departmentId: event.target.value,
                      }))
                    }
                  >
                    <option value="">No department</option>
                    {departments.status === "ready"
                      ? departments.items.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name} ({entry.code})
                          </option>
                        ))
                      : null}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="evidence-edit-issue">Issue date</label>
                  <input
                    id="evidence-edit-issue"
                    className="control"
                    type="date"
                    value={editForm.issueDate}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        issueDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="evidence-edit-expires">Expiry date</label>
                  <input
                    id="evidence-edit-expires"
                    className={`control ${fieldErrors.expiresAt ? "invalid" : ""}`}
                    type="date"
                    value={editForm.expiresAt}
                    aria-invalid={Boolean(fieldErrors.expiresAt)}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        expiresAt: event.target.value,
                      }))
                    }
                  />
                  {fieldErrors.expiresAt ? (
                    <div className="error" role="alert">
                      {fieldErrors.expiresAt}
                    </div>
                  ) : null}
                </div>
                <div className="button-row">
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={editBusy}
                    data-testid="evidence-edit-save"
                  >
                    {editBusy ? "Saving…" : "Save metadata"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={editBusy}
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <dl className="detail-list">
                <div>
                  <dt>Code</dt>
                  <dd className="mono">{evidence.code}</dd>
                </div>
                <div>
                  <dt>Title</dt>
                  <dd>{evidence.title}</dd>
                </div>
                <div>
                  <dt>Description</dt>
                  <dd>{display(evidence.description)}</dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{named(evidence.owner)}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{named(evidence.department, "Not assigned")}</dd>
                </div>
                <div>
                  <dt>Issue date</dt>
                  <dd>{formatEvidenceDate(evidence.issueDate)}</dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>{formatEvidenceDate(evidence.expiresAt)}</dd>
                </div>
                <div>
                  <dt>Supersedes</dt>
                  <dd>
                    {evidence.supersedes ? (
                      <Link to={`/evidence/${evidence.supersedes.id}`}>
                        {evidence.supersedes.code} (
                        {evidenceStatusLabel(evidence.supersedes.lifecycleStatus)})
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>
                    {formatEvidenceDateTime(evidence.createdAt)} by{" "}
                    {named(evidence.createdBy, "Unknown")}
                  </dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatEvidenceDateTime(evidence.updatedAt)}</dd>
                </div>
              </dl>
            )}
          </div>
        </section>

        <section className="card" data-testid="evidence-file-section">
          <header className="card-head">
            <div>
              <h2>File</h2>
              <p>
                Upload is allowed only while DRAFT and no file exists. Files
                cannot be replaced in this release.
              </p>
            </div>
          </header>
          <div className="card-pad">
            {evidence.hasFile && evidence.file ? (
              <dl className="detail-list">
                <div>
                  <dt>Filename</dt>
                  <dd>{display(evidence.file.originalFileName, "Not recorded")}</dd>
                </div>
                <div>
                  <dt>Content type</dt>
                  <dd>
                    {display(
                      evidence.file.detectedMimeType ?? evidence.file.mimeType,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{formatFileSize(evidence.file.byteSize)}</dd>
                </div>
                <div>
                  <dt>Uploaded</dt>
                  <dd>
                    {formatEvidenceDateTime(evidence.file.uploadedAt)} by{" "}
                    {named(evidence.file.uploadedBy, "Unknown")}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="muted" data-testid="evidence-no-file">
                No file has been uploaded for this Evidence yet.
              </p>
            )}

            {canUploadFile ? (
              <>
                <EvidenceFileUpload
                  inputId="evidence-detail-file"
                  file={uploadFile}
                  onFileChange={setUploadFile}
                  uploading={upload.uploading}
                  progress={upload.progress}
                  onCancel={upload.cancel}
                  label="Upload Evidence file"
                />
                <div className="button-row evidence-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={!uploadFile || upload.uploading}
                    data-testid="evidence-detail-upload"
                    onClick={() => void runUpload()}
                  >
                    <UploadCloud size={15} />{" "}
                    {upload.uploading ? "Uploading…" : "Upload file"}
                  </button>
                </div>
              </>
            ) : null}

            {evidence.hasFile && canDownload ? (
              <div className="button-row evidence-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={previewBusy}
                  data-testid="evidence-preview"
                  onClick={() => void runPreview(evidence)}
                >
                  {previewBusy ? "Loading preview…" : "Preview file"}
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={downloadBusy}
                  data-testid="evidence-download"
                  onClick={() => void runDownload(evidence)}
                >
                  <Download size={15} />{" "}
                  {downloadBusy ? "Preparing…" : "Download file"}
                </button>
              </div>
            ) : null}
            {preview ? (
              <div
                className="evidence-preview-frame"
                data-testid="evidence-preview-frame"
              >
                {preview.contentType.startsWith("image/") ? (
                  <img
                    src={preview.objectUrl}
                    alt="Evidence file preview"
                    className="evidence-preview-image"
                  />
                ) : (
                  <iframe
                    title="Evidence file preview"
                    src={preview.objectUrl}
                    className="evidence-preview-iframe"
                  />
                )}
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(preview.objectUrl);
                    setPreview(null);
                  }}
                >
                  Close preview
                </button>
              </div>
            ) : null}

            {status === "DRAFT" && !evidence.hasFile ? (
              <p className="muted" data-testid="evidence-submit-blocked">
                Submit for review stays disabled until a file upload succeeds.
              </p>
            ) : null}
          </div>
        </section>

        <section className="card" data-testid="evidence-lifecycle-section">
          <header className="card-head">
            <div>
              <h2>Lifecycle</h2>
              <p>Submission and review timestamps from the authoritative record.</p>
            </div>
          </header>
          <div className="card-pad">
            <dl className="detail-list">
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge tone={evidenceStatusTone(status)}>
                    {evidenceStatusLabel(status)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>
                  {evidence.submittedAt
                    ? `${formatEvidenceDateTime(evidence.submittedAt)} by ${named(evidence.submittedBy, "Unknown")}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Reviewed</dt>
                <dd>
                  {evidence.reviewedAt
                    ? `${formatEvidenceDateTime(evidence.reviewedAt)} by ${named(evidence.reviewedBy, "Unknown")}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Archived</dt>
                <dd>{formatEvidenceDateTime(evidence.archivedAt)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <EvidenceLinkSections
          evidence={evidence}
          onLinksChanged={() => setDetailVersion((value) => value + 1)}
        />

        <EvidenceReviewDecisionHistory
          decisions={decisions.data?.data ?? null}
          meta={decisions.data?.meta ?? null}
          loading={decisions.loading}
          error={decisions.error}
          page={decisionsPage}
          onPageChange={setDecisionsPage}
          onRetry={() => setDecisionsVersion((value) => value + 1)}
        />

        <EvidenceAuditHistory
          events={audit.data?.data ?? null}
          meta={audit.data?.meta ?? null}
          loading={audit.loading}
          error={audit.error}
          page={auditPage}
          onPageChange={setAuditPage}
          onRetry={() => setAuditVersion((value) => value + 1)}
        />
      </div>

      {lifecycleConfirm ? (
        <Modal
          title={
            lifecycleConfirm === "submit"
              ? "Submit Evidence for review"
              : "Archive Evidence"
          }
          onClose={lifecycleBusy ? () => undefined : () => setLifecycleConfirm(null)}
          footer={
            <>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={lifecycleBusy}
                onClick={() => setLifecycleConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={lifecycleBusy}
                data-testid={`evidence-${lifecycleConfirm}-confirm`}
                onClick={() => void runLifecycle(lifecycleConfirm)}
              >
                {lifecycleBusy
                  ? "Working…"
                  : lifecycleConfirm === "submit"
                    ? "Submit for review"
                    : "Archive Evidence"}
              </button>
            </>
          }
        >
          {lifecycleConfirm === "submit" ? (
            <p>
              Submitting moves this Evidence to{" "}
              <strong>Pending review</strong>. Metadata and the uploaded file
              become immutable until a reviewer decides.
            </p>
          ) : (
            <p>
              Archiving makes this Evidence read-only. This action cannot be
              undone in the UI.
            </p>
          )}
        </Modal>
      ) : null}

      {reviewKind ? (
        <EvidenceReviewModal
          kind={reviewKind}
          evidence={evidence}
          selfReviewHint={selfReviewHint(evidence)}
          onClose={() => setReviewKind(null)}
          onCompleted={() => {
            setReviewKind(null);
            showToast(
              "success",
              reviewKind === "approve" ? "Evidence approved" : "Evidence rejected",
              `${evidence.code} was updated.`,
            );
            refreshAll();
          }}
          onConflict={(message) => {
            setReviewKind(null);
            setActionError(message);
            refreshAll();
          }}
        />
      ) : null}
    </div>
  );
}
