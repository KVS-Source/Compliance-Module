import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/feedback/Modal";
import { masterDataApi } from "../../services/masterDataApi";
import { taskApi } from "../../services/taskApi";
import type {
  CompanyUser,
  ComplianceTask,
  TaskInput,
  TaskLinkType,
  TaskStatus,
} from "../../types/api";

const optional = (value: string) => value.trim() || null;

export function TaskFormModal({
  task,
  onClose,
  onSaved,
}: {
  task?: ComplianceTask;
  onClose: () => void;
  onSaved: (task: ComplianceTask) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "TODO");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [ownerId, setOwnerId] = useState(task?.owner?.id ?? "");
  const [linkType, setLinkType] = useState<TaskLinkType>(task?.linked.type ?? "GAP");
  const [linkId, setLinkId] = useState(task?.linked.id ?? "");
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void masterDataApi.listUsers().then((items) => {
      if (active) setUsers(items);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const input: TaskInput = {
      title: title.trim(),
      description: optional(description),
      status,
      dueDate: dueDate || null,
      ownerId: ownerId || null,
      linkedEntityType: linkType,
      linkedEntityId: linkId,
    };
    try {
      onSaved(task ? await taskApi.update(task.id, input) : await taskApi.create(input));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The task could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={task ? "Edit task" : "Create task"}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="task-form"
            disabled={saving || !title.trim() || !linkId}
          >
            {saving ? "Saving…" : task ? "Save changes" : "Create task"}
          </button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit}>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div className="form-grid">
          <label className="field field-span">
            <span>Title</span>
            <input className="control" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} required autoFocus />
          </label>
          <label className="field field-span">
            <span>Description</span>
            <textarea className="control" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={5000} />
          </label>
          <label className="field">
            <span>Status</span>
            <select className="control" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
              <option value="TODO">TO DO</option>
              <option value="IN_PROGRESS">IN PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </label>
          <label className="field">
            <span>Due date</span>
            <input className="control" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <label className="field field-span">
            <span>Owner</span>
            <select className="control" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option value={user.id} key={user.id}>{user.name} ({user.code})</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Linked record type</span>
            <select className="control" value={linkType} onChange={(event) => setLinkType(event.target.value as TaskLinkType)}>
              <option value="GAP">Gap</option>
              <option value="CAPA">CAPA</option>
              <option value="RISK">Risk</option>
              <option value="AUDIT">Audit event</option>
            </select>
          </label>
          <label className="field">
            <span>Linked record id</span>
            <input className="control mono" value={linkId} onChange={(event) => setLinkId(event.target.value.trim())} placeholder="UUID" required />
          </label>
        </div>
        <p className="detail-help">
          The server verifies that the linked Gap, CAPA, Risk or Audit event belongs to the active Company.
        </p>
      </form>
    </Modal>
  );
}
