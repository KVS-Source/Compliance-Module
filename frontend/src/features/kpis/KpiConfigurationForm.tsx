import { Save, TriangleAlert } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { LoadingState } from "../../components/feedback/AsyncState";
import { Modal } from "../../components/feedback/Modal";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { kpiApi } from "../../services/kpiApi";
import { masterDataApi } from "../../services/masterDataApi";
import type {
  CompanyUser,
  CreateKpiConfigurationInput,
  Department,
  KpiConfiguration,
  KpiDefinition,
  KpiFrequency,
  KpiThresholdDefaults,
  Location,
  OrganisationUnit,
} from "../../types/api";
import { kpiConfigurationError, type FieldErrors } from "../../utils/fieldErrors";
import { directionLabel, enumLabel } from "./kpiFormatting";

const FREQUENCIES: KpiFrequency[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "ANNUAL",
  "CONTINUOUS",
  "PER_EVENT",
  "ONE_TIME",
];

interface FormState {
  kpiDefinitionId: string;
  departmentId: string;
  orgUnitId: string;
  orgLocationId: string;
  productService: string;
  ownerId: string;
  approverId: string;
  enabled: boolean;
  requiresApproval: boolean;
  requiresEvidence: boolean;
  currency: string;
  reviewFrequency: KpiFrequency;
  amberThresholdPct: string;
  redThresholdPct: string;
  effectiveFrom: string;
  effectiveTo: string;
}

const emptyState = (): FormState => ({
  kpiDefinitionId: "",
  departmentId: "",
  orgUnitId: "",
  orgLocationId: "",
  productService: "",
  ownerId: "",
  approverId: "",
  enabled: true,
  requiresApproval: true,
  requiresEvidence: false,
  currency: "",
  reviewFrequency: "QUARTERLY",
  amberThresholdPct: "",
  redThresholdPct: "",
  effectiveFrom: "",
  effectiveTo: "",
});

const stateFrom = (configuration: KpiConfiguration): FormState => ({
  kpiDefinitionId: configuration.kpi.id,
  departmentId: configuration.department?.id ?? "",
  orgUnitId: configuration.orgUnit?.id ?? "",
  orgLocationId: configuration.orgLocation?.id ?? "",
  productService: configuration.productService ?? "",
  ownerId: configuration.owner?.id ?? "",
  approverId: configuration.approver?.id ?? "",
  enabled: configuration.enabled,
  requiresApproval: configuration.requiresApproval,
  requiresEvidence: configuration.requiresEvidence,
  currency: configuration.currency ?? "",
  reviewFrequency: configuration.reviewFrequency,
  amberThresholdPct: configuration.amberThresholdPct ?? "",
  redThresholdPct: configuration.redThresholdPct ?? "",
  effectiveFrom: configuration.effectiveFrom,
  effectiveTo: configuration.effectiveTo ?? "",
});

/** Empty string means "omit"; the API treats null as an explicit clear. */
const orNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

interface ReferenceData {
  definitions: KpiDefinition[] | null;
  users: CompanyUser[] | null;
  departments: Department[] | null;
  locations: Location[] | null;
  units: OrganisationUnit[] | null;
  thresholds: KpiThresholdDefaults | null;
}

/**
 * Pickers depend on users:read and organisation:read, which a role holding
 * kpi-config:write does not necessarily carry. Settle each independently so one
 * denial degrades a single field instead of blocking the whole form.
 */
const loadReferenceData = async (): Promise<ReferenceData> => {
  const [definitions, users, departments, locations, units, thresholds] =
    await Promise.allSettled([
      masterDataApi.listKpiDefinitions(),
      masterDataApi.listUsers(),
      masterDataApi.listDepartments(),
      masterDataApi.listLocations(),
      masterDataApi.listUnits(),
      kpiApi.getThresholdDefaults(),
    ]);
  const settled = <T,>(result: PromiseSettledResult<T>) =>
    result.status === "fulfilled" ? result.value : null;
  return {
    definitions: settled(definitions),
    users: settled(users),
    departments: settled(departments),
    locations: settled(locations),
    units: settled(units),
    thresholds: settled(thresholds),
  };
};

interface Props {
  configuration: KpiConfiguration | null;
  onClose: () => void;
  onSaved: (configuration: KpiConfiguration, created: boolean) => void;
}

export function KpiConfigurationForm({ configuration, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const editing = configuration !== null;

  const [form, setForm] = useState<FormState>(() =>
    configuration ? stateFrom(configuration) : emptyState(),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reference = useApiResource(loadReferenceData, [
    contextVersion,
    user?.activeCompany.id,
  ]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const selectedDefinition = useMemo(
    () =>
      (reference.data?.definitions ?? []).find(
        (definition) => definition.id === form.kpiDefinitionId,
      ) ?? null,
    [form.kpiDefinitionId, reference.data?.definitions],
  );

  const thresholds = reference.data?.thresholds ?? null;
  const defaultNote = (which: "amber" | "red") => {
    if (!thresholds) {
      return "Leave empty to inherit the Company default (the current default could not be loaded).";
    }
    const value =
      which === "amber"
        ? thresholds.defaultAmberThresholdPct
        : thresholds.defaultRedThresholdPct;
    return `Leave empty to inherit the Company default, currently ${value}%.`;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    const payload: CreateKpiConfigurationInput = {
      kpiDefinitionId: form.kpiDefinitionId,
      departmentId: orNull(form.departmentId),
      orgUnitId: orNull(form.orgUnitId),
      orgLocationId: orNull(form.orgLocationId),
      productService: orNull(form.productService),
      ownerId: form.ownerId,
      approverId: orNull(form.approverId),
      enabled: form.enabled,
      currency: orNull(form.currency)?.toUpperCase() ?? null,
      reviewFrequency: form.reviewFrequency,
      amberThresholdPct: orNull(form.amberThresholdPct),
      redThresholdPct: orNull(form.redThresholdPct),
      requiresEvidence: form.requiresEvidence,
      requiresApproval: form.requiresApproval,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: orNull(form.effectiveTo),
    };
    try {
      const saved = editing
        ? await kpiApi.updateConfiguration(configuration.id, payload)
        : await kpiApi.createConfiguration(payload);
      onSaved(saved, !editing);
    } catch (error) {
      const mapped = kpiConfigurationError(error);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSaving(false);
    }
  };

  const errorFor = (key: string) => fieldErrors[key] ?? "";
  const missingPicker = (label: string, permission: string) => (
    <p className="muted">
      {label} could not be loaded. This usually means your role does not include{" "}
      <code>{permission}</code>.
    </p>
  );

  return (
    <Modal
      title={editing ? "Edit KPI configuration" : "New KPI configuration"}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="kpi-configuration-form"
            disabled={
              saving ||
              reference.loading ||
              !form.kpiDefinitionId ||
              !form.ownerId ||
              !form.effectiveFrom
            }
          >
            <Save size={15} />
            {saving
              ? "Saving…"
              : editing
                ? "Save configuration"
                : "Create configuration"}
          </button>
        </>
      }
    >
      {reference.loading ? (
        <LoadingState label="Loading KPI reference data…" />
      ) : (
        <form
          id="kpi-configuration-form"
          className="form-grid"
          onSubmit={(event) => void onSubmit(event)}
        >
          {formError ? (
            <div className="banner warning field-span" role="alert">
              {formError}
            </div>
          ) : null}

          <div className="field field-span">
            <label htmlFor="config-definition">KPI definition *</label>
            <select
              id="config-definition"
              className={`control ${errorFor("kpiDefinitionId") ? "invalid" : ""}`}
              value={form.kpiDefinitionId}
              onChange={(event) => set("kpiDefinitionId", event.target.value)}
              required
              aria-invalid={Boolean(errorFor("kpiDefinitionId"))}
              aria-describedby="config-definition-error"
            >
              <option value="">Select a shared KPI definition</option>
              {(reference.data?.definitions ?? []).map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.code} · {definition.name}
                </option>
              ))}
            </select>
            <div className="error" id="config-definition-error" role="alert">
              {errorFor("kpiDefinitionId")}
            </div>
            {reference.data?.definitions === null
              ? missingPicker("KPI definitions", "kpis:read")
              : null}
            <p className="muted">
              KPI definitions are shared platform master data and are maintained
              centrally, not per Company.
            </p>
          </div>

          {selectedDefinition ? (
            <section
              className="field-span information-card"
              aria-label="Selected KPI definition"
            >
              <dl className="detail-list">
                <div>
                  <dt>Code</dt>
                  <dd className="mono">{selectedDefinition.code}</dd>
                </div>
                <div>
                  <dt>Name</dt>
                  <dd>{selectedDefinition.name}</dd>
                </div>
                <div>
                  <dt>Unit of measure</dt>
                  <dd>{selectedDefinition.unit}</dd>
                </div>
                <div>
                  <dt>Definition frequency</dt>
                  <dd>{enumLabel(selectedDefinition.frequency)}</dd>
                </div>
                <div>
                  <dt>Direction</dt>
                  <dd>
                    {directionLabel(
                      selectedDefinition.direction as Parameters<
                        typeof directionLabel
                      >[0],
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}

          <div className="field">
            <label htmlFor="config-department">Department (Business Unit)</label>
            <select
              id="config-department"
              className={`control ${errorFor("departmentId") ? "invalid" : ""}`}
              value={form.departmentId}
              onChange={(event) => set("departmentId", event.target.value)}
              aria-invalid={Boolean(errorFor("departmentId"))}
              aria-describedby="config-department-error"
            >
              <option value="">Not scoped to a department</option>
              {(reference.data?.departments ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.code} · {department.name}
                </option>
              ))}
            </select>
            <div className="error" id="config-department-error" role="alert">
              {errorFor("departmentId")}
            </div>
            {reference.data?.departments === null
              ? missingPicker("Departments", "organisation:read")
              : null}
          </div>

          <div className="field">
            <label htmlFor="config-unit">Organisation unit</label>
            <select
              id="config-unit"
              className={`control ${errorFor("orgUnitId") ? "invalid" : ""}`}
              value={form.orgUnitId}
              onChange={(event) => set("orgUnitId", event.target.value)}
              aria-invalid={Boolean(errorFor("orgUnitId"))}
              aria-describedby="config-unit-error"
            >
              <option value="">Not scoped to a unit</option>
              {(reference.data?.units ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code} · {unit.name}
                </option>
              ))}
            </select>
            <div className="error" id="config-unit-error" role="alert">
              {errorFor("orgUnitId")}
            </div>
          </div>

          <div className="field">
            <label htmlFor="config-location">Location</label>
            <select
              id="config-location"
              className={`control ${errorFor("orgLocationId") ? "invalid" : ""}`}
              value={form.orgLocationId}
              onChange={(event) => set("orgLocationId", event.target.value)}
              aria-invalid={Boolean(errorFor("orgLocationId"))}
              aria-describedby="config-location-error"
            >
              <option value="">Not scoped to a location</option>
              {(reference.data?.locations ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} · {location.name}
                </option>
              ))}
            </select>
            <div className="error" id="config-location-error" role="alert">
              {errorFor("orgLocationId")}
            </div>
          </div>

          <div className="field">
            <label htmlFor="config-product">Product or service</label>
            <input
              id="config-product"
              className={`control ${errorFor("productService") ? "invalid" : ""}`}
              value={form.productService}
              onChange={(event) => set("productService", event.target.value)}
              maxLength={200}
              placeholder="Not scoped to a product or service"
              aria-invalid={Boolean(errorFor("productService"))}
              aria-describedby="config-product-error"
            />
            <div className="error" id="config-product-error" role="alert">
              {errorFor("productService")}
            </div>
          </div>

          <div className="field">
            <label htmlFor="config-owner">Owner *</label>
            <select
              id="config-owner"
              className={`control ${errorFor("ownerId") ? "invalid" : ""}`}
              value={form.ownerId}
              onChange={(event) => set("ownerId", event.target.value)}
              required
              aria-invalid={Boolean(errorFor("ownerId"))}
              aria-describedby="config-owner-error"
            >
              <option value="">Select an owner</option>
              {(reference.data?.users ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} · {entry.name}
                </option>
              ))}
            </select>
            <div className="error" id="config-owner-error" role="alert">
              {errorFor("ownerId")}
            </div>
            {reference.data?.users === null
              ? missingPicker("Company users", "users:read")
              : null}
          </div>

          <div className="field">
            <label htmlFor="config-approver">Approver</label>
            <select
              id="config-approver"
              className={`control ${errorFor("approverId") ? "invalid" : ""}`}
              value={form.approverId}
              onChange={(event) => set("approverId", event.target.value)}
              aria-invalid={Boolean(errorFor("approverId"))}
              aria-describedby="config-approver-error"
            >
              <option value="">
                Any user holding kpi-target:approve may decide
              </option>
              {(reference.data?.users ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} · {entry.name}
                </option>
              ))}
            </select>
            <div className="error" id="config-approver-error" role="alert">
              {errorFor("approverId")}
            </div>
            <p className="muted">
              Naming an approver restricts target decisions to that user. They
              cannot also submit the target.
            </p>
          </div>

          <div className="field">
            <label htmlFor="config-frequency">Review frequency *</label>
            <select
              id="config-frequency"
              className={`control ${errorFor("reviewFrequency") ? "invalid" : ""}`}
              value={form.reviewFrequency}
              onChange={(event) =>
                set("reviewFrequency", event.target.value as KpiFrequency)
              }
              required
              aria-invalid={Boolean(errorFor("reviewFrequency"))}
              aria-describedby="config-frequency-error"
            >
              {FREQUENCIES.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {enumLabel(frequency)}
                </option>
              ))}
            </select>
            <div className="error" id="config-frequency-error" role="alert">
              {errorFor("reviewFrequency")}
            </div>
          </div>

          <div className="field">
            <label htmlFor="config-currency">Currency</label>
            <input
              id="config-currency"
              className={`control ${errorFor("currency") ? "invalid" : ""}`}
              value={form.currency}
              onChange={(event) => set("currency", event.target.value)}
              maxLength={3}
              placeholder="e.g. INR"
              aria-invalid={Boolean(errorFor("currency"))}
              aria-describedby="config-currency-error"
            />
            <div className="error" id="config-currency-error" role="alert">
              {errorFor("currency")}
            </div>
            <p className="muted">
              ISO 4217, and only meaningful for monetary KPIs. Leave empty
              otherwise.
            </p>
          </div>

          <div className="field">
            <label htmlFor="config-amber">Amber threshold override (%)</label>
            <input
              id="config-amber"
              className={`control ${errorFor("amberThresholdPct") ? "invalid" : ""}`}
              value={form.amberThresholdPct}
              onChange={(event) => set("amberThresholdPct", event.target.value)}
              inputMode="decimal"
              placeholder="Company default"
              aria-invalid={Boolean(errorFor("amberThresholdPct"))}
              aria-describedby="config-amber-error config-amber-help"
            />
            <div className="error" id="config-amber-error" role="alert">
              {errorFor("amberThresholdPct")}
            </div>
            <p className="muted" id="config-amber-help">
              {defaultNote("amber")}
            </p>
          </div>

          <div className="field">
            <label htmlFor="config-red">Red threshold override (%)</label>
            <input
              id="config-red"
              className={`control ${errorFor("redThresholdPct") ? "invalid" : ""}`}
              value={form.redThresholdPct}
              onChange={(event) => set("redThresholdPct", event.target.value)}
              inputMode="decimal"
              placeholder="Company default"
              aria-invalid={Boolean(errorFor("redThresholdPct"))}
              aria-describedby="config-red-error config-red-help"
            />
            <div className="error" id="config-red-error" role="alert">
              {errorFor("redThresholdPct")}
            </div>
            <p className="muted" id="config-red-help">
              {defaultNote("red")}
            </p>
          </div>

          <div className="field">
            <label htmlFor="config-from">Effective from *</label>
            <input
              id="config-from"
              className={`control ${errorFor("effectiveFrom") ? "invalid" : ""}`}
              type="date"
              value={form.effectiveFrom}
              onChange={(event) => set("effectiveFrom", event.target.value)}
              required
              aria-invalid={Boolean(errorFor("effectiveFrom"))}
              aria-describedby="config-from-error"
            />
            <div className="error" id="config-from-error" role="alert">
              {errorFor("effectiveFrom")}
            </div>
          </div>

          <div className="field">
            <label htmlFor="config-to">Effective to</label>
            <input
              id="config-to"
              className={`control ${errorFor("effectiveTo") ? "invalid" : ""}`}
              type="date"
              value={form.effectiveTo}
              onChange={(event) => set("effectiveTo", event.target.value)}
              aria-invalid={Boolean(errorFor("effectiveTo"))}
              aria-describedby="config-to-error"
            />
            <div className="error" id="config-to-error" role="alert">
              {errorFor("effectiveTo")}
            </div>
          </div>

          <fieldset className="field-span">
            <legend>Options</legend>
            <label className="checkbox-row" htmlFor="config-enabled">
              <input
                id="config-enabled"
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => set("enabled", event.target.checked)}
              />
              <span>Enabled — targets and actuals may be recorded</span>
            </label>
            <label className="checkbox-row" htmlFor="config-requires-approval">
              <input
                id="config-requires-approval"
                type="checkbox"
                checked={form.requiresApproval}
                onChange={(event) =>
                  set("requiresApproval", event.target.checked)
                }
              />
              <span>
                Requires approval — targets and actuals need an approver
              </span>
            </label>
            <label className="checkbox-row" htmlFor="config-requires-evidence">
              <input
                id="config-requires-evidence"
                type="checkbox"
                checked={form.requiresEvidence}
                onChange={(event) =>
                  set("requiresEvidence", event.target.checked)
                }
                aria-describedby="config-evidence-warning"
              />
              <span>Requires evidence</span>
            </label>
            {form.requiresEvidence ? (
              <div
                className="banner warning"
                role="alert"
                id="config-evidence-warning"
                data-testid="requires-evidence-warning"
              >
                <TriangleAlert size={15} aria-hidden />{" "}
                <strong>Evidence support is not implemented yet.</strong> With
                this enabled, approving a KPI actual for this configuration
                fails with <code>501 EVIDENCE_GATE_NOT_IMPLEMENTED</code> and
                saves nothing. If “Requires approval” is off, actual submission
                itself fails the same way, because submission approves
                immediately. KPI target submission and approval are not
                affected.
              </div>
            ) : (
              <p className="muted" id="config-evidence-warning">
                Evidence is not implemented yet. Enabling this blocks KPI actual
                approval until the Evidence domain ships.
              </p>
            )}
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
