import { Save, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LoadingState } from "../../components/feedback/AsyncState";
import { Modal } from "../../components/feedback/Modal";
import { ApiError } from "../../services/apiClient";
import { checkpointApi } from "../../services/checkpointApi";
import { controlApi } from "../../services/controlApi";
import { masterDataApi } from "../../services/masterDataApi";
import type {
  CheckpointDetail,
  CheckpointVerificationFrequency,
  CompanyUser,
  Control,
  Department,
} from "../../types/api";
import { checkpointWriteError, type FieldErrors } from "../../utils/fieldErrors";
import { VERIFICATION_FREQUENCY_OPTIONS } from "./checkpointFormatting";

type MasterState<T> =
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "forbidden" }
  | { status: "error"; message: string };

interface CheckpointFormModalProps {
  mode: "create" | "edit";
  checkpoint?: CheckpointDetail | null;
  onClose: () => void;
  onSaved: (checkpoint: CheckpointDetail) => void;
}

interface FormState {
  controlId: string;
  title: string;
  description: string;
  verificationFrequency: CheckpointVerificationFrequency;
  ownerId: string;
  departmentId: string;
  expectedResult: string;
  evidenceRequired: boolean;
  initialReviewDate: string;
  nextReviewDate: string;
}

const emptyCreate = (): FormState => ({
  controlId: "",
  title: "",
  description: "",
  verificationFrequency: "MONTHLY",
  ownerId: "",
  departmentId: "",
  expectedResult: "",
  evidenceRequired: false,
  initialReviewDate: "",
  nextReviewDate: "",
});

const stateFromCheckpoint = (checkpoint: CheckpointDetail): FormState => ({
  controlId: checkpoint.control?.id ?? "",
  title: checkpoint.title,
  description: checkpoint.description ?? "",
  verificationFrequency: checkpoint.verificationFrequency,
  ownerId: checkpoint.owner?.id ?? "",
  departmentId: checkpoint.department?.id ?? "",
  expectedResult: checkpoint.expectedResult,
  evidenceRequired: checkpoint.evidenceRequired,
  initialReviewDate: checkpoint.initialReviewDate ?? "",
  nextReviewDate: checkpoint.nextReviewDate ?? "",
});

const optionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const optionalId = (value: string) => (value.trim() ? value.trim() : null);

const loadMaster = async <T,>(
  loader: () => Promise<T[]>,
): Promise<MasterState<T>> => {
  try {
    return { status: "ready", items: await loader() };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { status: "forbidden" };
    }
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Supporting data could not be loaded.",
    };
  }
};

const loadSelectableControls = async (): Promise<MasterState<Control>> => {
  try {
    const collected: Control[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const result = await controlApi.listControls({
        page,
        pageSize: 100,
      });
      collected.push(
        ...result.data.filter((control) => control.lifecycleStatus !== "ARCHIVED"),
      );
      totalPages = result.meta.totalPages;
      page += 1;
    } while (page <= totalPages && page <= 20);
    return { status: "ready", items: collected };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { status: "forbidden" };
    }
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Controls could not be loaded.",
    };
  }
};

export function CheckpointFormModal({
  mode,
  checkpoint,
  onClose,
  onSaved,
}: CheckpointFormModalProps) {
  const scheduleFrozen =
    mode === "edit" && (checkpoint?.totalReviewCount ?? 0) > 0;

  const [values, setValues] = useState<FormState>(() =>
    mode === "edit" && checkpoint
      ? stateFromCheckpoint(checkpoint)
      : emptyCreate(),
  );
  const [initial, setInitial] = useState(() =>
    JSON.stringify(
      mode === "edit" && checkpoint
        ? stateFromCheckpoint(checkpoint)
        : emptyCreate(),
    ),
  );
  const [users, setUsers] = useState<MasterState<CompanyUser>>({
    status: "loading",
  });
  const [departments, setDepartments] = useState<MasterState<Department>>({
    status: "loading",
  });
  const [controls, setControls] = useState<MasterState<Control>>({
    status: "loading",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadMaster(() => masterDataApi.listUsers()),
      loadMaster(() => masterDataApi.listDepartments()),
      mode === "create"
        ? loadSelectableControls()
        : Promise.resolve({
            status: "ready" as const,
            items: [] as Control[],
          }),
    ]).then(([userState, departmentState, controlState]) => {
      if (!active) return;
      setUsers(userState);
      setDepartments(departmentState);
      setControls(controlState);
    });
    return () => {
      active = false;
    };
  }, [mode]);

  const dirty = useMemo(
    () => JSON.stringify(values) !== initial,
    [values, initial],
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const requestClose = () => {
    if (saving) return;
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFieldErrors({});
    setFormError(null);

    if (mode === "edit" && checkpoint) {
      if (checkpoint.lifecycleStatus === "ARCHIVED") {
        setFormError(
          "This Checkpoint is archived and can no longer be changed.",
        );
        setSaving(false);
        return;
      }
      if (!dirty) {
        setFormError("No changes to save.");
        setSaving(false);
        return;
      }
    }

    if (mode === "create" && !values.controlId.trim()) {
      setFieldErrors({ controlId: "Control is required." });
      setSaving(false);
      return;
    }
    if (!values.title.trim()) {
      setFieldErrors({ title: "Title is required." });
      setSaving(false);
      return;
    }
    if (!values.expectedResult.trim()) {
      setFieldErrors({ expectedResult: "Expected result is required." });
      setSaving(false);
      return;
    }

    try {
      if (mode === "create") {
        const created = await checkpointApi.createCheckpoint({
          controlId: values.controlId.trim(),
          title: values.title.trim(),
          description: optionalText(values.description),
          verificationFrequency: values.verificationFrequency,
          ownerId: optionalId(values.ownerId),
          departmentId: optionalId(values.departmentId),
          expectedResult: values.expectedResult.trim(),
          evidenceRequired: values.evidenceRequired,
          initialReviewDate: optionalId(values.initialReviewDate),
        });
        setInitial(JSON.stringify(values));
        onSaved(created);
      } else if (checkpoint) {
        const payload: Parameters<typeof checkpointApi.updateCheckpoint>[1] = {
          title: values.title.trim(),
          description: optionalText(values.description),
          ownerId: optionalId(values.ownerId),
          departmentId: optionalId(values.departmentId),
          expectedResult: values.expectedResult.trim(),
          evidenceRequired: values.evidenceRequired,
          nextReviewDate: optionalId(values.nextReviewDate),
        };
        if (!scheduleFrozen) {
          payload.verificationFrequency = values.verificationFrequency;
          payload.initialReviewDate = optionalId(values.initialReviewDate);
        }
        const updated = await checkpointApi.updateCheckpoint(
          checkpoint.id,
          payload,
        );
        setInitial(JSON.stringify(values));
        onSaved(updated);
      }
    } catch (error) {
      const mapped = checkpointWriteError(error, "checkpoints:write");
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSaving(false);
    }
  };

  const mastersLoading =
    users.status === "loading" ||
    departments.status === "loading" ||
    (mode === "create" && controls.status === "loading");

  return (
    <Modal
      title={mode === "create" ? "Create Checkpoint" : "Edit Checkpoint"}
      onClose={requestClose}
      wide
      footer={
        <>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={requestClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="checkpoint-form"
            disabled={saving}
            data-testid="checkpoint-form-save"
          >
            <Save size={15} /> {saving ? "Saving…" : "Save Checkpoint"}
          </button>
        </>
      }
    >
      <form
        id="checkpoint-form"
        className="stack"
        onSubmit={(event) => void onSubmit(event)}
      >
        {formError ? (
          <div
            className="banner warning"
            role="alert"
            data-testid="checkpoint-form-error"
          >
            {formError}
          </div>
        ) : null}

        {mastersLoading ? (
          <LoadingState label="Loading supporting data…" />
        ) : null}

        {mode === "edit" && checkpoint ? (
          <p className="muted">
            Editing <span className="mono">{checkpoint.code}</span>. Control
            linkage and Checkpoint code are not editable here.
          </p>
        ) : null}

        {mode === "create" ? (
          <div className="field">
            <label htmlFor="checkpoint-control">Control</label>
            <select
              id="checkpoint-control"
              className={`control ${fieldErrors.controlId ? "invalid" : ""}`}
              value={values.controlId}
              disabled={controls.status !== "ready"}
              required
              onChange={(event) => setField("controlId", event.target.value)}
              aria-invalid={Boolean(fieldErrors.controlId)}
              data-testid="checkpoint-form-control"
            >
              <option value="">
                {controls.status === "forbidden"
                  ? "Control options unavailable"
                  : "Select a Control"}
              </option>
              {controls.status === "ready"
                ? controls.items.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.code} · {entry.title} ({entry.lifecycleStatus})
                    </option>
                  ))
                : null}
            </select>
            {fieldErrors.controlId ? (
              <div className="error" role="alert">
                {fieldErrors.controlId}
              </div>
            ) : null}
            <p className="muted">
              ARCHIVED Controls are excluded. INACTIVE Controls are allowed.
            </p>
            {controls.status === "forbidden" ? (
              <div className="banner warning" role="status">
                controls:read is required to choose a parent Control.
              </div>
            ) : null}
          </div>
        ) : checkpoint?.control ? (
          <div className="field">
            <label htmlFor="checkpoint-control-locked">Control</label>
            <input
              id="checkpoint-control-locked"
              className="control"
              value={`${checkpoint.control.code} · ${checkpoint.control.title}`}
              disabled
              readOnly
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="checkpoint-title">Title</label>
          <input
            id="checkpoint-title"
            className={`control ${fieldErrors.title ? "invalid" : ""}`}
            value={values.title}
            maxLength={300}
            required
            onChange={(event) => setField("title", event.target.value)}
            aria-invalid={Boolean(fieldErrors.title)}
          />
          {fieldErrors.title ? (
            <div className="error" role="alert">
              {fieldErrors.title}
            </div>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="checkpoint-description">Description (optional)</label>
          <textarea
            id="checkpoint-description"
            className={`control ${fieldErrors.description ? "invalid" : ""}`}
            rows={3}
            maxLength={4000}
            value={values.description}
            onChange={(event) => setField("description", event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="checkpoint-expected-result">Expected result</label>
          <textarea
            id="checkpoint-expected-result"
            className={`control ${fieldErrors.expectedResult ? "invalid" : ""}`}
            rows={4}
            maxLength={5000}
            required
            value={values.expectedResult}
            onChange={(event) => setField("expectedResult", event.target.value)}
            aria-invalid={Boolean(fieldErrors.expectedResult)}
          />
          {fieldErrors.expectedResult ? (
            <div className="error" role="alert">
              {fieldErrors.expectedResult}
            </div>
          ) : null}
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="checkpoint-frequency">Verification frequency</label>
            <select
              id="checkpoint-frequency"
              className={`control ${fieldErrors.verificationFrequency ? "invalid" : ""}`}
              value={values.verificationFrequency}
              disabled={scheduleFrozen}
              onChange={(event) =>
                setField(
                  "verificationFrequency",
                  event.target.value as CheckpointVerificationFrequency,
                )
              }
              aria-invalid={Boolean(fieldErrors.verificationFrequency)}
            >
              {VERIFICATION_FREQUENCY_OPTIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
            {fieldErrors.verificationFrequency ? (
              <div className="error" role="alert">
                {fieldErrors.verificationFrequency}
              </div>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="checkpoint-evidence">Evidence required</label>
            <select
              id="checkpoint-evidence"
              className="control"
              value={values.evidenceRequired ? "true" : "false"}
              onChange={(event) =>
                setField("evidenceRequired", event.target.value === "true")
              }
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
        </div>

        {scheduleFrozen ? (
          <div className="banner warning" role="status">
            <TriangleAlert size={15} aria-hidden /> verificationFrequency and
            initialReviewDate are frozen after the first Review.
          </div>
        ) : null}

        <div className="grid-2">
          <div className="field">
            <label htmlFor="checkpoint-owner">Owner</label>
            <select
              id="checkpoint-owner"
              className={`control ${fieldErrors.ownerId ? "invalid" : ""}`}
              value={values.ownerId}
              disabled={users.status !== "ready"}
              onChange={(event) => setField("ownerId", event.target.value)}
            >
              <option value="">
                {users.status === "forbidden"
                  ? "Owner options unavailable"
                  : "Not assigned"}
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
            <label htmlFor="checkpoint-department">Department</label>
            <select
              id="checkpoint-department"
              className={`control ${fieldErrors.departmentId ? "invalid" : ""}`}
              value={values.departmentId}
              disabled={departments.status !== "ready"}
              onChange={(event) => setField("departmentId", event.target.value)}
            >
              <option value="">
                {departments.status === "forbidden"
                  ? "Department options unavailable"
                  : "Not assigned"}
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
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="checkpoint-initial-review">
              Initial review date (optional)
            </label>
            <input
              id="checkpoint-initial-review"
              className={`control ${fieldErrors.initialReviewDate ? "invalid" : ""}`}
              type="date"
              value={values.initialReviewDate}
              disabled={scheduleFrozen}
              onChange={(event) =>
                setField("initialReviewDate", event.target.value)
              }
            />
            {fieldErrors.initialReviewDate ? (
              <div className="error" role="alert">
                {fieldErrors.initialReviewDate}
              </div>
            ) : null}
          </div>
          {mode === "edit" ? (
            <div className="field">
              <label htmlFor="checkpoint-next-review">
                Next review date (optional)
              </label>
              <input
                id="checkpoint-next-review"
                className={`control ${fieldErrors.nextReviewDate ? "invalid" : ""}`}
                type="date"
                value={values.nextReviewDate}
                onChange={(event) =>
                  setField("nextReviewDate", event.target.value)
                }
              />
              {fieldErrors.nextReviewDate ? (
                <div className="error" role="alert">
                  {fieldErrors.nextReviewDate}
                </div>
              ) : null}
            </div>
          ) : (
            <div />
          )}
        </div>
      </form>
    </Modal>
  );
}
