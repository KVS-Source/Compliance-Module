import { Save } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "../../components/feedback/Modal";
import { ApiError } from "../../services/apiClient";
import { masterDataApi } from "../../services/masterDataApi";
import type {
  Department,
  Location,
  OrganisationUnit,
  UserStatus,
} from "../../types/api";
import {
  duplicateCodeFieldError,
  fieldErrorsFromApi,
  type FieldErrors,
} from "../../utils/fieldErrors";

export type OrganisationKind = "departments" | "locations" | "units";
export type OrganisationRow = Department | Location | OrganisationUnit;

const statuses: UserStatus[] = ["ACTIVE", "DISABLED", "INVITED", "LOCKED"];

interface OrganisationFormModalProps {
  kind: OrganisationKind;
  singular: string;
  mode: "create" | "edit";
  row?: OrganisationRow | null;
  onClose: () => void;
  onSaved: (row: OrganisationRow) => void;
}

const asStatus = (value: string): UserStatus =>
  statuses.includes(value as UserStatus) ? (value as UserStatus) : "ACTIVE";

export function OrganisationFormModal({
  kind,
  singular,
  mode,
  row,
  onClose,
  onSaved,
}: OrganisationFormModalProps) {
  const [values, setValues] = useState(() => ({
    code: row?.code ?? "",
    name: row?.name ?? "",
    headName:
      row && "headName" in row ? (row.headName ?? "") : "",
    city: row && "city" in row ? (row.city ?? "") : "",
    state: row && "state" in row ? (row.state ?? "") : "",
    country: row && "country" in row ? (row.country ?? "") : "",
    type: row && "type" in row ? (row.type ?? "") : "",
    status: asStatus(row?.status ?? "ACTIVE"),
  }));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setField = (key: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const nullable = (value: string) => (value.trim() ? value.trim() : null);
      let saved: OrganisationRow;
      if (kind === "departments") {
        saved =
          mode === "create"
            ? await masterDataApi.createDepartment({
                code: values.code.trim(),
                name: values.name.trim(),
                headName: nullable(values.headName),
                status: values.status,
              })
            : await masterDataApi.updateDepartment(row!.id, {
                name: values.name.trim(),
                headName: nullable(values.headName),
                status: values.status,
              });
      } else if (kind === "locations") {
        saved =
          mode === "create"
            ? await masterDataApi.createLocation({
                code: values.code.trim(),
                name: values.name.trim(),
                city: nullable(values.city),
                state: nullable(values.state),
                country: nullable(values.country),
                type: nullable(values.type),
                status: values.status,
              })
            : await masterDataApi.updateLocation(row!.id, {
                name: values.name.trim(),
                city: nullable(values.city),
                state: nullable(values.state),
                country: nullable(values.country),
                type: nullable(values.type),
                status: values.status,
              });
      } else {
        saved =
          mode === "create"
            ? await masterDataApi.createUnit({
                code: values.code.trim(),
                name: values.name.trim(),
                status: values.status,
              })
            : await masterDataApi.updateUnit(row!.id, {
                name: values.name.trim(),
                status: values.status,
              });
      }
      onSaved(saved);
    } catch (error) {
      const codeConflict = duplicateCodeFieldError(error);
      if (codeConflict) {
        setFieldErrors({ code: codeConflict });
        return;
      }
      const details = fieldErrorsFromApi(error);
      if (Object.keys(details).length > 0) {
        setFieldErrors(details);
        return;
      }
      setFormError(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Request failed",
      );
    } finally {
      setSaving(false);
    }
  };

  const field = (
    id: keyof typeof values,
    label: string,
    control: ReactNode,
  ) => (
    <div className="field">
      <label htmlFor={`org-${id}`}>{label}</label>
      {control}
      <div className="error" id={`org-${id}-error`} role="alert">
        {fieldErrors[id] ?? ""}
      </div>
    </div>
  );

  return (
    <Modal
      title={mode === "create" ? `Add ${singular}` : `Edit ${row?.name ?? singular}`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="org-write-form"
            disabled={saving}
          >
            <Save size={15} /> {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form
        id="org-write-form"
        className="form-grid"
        onSubmit={(event) => void onSubmit(event)}
      >
        {formError ? (
          <div className="banner warning field-span" role="alert">
            {formError}
          </div>
        ) : null}
        {field(
          "code",
          `${singular} code`,
          <input
            id="org-code"
            className={`control ${fieldErrors.code ? "invalid" : ""}`}
            name="code"
            value={values.code}
            onChange={(event) => setField("code", event.target.value)}
            required={mode === "create"}
            readOnly={mode === "edit"}
            disabled={mode === "edit"}
            aria-invalid={Boolean(fieldErrors.code)}
            aria-describedby="org-code-error"
          />,
        )}
        {field(
          "name",
          `${singular} name`,
          <input
            id="org-name"
            className={`control ${fieldErrors.name ? "invalid" : ""}`}
            name="name"
            value={values.name}
            onChange={(event) => setField("name", event.target.value)}
            required
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby="org-name-error"
          />,
        )}
        {kind === "departments"
          ? field(
              "headName",
              "Department head",
              <input
                id="org-headName"
                className={`control ${fieldErrors.headName ? "invalid" : ""}`}
                name="headName"
                value={values.headName}
                onChange={(event) => setField("headName", event.target.value)}
                aria-invalid={Boolean(fieldErrors.headName)}
                aria-describedby="org-headName-error"
              />,
            )
          : null}
        {kind === "locations" ? (
          <>
            {field(
              "city",
              "City",
              <input
                id="org-city"
                className={`control ${fieldErrors.city ? "invalid" : ""}`}
                name="city"
                value={values.city}
                onChange={(event) => setField("city", event.target.value)}
                aria-invalid={Boolean(fieldErrors.city)}
                aria-describedby="org-city-error"
              />,
            )}
            {field(
              "state",
              "State",
              <input
                id="org-state"
                className={`control ${fieldErrors.state ? "invalid" : ""}`}
                name="state"
                value={values.state}
                onChange={(event) => setField("state", event.target.value)}
                aria-invalid={Boolean(fieldErrors.state)}
                aria-describedby="org-state-error"
              />,
            )}
            {field(
              "country",
              "Country",
              <input
                id="org-country"
                className={`control ${fieldErrors.country ? "invalid" : ""}`}
                name="country"
                value={values.country}
                onChange={(event) => setField("country", event.target.value)}
                aria-invalid={Boolean(fieldErrors.country)}
                aria-describedby="org-country-error"
              />,
            )}
            {field(
              "type",
              "Type",
              <input
                id="org-type"
                className={`control ${fieldErrors.type ? "invalid" : ""}`}
                name="type"
                value={values.type}
                onChange={(event) => setField("type", event.target.value)}
                aria-invalid={Boolean(fieldErrors.type)}
                aria-describedby="org-type-error"
              />,
            )}
          </>
        ) : null}
        {field(
          "status",
          "Status",
          <select
            id="org-status"
            className={`control ${fieldErrors.status ? "invalid" : ""}`}
            name="status"
            value={values.status}
            onChange={(event) => setField("status", event.target.value)}
            aria-invalid={Boolean(fieldErrors.status)}
            aria-describedby="org-status-error"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>,
        )}
      </form>
    </Modal>
  );
}
