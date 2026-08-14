import { Save } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Modal } from "../../components/feedback/Modal";
import { ApiError } from "../../services/apiClient";
import { masterDataApi } from "../../services/masterDataApi";
import {
  registerApi,
  type RegisterRecord,
  type RegisterType,
} from "../../services/registerApi";
import type { CompanyUser, Department } from "../../types/api";

type RegisterField = { key: string; label: string; type: string };

const configuredFields = (register: RegisterType): RegisterField[] =>
  Array.isArray(register.fields)
    ? register.fields.filter(
        (field): field is RegisterField =>
          typeof field === "object" &&
          field !== null &&
          typeof (field as RegisterField).key === "string" &&
          typeof (field as RegisterField).label === "string" &&
          typeof (field as RegisterField).type === "string",
      )
    : [];

export function RegisterRecordFormModal({
  register,
  record,
  onClose,
  onSaved,
}: {
  register: RegisterType;
  record?: RegisterRecord | null;
  onClose: () => void;
  onSaved: (record: RegisterRecord) => void;
}) {
  const editing = Boolean(record);
  const fields = useMemo(() => configuredFields(register), [register]);
  const [values, setValues] = useState(() => ({
    businessRecordCode: record?.businessRecordCode ?? "",
    title: record?.title ?? "",
    status: record?.status ?? "",
    ownerId: record?.owner?.id ?? "",
    departmentId: record?.department?.id ?? "",
    recordDate: record?.recordDate ?? "",
    dueDate: record?.dueDate ?? "",
  }));
  const [payload, setPayload] = useState<Record<string, string>>(
    record?.fields ?? {},
  );
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingReferences(true);
    void Promise.all([masterDataApi.listUsers(), masterDataApi.listDepartments()])
      .then(([companyUsers, companyDepartments]) => {
        if (!active) return;
        setUsers(companyUsers);
        setDepartments(companyDepartments);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Company owners and departments could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingReferences(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const setField = (key: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const input = {
      title: values.title.trim(),
      status: values.status.trim() || null,
      ownerId: values.ownerId || null,
      departmentId: values.departmentId || null,
      recordDate: values.recordDate || null,
      dueDate: values.dueDate || null,
      payload,
    };
    try {
      const saved = record
        ? await registerApi.updateRecord(register.code, record.id, input)
        : await registerApi.createRecord(register.code, {
            businessRecordCode: values.businessRecordCode.trim(),
            ...input,
          });
      onSaved(saved);
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : reason instanceof Error
            ? reason.message
            : "The register record could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Edit ${record?.businessRecordCode}` : `Add ${register.name} record`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" form="register-record-form" disabled={saving || loadingReferences}>
            <Save size={15} /> {saving ? "Saving…" : editing ? "Save changes" : "Create record"}
          </button>
        </>
      }
    >
      <form id="register-record-form" className="form-grid" onSubmit={(event) => void submit(event)}>
        {error ? <div className="banner warning field-span" role="alert">{error}</div> : null}
        <div className="field">
          <label htmlFor="register-business-code">Record code</label>
          <input id="register-business-code" className="control" value={values.businessRecordCode} onChange={(event) => setField("businessRecordCode", event.target.value)} maxLength={64} required readOnly={editing} />
        </div>
        <div className="field">
          <label htmlFor="register-status">Status</label>
          <input id="register-status" className="control" value={values.status} onChange={(event) => setField("status", event.target.value)} maxLength={120} placeholder="Open" />
        </div>
        <div className="field span-2">
          <label htmlFor="register-title">Title</label>
          <input id="register-title" className="control" value={values.title} onChange={(event) => setField("title", event.target.value)} maxLength={300} required />
        </div>
        <div className="field">
          <label htmlFor="register-owner">Owner</label>
          <select id="register-owner" className="control" value={values.ownerId} onChange={(event) => setField("ownerId", event.target.value)}>
            <option value="">Unassigned</option>
            {users.map((user) => <option value={user.id} key={user.id}>{user.name} ({user.code})</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="register-department">Department</label>
          <select id="register-department" className="control" value={values.departmentId} onChange={(event) => setField("departmentId", event.target.value)}>
            <option value="">Not assigned</option>
            {departments.map((department) => <option value={department.id} key={department.id}>{department.name} ({department.code})</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="register-record-date">Record date</label>
          <input id="register-record-date" className="control" type="date" value={values.recordDate} onChange={(event) => setField("recordDate", event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="register-due-date">Due date</label>
          <input id="register-due-date" className="control" type="date" value={values.dueDate} onChange={(event) => setField("dueDate", event.target.value)} />
        </div>
        {fields.map((field) => (
          <div className="field" key={field.key}>
            <label htmlFor={`register-payload-${field.key}`}>{field.label}</label>
            <input
              id={`register-payload-${field.key}`}
              className="control"
              type={field.type.toLowerCase() === "date" ? "date" : "text"}
              value={payload[field.key] ?? ""}
              onChange={(event) => {
                setPayload((current) => ({ ...current, [field.key]: event.target.value }));
                setError(null);
              }}
              maxLength={2_000}
            />
          </div>
        ))}
      </form>
    </Modal>
  );
}
