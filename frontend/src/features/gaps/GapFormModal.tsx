import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/feedback/Modal";
import { gapApi } from "../../services/gapApi";
import { masterDataApi } from "../../services/masterDataApi";
import type {
  CompanyUser,
  CreateGapInput,
  Department,
  Gap,
  GapSeverity,
  GapStatus,
  UpdateGapInput,
} from "../../types/api";

interface GapFormModalProps {
  gap?: Gap;
  onClose: () => void;
  onSaved: (gap: Gap) => void;
}

const severities: GapSeverity[] = [
  "CRITICAL",
  "MAJOR",
  "MINOR",
  "OBSERVATION",
  "OFI",
];

const editableStatuses: Array<Exclude<GapStatus, "CLOSED">> = [
  "OPEN",
  "IN_PROGRESS",
  "CANCELLED",
];

const optional = (value: string) => value.trim() || null;

export function GapFormModal({ gap, onClose, onSaved }: GapFormModalProps) {
  const [title, setTitle] = useState(gap?.title ?? "");
  const [description, setDescription] = useState(gap?.description ?? "");
  const [severity, setSeverity] = useState<GapSeverity>(gap?.severity ?? "MINOR");
  const [status, setStatus] = useState<Exclude<GapStatus, "CLOSED">>(
    gap?.status === "IN_PROGRESS" || gap?.status === "CANCELLED"
      ? gap.status
      : "OPEN",
  );
  const [source, setSource] = useState(gap?.source ?? "");
  const [clauseRef, setClauseRef] = useState(gap?.clauseRef ?? "");
  const [recommendedAction, setRecommendedAction] = useState(
    gap?.recommendedAction ?? "",
  );
  const [identifiedOn, setIdentifiedOn] = useState(gap?.identifiedOn ?? "");
  const [dueDate, setDueDate] = useState(gap?.dueDate ?? "");
  const [ownerId, setOwnerId] = useState(gap?.owner?.id ?? "");
  const [departmentId, setDepartmentId] = useState(gap?.department?.id ?? "");
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      masterDataApi.listUsers(),
      masterDataApi.listDepartments(),
    ]).then(([userResult, departmentResult]) => {
      if (!active) return;
      if (userResult.status === "fulfilled") setUsers(userResult.value);
      if (departmentResult.status === "fulfilled") {
        setDepartments(departmentResult.value);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (gap) {
        const input: UpdateGapInput = {
          title: title.trim(),
          description: optional(description),
          severity,
          status,
          source: optional(source),
          clauseRef: optional(clauseRef),
          recommendedAction: optional(recommendedAction),
          departmentId: departmentId || null,
          identifiedOn: identifiedOn || null,
          dueDate: dueDate || null,
        };
        onSaved(await gapApi.update(gap.id, input));
      } else {
        const input: CreateGapInput = {
          title: title.trim(),
          description: optional(description),
          severity,
          source: optional(source),
          clauseRef: optional(clauseRef),
          recommendedAction: optional(recommendedAction),
          ownerId: ownerId || null,
          departmentId: departmentId || null,
          identifiedOn: identifiedOn || null,
          dueDate: dueDate || null,
        };
        onSaved(await gapApi.create(input));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the Gap.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={gap ? `Edit ${gap.code}` : "Create Gap"}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" form="gap-form" disabled={saving || !title.trim()}>
            {saving ? "Saving…" : gap ? "Save changes" : "Create Gap"}
          </button>
        </>
      }
    >
      <form id="gap-form" onSubmit={submit}>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div className="form-grid">
          <label className="field field-span">
            <span>Title</span>
            <input className="control" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} required autoFocus />
          </label>
          <label className="field">
            <span>Severity</span>
            <select className="control" value={severity} onChange={(event) => setSeverity(event.target.value as GapSeverity)}>
              {severities.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          {gap ? (
            <label className="field">
              <span>Status</span>
              <select className="control" value={status} onChange={(event) => setStatus(event.target.value as Exclude<GapStatus, "CLOSED">)}>
                {editableStatuses.map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}
              </select>
            </label>
          ) : null}
          <label className="field field-span">
            <span>Description</span>
            <textarea className="control" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={5000} />
          </label>
          <label className="field">
            <span>Owner</span>
            <select className="control" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} disabled={Boolean(gap)}>
              <option value="">Unassigned</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.code})</option>)}
            </select>
            {gap ? <small>Use Assign owner on the detail page.</small> : null}
          </label>
          <label className="field">
            <span>Department</span>
            <select className="control" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value="">No department</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Identified on</span>
            <input className="control" type="date" value={identifiedOn} onChange={(event) => setIdentifiedOn(event.target.value)} />
          </label>
          <label className="field">
            <span>Due date</span>
            <input className="control" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Source</span>
            <input className="control" value={source} onChange={(event) => setSource(event.target.value)} maxLength={200} />
          </label>
          <label className="field">
            <span>Clause reference</span>
            <input className="control" value={clauseRef} onChange={(event) => setClauseRef(event.target.value)} maxLength={200} />
          </label>
          <label className="field field-span">
            <span>Recommended action</span>
            <textarea className="control" value={recommendedAction} onChange={(event) => setRecommendedAction(event.target.value)} rows={3} maxLength={5000} />
          </label>
        </div>
      </form>
    </Modal>
  );
}
