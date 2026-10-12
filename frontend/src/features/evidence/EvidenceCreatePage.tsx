import { ArrowLeft, Save, TriangleAlert, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Modal } from "../../components/feedback/Modal";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { evidenceApi } from "../../services/evidenceApi";
import { masterDataApi } from "../../services/masterDataApi";
import type {
  CompanyUser,
  CreateEvidenceInput,
  Department,
  Evidence,
} from "../../types/api";
import { evidenceWorkflowError, type FieldErrors } from "../../utils/fieldErrors";
import { parseReturnTo } from "../../utils/returnTo";
import {
  EvidenceFileUpload,
  useEvidenceUpload,
} from "./EvidenceFileUpload";
import { evidenceStatusLabel } from "./evidenceFormatting";

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 5_000;
const SUPERSEDABLE_PAGE_SIZE = 50;

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
    // A missing supporting permission removes the selector rather than
    // degrading into a raw identifier field.
    return { status: "unavailable" };
  }
};

interface FormState {
  title: string;
  description: string;
  ownerId: string;
  departmentId: string;
  issueDate: string;
  expiresAt: string;
  supersedesEvidenceId: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  ownerId: "",
  departmentId: "",
  issueDate: "",
  expiresAt: "",
  supersedesEvidenceId: "",
};

export function EvidenceCreatePage() {
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const activeCompanyId = user?.activeCompany.id;

  const returnTo = parseReturnTo(searchParams.get("returnTo"));
  const linkKpiActualId = searchParams.get("linkKpiActualId")?.trim() || null;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Set once metadata is stored. It pins every retry to the same DRAFT record
  // so a failed upload can never produce a second Evidence.
  const [draft, setDraft] = useState<Evidence | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkConfirmOpen, setLinkConfirmOpen] = useState(false);
  const [linkConfirmDetail, setLinkConfirmDetail] = useState<{
    id: string;
    code: string;
  } | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const upload = useEvidenceUpload();

  const [users, setUsers] = useState<MasterState<CompanyUser>>({
    status: "loading",
  });
  const [departments, setDepartments] = useState<MasterState<Department>>({
    status: "loading",
  });
  const [supersedable, setSupersedable] = useState<MasterState<Evidence>>({
    status: "loading",
  });

  const tenantKeyRef = useRef(`${activeCompanyId}:${contextVersion}`);
  useEffect(() => {
    const key = `${activeCompanyId}:${contextVersion}`;
    if (tenantKeyRef.current === key) return;
    tenantKeyRef.current = key;
    setForm(EMPTY_FORM);
    setFile(null);
    setFieldErrors({});
    setFormError(null);
    setDraft(null);
    setUploadError(null);
    setLinkConfirmOpen(false);
    setLinkConfirmDetail(null);
    setLinkError(null);
  }, [activeCompanyId, contextVersion]);

  useEffect(() => {
    const fromState = (
      location.state as { supersedesEvidenceId?: string } | null
    )?.supersedesEvidenceId;
    if (fromState) {
      setForm((current) =>
        current.supersedesEvidenceId === fromState
          ? current
          : { ...current, supersedesEvidenceId: fromState },
      );
    }
  }, [location.state]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadMaster(() => masterDataApi.listUsers()),
      loadMaster(() => masterDataApi.listDepartments()),
      loadMaster(async () => {
        // Only REJECTED and ARCHIVED Evidence may be superseded.
        const [rejected, archived] = await Promise.all([
          evidenceApi.listEvidence({
            lifecycleStatus: "REJECTED",
            pageSize: SUPERSEDABLE_PAGE_SIZE,
          }),
          evidenceApi.listEvidence({
            lifecycleStatus: "ARCHIVED",
            pageSize: SUPERSEDABLE_PAGE_SIZE,
          }),
        ]);
        return [...rejected.data, ...archived.data];
      }),
    ]).then(([userState, departmentState, supersedableState]) => {
      if (!active) return;
      setUsers(userState);
      setDepartments(departmentState);
      setSupersedable(supersedableState);
    });
    return () => {
      active = false;
    };
  }, [activeCompanyId, contextVersion]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    const title = form.title.trim();
    if (title.length < 2) {
      errors.title = "Enter a title of at least 2 characters.";
    } else if (title.length > TITLE_MAX) {
      errors.title = `Title must be ${TITLE_MAX} characters or fewer.`;
    }
    if (form.description.trim().length > DESCRIPTION_MAX) {
      errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
    }
    if (form.issueDate && form.expiresAt && form.expiresAt < form.issueDate) {
      errors.expiresAt = "Expiry date must not be before the issue date.";
    }
    if (!file) {
      errors.file = "Choose the Evidence file to upload.";
    }
    return errors;
  };

  const buildInput = (): CreateEvidenceInput => ({
    title: form.title.trim(),
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    ...(form.ownerId ? { ownerId: form.ownerId } : {}),
    ...(form.departmentId ? { departmentId: form.departmentId } : {}),
    ...(form.issueDate ? { issueDate: form.issueDate } : {}),
    ...(form.expiresAt ? { expiresAt: form.expiresAt } : {}),
    ...(form.supersedesEvidenceId
      ? { supersedesEvidenceId: form.supersedesEvidenceId }
      : {}),
  });

  const runUpload = async (evidenceId: string, selected: File) => {
    setUploadError(null);
    const detail = await upload.upload(evidenceId, selected);
    if (linkKpiActualId) {
      setLinkConfirmDetail({ id: detail.id, code: detail.code });
      setLinkConfirmOpen(true);
      return detail;
    }
    showToast(
      "success",
      "Evidence created",
      `${detail.code} was created as a DRAFT with its file uploaded.`,
    );
    navigate(returnTo ?? `/evidence/${detail.id}`);
    return detail;
  };

  const confirmLinkToKpiActual = async () => {
    if (!linkConfirmDetail || !linkKpiActualId || linkBusy) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      await evidenceApi.linkKpiActual(linkConfirmDetail.id, linkKpiActualId);
      showToast(
        "success",
        "Evidence linked",
        `${linkConfirmDetail.code} was linked to the KPI actual.`,
      );
      setLinkConfirmOpen(false);
      navigate(returnTo ?? `/evidence/${linkConfirmDetail.id}`);
    } catch (error) {
      const mapped = evidenceWorkflowError(error, "evidence:write");
      setLinkError(
        mapped.formError ??
          Object.values(mapped.fieldErrors)[0] ??
          "The link could not be created. The Evidence remains in DRAFT.",
      );
    } finally {
      setLinkBusy(false);
    }
  };

  const skipLinkToKpiActual = () => {
    if (!linkConfirmDetail) return;
    setLinkConfirmOpen(false);
    showToast(
      "success",
      "Evidence created",
      `${linkConfirmDetail.code} was saved as DRAFT without linking.`,
    );
    navigate(returnTo ?? `/evidence/${linkConfirmDetail.id}`);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || upload.uploading) return;
    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0 || !file) return;

    setSaving(true);
    // Tracked locally because the state update is not visible inside this
    // closure, and the catch must know whether metadata already exists.
    let created = draft;
    try {
      if (!created) {
        created = await evidenceApi.createEvidence(buildInput());
        setDraft(created);
      }
      await runUpload(created.id, file);
    } catch (error) {
      const mapped = evidenceWorkflowError(error, "evidence:write");
      setFieldErrors(mapped.fieldErrors);
      if (mapped.formError) setFormError(mapped.formError);
      if (created) {
        setUploadError(
          mapped.formError ?? Object.values(mapped.fieldErrors)[0] ?? null,
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const onRetryUpload = async () => {
    if (!draft || !file || upload.uploading) return;
    setFormError(null);
    setFieldErrors({});
    try {
      await runUpload(draft.id, file);
    } catch (error) {
      const mapped = evidenceWorkflowError(error, "evidence:write");
      setFieldErrors(mapped.fieldErrors);
      setUploadError(
        mapped.formError ?? Object.values(mapped.fieldErrors)[0] ?? null,
      );
      if (mapped.formError) setFormError(mapped.formError);
    }
  };

  const busy = saving || upload.uploading;
  const recovering = Boolean(draft);

  return (
    <div className="page">
      <PageHeader
        title="Create Evidence"
        section="Evidence Management"
        description="Metadata is saved first as DRAFT, then the file is uploaded to that exact record. Submission for review stays a separate, explicit step."
        connected
        actions={
          <Link className="btn btn-secondary" to="/evidence">
            <ArrowLeft size={15} /> Back to Library
          </Link>
        }
      />

      {linkKpiActualId ? (
        <div
          className="banner information"
          role="status"
          data-testid="evidence-create-kpi-context"
        >
          After the file upload succeeds, you will be asked whether to link this
          Evidence to KPI actual{" "}
          <span className="mono">{linkKpiActualId}</span>. Linking never
          submits the Evidence for review automatically.
        </div>
      ) : null}

      {recovering ? (
        <div
          className="banner warning"
          role="alert"
          data-testid="evidence-upload-recovery"
        >
          <TriangleAlert size={16} aria-hidden />
          <div>
            <strong>
              DRAFT metadata was saved as {draft?.code}, but the file upload did
              not complete.
            </strong>
            <p style={{ margin: "2px 0 0" }}>
              {uploadError ??
                "The upload did not finish. Retrying uploads to the same DRAFT Evidence — no second record is created."}
            </p>
            <p style={{ margin: "2px 0 0" }}>
              This Evidence is not file-complete and cannot be submitted for
              review until an upload succeeds.
            </p>
          </div>
        </div>
      ) : null}

      {formError && !recovering ? (
        <div className="banner warning" role="alert" data-testid="evidence-create-error">
          {formError}
        </div>
      ) : null}

      <section className="card" id="page-content">
        <header className="card-head">
          <div>
            <h2>Evidence metadata</h2>

          </div>
        </header>
        <div className="card-pad">
          <form
            id="evidence-create-form"
            className="stack"
            onSubmit={(event) => void onSubmit(event)}
          >
            <div className="field">
              <label htmlFor="evidence-title">Title (required)</label>
              <input
                id="evidence-title"
                className={`control ${fieldErrors.title ? "invalid" : ""}`}
                type="text"
                required
                minLength={2}
                maxLength={TITLE_MAX}
                value={form.title}
                disabled={recovering}
                aria-invalid={Boolean(fieldErrors.title)}
                aria-describedby={
                  fieldErrors.title ? "evidence-title-error" : undefined
                }
                onChange={(event) => setField("title", event.target.value)}
              />
              {fieldErrors.title ? (
                <div className="error" id="evidence-title-error" role="alert">
                  {fieldErrors.title}
                </div>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="evidence-description">Description</label>
              <textarea
                id="evidence-description"
                className={`control ${fieldErrors.description ? "invalid" : ""}`}
                rows={4}
                maxLength={DESCRIPTION_MAX}
                value={form.description}
                disabled={recovering}
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={
                  fieldErrors.description
                    ? "evidence-description-error"
                    : undefined
                }
                onChange={(event) => setField("description", event.target.value)}
              />
              {fieldErrors.description ? (
                <div
                  className="error"
                  id="evidence-description-error"
                  role="alert"
                >
                  {fieldErrors.description}
                </div>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="evidence-owner">Owner</label>
              <select
                id="evidence-owner"
                className={`control ${fieldErrors.ownerId ? "invalid" : ""}`}
                value={form.ownerId}
                disabled={recovering || users.status !== "ready"}
                aria-invalid={Boolean(fieldErrors.ownerId)}
                onChange={(event) => setField("ownerId", event.target.value)}
              >
                <option value="">
                  {users.status === "unavailable"
                    ? "Owner selection unavailable"
                    : "No owner"}
                </option>
                {users.status === "ready"
                  ? users.items.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name} ({entry.code})
                      </option>
                    ))
                  : null}
              </select>
              {fieldErrors.ownerId ? (
                <div className="error" role="alert">
                  {fieldErrors.ownerId}
                </div>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="evidence-department">Department</label>
              <select
                id="evidence-department"
                className={`control ${fieldErrors.departmentId ? "invalid" : ""}`}
                value={form.departmentId}
                disabled={recovering || departments.status !== "ready"}
                aria-invalid={Boolean(fieldErrors.departmentId)}
                onChange={(event) =>
                  setField("departmentId", event.target.value)
                }
              >
                <option value="">
                  {departments.status === "unavailable"
                    ? "Department selection unavailable"
                    : "No department"}
                </option>
                {departments.status === "ready"
                  ? departments.items.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name} ({entry.code})
                      </option>
                    ))
                  : null}
              </select>
              {fieldErrors.departmentId ? (
                <div className="error" role="alert">
                  {fieldErrors.departmentId}
                </div>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="evidence-issue-date">Issue date</label>
              <input
                id="evidence-issue-date"
                className={`control ${fieldErrors.issueDate ? "invalid" : ""}`}
                type="date"
                value={form.issueDate}
                disabled={recovering}
                aria-invalid={Boolean(fieldErrors.issueDate)}
                onChange={(event) => setField("issueDate", event.target.value)}
              />
              {fieldErrors.issueDate ? (
                <div className="error" role="alert">
                  {fieldErrors.issueDate}
                </div>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="evidence-expires-at">Expiry date</label>
              <input
                id="evidence-expires-at"
                className={`control ${fieldErrors.expiresAt ? "invalid" : ""}`}
                type="date"
                value={form.expiresAt}
                disabled={recovering}
                aria-invalid={Boolean(fieldErrors.expiresAt)}
                aria-describedby={
                  fieldErrors.expiresAt ? "evidence-expires-error" : undefined
                }
                onChange={(event) => setField("expiresAt", event.target.value)}
              />
              {fieldErrors.expiresAt ? (
                <div className="error" id="evidence-expires-error" role="alert">
                  {fieldErrors.expiresAt}
                </div>
              ) : null}
            </div>

            {supersedable.status === "ready" && supersedable.items.length > 0 ? (
              <div className="field">
                <label htmlFor="evidence-supersedes">
                  Supersedes existing Evidence
                </label>
                <select
                  id="evidence-supersedes"
                  className={`control ${
                    fieldErrors.supersedesEvidenceId ? "invalid" : ""
                  }`}
                  value={form.supersedesEvidenceId}
                  disabled={recovering}
                  aria-invalid={Boolean(fieldErrors.supersedesEvidenceId)}
                  data-testid="evidence-supersedes-select"
                  onChange={(event) =>
                    setField("supersedesEvidenceId", event.target.value)
                  }
                >
                  <option value="">Does not supersede existing Evidence</option>
                  {supersedable.items.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.code} · {entry.title} (
                      {evidenceStatusLabel(entry.lifecycleStatus)})
                    </option>
                  ))}
                </select>
                <p className="muted">
                  Only REJECTED and ARCHIVED Evidence can be superseded. The
                  reference is fixed at creation and cannot be edited later.
                </p>
                {fieldErrors.supersedesEvidenceId ? (
                  <div className="error" role="alert">
                    {fieldErrors.supersedesEvidenceId}
                  </div>
                ) : null}
              </div>
            ) : null}

            <EvidenceFileUpload
              inputId="evidence-file"
              file={file}
              onFileChange={(next) => {
                setFile(next);
                setFieldErrors((current) => {
                  if (!current.file) return current;
                  const nextErrors = { ...current };
                  delete nextErrors.file;
                  return nextErrors;
                });
              }}
              uploading={upload.uploading}
              progress={upload.progress}
              onCancel={upload.cancel}
              fieldError={fieldErrors.file ?? null}
              label="Evidence file (required)"
            />

            <div className="button-row">
              {recovering ? (
                <>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy || !file}
                    data-testid="evidence-retry-upload"
                    onClick={() => void onRetryUpload()}
                  >
                    <UploadCloud size={15} />{" "}
                    {upload.uploading ? "Uploading…" : "Retry upload"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={upload.uploading}
                    data-testid="evidence-open-draft"
                    onClick={() => navigate(`/evidence/${draft?.id ?? ""}`)}
                  >
                    Open saved DRAFT
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={busy}
                  data-testid="evidence-create-save"
                >
                  <Save size={15} />{" "}
                  {saving
                    ? "Saving…"
                    : upload.uploading
                      ? "Uploading…"
                      : "Create Evidence and upload file"}
                </button>
              )}
              <Link className="btn btn-secondary" to="/evidence">
                Cancel
              </Link>
            </div>
            <p className="muted">
              Creating leaves the Evidence in DRAFT. Submitting it for review is
              a separate action on the Evidence detail page.
            </p>
          </form>
        </div>
      </section>

      {linkConfirmOpen && linkConfirmDetail ? (
        <Modal
          title="Link Evidence to KPI actual?"
          onClose={linkBusy ? () => undefined : skipLinkToKpiActual}
          footer={
            <>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={linkBusy}
                data-testid="evidence-link-kpi-skip"
                onClick={skipLinkToKpiActual}
              >
                Keep DRAFT only
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={linkBusy}
                data-testid="evidence-link-kpi-confirm"
                onClick={() => void confirmLinkToKpiActual()}
              >
                {linkBusy ? "Linking…" : "Link to KPI actual"}
              </button>
            </>
          }
        >
          {linkError ? (
            <div className="banner warning" role="alert" data-testid="evidence-link-kpi-error">
              {linkError}
            </div>
          ) : null}
          <p>
            <strong>{linkConfirmDetail.code}</strong> was created and its file
            uploaded. Link it to KPI actual{" "}
            <span className="mono">{linkKpiActualId}</span> now?
          </p>
          <p className="muted">
            If linking fails, the Evidence stays in DRAFT and you can retry from
            the Evidence detail page.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
