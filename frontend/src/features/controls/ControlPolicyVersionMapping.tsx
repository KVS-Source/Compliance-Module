import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../../components/feedback/Badge";
import { LoadingState } from "../../components/feedback/AsyncState";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/apiClient";
import { controlApi } from "../../services/controlApi";
import { policyApi } from "../../services/policyApi";
import type {
  ControlDetail,
  ControlPolicyVersionMapping as Mapping,
  ControlTraceability,
} from "../../types/api";
import { controlWriteError, type FieldErrors } from "../../utils/fieldErrors";
import { statusLabel, versionStatusTone } from "../policies/policyFormatting";

interface ControlPolicyVersionMappingProps {
  control: ControlDetail;
  mappings: Mapping[];
  canWrite: boolean;
  onUpdated: (control: ControlDetail, traceability?: ControlTraceability) => void;
}

interface PolicyVersionOption {
  policyVersionId: string;
  policyId: string;
  label: string;
}

const sortedIds = (ids: string[]) => [...new Set(ids)].sort();

export function ControlPolicyVersionMapping({
  control,
  mappings,
  canWrite,
  onUpdated,
}: ControlPolicyVersionMappingProps) {
  const { hasPermission } = useAuth();
  const canReadPolicies = hasPermission("policies:read");
  const editable = canWrite && control.lifecycleStatus !== "ARCHIVED";

  const activeIds = useMemo(
    () =>
      sortedIds(
        mappings.filter((mapping) => mapping.isActive).map((m) => m.policyVersionId),
      ),
    [mappings],
  );

  const [selected, setSelected] = useState<string[]>(activeIds);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [options, setOptions] = useState<PolicyVersionOption[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    setSelected(activeIds);
    setFormError(null);
    setFieldErrors({});
  }, [activeIds, control.id]);

  useEffect(() => {
    if (!editable) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    setLoadingOptions(true);
    setOptionsError(null);
    void policyApi
      .listPolicies(
        {
          page,
          pageSize: 20,
          q: filter.trim() || undefined,
        },
        controller.signal,
      )
      .then((result) => {
        const next = result.data
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
        setOptions(next);
        setTotalPages(result.meta.totalPages);
        setLoadingOptions(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 403) {
          setOptionsError(
            "Policy Version options cannot be loaded (policies:read required).",
          );
        } else {
          setOptionsError(
            error instanceof Error
              ? error.message
              : "Policy Version options could not be loaded.",
          );
        }
        setOptions([]);
        setLoadingOptions(false);
      });
    return () => controller.abort();
  }, [editable, filter, page, control.id]);

  const dirty = sortedIds(selected).join(",") !== activeIds.join(",");

  const selectedPolicyIds = useMemo(() => {
    const fromOptions = new Map(
      options.map((option) => [option.policyVersionId, option.policyId]),
    );
    const fromMappings = new Map(
      mappings.map((mapping) => [mapping.policyVersionId, mapping.policyId]),
    );
    return new Set(
      selected
        .map((id) => fromOptions.get(id) ?? fromMappings.get(id))
        .filter((id): id is string => Boolean(id)),
    );
  }, [selected, options, mappings]);

  const toggle = (option: PolicyVersionOption) => {
    setSelected((current) => {
      if (current.includes(option.policyVersionId)) {
        return current.filter((id) => id !== option.policyVersionId);
      }
      const policyIds = new Set(
        current
          .map((id) => {
            const mapped = mappings.find((entry) => entry.policyVersionId === id);
            if (mapped) return mapped.policyId;
            return options.find((entry) => entry.policyVersionId === id)?.policyId;
          })
          .filter((id): id is string => Boolean(id)),
      );
      if (policyIds.has(option.policyId)) {
        setFieldErrors({
          policyVersionIds:
            "A Control cannot map two Versions of the same Policy at once.",
        });
        return current;
      }
      return [...current, option.policyVersionId];
    });
    setFieldErrors((current) => {
      if (!current.policyVersionIds) return current;
      const next = { ...current };
      delete next.policyVersionIds;
      return next;
    });
  };

  const save = async () => {
    if (!editable || !dirty || saving) return;
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const updated = await controlApi.replaceControlPolicyVersions(control.id, {
        policyVersionIds: sortedIds(selected),
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

  const activeMappings = mappings.filter((mapping) => mapping.isActive);

  return (
    <section className="card" data-testid="control-policy-version-mapping">
      <header className="card-head">
        <div>
          <h2>Policy Version mappings</h2>
          <p>
            Active mappings use currently APPROVED Policy Versions. Existing
            SUPERSEDED active rows remain visible and are not silently retargeted.
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

        <ul className="stack" data-testid="control-active-policy-versions">
          {activeMappings.length === 0 ? (
            <li className="muted">No active Policy Version mappings.</li>
          ) : (
            activeMappings.map((mapping) => (
              <li key={mapping.id}>
                {canReadPolicies ? (
                  <Link to={`/compliance/policies/${mapping.policyId}`}>
                    {mapping.policy.code}
                  </Link>
                ) : (
                  <strong className="mono">{mapping.policy.code}</strong>
                )}{" "}
                · {mapping.policy.title} · v
                <span className="mono">{mapping.policyVersion.version}</span>{" "}
                <Badge tone={versionStatusTone(mapping.policyVersion.status)}>
                  {statusLabel(mapping.policyVersion.status)}
                </Badge>
              </li>
            ))
          )}
        </ul>

        {!editable ? (
          <p className="muted">
            Policy Version mappings can be updated only for non-archived
            Controls when you hold controls:write.
          </p>
        ) : (
          <>
            <label className="field">
              <span className="sr-only">Search approved Policy Versions</span>
              <input
                className="control"
                type="search"
                placeholder="Search policies…"
                value={filter}
                onChange={(event) => {
                  setPage(1);
                  setFilter(event.target.value);
                }}
              />
            </label>
            {loadingOptions ? (
              <LoadingState label="Loading Policy Version options…" />
            ) : optionsError ? (
              <p className="muted" data-testid="control-policy-options-unavailable">
                {optionsError}
              </p>
            ) : (
              <div
                className="stack"
                style={{ maxHeight: 200, overflow: "auto" }}
                data-testid="control-policy-version-editor"
              >
                {options.length === 0 ? (
                  <p className="muted">
                    No APPROVED current Policy Versions match this search.
                  </p>
                ) : (
                  options.map((option) => {
                    const blockedByOtherVersion =
                      !selected.includes(option.policyVersionId) &&
                      selectedPolicyIds.has(option.policyId);
                    return (
                      <label key={option.policyVersionId} className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={selected.includes(option.policyVersionId)}
                          disabled={blockedByOtherVersion}
                          onChange={() => toggle(option)}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })
                )}
              </div>
            )}
            {fieldErrors.policyVersionIds ? (
              <div
                className="error"
                role="alert"
                data-testid="control-policy-version-field-error"
              >
                {fieldErrors.policyVersionIds}
              </div>
            ) : null}
            <div className="pagination">
              <button
                className="page-btn"
                type="button"
                disabled={page <= 1 || loadingOptions}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, totalPages)}
              </span>
              <button
                className="page-btn"
                type="button"
                disabled={page >= totalPages || loadingOptions}
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
              >
                Next
              </button>
            </div>
            <p className="muted">
              Update active Policy Version mappings. Historical rows are retained
              when a Version is unchecked.
            </p>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!dirty || saving}
              onClick={() => void save()}
              data-testid="control-policy-version-save"
            >
              <Save size={15} />{" "}
              {saving ? "Updating…" : "Update active Policy Version mappings"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
