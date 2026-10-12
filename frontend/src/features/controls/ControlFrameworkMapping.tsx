import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { ApiError } from "../../services/apiClient";
import { controlApi } from "../../services/controlApi";
import { frameworkApi } from "../../services/frameworkApi";
import type {
  ControlDetail,
  ControlFrameworkMapping as Mapping,
  Framework,
} from "../../types/api";
import { controlWriteError, type FieldErrors } from "../../utils/fieldErrors";

interface ControlFrameworkMappingProps {
  control: ControlDetail;
  mappings: Mapping[];
  activeRuleFrameworkIds: string[];
  canWrite: boolean;
  onUpdated: (control: ControlDetail) => void;
  /** Called when Frameworks change so Rule panel can refresh invalidation UX. */
  onFrameworkSelectionPreview?: (frameworkIds: string[]) => void;
}

type FrameworkLoad =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; items: Framework[] }
  | { status: "forbidden" }
  | { status: "error"; error: Error };

const sortedIds = (ids: string[]) => [...new Set(ids)].sort();

export function ControlFrameworkMapping({
  control,
  mappings,
  activeRuleFrameworkIds,
  canWrite,
  onUpdated,
  onFrameworkSelectionPreview,
}: ControlFrameworkMappingProps) {
  const editable = canWrite && control.lifecycleStatus !== "ARCHIVED";
  const [frameworks, setFrameworks] = useState<FrameworkLoad>({ status: "idle" });
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pendingRemoval, setPendingRemoval] = useState<string[]>([]);
  const [confirmRemoval, setConfirmRemoval] = useState(false);

  const activeIds = useMemo(
    () =>
      sortedIds(
        mappings.filter((mapping) => mapping.isActive).map((m) => m.frameworkId),
      ),
    [mappings],
  );

  useEffect(() => {
    setSelected(activeIds);
    setFormError(null);
    setFieldErrors({});
    setPendingRemoval([]);
    setConfirmRemoval(false);
  }, [activeIds, control.id]);

  useEffect(() => {
    onFrameworkSelectionPreview?.(selected);
  }, [selected, onFrameworkSelectionPreview]);

  useEffect(() => {
    if (!editable) {
      setFrameworks({ status: "idle" });
      return;
    }
    let active = true;
    setFrameworks({ status: "loading" });
    void frameworkApi
      .list()
      .then((items) => {
        if (active) setFrameworks({ status: "ready", items });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 403) {
          setFrameworks({ status: "forbidden" });
          return;
        }
        setFrameworks({
          status: "error",
          error:
            error instanceof Error
              ? error
              : new Error("Framework options could not be loaded."),
        });
      });
    return () => {
      active = false;
    };
  }, [editable, control.id]);

  const dirty = sortedIds(selected).join(",") !== activeIds.join(",");

  const filtered =
    frameworks.status === "ready"
      ? frameworks.items.filter((framework) => {
          const needle = filter.trim().toLowerCase();
          if (!needle) return true;
          return (
            framework.code.toLowerCase().includes(needle) ||
            framework.name.toLowerCase().includes(needle)
          );
        })
      : [];

  const attemptToggle = (frameworkId: string) => {
    setSelected((current) => {
      if (!current.includes(frameworkId)) {
        setPendingRemoval((pending) =>
          pending.filter((id) => id !== frameworkId),
        );
        setConfirmRemoval(false);
        return [...current, frameworkId];
      }
      if (activeRuleFrameworkIds.includes(frameworkId)) {
        setPendingRemoval((pending) =>
          pending.includes(frameworkId) ? pending : [...pending, frameworkId],
        );
        setConfirmRemoval(false);
        setFormError(
          "This Framework cannot be removed while active Framework Rule mappings still depend on it. Remove those Rules first, or confirm removal only after Rules are cleared.",
        );
        return current;
      }
      return current.filter((id) => id !== frameworkId);
    });
    setFieldErrors((current) => {
      if (!current.frameworkIds) return current;
      const next = { ...current };
      delete next.frameworkIds;
      return next;
    });
  };

  const forceRemovePending = () => {
    if (pendingRemoval.length === 0) return;
    setSelected((current) =>
      current.filter((id) => !pendingRemoval.includes(id)),
    );
    setPendingRemoval([]);
    setConfirmRemoval(false);
    setFormError(
      "Remove dependent Rule mappings before saving these Framework changes.",
    );
  };

  const save = async () => {
    if (!editable || !dirty || saving) return;
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const updated = await controlApi.replaceControlFrameworks(control.id, {
        frameworkIds: sortedIds(selected),
      });
      onUpdated(updated);
    } catch (error) {
      const mapped = controlWriteError(error, "controls:write");
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card" data-testid="control-framework-mapping">
      <header className="card-head">
        <div>
          <h2>Framework mappings</h2>
          <p>
            Active Framework mappings for this Control. Removing a Framework is
            blocked while active Framework Rule mappings depend on it.
          </p>
        </div>
        <Badge>
          {mappings.filter((mapping) => mapping.isActive).length} active
        </Badge>
      </header>
      <div className="card-pad stack">
        {formError ? (
          <div className="banner warning" role="alert">
            {formError}
          </div>
        ) : null}

        <ul className="stack" data-testid="control-active-frameworks">
          {mappings.filter((mapping) => mapping.isActive).length === 0 ? (
            <li className="muted">No active Framework mappings.</li>
          ) : (
            mappings
              .filter((mapping) => mapping.isActive)
              .map((mapping) => (
                <li key={mapping.id}>
                  {mapping.framework
                    ? `${mapping.framework.code} · ${mapping.framework.name} (v${mapping.framework.version})`
                    : mapping.frameworkId}
                </li>
              ))
          )}
        </ul>

        {!editable ? (
          <p className="muted">
            Framework mappings can be updated only for non-archived Controls when
            you hold controls:write.
          </p>
        ) : frameworks.status === "loading" ? (
          <LoadingState label="Loading Framework options…" />
        ) : frameworks.status === "forbidden" ? (
          <p className="muted" data-testid="control-framework-options-unavailable">
            Framework options cannot be loaded (frameworks:read required).
            Current mappings are shown above.
          </p>
        ) : frameworks.status === "error" ? (
          <ErrorState error={frameworks.error} />
        ) : (
          <>
            <label className="field">
              <span className="sr-only">Filter frameworks</span>
              <input
                className="control"
                type="search"
                placeholder="Filter frameworks…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
            <div
              className="stack"
              style={{ maxHeight: 200, overflow: "auto" }}
              data-testid="control-framework-editor"
              aria-invalid={Boolean(fieldErrors.frameworkIds)}
            >
              {filtered.map((framework) => (
                <label key={framework.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selected.includes(framework.id)}
                    onChange={() => attemptToggle(framework.id)}
                  />
                  <span>
                    {framework.code} · {framework.name}
                  </span>
                </label>
              ))}
            </div>
            {pendingRemoval.length > 0 ? (
              <div className="banner warning" role="status">
                Frameworks with dependent Rules were not removed. Clear Rule
                mappings first.
                <div className="row-actions" style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setConfirmRemoval(true)}
                    data-testid="control-framework-confirm-invalidation"
                  >
                    Acknowledge blocked removals
                  </button>
                  {confirmRemoval ? (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={forceRemovePending}
                      data-testid="control-framework-force-remove"
                    >
                      Remove selected Frameworks
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {fieldErrors.frameworkIds ? (
              <div
                className="error"
                role="alert"
                data-testid="control-framework-field-error"
              >
                {fieldErrors.frameworkIds}
              </div>
            ) : null}
            <button
              className="btn btn-primary"
              type="button"
              disabled={!dirty || saving}
              onClick={() => void save()}
              data-testid="control-framework-save"
            >
              <Save size={15} />{" "}
              {saving ? "Updating…" : "Update Framework mappings"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
