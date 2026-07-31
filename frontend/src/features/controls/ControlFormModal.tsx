import { Save, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LoadingState } from "../../components/feedback/AsyncState";
import { Modal } from "../../components/feedback/Modal";
import { ApiError } from "../../services/apiClient";
import { controlApi } from "../../services/controlApi";
import { frameworkApi } from "../../services/frameworkApi";
import { masterDataApi } from "../../services/masterDataApi";
import { policyApi } from "../../services/policyApi";
import type {
  CompanyUser,
  ControlDetail,
  ControlFrequency,
  ControlImplementationStatus,
  ControlType,
  Department,
  Framework,
  FrameworkRule,
} from "../../types/api";
import { controlWriteError, type FieldErrors } from "../../utils/fieldErrors";
import {
  CONTROL_TYPE_OPTIONS,
  EVIDENCE_UNAVAILABLE_MESSAGE,
  FREQUENCY_OPTIONS,
  IMPLEMENTATION_STATUS_OPTIONS,
} from "./controlFormatting";

type MasterState<T> =
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "forbidden" }
  | { status: "error"; message: string };

interface ControlFormModalProps {
  mode: "create" | "edit";
  control?: ControlDetail | null;
  onClose: () => void;
  onSaved: (control: ControlDetail) => void;
}

interface PolicyVersionOption {
  policyVersionId: string;
  policyId: string;
  label: string;
}

interface FormState {
  title: string;
  description: string;
  objective: string;
  ownerId: string;
  departmentId: string;
  implementationStatus: ControlImplementationStatus;
  implementationNotes: string;
  controlType: ControlType;
  frequency: ControlFrequency;
  verificationMethod: string;
  requiresEvidence: boolean;
  lastReviewDate: string;
  nextReviewDate: string;
  policyVersionIds: string[];
  frameworkIds: string[];
  frameworkRuleIds: string[];
  policyFilter: string;
  frameworkFilter: string;
  ruleFilter: string;
}

const emptyCreate = (): FormState => ({
  title: "",
  description: "",
  objective: "",
  ownerId: "",
  departmentId: "",
  implementationStatus: "NOT_STARTED",
  implementationNotes: "",
  controlType: "PREVENTIVE",
  frequency: "MONTHLY",
  verificationMethod: "",
  requiresEvidence: false,
  lastReviewDate: "",
  nextReviewDate: "",
  policyVersionIds: [],
  frameworkIds: [],
  frameworkRuleIds: [],
  policyFilter: "",
  frameworkFilter: "",
  ruleFilter: "",
});

const stateFromControl = (control: ControlDetail): FormState => ({
  title: control.title,
  description: control.description ?? "",
  objective: control.objective,
  ownerId: control.owner?.id ?? "",
  departmentId: control.department?.id ?? "",
  implementationStatus: control.implementationStatus,
  implementationNotes: control.implementationNotes ?? "",
  controlType: control.controlType,
  frequency: control.frequency,
  verificationMethod: control.verificationMethod,
  requiresEvidence: control.requiresEvidence,
  lastReviewDate: control.lastReviewDate ?? "",
  nextReviewDate: control.nextReviewDate ?? "",
  policyVersionIds: [],
  frameworkIds: [],
  frameworkRuleIds: [],
  policyFilter: "",
  frameworkFilter: "",
  ruleFilter: "",
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

const sortedIds = (ids: string[]) => [...new Set(ids)].sort();

export function ControlFormModal({
  mode,
  control,
  onClose,
  onSaved,
}: ControlFormModalProps) {
  const [values, setValues] = useState<FormState>(() =>
    mode === "edit" && control ? stateFromControl(control) : emptyCreate(),
  );
  const [initial, setInitial] = useState(() =>
    JSON.stringify(
      mode === "edit" && control ? stateFromControl(control) : emptyCreate(),
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
  const [rulesByFramework, setRulesByFramework] = useState<
    Record<string, FrameworkRule[]>
  >({});
  const [policyOptions, setPolicyOptions] = useState<PolicyVersionOption[]>([]);
  const [policyPage, setPolicyPage] = useState(1);
  const [policyTotalPages, setPolicyTotalPages] = useState(1);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
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
        : Promise.resolve({
            status: "ready" as const,
            items: [] as Framework[],
          }),
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

  useEffect(() => {
    if (mode !== "create") return;
    const controller = new AbortController();
    setPolicyLoading(true);
    setPolicyError(null);
    void policyApi
      .listPolicies(
        {
          page: policyPage,
          pageSize: 20,
          q: values.policyFilter.trim() || undefined,
        },
        controller.signal,
      )
      .then((result) => {
        const options = result.data
          .filter(
            (policy) =>
              policy.lifecycleStatus !== "ARCHIVED" &&
              policy.currentApprovedVersion?.status === "APPROVED",
          )
          .map((policy) => ({
            policyVersionId: policy.currentApprovedVersion!.id,
            policyId: policy.id,
            label: `${policy.code} · ${policy.title} (v${policy.currentApprovedVersion!.version})`,
          }));
        setPolicyOptions(options);
        setPolicyTotalPages(result.meta.totalPages);
        setPolicyLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 403) {
          setPolicyError("policies:read required to load Policy Version options.");
        } else {
          setPolicyError(
            error instanceof Error
              ? error.message
              : "Policy Version options could not be loaded.",
          );
        }
        setPolicyOptions([]);
        setPolicyLoading(false);
      });
    return () => controller.abort();
  }, [mode, policyPage, values.policyFilter]);

  useEffect(() => {
    if (mode !== "create" || values.frameworkIds.length === 0) {
      setRulesByFramework({});
      return;
    }
    let active = true;
    const missing = values.frameworkIds.filter((id) => !rulesByFramework[id]);
    if (missing.length === 0) return;
    void Promise.all(
      missing.map(async (frameworkId) => {
        try {
          const rules = await frameworkApi.listRules(frameworkId);
          return [frameworkId, rules] as const;
        } catch {
          return [frameworkId, [] as FrameworkRule[]] as const;
        }
      }),
    ).then((entries) => {
      if (!active) return;
      setRulesByFramework((current) => {
        const next = { ...current };
        for (const [frameworkId, rules] of entries) {
          next[frameworkId] = rules;
        }
        return next;
      });
    });
    return () => {
      active = false;
    };
    // Intentionally omit rulesByFramework to avoid reload loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, values.frameworkIds.join(",")]);

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

  const togglePolicyVersion = (option: PolicyVersionOption) => {
    setValues((current) => {
      const exists = current.policyVersionIds.includes(option.policyVersionId);
      if (exists) {
        return {
          ...current,
          policyVersionIds: current.policyVersionIds.filter(
            (id) => id !== option.policyVersionId,
          ),
        };
      }
      const selectedPolicies = new Set(
        policyOptions
          .filter((entry) =>
            current.policyVersionIds.includes(entry.policyVersionId),
          )
          .map((entry) => entry.policyId),
      );
      if (selectedPolicies.has(option.policyId)) {
        return current;
      }
      return {
        ...current,
        policyVersionIds: [...current.policyVersionIds, option.policyVersionId],
      };
    });
    setFieldErrors((current) => {
      if (!current.policyVersionIds) return current;
      const next = { ...current };
      delete next.policyVersionIds;
      return next;
    });
  };

  const toggleFramework = (frameworkId: string) => {
    setValues((current) => {
      const exists = current.frameworkIds.includes(frameworkId);
      if (!exists) {
        return {
          ...current,
          frameworkIds: [...current.frameworkIds, frameworkId],
        };
      }
      const nextFrameworkIds = current.frameworkIds.filter(
        (id) => id !== frameworkId,
      );
      const nextRuleIds = current.frameworkRuleIds.filter((ruleId) => {
        const rule = Object.values(rulesByFramework)
          .flat()
          .find((entry) => entry.id === ruleId);
        return rule ? nextFrameworkIds.includes(rule.frameworkId) : false;
      });
      return {
        ...current,
        frameworkIds: nextFrameworkIds,
        frameworkRuleIds: nextRuleIds,
      };
    });
  };

  const toggleRule = (rule: FrameworkRule) => {
    if (!values.frameworkIds.includes(rule.frameworkId)) {
      setFieldErrors((current) => ({
        ...current,
        frameworkRuleIds:
          "Map the Rule’s Framework to this Control before selecting the Rule.",
      }));
      return;
    }
    setValues((current) => {
      const exists = current.frameworkRuleIds.includes(rule.id);
      return {
        ...current,
        frameworkRuleIds: exists
          ? current.frameworkRuleIds.filter((id) => id !== rule.id)
          : [...current.frameworkRuleIds, rule.id],
      };
    });
    setFieldErrors((current) => {
      if (!current.frameworkRuleIds) return current;
      const next = { ...current };
      delete next.frameworkRuleIds;
      return next;
    });
  };

  const availableRules = values.frameworkIds.flatMap(
    (frameworkId) => rulesByFramework[frameworkId] ?? [],
  );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    if (mode === "edit" && control) {
      if (!dirty) {
        setFormError("No changes to save.");
        setSaving(false);
        return;
      }
      if (control.lifecycleStatus === "ARCHIVED") {
        setFormError("This Control is archived and can no longer be changed.");
        setSaving(false);
        return;
      }
    }

    if (!values.title.trim()) {
      setFieldErrors({ title: "Title is required." });
      setSaving(false);
      return;
    }
    if (!values.objective.trim()) {
      setFieldErrors({ objective: "Objective is required." });
      setSaving(false);
      return;
    }
    if (!values.verificationMethod.trim()) {
      setFieldErrors({
        verificationMethod: "Verification method is required.",
      });
      setSaving(false);
      return;
    }
    if (
      values.implementationStatus === "NOT_APPLICABLE" &&
      values.implementationNotes.trim().length < 2
    ) {
      setFieldErrors({
        implementationNotes:
          "NOT_APPLICABLE Controls require implementation notes.",
      });
      setSaving(false);
      return;
    }
    if (
      values.lastReviewDate &&
      values.nextReviewDate &&
      values.nextReviewDate <= values.lastReviewDate
    ) {
      setFieldErrors({
        nextReviewDate: "nextReviewDate must be later than lastReviewDate",
      });
      setSaving(false);
      return;
    }

    try {
      if (mode === "create") {
        const created = await controlApi.createControl({
          title: values.title.trim(),
          description: optionalText(values.description),
          objective: values.objective.trim(),
          ownerId: optionalId(values.ownerId),
          departmentId: optionalId(values.departmentId),
          implementationStatus: values.implementationStatus,
          implementationNotes: optionalText(values.implementationNotes),
          controlType: values.controlType,
          frequency: values.frequency,
          verificationMethod: values.verificationMethod.trim(),
          requiresEvidence: values.requiresEvidence,
          lastReviewDate: optionalId(values.lastReviewDate),
          nextReviewDate: optionalId(values.nextReviewDate),
          policyVersionIds: sortedIds(values.policyVersionIds),
          frameworkIds: sortedIds(values.frameworkIds),
          frameworkRuleIds: sortedIds(values.frameworkRuleIds),
        });
        setInitial(JSON.stringify(values));
        onSaved(created);
      } else if (control) {
        const updated = await controlApi.updateControl(control.id, {
          title: values.title.trim(),
          description: optionalText(values.description),
          objective: values.objective.trim(),
          ownerId: optionalId(values.ownerId),
          departmentId: optionalId(values.departmentId),
          implementationStatus: values.implementationStatus,
          implementationNotes: optionalText(values.implementationNotes),
          controlType: values.controlType,
          frequency: values.frequency,
          verificationMethod: values.verificationMethod.trim(),
          requiresEvidence: values.requiresEvidence,
          lastReviewDate: optionalId(values.lastReviewDate),
          nextReviewDate: optionalId(values.nextReviewDate),
        });
        setInitial(JSON.stringify(values));
        onSaved(updated);
      }
    } catch (error) {
      const mapped = controlWriteError(error, "controls:write");
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

  const filteredRules = availableRules.filter((rule) => {
    const needle = values.ruleFilter.trim().toLowerCase();
    if (!needle) return true;
    return (
      rule.code.toLowerCase().includes(needle) ||
      rule.title.toLowerCase().includes(needle)
    );
  });

  return (
    <Modal
      title={mode === "create" ? "Create Control" : "Edit Control"}
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
            form="control-form"
            disabled={saving}
            data-testid="control-form-save"
          >
            <Save size={15} /> {saving ? "Saving…" : "Save Control"}
          </button>
        </>
      }
    >
      <form
        id="control-form"
        className="stack"
        onSubmit={(event) => void onSubmit(event)}
      >
        {formError ? (
          <div
            className="banner warning"
            role="alert"
            data-testid="control-form-error"
          >
            {formError}
          </div>
        ) : null}

        {mode === "edit" && control ? (
          <p className="muted">
            Editing <span className="mono">{control.code}</span>. Control code
            and lifecycle are not editable here.
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="control-title">Title</label>
          <input
            id="control-title"
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
          <label htmlFor="control-description">Description (optional)</label>
          <textarea
            id="control-description"
            className={`control ${fieldErrors.description ? "invalid" : ""}`}
            rows={3}
            maxLength={4000}
            value={values.description}
            onChange={(event) => setField("description", event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="control-objective">Objective</label>
          <textarea
            id="control-objective"
            className={`control ${fieldErrors.objective ? "invalid" : ""}`}
            rows={3}
            maxLength={5000}
            required
            value={values.objective}
            onChange={(event) => setField("objective", event.target.value)}
            aria-invalid={Boolean(fieldErrors.objective)}
          />
          {fieldErrors.objective ? (
            <div className="error" role="alert">
              {fieldErrors.objective}
            </div>
          ) : null}
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="control-owner">Owner</label>
            <select
              id="control-owner"
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
            <label htmlFor="control-department">Department</label>
            <select
              id="control-department"
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
            <label htmlFor="control-implementation">Implementation status</label>
            <select
              id="control-implementation"
              className="control"
              value={values.implementationStatus}
              onChange={(event) =>
                setField(
                  "implementationStatus",
                  event.target.value as ControlImplementationStatus,
                )
              }
            >
              {IMPLEMENTATION_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="control-type">Control type</label>
            <select
              id="control-type"
              className="control"
              value={values.controlType}
              onChange={(event) =>
                setField("controlType", event.target.value as ControlType)
              }
            >
              {CONTROL_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="control-notes">Implementation notes</label>
          <textarea
            id="control-notes"
            className={`control ${fieldErrors.implementationNotes ? "invalid" : ""}`}
            rows={3}
            maxLength={5000}
            value={values.implementationNotes}
            onChange={(event) =>
              setField("implementationNotes", event.target.value)
            }
            aria-invalid={Boolean(fieldErrors.implementationNotes)}
          />
          {fieldErrors.implementationNotes ? (
            <div className="error" role="alert">
              {fieldErrors.implementationNotes}
            </div>
          ) : (
            <p className="muted">
              Required when implementation status is NOT_APPLICABLE.
            </p>
          )}
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="control-frequency">Frequency</label>
            <select
              id="control-frequency"
              className="control"
              value={values.frequency}
              onChange={(event) =>
                setField("frequency", event.target.value as ControlFrequency)
              }
            >
              {FREQUENCY_OPTIONS.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {frequency}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="checkbox-row" htmlFor="control-requires-evidence">
              <input
                id="control-requires-evidence"
                type="checkbox"
                checked={values.requiresEvidence}
                onChange={(event) =>
                  setField("requiresEvidence", event.target.checked)
                }
              />
              <span>Requires Evidence</span>
            </label>
          </div>
        </div>

        {values.requiresEvidence ? (
          <div className="banner warning" role="status">
            <TriangleAlert size={15} aria-hidden /> {EVIDENCE_UNAVAILABLE_MESSAGE}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="control-verification">Verification method</label>
          <textarea
            id="control-verification"
            className={`control ${fieldErrors.verificationMethod ? "invalid" : ""}`}
            rows={3}
            maxLength={5000}
            required
            value={values.verificationMethod}
            onChange={(event) =>
              setField("verificationMethod", event.target.value)
            }
            aria-invalid={Boolean(fieldErrors.verificationMethod)}
          />
          {fieldErrors.verificationMethod ? (
            <div className="error" role="alert">
              {fieldErrors.verificationMethod}
            </div>
          ) : null}
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="control-last-review">Last review date</label>
            <input
              id="control-last-review"
              className="control"
              type="date"
              value={values.lastReviewDate}
              onChange={(event) => setField("lastReviewDate", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="control-next-review">Next review date</label>
            <input
              id="control-next-review"
              className={`control ${fieldErrors.nextReviewDate ? "invalid" : ""}`}
              type="date"
              value={values.nextReviewDate}
              onChange={(event) => setField("nextReviewDate", event.target.value)}
              aria-invalid={Boolean(fieldErrors.nextReviewDate)}
            />
            {fieldErrors.nextReviewDate ? (
              <div className="error" role="alert">
                {fieldErrors.nextReviewDate}
              </div>
            ) : null}
          </div>
        </div>

        {mode === "create" ? (
          <>
            <section className="stack" data-testid="control-create-mappings">
              <h3>Optional initial mappings</h3>
              <p className="muted">
                Policy Version options come from each Policy’s current approved
                Version. Mappings can also be edited later on the detail page.
              </p>

              <div className="field">
                <label htmlFor="control-policy-filter">
                  Search approved Policy Versions
                </label>
                <input
                  id="control-policy-filter"
                  className="control"
                  type="search"
                  placeholder="Search policies…"
                  value={values.policyFilter}
                  onChange={(event) => {
                    setPolicyPage(1);
                    setField("policyFilter", event.target.value);
                  }}
                />
              </div>
              {policyLoading ? (
                <LoadingState label="Loading Policy Version options…" />
              ) : policyError ? (
                <p className="muted">{policyError}</p>
              ) : (
                <div
                  className="stack"
                  style={{ maxHeight: 160, overflow: "auto" }}
                  data-testid="control-policy-version-options"
                >
                  {policyOptions.length === 0 ? (
                    <p className="muted">
                      No APPROVED current Policy Versions match this search.
                    </p>
                  ) : (
                    policyOptions.map((option) => (
                      <label key={option.policyVersionId} className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={values.policyVersionIds.includes(
                            option.policyVersionId,
                          )}
                          onChange={() => togglePolicyVersion(option)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
              {fieldErrors.policyVersionIds ? (
                <div className="error" role="alert">
                  {fieldErrors.policyVersionIds}
                </div>
              ) : null}
              <div className="pagination">
                <button
                  className="page-btn"
                  type="button"
                  disabled={policyPage <= 1 || policyLoading}
                  onClick={() => setPolicyPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {policyPage} of {Math.max(1, policyTotalPages)}
                </span>
                <button
                  className="page-btn"
                  type="button"
                  disabled={policyPage >= policyTotalPages || policyLoading}
                  onClick={() =>
                    setPolicyPage((page) =>
                      Math.min(policyTotalPages, page + 1),
                    )
                  }
                >
                  Next
                </button>
              </div>

              {frameworks.status === "loading" ? (
                <LoadingState label="Loading Framework options…" />
              ) : frameworks.status === "forbidden" ? (
                <p className="muted">
                  Framework options unavailable (frameworks:read required).
                </p>
              ) : frameworks.status === "error" ? (
                <p className="muted">{frameworks.message}</p>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="control-framework-filter">
                      Filter Frameworks
                    </label>
                    <input
                      id="control-framework-filter"
                      className="control"
                      type="search"
                      value={values.frameworkFilter}
                      onChange={(event) =>
                        setField("frameworkFilter", event.target.value)
                      }
                    />
                  </div>
                  <div
                    className="stack"
                    style={{ maxHeight: 160, overflow: "auto" }}
                    data-testid="control-framework-options"
                  >
                    {filteredFrameworks.map((framework) => (
                      <label key={framework.id} className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={values.frameworkIds.includes(framework.id)}
                          onChange={() => toggleFramework(framework.id)}
                        />
                        <span>
                          {framework.code} · {framework.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  {fieldErrors.frameworkIds ? (
                    <div className="error" role="alert">
                      {fieldErrors.frameworkIds}
                    </div>
                  ) : null}

                  <div className="field">
                    <label htmlFor="control-rule-filter">
                      Filter Framework Rules
                    </label>
                    <input
                      id="control-rule-filter"
                      className="control"
                      type="search"
                      value={values.ruleFilter}
                      onChange={(event) =>
                        setField("ruleFilter", event.target.value)
                      }
                    />
                  </div>
                  <div
                    className="stack"
                    style={{ maxHeight: 160, overflow: "auto" }}
                    data-testid="control-framework-rule-options"
                  >
                    {values.frameworkIds.length === 0 ? (
                      <p className="muted">
                        Select Frameworks before choosing Framework Rules.
                      </p>
                    ) : filteredRules.length === 0 ? (
                      <p className="muted">
                        No Framework Rules available for the selected Frameworks.
                      </p>
                    ) : (
                      filteredRules.map((rule) => (
                        <label key={rule.id} className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={values.frameworkRuleIds.includes(rule.id)}
                            onChange={() => toggleRule(rule)}
                          />
                          <span>
                            {rule.code} · {rule.title}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  {fieldErrors.frameworkRuleIds ? (
                    <div
                      className="error"
                      role="alert"
                      data-testid="control-framework-rule-field-error"
                    >
                      {fieldErrors.frameworkRuleIds}
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </>
        ) : null}
      </form>
    </Modal>
  );
}
