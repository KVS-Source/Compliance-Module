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

interface ControlFrameworkRuleMappingProps {
  control: ControlDetail;
  mappings: Mapping[];
  frameworkMappings: ControlFrameworkMapping[];
  canWrite: boolean;
  onUpdated: (control: ControlDetail) => void;
}

const sortedIds = (ids: string[]) => [...new Set(ids)].sort();

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
  const [invalidated, setInvalidated] = useState<Mapping[]>([]);
  const [confirmDiscardInvalidated, setConfirmDiscardInvalidated] =
    useState(false);

  useEffect(() => {
    setSelected(activeIds);
    setFormError(null);
    setFieldErrors({});
    setInvalidated([]);
    setConfirmDiscardInvalidated(false);
  }, [activeIds, control.id]);

  useEffect(() => {
    const stillInvalid = mappings.filter(
      (mapping) =>
        mapping.isActive &&
        !activeFrameworkIds.includes(mapping.frameworkId),
    );
    setInvalidated(stillInvalid);
    if (stillInvalid.length === 0) {
      setConfirmDiscardInvalidated(false);
    }
  }, [mappings, activeFrameworkIds]);

  useEffect(() => {
    if (!editable || activeFrameworkIds.length === 0) {
      setRules([]);
      setLoadingRules(false);
      return;
    }
    let active = true;
    setLoadingRules(true);
    setRulesError(null);
    void Promise.all(
      activeFrameworkIds.map(async (frameworkId) => {
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
  }, [editable, activeFrameworkIds.join(","), control.id]);

  const dirty = sortedIds(selected).join(",") !== activeIds.join(",");

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
    setFieldErrors((current) => {
      if (!current.frameworkRuleIds) return current;
      const next = { ...current };
      delete next.frameworkRuleIds;
      return next;
    });
  };

  const removeInvalidated = () => {
    const invalidIds = new Set(
      invalidated.map((mapping) => mapping.frameworkRuleId),
    );
    setSelected((current) => current.filter((id) => !invalidIds.has(id)));
    setInvalidated([]);
    setConfirmDiscardInvalidated(false);
    setFormError(
      "Invalidated Framework Rule selections were removed from the editor. Save to apply.",
    );
  };

  const save = async () => {
    if (!editable || !dirty || saving) return;
    if (invalidated.length > 0 && !confirmDiscardInvalidated) {
      setFormError(
        "Some active Rules belong to Frameworks that are no longer mapped. Remove them or confirm before saving.",
      );
      return;
    }
    const invalidIds = new Set(
      invalidated.map((mapping) => mapping.frameworkRuleId),
    );
    const nextIds = sortedIds(
      selected.filter((id) => !invalidIds.has(id)),
    );
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
                {mapping.frameworkRule.code} · {mapping.frameworkRule.title}
              </li>
            ))
          )}
        </ul>

        {invalidated.length > 0 ? (
          <div
            className="banner warning"
            role="status"
            data-testid="control-framework-rule-invalidated"
          >
            <p>
              {invalidated.length} active Rule
              {invalidated.length === 1 ? "" : "s"} no longer have an active
              Framework mapping:
            </p>
            <ul>
              {invalidated.map((mapping) => (
                <li key={mapping.id}>
                  {mapping.frameworkRule.code} · {mapping.frameworkRule.title}
                </li>
              ))}
            </ul>
            <div className="row-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={removeInvalidated}
                data-testid="control-framework-rule-remove-invalidated"
              >
                Remove invalidated Rules
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setConfirmDiscardInvalidated(true)}
                data-testid="control-framework-rule-confirm-invalidated"
              >
                Confirm save will drop them
              </button>
            </div>
          </div>
        ) : null}

        {!editable ? (
          <p className="muted">
            Framework Rule mappings can be updated only for non-archived
            Controls when you hold controls:write.
          </p>
        ) : activeFrameworkIds.length === 0 ? (
          <p className="muted">
            Map at least one Framework before selecting Framework Rules.
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
              {[...rulesByFramework.entries()].map(([frameworkId, group]) => {
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
              })}
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
            <button
              className="btn btn-primary"
              type="button"
              disabled={
                (!dirty && invalidated.length === 0) ||
                saving ||
                (invalidated.length > 0 && !confirmDiscardInvalidated)
              }
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
