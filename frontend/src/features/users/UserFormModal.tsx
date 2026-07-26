import { Save } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "../../components/feedback/Modal";
import { ApiError } from "../../services/apiClient";
import { masterDataApi } from "../../services/masterDataApi";
import type { CompanyUser, Department, UserStatus } from "../../types/api";
import {
  duplicateEmailFieldError,
  fieldErrorsFromApi,
  type FieldErrors,
} from "../../utils/fieldErrors";

const statuses: UserStatus[] = ["ACTIVE", "DISABLED", "INVITED", "LOCKED"];

interface UserFormModalProps {
  mode: "create" | "edit";
  user?: CompanyUser | null;
  onClose: () => void;
  onSaved: (user: CompanyUser) => void;
}

const emptyCreate = {
  code: "",
  name: "",
  email: "",
  phone: "",
  password: "",
  status: "ACTIVE" as UserStatus,
  departmentId: "",
};

export function UserFormModal({
  mode,
  user,
  onClose,
  onSaved,
}: UserFormModalProps) {
  const [values, setValues] = useState(() =>
    mode === "edit" && user
      ? {
          code: user.code,
          name: user.name,
          email: user.email,
          phone: user.phone ?? "",
          password: "",
          status: (statuses.includes(user.status as UserStatus)
            ? user.status
            : "ACTIVE") as UserStatus,
          departmentId: "",
        }
      : emptyCreate,
  );
  const [departments, setDepartments] = useState<Department[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingDepartments(true);
    void masterDataApi
      .listDepartments()
      .then((items) => {
        if (!active) return;
        setDepartments(items);
        if (mode === "edit" && user?.department) {
          const match = items.find((entry) => entry.name === user.department);
          if (match) {
            setValues((current) => ({ ...current, departmentId: match.id }));
          }
        }
      })
      .catch(() => {
        if (active) setDepartments([]);
      })
      .finally(() => {
        if (active) setLoadingDepartments(false);
      });
    return () => {
      active = false;
    };
  }, [mode, user]);

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
      const phone = values.phone.trim() ? values.phone.trim() : null;
      const departmentId = values.departmentId
        ? values.departmentId
        : null;
      const saved =
        mode === "create"
          ? await masterDataApi.createUser({
              code: values.code.trim(),
              name: values.name.trim(),
              email: values.email.trim(),
              phone,
              password: values.password,
              status: values.status,
              departmentId,
            })
          : await masterDataApi.updateUser(user!.id, {
              name: values.name.trim(),
              email: values.email.trim(),
              phone,
              status: values.status,
              departmentId,
              ...(values.password ? { password: values.password } : {}),
            });
      onSaved(saved);
    } catch (error) {
      const emailConflict = duplicateEmailFieldError(error);
      if (emailConflict) {
        setFieldErrors({ email: emailConflict });
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
      <label htmlFor={`user-${id}`}>{label}</label>
      {control}
      <div className="error" id={`user-${id}-error`} role="alert">
        {fieldErrors[id] ?? ""}
      </div>
    </div>
  );

  return (
    <Modal
      title={mode === "create" ? "Add User" : `Edit ${user?.name ?? "User"}`}
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
            form="user-write-form"
            disabled={saving}
          >
            <Save size={15} /> {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="user-write-form" className="form-grid" onSubmit={(event) => void onSubmit(event)}>
        {formError ? (
          <div className="banner warning field-span" role="alert">
            {formError}
          </div>
        ) : null}
        {mode === "create"
          ? field(
              "code",
              "User code",
              <input
                id="user-code"
                className={`control ${fieldErrors.code ? "invalid" : ""}`}
                name="code"
                value={values.code}
                onChange={(event) => setField("code", event.target.value)}
                autoComplete="off"
                required
                aria-invalid={Boolean(fieldErrors.code)}
                aria-describedby="user-code-error"
              />,
            )
          : field(
              "code",
              "User code",
              <input
                id="user-code"
                className="control"
                name="code"
                value={values.code}
                readOnly
                disabled
              />,
            )}
        {field(
          "name",
          "Full name",
          <input
            id="user-name"
            className={`control ${fieldErrors.name ? "invalid" : ""}`}
            name="name"
            value={values.name}
            onChange={(event) => setField("name", event.target.value)}
            required
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby="user-name-error"
          />,
        )}
        {field(
          "email",
          "Email",
          <input
            id="user-email"
            className={`control ${fieldErrors.email ? "invalid" : ""}`}
            name="email"
            type="email"
            value={values.email}
            onChange={(event) => setField("email", event.target.value)}
            required
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby="user-email-error"
          />,
        )}
        {field(
          "phone",
          "Phone",
          <input
            id="user-phone"
            className={`control ${fieldErrors.phone ? "invalid" : ""}`}
            name="phone"
            value={values.phone}
            onChange={(event) => setField("phone", event.target.value)}
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby="user-phone-error"
          />,
        )}
        {field(
          "password",
          mode === "create" ? "Password" : "Password (leave blank to keep)",
          <input
            id="user-password"
            className={`control ${fieldErrors.password ? "invalid" : ""}`}
            name="password"
            type="password"
            value={values.password}
            onChange={(event) => setField("password", event.target.value)}
            required={mode === "create"}
            autoComplete={mode === "create" ? "new-password" : "off"}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby="user-password-error"
          />,
        )}
        {field(
          "status",
          "Status",
          <select
            id="user-status"
            className={`control ${fieldErrors.status ? "invalid" : ""}`}
            name="status"
            value={values.status}
            onChange={(event) => setField("status", event.target.value)}
            aria-invalid={Boolean(fieldErrors.status)}
            aria-describedby="user-status-error"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>,
        )}
        {field(
          "departmentId",
          "Department",
          <select
            id="user-departmentId"
            className={`control ${fieldErrors.departmentId ? "invalid" : ""}`}
            name="departmentId"
            value={values.departmentId}
            onChange={(event) => setField("departmentId", event.target.value)}
            disabled={loadingDepartments}
            aria-invalid={Boolean(fieldErrors.departmentId)}
            aria-describedby="user-departmentId-error"
          >
            <option value="">No department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>,
        )}
      </form>
    </Modal>
  );
}
