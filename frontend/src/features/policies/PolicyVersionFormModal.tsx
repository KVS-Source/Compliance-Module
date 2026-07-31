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
  Framework,
  PolicyVersion,
  PolicyVersionBump,
  PolicyVersionSummary,
} from "../../types/api";
import { policyWriteError, type FieldErrors } from "../../utils/fieldErrors";
import {
  EVIDENCE_UNAVAILABLE_MESSAGE,
  estimateNextVersion,
  isEditableVersionStatus,
} from "./policyFormatting";

type MasterState<T> =
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "forbidden" }
  | { status: "error"; message: string };

interface PolicyVersionFormModalProps {
  mode: "create" | "edit";
  policyId: string;
  latestVersion?: PolicyVersionSummary | PolicyVersion | null;
  version?: PolicyVersion | null;
  onClose: () => void;
  onSaved: (version: PolicyVersion) => void;
}

interface FormState {
  bump: PolicyVersionBump;
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

const optionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const optionalId = (value: string) => (value.trim() ? value.trim() : null);

const loadMaster = async <T,>(loader: () => Promise<T[]>): Promise<MasterState<T>> => {
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

const stateFromVersion = (version: PolicyVersion): FormState => ({
  bump: "MINOR",
  content: version.content,
  purpose: version.purpose ?? "",
  scope: version.scope ?? "",
  changeSummary: version.changeSummary ?? "",
  effectiveDate: version.effectiveDate ?? "",
  reviewDate: version.reviewDate ?? "",
  requiresEvidence: version.requiresEvidence,
  requestedApproverId: version.requestedApprover?.id ?? "",
  frameworkIds: version.frameworks
    .filter((mapping) => mapping.isActive)
    .map((mapping) => mapping.frameworkId),
  frameworkFilter: "",
});

const emptyCreate = (seed?: PolicyVersion | PolicyVersionSummary | null): FormState => ({
  bump: "MINOR",
  content: seed && "content" in seed ? seed.content : "",
  purpose: seed && "purpose" in seed ? (seed.purpose ?? "") : "",
  scope: seed && "scope" in seed ? (seed.scope ?? "") : "",
  changeSummary: "",
  effectiveDate: seed?.effectiveDate ?? "",
  reviewDate: seed?.reviewDate ?? "",
  requiresEvidence: seed?.requiresEvidence ?? false,
  requestedApproverId: seed?.requestedApprover?.id ?? "",
  frameworkIds:
    seed?.frameworks
      .filter((mapping) => mapping.isActive)
      .map((mapping) => mapping.frameworkId) ?? [],
  frameworkFilter: "",
});

export function PolicyVersionFormModal({
  mode,
  policyId,
  latestVersion,
  version,
  onClose,
  onSaved,
}: PolicyVersionFormModalProps) {
  const [values, setValues] = useState<FormState>(() =>
    mode === "edit" && version ? stateFromVersion(version) : emptyCreate(latestVersion),
  );
  const [initial, setInitial] = useState(() =>
    JSON.stringify(
      mode === "edit" && version
        ? stateFromVersion(version)
        : emptyCreate(latestVersion),
    ),
  );
  const [users, setUsers] = useState<MasterState<CompanyUser>>({
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
      mode === "create"
        ? loadMaster(() => frameworkApi.list())
        : Promise.resolve({ status: "ready" as const, items: [] as Framework[] }),
    ]).then(([userState, frameworkState]) => {
      if (!active) return;
      setUsers(userState);
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

    if (mode === "edit" && version && !isEditableVersionStatus(version.status)) {
      setFormError(
        "This Policy Version can no longer be edited. Refresh to see its current state.",
      );
      setSaving(false);
      return;
    }

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

    try {
      if (mode === "create") {
        const created = await policyApi.createPolicyVersion(policyId, {
          bump: values.bump,
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
      } else if (version) {
        if (!dirty) {
          setFormError("No changes to save.");
          setSaving(false);
          return;
        }
        const updated = await policyApi.updatePolicyVersion(version.id, {
          content: values.content.trim(),
          purpose: optionalText(values.purpose),
          scope: optionalText(values.scope),
          changeSummary: optionalText(values.changeSummary),
          effectiveDate: optionalId(values.effectiveDate),
          reviewDate: optionalId(values.reviewDate),
          requiresEvidence: values.requiresEvidence,
          requestedApproverId: optionalId(values.requestedApproverId),
        });
        setInitial(JSON.stringify(values));
        onSaved(updated);
      }
    } catch (error) {
      const mapped = policyWriteError(error, "policies:write");
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
      if (
        error instanceof ApiError &&
        (error.code === "POLICY_VERSION_IMMUTABLE" ||
          error.code === "POLICY_VERSION_INVALID_STATE")
      ) {
        // Leave the modal open with the conflict message; caller can refresh.
      }
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
    (mode === "create" && frameworks.status === "loading");

  const nextEstimate = estimateNextVersion(latestVersion, values.bump);

  return (
    <Modal
      title={
        mode === "create"
          ? "Create Policy Version"
          : `Edit Version ${version?.version ?? ""}`
      }
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
            form="policy-version-form"
            disabled={saving || mastersLoading}
            data-testid="policy-version-form-save"
          >
            <Save size={15} /> {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {mastersLoading ? (
        <LoadingState label="Loading Version reference data…" />
      ) : (
        <form
          id="policy-version-form"
          className="form-grid"
          onSubmit={(event) => void onSubmit(event)}
        >
          {formError ? (
            <div
              className="banner warning field-span"
              role="alert"
              data-testid="policy-version-form-error"
            >
              {formError}
            </div>
          ) : null}

          {mode === "create" ? (
            <fieldset className="field field-span">
              <legend>Version bump</legend>
              <p className="muted">
                MINOR is for compatible or smaller updates. MAJOR is for
                substantial policy changes. Estimated next Version{" "}
                <strong className="mono">{nextEstimate}</strong> — the server
                allocates the final Version number.
              </p>
              <label className="checkbox-row">
                <input
                  type="radio"
                  name="policy-version-bump"
                  checked={values.bump === "MINOR"}
                  onChange={() => setField("bump", "MINOR")}
                />
                <span>MINOR</span>
              </label>
              <label className="checkbox-row">
                <input
                  type="radio"
                  name="policy-version-bump"
                  checked={values.bump === "MAJOR"}
                  onChange={() => setField("bump", "MAJOR")}
                />
                <span>MAJOR</span>
              </label>
            </fieldset>
          ) : null}

          <div className="field field-span">
            <label htmlFor="policy-version-content">
              Content (required, plain text)
            </label>
            <textarea
              id="policy-version-content"
              className={`control ${fieldErrors.content ? "invalid" : ""}`}
              rows={8}
              maxLength={100000}
              required
              value={values.content}
              onChange={(event) => setField("content", event.target.value)}
            />
            <div className="error" role="alert">
              {fieldErrors.content ?? ""}
            </div>
          </div>

          <div className="field">
            <label htmlFor="policy-version-purpose">Purpose</label>
            <textarea
              id="policy-version-purpose"
              className="control"
              rows={3}
              maxLength={20000}
              value={values.purpose}
              onChange={(event) => setField("purpose", event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="policy-version-scope">Scope</label>
            <textarea
              id="policy-version-scope"
              className="control"
              rows={3}
              maxLength={20000}
              value={values.scope}
              onChange={(event) => setField("scope", event.target.value)}
            />
          </div>
          <div className="field field-span">
            <label htmlFor="policy-version-change-summary">Change summary</label>
            <textarea
              id="policy-version-change-summary"
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
            <label htmlFor="policy-version-effective">Effective date</label>
            <input
              id="policy-version-effective"
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
            <label htmlFor="policy-version-review">Review date</label>
            <input
              id="policy-version-review"
              type="date"
              className={`control ${fieldErrors.reviewDate ? "invalid" : ""}`}
              value={values.reviewDate}
              onChange={(event) => setField("reviewDate", event.target.value)}
            />
            <div className="error" role="alert">
              {fieldErrors.reviewDate ?? ""}
            </div>
          </div>
          <div className="field">
            <label htmlFor="policy-version-approver">Requested approver</label>
            {users.status === "forbidden" ? (
              <>
                <p className="muted" data-testid="policy-version-approver-unavailable">
                  Approver options cannot be loaded (users:read required).
                  {mode === "edit" && version?.requestedApprover
                    ? ` Current approver ${version.requestedApprover.name} is preserved.`
                    : ""}
                </p>
                <input
                  type="hidden"
                  value={values.requestedApproverId}
                  readOnly
                />
              </>
            ) : users.status === "error" ? (
              <p className="muted" role="alert">
                {users.message}
              </p>
            ) : (
              <select
                id="policy-version-approver"
                className="control"
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
                {mode === "edit" &&
                version?.requestedApprover &&
                users.status === "ready" &&
                !users.items.some(
                  (user) => user.id === version.requestedApprover!.id,
                ) ? (
                  <option value={version.requestedApprover.id}>
                    {version.requestedApprover.name} (
                    {version.requestedApprover.code}) — current
                  </option>
                ) : null}
              </select>
            )}
          </div>
          <fieldset className="field field-span">
            <legend>Evidence requirement</legend>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={values.requiresEvidence}
                onChange={(event) =>
                  setField("requiresEvidence", event.target.checked)
                }
              />
              <span>Requires Evidence</span>
            </label>
            {values.requiresEvidence ? (
              <div
                className="banner warning"
                role="alert"
                data-testid="policy-version-evidence-warning"
              >
                <TriangleAlert size={15} aria-hidden />{" "}
                {EVIDENCE_UNAVAILABLE_MESSAGE}
              </div>
            ) : null}
          </fieldset>

          {mode === "create" ? (
            <fieldset className="field field-span">
              <legend>Framework mappings</legend>
              {frameworks.status === "forbidden" ? (
                <p className="muted">
                  Framework options cannot be loaded (frameworks:read required).
                </p>
              ) : frameworks.status === "error" ? (
                <p className="muted" role="alert">
                  {frameworks.message}
                </p>
              ) : (
                <>
                  <input
                    className="control"
                    type="search"
                    placeholder="Filter frameworks…"
                    aria-label="Filter frameworks"
                    value={values.frameworkFilter}
                    onChange={(event) =>
                      setField("frameworkFilter", event.target.value)
                    }
                  />
                  <div
                    className="stack"
                    style={{ maxHeight: 160, overflow: "auto", marginTop: 8 }}
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
                </>
              )}
            </fieldset>
          ) : (
            <p className="muted field-span">
              Framework mappings for this Version are managed in the Framework
              mapping section on the Policy detail page.
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
