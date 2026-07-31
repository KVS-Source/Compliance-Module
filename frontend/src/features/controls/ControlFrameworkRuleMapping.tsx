import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { controlApi } from "../../services/controlApi";
import { frameworkApi } from "../../services/frameworkApi";
import type {
  ControlDetail,
  ControlFrameworkMapping,
  ControlFrameworkRuleMapping as Mapping,
  FrameworkRule,
} from "../../types/api";
import { controlWriteError, type FieldErrors } from "../../utils/fieldErrors";
import { computeFrameworkRuleSaveSet } from "./frameworkRuleSaveSet";

interface ControlFrameworkRuleMappingProps {
  control: ControlDetail;
  mappings: Mapping[];
  frameworkMappings: ControlFrameworkMapping[];
  canWrite: boolean;
  onUpdated: (control: ControlDetail) => void;
}

const sortedIds = (ids: string[]) => [...new Set(ids)].sort();

const boundLabel = (code: string, title: string) => {
  const combined = `${code} · ${title}`;
  return combined.length > 80 ? `${combined.slice(0, 77)}…` : combined;
};

export function ControlFrameworkRuleMapping({
  control,
  mappings,
  frameworkMappings,
  canWrite,
  onUpdated,
}: ControlFrameworkRuleMappingProps) {
  const editable = canWrite && control.lifecycleStatus !== "ARCHIVED";

  const activeFrameworkIds = useMemo(
    () =>
      sortedIds(
        frameworkMappings
          .filter((mapping) => mapping.isActive)
          .map((mapping) => mapping.frameworkId),
      ),
    [frameworkMappings],
  );

  const activeIds = useMemo(
    () =>
      sortedIds(
        mappings
          .filter((mapping) => mapping.isActive)
          .map((mapping) => mapping.frameworkRuleId),
      ),
    [mappings],
  );

  const [selected, setSelected] = useState<string[]>(activeIds);
  const [filter, setFilter] = useState("");
  const [rules, setRules] = useState<FrameworkRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmDiscardInvalidated, setConfirmDiscardInvalidated] =
    useState(false);

  useEffect(() => {
    setSelected(activeIds);
    setFormError(null);
    setFieldErrors({});
    setConfirmDiscardInvalidated(false);
  }, [activeIds, control.id]);

  const activeFrameworkKey = activeFrameworkIds.join(",");

  useEffect(() => {
    if (!editable || activeFrameworkIds.length === 0) {
      setRules([]);
      setLoadingRules(false);
      return;
    }
    let active = true;
    setLoadingRules(true);
    setRulesError(null);
    const frameworkIds = activeFrameworkKey
      ? activeFrameworkKey.split(",")
      : [];
    void Promise.all(
      frameworkIds.map(async (frameworkId) => {
        try {
          return await frameworkApi.listRules(frameworkId);
        } catch {
          return [] as FrameworkRule[];
        }
      }),
    )
      .then((groups) => {
        if (!active) return;
        setRules(groups.flat());
        setLoadingRules(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRulesError(
          error instanceof Error
            ? error.message
            : "Framework Rule options could not be loaded.",
        );
        setRules([]);
        setLoadingRules(false);
      });
    return () => {
      active = false;
    };
  }, [editable, activeFrameworkKey, activeFrameworkIds.length, control.id]);

  const ruleFrameworkById = useMemo(() => {
    const map = new Map<string, string>();
    for (const mapping of mappings) {
      map.set(mapping.frameworkRuleId, mapping.frameworkId);
    }
    for (const rule of rules) {
      map.set(rule.id, rule.frameworkId);
    }
    return map;
  }, [mappings, rules]);

  const saveSet = useMemo(
    () =>
      computeFrameworkRuleSaveSet({
        selectedIds: selected,
        activeIds,
        activeFrameworkIds,
        ruleFrameworkById,
        confirmDiscardInvalidated,
      }),
    [
      selected,
      activeIds,
      activeFrameworkIds,
      ruleFrameworkById,
      confirmDiscardInvalidated,
    ],
  );

  const invalidatedMappings = useMemo(
    () =>
      mappings.filter(
        (mapping) =>
          mapping.isActive &&
          saveSet.invalidatedSelectedIds.includes(mapping.frameworkRuleId),
      ),
    [mappings, saveSet.invalidatedSelectedIds],
  );

  // Framework re-added: no invalidated selection → clear stale confirmation.
  useEffect(() => {
    if (saveSet.invalidatedSelectedIds.length === 0 && confirmDiscardInvalidated) {
      setConfirmDiscardInvalidated(false);
    }
  }, [saveSet.invalidatedSelectedIds, confirmDiscardInvalidated]);

  const filtered = rules.filter((rule) => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return true;
    return (
      rule.code.toLowerCase().includes(needle) ||
      rule.title.toLowerCase().includes(needle)
    );
  });

  const rulesByFramework = useMemo(() => {
    const groups = new Map<string, FrameworkRule[]>();
    for (const rule of filtered) {
      const list = groups.get(rule.frameworkId) ?? [];
      list.push(rule);
      groups.set(rule.frameworkId, list);
    }
    return groups;
  }, [filtered]);

  const toggle = (rule: FrameworkRule) => {
    if (!activeFrameworkIds.includes(rule.frameworkId)) {
      setFieldErrors({
        frameworkRuleIds:
          "Map the Rule’s Framework to this Control before selecting the Rule.",
      });
      return;
    }
    setSelected((current) =>
      current.includes(rule.id)
        ? current.filter((id) => id !== rule.id)
        : [...current, rule.id],
    );
    setConfirmDiscardInvalidated(false);
    setFieldErrors((current) => {
      if (!current.frameworkRuleIds) return current;
      const next = { ...current };
      delete next.frameworkRuleIds;
      return next;
    });
  };

  const removeInvalidated = () => {
    const invalidIds = new Set(saveSet.invalidatedSelectedIds);
    setSelected((current) => current.filter((id) => !invalidIds.has(id)));
    setConfirmDiscardInvalidated(false);
    setFormError(
      "Invalidated Framework Rule selections were removed from the editor. Save to apply.",
    );
  };

  const save = async () => {
    if (!editable || saving) return;
    if (saveSet.needsInvalidationConfirmation) {
      setFormError(
        "Some selected Rules belong to Frameworks that are no longer mapped. Remove them or confirm that save will drop them.",
      );
      return;
    }
    if (!saveSet.hasEffectiveChanges) return;

    const nextIds = saveSet.effectiveSaveIds;
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const updated = await controlApi.replaceControlFrameworkRules(
        control.id,
        { frameworkRuleIds: nextIds },
      );
      onUpdated(updated);
    } catch (error) {
      const mapped = controlWriteError(error, "controls:write");
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSaving(false);
    }
  };

  const activeMappings = mappings.filter((mapping) => mapping.isActive);
  const saveDisabled = !editable || saving || !saveSet.canSave;
  const saveHint = saveSet.needsInvalidationConfirmation
    ? "Remove invalidated Rules or confirm that save will drop them before updating."
    : !saveSet.hasEffectiveChanges
      ? "No Framework Rule mapping changes to save."
      : undefined;

  return (
    <section className="card" data-testid="control-framework-rule-mapping">
      <header className="card-head">
        <div>
          <h2>Framework Rule mappings</h2>
          <p>
            Only Rules for Frameworks actively mapped to this Control can be
            selected. Frameworks are never auto-added from Rule choices.
          </p>
        </div>
        <Badge>{activeMappings.length} active</Badge>
      </header>
      <div className="card-pad stack">
        {formError ? (
          <div className="banner warning" role="alert">
            {formError}
          </div>
        ) : null}

        <ul className="stack" data-testid="control-active-framework-rules">
          {activeMappings.length === 0 ? (
            <li className="muted">No active Framework Rule mappings.</li>
          ) : (
            activeMappings.map((mapping) => (
              <li key={mapping.id}>
                {boundLabel(
                  mapping.frameworkRule.code,
                  mapping.frameworkRule.title,
                )}
              </li>
            ))
          )}
        </ul>

        {invalidatedMappings.length > 0 ? (
          <div
            className="banner warning"
            role="status"
            aria-live="polite"
            data-testid="control-framework-rule-invalidated"
          >
            <p>
              {invalidatedMappings.length} selected Rule
              {invalidatedMappings.length === 1 ? "" : "s"}{" "}
              {invalidatedMappings.length === 1 ? "is" : "are"} no longer valid
              because {invalidatedMappings.length === 1 ? "its" : "their"}{" "}
              Framework {invalidatedMappings.length === 1 ? "is" : "are"} not
              mapped to this Control:
            </p>
            <ul>
              {invalidatedMappings.map((mapping) => (
                <li key={mapping.id}>
                  {boundLabel(
                    mapping.frameworkRule.code,
                    mapping.frameworkRule.title,
                  )}
                </li>
              ))}
            </ul>
            <p className="muted" style={{ marginBottom: 0 }}>
              Remove invalid Rules clears them from the editor selection. Confirm
              drop keeps them selected until Save, then submits only Rules whose
              Framework is still mapped.
            </p>
            <div className="row-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={removeInvalidated}
                aria-label="Remove invalidated Framework Rules from selection"
                data-testid="control-framework-rule-remove-invalidated"
              >
                Remove invalidated Rules
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setConfirmDiscardInvalidated(true);
                  setFormError(null);
                }}
                aria-label="Confirm that saving will drop invalidated Framework Rules"
                data-testid="control-framework-rule-confirm-invalidated"
              >
                Confirm save will drop them
              </button>
            </div>
            {confirmDiscardInvalidated && !saveSet.hasEffectiveChanges ? (
              <p className="muted" data-testid="control-framework-rule-noop-hint">
                Dropping invalidated Rules would not change the active mapping
                set. No update is required.
              </p>
            ) : null}
          </div>
        ) : null}

        {!editable ? (
          <p className="muted">
            Framework Rule mappings can be updated only for non-archived
            Controls when you hold controls:write.
          </p>
        ) : activeFrameworkIds.length === 0 &&
          saveSet.invalidatedSelectedIds.length === 0 ? (
          <p className="muted">
            Map at least one Framework before selecting Framework Rules.
          </p>
        ) : (
          <>
            {activeFrameworkIds.length === 0 ? (
              <p className="muted">
                No Frameworks are mapped. Save after removing or confirming drop
                of invalidated Rules, or map a Framework to continue editing.
              </p>
            ) : loadingRules ? (
              <LoadingState label="Loading Framework Rule options…" />
            ) : rulesError ? (
              <p className="muted">{rulesError}</p>
            ) : (
              <>
                <label className="field">
                  <span className="sr-only">Filter Framework Rules</span>
                  <input
                    className="control"
                    type="search"
                    placeholder="Filter Framework Rules…"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  />
                </label>
                <div
                  className="stack"
                  style={{ maxHeight: 220, overflow: "auto" }}
                  data-testid="control-framework-rule-editor"
                >
                  {[...rulesByFramework.entries()].map(
                    ([frameworkId, group]) => {
                      const frameworkLabel =
                        frameworkMappings.find(
                          (mapping) => mapping.frameworkId === frameworkId,
                        )?.framework?.code ?? frameworkId;
                      return (
                        <div key={frameworkId} className="stack">
                          <strong>{frameworkLabel}</strong>
                          {group.map((rule) => (
                            <label key={rule.id} className="checkbox-row">
                              <input
                                type="checkbox"
                                checked={selected.includes(rule.id)}
                                onChange={() => toggle(rule)}
                              />
                              <span>
                                {rule.code} · {rule.title}
                              </span>
                            </label>
                          ))}
                        </div>
                      );
                    },
                  )}
                </div>
              </>
            )}
            {fieldErrors.frameworkRuleIds ? (
              <div
                className="error"
                role="alert"
                data-testid="control-framework-rule-field-error"
              >
                {fieldErrors.frameworkRuleIds}
              </div>
            ) : null}
            {saveHint ? (
              <p className="muted" data-testid="control-framework-rule-save-hint">
                {saveHint}
              </p>
            ) : null}
            <button
              className="btn btn-primary"
              type="button"
              disabled={saveDisabled}
              aria-disabled={saveDisabled}
              title={saveHint}
              onClick={() => void save()}
              data-testid="control-framework-rule-save"
            >
              <Save size={15} />{" "}
              {saving ? "Updating…" : "Update Framework Rule mappings"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
