import { Save, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LoadingState } from "../../components/feedback/AsyncState";
import { Modal } from "../../components/feedback/Modal";
import { ApiError } from "../../services/apiClient";
import { frameworkApi } from "../../services/frameworkApi";
import { masterDataApi } from "../../services/masterDataApi";
import { policyApi } from "../../services/policyApi";
import type {
  CompanyUser,
  Department,
  Framework,
  PolicyDetail,
} from "../../types/api";
import { policyWriteError, type FieldErrors } from "../../utils/fieldErrors";
import { EVIDENCE_UNAVAILABLE_MESSAGE } from "./policyFormatting";

type MasterState<T> =
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "forbidden" }
  | { status: "error"; message: string };

interface PolicyFormModalProps {
  mode: "create" | "edit";
  policy?: PolicyDetail | null;
  onClose: () => void;
  onSaved: (policy: PolicyDetail) => void;
}

interface FormState {
  title: string;
  description: string;
  ownerId: string;
  departmentId: string;
  content: string;
  purpose: string;
  scope: string;
  changeSummary: string;
  effectiveDate: string;
  reviewDate: string;
  requiresEvidence: boolean;
  requestedApproverId: string;
  frameworkIds: string[];
  frameworkFilter: string;
}

const emptyCreate = (): FormState => ({
  title: "",
  description: "",
  ownerId: "",
  departmentId: "",
  content: "",
  purpose: "",
  scope: "",
  changeSummary: "",
  effectiveDate: "",
  reviewDate: "",
  requiresEvidence: false,
  requestedApproverId: "",
  frameworkIds: [],
  frameworkFilter: "",
});

const stateFromPolicy = (policy: PolicyDetail): FormState => ({
  title: policy.title,
  description: policy.description ?? "",
  ownerId: policy.owner?.id ?? "",
  departmentId: policy.department?.id ?? "",
  content: "",
  purpose: "",
  scope: "",
  changeSummary: "",
  effectiveDate: "",
  reviewDate: "",
  requiresEvidence: false,
  requestedApproverId: "",
  frameworkIds: [],
  frameworkFilter: "",
});

const optionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const optionalId = (value: string) => (value.trim() ? value.trim() : null);

const loadMaster = async <T,>(loader: () => Promise<T[]>): Promise<MasterState<T>> => {
  try {
    const items = await loader();
    return { status: "ready", items };
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

export function PolicyFormModal({
  mode,
  policy,
  onClose,
  onSaved,
}: PolicyFormModalProps) {
  const [values, setValues] = useState<FormState>(() =>
    mode === "edit" && policy ? stateFromPolicy(policy) : emptyCreate(),
  );
  const [initial, setInitial] = useState(() =>
    JSON.stringify(
      mode === "edit" && policy ? stateFromPolicy(policy) : emptyCreate(),
    ),
  );
  const [users, setUsers] = useState<MasterState<CompanyUser>>({
    status: "loading",
  });
  const [departments, setDepartments] = useState<MasterState<Department>>({
    status: "loading",
  });
  const [frameworks, setFrameworks] = useState<MasterState<Framework>>({
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
        ? loadMaster(() => frameworkApi.list())
        : Promise.resolve({ status: "ready" as const, items: [] as Framework[] }),
    ]).then(([userState, departmentState, frameworkState]) => {
      if (!active) return;
      setUsers(userState);
      setDepartments(departmentState);
      setFrameworks(frameworkState);
    });
    return () => {
      active = false;
    };
  }, [mode]);

  const dirty = useMemo(
    () => JSON.stringify(values) !== initial,
    [values, initial],
  );

  const requestClose = () => {
    if (saving) return;
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const toggleFramework = (frameworkId: string) => {
    setValues((current) => {
      const exists = current.frameworkIds.includes(frameworkId);
      return {
        ...current,
        frameworkIds: exists
          ? current.frameworkIds.filter((id) => id !== frameworkId)
          : [...current.frameworkIds, frameworkId],
      };
    });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    if (mode === "edit" && policy) {
      if (!dirty) {
        setFormError("No changes to save.");
        setSaving(false);
        return;
      }
      if (policy.lifecycleStatus === "ARCHIVED") {
        setFormError("This Policy is archived and can no longer be changed.");
        setSaving(false);
        return;
      }
    }

    try {
      if (mode === "create") {
        if (!values.content.trim()) {
          setFieldErrors({ content: "Policy content is required." });
          setSaving(false);
          return;
        }
        if (
          (values.effectiveDate && !values.reviewDate) ||
          (!values.effectiveDate && values.reviewDate)
        ) {
          setFieldErrors({
            reviewDate:
              "effectiveDate and reviewDate must both be provided or both omitted",
          });
          setSaving(false);
          return;
        }
        const created = await policyApi.createPolicy({
          title: values.title.trim(),
          description: optionalText(values.description),
          ownerId: optionalId(values.ownerId),
          departmentId: optionalId(values.departmentId),
          content: values.content.trim(),
          purpose: optionalText(values.purpose),
          scope: optionalText(values.scope),
          changeSummary: optionalText(values.changeSummary),
          effectiveDate: optionalId(values.effectiveDate),
          reviewDate: optionalId(values.reviewDate),
          requiresEvidence: values.requiresEvidence,
          requestedApproverId: optionalId(values.requestedApproverId),
          frameworkIds: values.frameworkIds,
        });
        setInitial(JSON.stringify(values));
        onSaved(created);
      } else if (policy) {
        const updated = await policyApi.updatePolicy(policy.id, {
          title: values.title.trim(),
          description: optionalText(values.description),
          ownerId: optionalId(values.ownerId),
          departmentId: optionalId(values.departmentId),
        });
        setInitial(JSON.stringify(values));
        onSaved(updated);
      }
    } catch (error) {
      const mapped = policyWriteError(error, "policies:write");
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSaving(false);
    }
  };

  const filteredFrameworks =
    frameworks.status === "ready"
      ? frameworks.items.filter((framework) => {
          const needle = values.frameworkFilter.trim().toLowerCase();
          if (!needle) return true;
          return (
            framework.code.toLowerCase().includes(needle) ||
            framework.name.toLowerCase().includes(needle)
          );
        })
      : [];

  const mastersLoading =
    users.status === "loading" ||
    departments.status === "loading" ||
    (mode === "create" && frameworks.status === "loading");

  return (
    <Modal
      title={mode === "create" ? "Create Policy" : `Edit ${policy?.code ?? "Policy"}`}
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
            form="policy-write-form"
            disabled={saving || mastersLoading}
            data-testid="policy-form-save"
          >
            <Save size={15} /> {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {mastersLoading ? (
        <LoadingState label="Loading Policy reference data…" />
      ) : (
        <form
          id="policy-write-form"
          className="form-grid"
          onSubmit={(event) => void onSubmit(event)}
        >
          {formError ? (
            <div
              className="banner warning field-span"
              role="alert"
              data-testid="policy-form-error"
            >
              {formError}
            </div>
          ) : null}

          <div className="field field-span">
            <label htmlFor="policy-title">Title (required)</label>
            <input
              id="policy-title"
              className={`control ${fieldErrors.title ? "invalid" : ""}`}
              value={values.title}
              maxLength={200}
              required
              onChange={(event) => setField("title", event.target.value)}
              aria-invalid={Boolean(fieldErrors.title)}
            />
            <div className="error" role="alert">
              {fieldErrors.title ?? ""}
            </div>
          </div>

          <div className="field field-span">
            <label htmlFor="policy-description">Description</label>
            <textarea
              id="policy-description"
              className={`control ${fieldErrors.description ? "invalid" : ""}`}
              rows={3}
              maxLength={4000}
              value={values.description}
              onChange={(event) => setField("description", event.target.value)}
            />
            <div className="error" role="alert">
              {fieldErrors.description ?? ""}
            </div>
          </div>

          <div className="field">
            <label htmlFor="policy-owner">Owner</label>
            {users.status === "forbidden" ? (
              <>
                <p className="muted" data-testid="policy-owner-unavailable">
                  User options cannot be loaded (users:read required).
                  {mode === "edit" && policy?.owner
                    ? ` Current owner ${policy.owner.name} is preserved.`
                    : ""}
                </p>
                <input type="hidden" value={values.ownerId} readOnly />
              </>
            ) : users.status === "error" ? (
              <p className="muted" role="alert">
                {users.message}
              </p>
            ) : (
              <select
                id="policy-owner"
                className={`control ${fieldErrors.ownerId ? "invalid" : ""}`}
                value={values.ownerId}
                onChange={(event) => setField("ownerId", event.target.value)}
              >
                <option value="">Unassigned</option>
                {users.status === "ready"
                  ? users.items.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.code})
                      </option>
                    ))
                  : null}
                {mode === "edit" &&
                policy?.owner &&
                users.status === "ready" &&
                !users.items.some((user) => user.id === policy.owner!.id) ? (
                  <option value={policy.owner.id}>
                    {policy.owner.name} ({policy.owner.code}) — current
                  </option>
                ) : null}
              </select>
            )}
            <div className="error" role="alert">
              {fieldErrors.ownerId ?? ""}
            </div>
          </div>

          <div className="field">
            <label htmlFor="policy-department">Department</label>
            {departments.status === "forbidden" ? (
              <>
                <p
                  className="muted"
                  data-testid="policy-department-unavailable"
                >
                  Department options cannot be loaded (organisation:read
                  required).
                  {mode === "edit" && policy?.department
                    ? ` Current department ${policy.department.name} is preserved.`
                    : ""}
                </p>
                <input type="hidden" value={values.departmentId} readOnly />
              </>
            ) : departments.status === "error" ? (
              <p className="muted" role="alert">
                {departments.message}
              </p>
            ) : (
              <select
                id="policy-department"
                className={`control ${fieldErrors.departmentId ? "invalid" : ""}`}
                value={values.departmentId}
                onChange={(event) =>
                  setField("departmentId", event.target.value)
                }
              >
                <option value="">Unassigned</option>
                {departments.status === "ready"
                  ? departments.items.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name} ({department.code})
                      </option>
                    ))
                  : null}
                {mode === "edit" &&
                policy?.department &&
                departments.status === "ready" &&
                !departments.items.some(
                  (department) => department.id === policy.department!.id,
                ) ? (
                  <option value={policy.department.id}>
                    {policy.department.name} ({policy.department.code}) —
                    current
                  </option>
                ) : null}
              </select>
            )}
            <div className="error" role="alert">
              {fieldErrors.departmentId ?? ""}
            </div>
          </div>

          {mode === "create" ? (
            <>
              <div className="field field-span">
                <label htmlFor="policy-content">Content (required, plain text)</label>
                <textarea
                  id="policy-content"
                  className={`control ${fieldErrors.content ? "invalid" : ""}`}
                  rows={8}
                  maxLength={100000}
                  required
                  value={values.content}
                  onChange={(event) => setField("content", event.target.value)}
                  aria-describedby="policy-content-help"
                />
                <p className="muted" id="policy-content-help">
                  Plain text only. Raw HTML is rejected by the server.
                </p>
                <div className="error" role="alert">
                  {fieldErrors.content ?? ""}
                </div>
              </div>

              <div className="field">
                <label htmlFor="policy-purpose">Purpose</label>
                <textarea
                  id="policy-purpose"
                  className="control"
                  rows={3}
                  maxLength={20000}
                  value={values.purpose}
                  onChange={(event) => setField("purpose", event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="policy-scope">Scope</label>
                <textarea
                  id="policy-scope"
                  className="control"
                  rows={3}
                  maxLength={20000}
                  value={values.scope}
                  onChange={(event) => setField("scope", event.target.value)}
                />
              </div>
              <div className="field field-span">
                <label htmlFor="policy-change-summary">Change summary</label>
                <textarea
                  id="policy-change-summary"
                  className="control"
                  rows={2}
                  maxLength={20000}
                  value={values.changeSummary}
                  onChange={(event) =>
                    setField("changeSummary", event.target.value)
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="policy-effective-date">Effective date</label>
                <input
                  id="policy-effective-date"
                  type="date"
                  className={`control ${fieldErrors.effectiveDate ? "invalid" : ""}`}
                  value={values.effectiveDate}
                  onChange={(event) =>
                    setField("effectiveDate", event.target.value)
                  }
                />
                <div className="error" role="alert">
                  {fieldErrors.effectiveDate ?? ""}
                </div>
              </div>
              <div className="field">
                <label htmlFor="policy-review-date">Review date</label>
                <input
                  id="policy-review-date"
                  type="date"
                  className={`control ${fieldErrors.reviewDate ? "invalid" : ""}`}
                  value={values.reviewDate}
                  onChange={(event) =>
                    setField("reviewDate", event.target.value)
                  }
                />
                <p className="muted">
                  When either date is set, both are required and review must be
                  later than effective.
                </p>
                <div className="error" role="alert">
                  {fieldErrors.reviewDate ?? ""}
                </div>
              </div>
              <div className="field">
                <label htmlFor="policy-approver">Requested approver</label>
                {users.status === "forbidden" || users.status === "error" ? (
                  <p className="muted">Approver options unavailable.</p>
                ) : (
                  <select
                    id="policy-approver"
                    className={`control ${fieldErrors.requestedApproverId ? "invalid" : ""}`}
                    value={values.requestedApproverId}
                    onChange={(event) =>
                      setField("requestedApproverId", event.target.value)
                    }
                  >
                    <option value="">Any eligible approver</option>
                    {users.status === "ready"
                      ? users.items.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name} ({user.code})
                          </option>
                        ))
                      : null}
                  </select>
                )}
                <div className="error" role="alert">
                  {fieldErrors.requestedApproverId ?? ""}
                </div>
              </div>
              <fieldset className="field field-span">
                <legend>Evidence requirement</legend>
                <label className="checkbox-row">
                  <input
                    id="policy-requires-evidence"
                    type="checkbox"
                    checked={values.requiresEvidence}
                    onChange={(event) =>
                      setField("requiresEvidence", event.target.checked)
                    }
                    aria-describedby="policy-evidence-warning"
                  />
                  <span>Requires Evidence</span>
                </label>
                {values.requiresEvidence ? (
                  <div
                    className="banner warning"
                    role="alert"
                    id="policy-evidence-warning"
                    data-testid="policy-requires-evidence-warning"
                  >
                    <TriangleAlert size={15} aria-hidden />{" "}
                    {EVIDENCE_UNAVAILABLE_MESSAGE}
                  </div>
                ) : (
                  <p className="muted" id="policy-evidence-warning">
                    Evidence Management is not available. Enabling this blocks
                    approval until Evidence ships.
                  </p>
                )}
              </fieldset>
              <fieldset className="field field-span">
                <legend>Framework mappings for Version 1.0</legend>
                {frameworks.status === "forbidden" ? (
                  <p
                    className="muted"
                    data-testid="policy-frameworks-unavailable"
                  >
                    Framework options cannot be loaded (frameworks:read
                    required). You can still create the Policy and map Frameworks
                    later if permitted.
                  </p>
                ) : frameworks.status === "error" ? (
                  <p className="muted" role="alert">
                    {frameworks.message}
                  </p>
                ) : (
                  <>
                    <label className="sr-only" htmlFor="policy-framework-filter">
                      Filter frameworks
                    </label>
                    <input
                      id="policy-framework-filter"
                      className="control"
                      type="search"
                      placeholder="Filter frameworks…"
                      value={values.frameworkFilter}
                      onChange={(event) =>
                        setField("frameworkFilter", event.target.value)
                      }
                    />
                    <div
                      className="stack"
                      style={{ maxHeight: 180, overflow: "auto", marginTop: 8 }}
                      data-testid="policy-framework-options"
                    >
                      {filteredFrameworks.map((framework) => (
                        <label key={framework.id} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={values.frameworkIds.includes(framework.id)}
                            onChange={() => toggleFramework(framework.id)}
                          />
                          <span>
                            {framework.code} · {framework.name} (v
                            {framework.version})
                          </span>
                        </label>
                      ))}
                      {filteredFrameworks.length === 0 ? (
                        <p className="muted">No frameworks match this filter.</p>
                      ) : null}
                    </div>
                  </>
                )}
                <div className="error" role="alert">
                  {fieldErrors.frameworkIds ?? ""}
                </div>
              </fieldset>
            </>
          ) : null}
        </form>
      )}
    </Modal>
  );
}
