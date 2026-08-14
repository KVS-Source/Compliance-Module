import { Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/feedback/Modal";
import { ApiError } from "../../services/apiClient";
import { tenantApi } from "../../services/tenantApi";
import type { Company } from "../../types/api";
import {
  duplicateCodeFieldError,
  fieldErrorsFromApi,
  type FieldErrors,
} from "../../utils/fieldErrors";

/**
 * Creates a Company. The caller becomes its administrator, so the new Company
 * is immediately usable rather than an empty record nobody can enter.
 *
 * There is no edit form: the API exposes creation only, and a control that
 * appeared to save without an endpoint behind it would be worse than its
 * absence.
 */
export function CompanyFormModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (company: Company) => void;
}) {
  const [values, setValues] = useState({
    code: "",
    name: "",
    industry: "",
    country: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setField = (key: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const company = await tenantApi.create({
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        industry: values.industry.trim() || null,
        country: values.country.trim() || null,
      });
      onSaved(company);
    } catch (caught) {
      if (caught instanceof ApiError) {
        const duplicate = duplicateCodeFieldError(caught);
        setFieldErrors(
          duplicate ? { code: duplicate } : fieldErrorsFromApi(caught),
        );
        setError(caught.message);
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : "The Company was not created.",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add Company"
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
            form="company-form"
            disabled={saving}
            data-testid="company-form-save"
          >
            <Save size={15} /> {saving ? "Saving…" : "Create Company"}
          </button>
        </>
      }
    >
      <form id="company-form" className="form-grid" onSubmit={submit}>
        {error ? (
          <p className="form-error span-2" role="alert">
            {error}
          </p>
        ) : null}
        <label className="field">
          <span>Company code</span>
          <input
            className={`control ${fieldErrors.code ? "invalid" : ""}`}
            value={values.code}
            onChange={(event) => setField("code", event.target.value)}
            placeholder="ACME-EU"
            required
            data-testid="company-form-code"
            aria-invalid={Boolean(fieldErrors.code)}
          />
          <small>
            {fieldErrors.code ??
              "2–64 uppercase letters, digits, hyphen or underscore."}
          </small>
        </label>
        <label className="field">
          <span>Company name</span>
          <input
            className={`control ${fieldErrors.name ? "invalid" : ""}`}
            value={values.name}
            onChange={(event) => setField("name", event.target.value)}
            required
            data-testid="company-form-name"
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name ? <small>{fieldErrors.name}</small> : null}
        </label>
        <label className="field">
          <span>Industry</span>
          <input
            className="control"
            value={values.industry}
            onChange={(event) => setField("industry", event.target.value)}
            data-testid="company-form-industry"
          />
        </label>
        <label className="field">
          <span>Country</span>
          <input
            className="control"
            value={values.country}
            onChange={(event) => setField("country", event.target.value)}
            data-testid="company-form-country"
          />
        </label>
      </form>
    </Modal>
  );
}
