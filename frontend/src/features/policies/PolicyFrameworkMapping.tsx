import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { ApiError } from "../../services/apiClient";
import { frameworkApi } from "../../services/frameworkApi";
import { policyApi } from "../../services/policyApi";
import type { Framework, PolicyVersion } from "../../types/api";
import {
  policyWriteError,
  type FieldErrors,
} from "../../utils/fieldErrors";
import { isEditableVersionStatus } from "./policyFormatting";

interface PolicyFrameworkMappingProps {
  version: PolicyVersion | null;
  canWrite: boolean;
  onUpdated: (version: PolicyVersion) => void;
}

type FrameworkLoad =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; items: Framework[] }
  | { status: "forbidden" }
  | { status: "error"; error: Error };

const sortedIds = (ids: string[]) => [...new Set(ids)].sort();

export function PolicyFrameworkMapping({
  version,
  canWrite,
  onUpdated,
}: PolicyFrameworkMappingProps) {
  const [frameworks, setFrameworks] = useState<FrameworkLoad>({ status: "idle" });
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const editable =
    Boolean(version) &&
    canWrite &&
    version !== null &&
    isEditableVersionStatus(version.status);

  const activeIds = useMemo(
    () =>
      sortedIds(
        version?.frameworks
          .filter((mapping) => mapping.isActive)
          .map((mapping) => mapping.frameworkId) ?? [],
      ),
    [version],
  );

  useEffect(() => {
    setSelected(activeIds);
    setFormError(null);
    setFieldErrors({});
  }, [activeIds, version?.id]);

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
  }, [editable, version?.id]);

  const dirty =
    sortedIds(selected).join(",") !== activeIds.join(",");

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

  const toggleSelected = (frameworkId: string) => {
    setSelected((current) =>
      current.includes(frameworkId)
        ? current.filter((id) => id !== frameworkId)
        : [...current, frameworkId],
    );
    setFieldErrors((current) => {
      if (!current.frameworkIds) return current;
      const next = { ...current };
      delete next.frameworkIds;
      return next;
    });
  };

  const save = async () => {
    if (!version || !editable || !dirty || saving) return;
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const updated = await policyApi.replacePolicyVersionFrameworks(
        version.id,
        { frameworkIds: sortedIds(selected) },
      );
      setFormError(null);
      setFieldErrors({});
      onUpdated(updated);
    } catch (error) {
      const mapped = policyWriteError(error, "policies:write");
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSaving(false);
    }
  };

  if (!version) {
    return (
      <section className="card" data-testid="policy-framework-mapping">
        <header className="card-head">
          <div>
            <h2>Framework mappings</h2>
            <p>Mappings belong to a selected Policy Version.</p>
          </div>
        </header>
        <div className="card-pad">
          <p className="muted">Select a Version to review Framework mappings.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card" data-testid="policy-framework-mapping">
      <header className="card-head">
        <div>
          <h2>Framework mappings</h2>
          <p>
            Active mappings for Version{" "}
            <span className="mono">{version.version}</span> (
            {version.status}).
          </p>
        </div>
        <Badge>{version.frameworks.filter((m) => m.isActive).length} active</Badge>
      </header>
      <div className="card-pad stack">
        {formError ? (
          <div className="banner warning" role="alert">
            {formError}
          </div>
        ) : null}

        <ul className="stack" data-testid="policy-active-frameworks">
          {version.frameworks.filter((mapping) => mapping.isActive).length ===
          0 ? (
            <li className="muted">No active Framework mappings on this Version.</li>
          ) : (
            version.frameworks
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
            Framework mappings can be updated only for DRAFT or REJECTED
            Versions when you hold policies:write.
          </p>
        ) : frameworks.status === "loading" ? (
          <LoadingState label="Loading Framework options…" />
        ) : frameworks.status === "forbidden" ? (
          <p className="muted" data-testid="policy-framework-options-unavailable">
            Framework options cannot be loaded (frameworks:read required).
            Current mappings from the Policy API remain visible above.
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
              data-testid="policy-framework-editor"
              aria-invalid={Boolean(fieldErrors.frameworkIds)}
            >
              {filtered.map((framework) => (
                <label key={framework.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selected.includes(framework.id)}
                    onChange={() => toggleSelected(framework.id)}
                  />
                  <span>
                    {framework.code} · {framework.name}
                  </span>
                </label>
              ))}
            </div>
            {fieldErrors.frameworkIds ? (
              <div
                className="error"
                role="alert"
                data-testid="policy-framework-field-error"
              >
                {fieldErrors.frameworkIds}
              </div>
            ) : null}
            <p className="muted">
              Unchecking a Framework removes it from this Version’s active
              mappings. It does not delete Framework master data.
            </p>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!dirty || saving}
              onClick={() => void save()}
              data-testid="policy-framework-save"
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
