import { Save } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "../../components/feedback/Modal";
import { ApiError } from "../../services/apiClient";
import { masterDataApi } from "../../services/masterDataApi";
import { userRoleApi } from "../../services/userRoleApi";
import type {
  AccessProfileResponse,
  CompanyUser,
  Department,
  UserStatus,
} from "../../types/api";
import {
  duplicateEmailFieldError,
  fieldErrorsFromApi,
  type FieldErrors,
} from "../../utils/fieldErrors";

const statuses: UserStatus[] = ["ACTIVE", "DISABLED", "INVITED", "LOCKED"];

interface UserFormModalProps {
  mode: "create" | "edit";
  user?: CompanyUser | null;
  canAssignRole: boolean;
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
  roleCode: "",
};

const assignedRoleCode = (user?: CompanyUser | null) => {
  const assignment = user?.roles.find(
    (role): role is Exclude<CompanyUser["roles"][number], string> =>
      typeof role !== "string" && role.status === "ACTIVE",
  );
  return assignment?.code ?? "";
};

export function UserFormModal({
  mode,
  user,
  canAssignRole,
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
          roleCode: assignedRoleCode(user),
        }
      : emptyCreate,
  );
  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<AccessProfileResponse["profiles"]>(
    [],
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savedWithoutRole, setSavedWithoutRole] = useState<CompanyUser | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingProfiles, setLoadingProfiles] = useState(canAssignRole);

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

  useEffect(() => {
    if (!canAssignRole) {
      setProfiles([]);
      setLoadingProfiles(false);
      return;
    }
    let active = true;
    setLoadingProfiles(true);
    void userRoleApi
      .profiles()
      .then((response) => {
        if (!active) return;
        setProfiles(response.profiles);
      })
      .catch(() => {
        if (!active) return;
        setProfiles([]);
        setFieldErrors((current) => ({
          ...current,
          roleCode: "Roles could not be loaded",
        }));
      })
      .finally(() => {
        if (active) setLoadingProfiles(false);
      });
    return () => {
      active = false;
    };
  }, [canAssignRole]);

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
    if (mode === "create" && canAssignRole && !values.roleCode) {
      setFieldErrors({ roleCode: "Select a sanctioned role" });
      setSaving(false);
      return;
    }
    let saved = savedWithoutRole;
    let assigningRole = false;
    try {
      const phone = values.phone.trim() ? values.phone.trim() : null;
      const departmentId = values.departmentId ? values.departmentId : null;
      if (!saved) {
        saved =
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
      }
      const initialRoleCode = assignedRoleCode(user);
      if (
        canAssignRole &&
        values.roleCode &&
        (mode === "create" || values.roleCode !== initialRoleCode)
      ) {
        assigningRole = true;
        await userRoleApi.assign(saved.id, values.roleCode);
      }
      onSaved(saved);
    } catch (error) {
      if (saved && assigningRole) {
        setSavedWithoutRole(saved);
        const reason =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Request failed";
        setFormError(
          `${mode === "create" ? "The user was created" : "The user details were saved"}, but the role assignment failed: ${reason}. Choose a role and retry the assignment.`,
        );
        return;
      }
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
            disabled={saving || (canAssignRole && loadingProfiles)}
          >
            <Save size={15} />{" "}
            {saving
              ? "Saving…"
              : savedWithoutRole
                ? "Retry role assignment"
                : "Save"}
          </button>
        </>
      }
    >
      <form
        id="user-write-form"
        className="form-grid"
        onSubmit={(event) => void onSubmit(event)}
      >
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
          <>
            <input
              id="user-password"
              className={`control ${fieldErrors.password ? "invalid" : ""}`}
              name="password"
              type="password"
              value={values.password}
              onChange={(event) => setField("password", event.target.value)}
              required={mode === "create"}
              autoComplete="new-password"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                mode === "edit"
                  ? "user-password-hint user-password-error"
                  : "user-password-error"
              }
            />
            {mode === "edit" ? (
              <small id="user-password-hint">
                A new password requires the user to sign in again across all
                Companies when their current access expires.
              </small>
            ) : null}
          </>,
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
        {canAssignRole
          ? field(
              "roleCode",
              "Role",
              <select
                id="user-roleCode"
                className={`control ${fieldErrors.roleCode ? "invalid" : ""}`}
                name="roleCode"
                value={values.roleCode}
                onChange={(event) => setField("roleCode", event.target.value)}
                disabled={loadingProfiles}
                required={mode === "create"}
                aria-invalid={Boolean(fieldErrors.roleCode)}
                aria-describedby="user-roleCode-error"
              >
                <option value="">
                  {mode === "create" ? "Select a role" : "Keep current role"}
                </option>
                {profiles.map((profile) => (
                  <option key={profile.code} value={profile.code}>
                    {profile.name}
                  </option>
                ))}
              </select>,
            )
          : null}
      </form>
    </Modal>
  );
}
