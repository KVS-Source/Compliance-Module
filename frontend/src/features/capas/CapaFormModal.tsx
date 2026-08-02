import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/feedback/Modal";
import { capaApi } from "../../services/capaApi";
import { gapApi } from "../../services/gapApi";
import { masterDataApi } from "../../services/masterDataApi";
import type {
  Capa,
  CapaPriority,
  CapaStatus,
  CompanyUser,
  CreateCapaInput,
  Department,
  Gap,
  UpdateCapaInput,
} from "../../types/api";

const priorities: CapaPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const editableStatuses: Array<Exclude<CapaStatus, "CLOSED">> = [
  "OPEN",
  "IN_PROGRESS",
  "PENDING_VERIFICATION",
  "CANCELLED",
];
const optional = (value: string) => value.trim() || null;

export function CapaFormModal({ capa, initialGapId, onClose, onSaved }: { capa?: Capa; initialGapId?: string; onClose: () => void; onSaved: (capa: Capa) => void }) {
  const [title, setTitle] = useState(capa?.title ?? "");
  const [description, setDescription] = useState(capa?.description ?? "");
  const [priority, setPriority] = useState<CapaPriority>(capa?.priority ?? "MEDIUM");
  const [status, setStatus] = useState<Exclude<CapaStatus, "CLOSED">>(capa?.status === "IN_PROGRESS" || capa?.status === "PENDING_VERIFICATION" || capa?.status === "CANCELLED" ? capa.status : "OPEN");
  const [gapId, setGapId] = useState(capa?.gap?.id ?? initialGapId ?? "");
  const [source, setSource] = useState(capa?.source ?? "");
  const [sourceRef, setSourceRef] = useState(capa?.sourceRef ?? "");
  const [rootCause, setRootCause] = useState(capa?.rootCause ?? "");
  const [correctiveAction, setCorrectiveAction] = useState(capa?.correctiveAction ?? "");
  const [preventiveAction, setPreventiveAction] = useState(capa?.preventiveAction ?? "");
  const [ownerId, setOwnerId] = useState(capa?.owner?.id ?? "");
  const [departmentId, setDepartmentId] = useState(capa?.department?.id ?? "");
  const [raisedOn, setRaisedOn] = useState(capa?.raisedOn ?? "");
  const [dueDate, setDueDate] = useState(capa?.dueDate ?? "");
  const [completion, setCompletion] = useState(capa?.completionPercentage ?? 0);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.allSettled([gapApi.list({ pageSize: 100 }), masterDataApi.listUsers(), masterDataApi.listDepartments()]).then(([gapResult, userResult, departmentResult]) => {
      if (!active) return;
      if (gapResult.status === "fulfilled") setGaps(gapResult.value.data);
      if (userResult.status === "fulfilled") setUsers(userResult.value);
      if (departmentResult.status === "fulfilled") setDepartments(departmentResult.value);
    });
    return () => { active = false; };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const common = {
        title: title.trim(),
        description: optional(description),
        gapId: gapId || null,
        priority,
        source: optional(source),
        sourceRef: optional(sourceRef),
        rootCause: optional(rootCause),
        correctiveAction: optional(correctiveAction),
        preventiveAction: optional(preventiveAction),
        departmentId: departmentId || null,
        raisedOn: raisedOn || null,
        dueDate: dueDate || null,
        completionPercentage: completion,
      };
      if (capa) {
        onSaved(await capaApi.update(capa.id, { ...common, status } satisfies UpdateCapaInput));
      } else {
        onSaved(await capaApi.create({ ...common, ownerId: ownerId || null } satisfies CreateCapaInput));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the CAPA.");
    } finally {
      setSaving(false);
    }
  };

  const linkedGapOptions = capa?.gap && !gaps.some((gap) => gap.id === capa.gap?.id)
    ? [{ ...capa.gap, description: null, source: null, clauseRef: null, recommendedAction: null, owner: null, sourceOwnerRef: null, department: null, framework: null, frameworkRule: null, control: null, checkpoint: null, identifiedOn: null, dueDate: null, overdue: false, closedAt: null, closureNote: null, needsReview: false, reviewReason: null, capas: [], evidence: [], createdAt: "", updatedAt: "" } as Gap, ...gaps]
    : gaps;

  return (
    <Modal title={capa ? `Edit ${capa.code}` : "Create CAPA"} onClose={onClose} wide footer={<><button className="btn btn-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" type="submit" form="capa-form" disabled={saving || !title.trim()}>{saving ? "Saving…" : capa ? "Save changes" : "Create CAPA"}</button></>}>
      <form id="capa-form" onSubmit={submit}>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
        <div className="form-grid">
          <label className="field field-span"><span>Title</span><input className="control" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} required autoFocus /></label>
          <label className="field"><span>Priority</span><select className="control" value={priority} onChange={(event) => setPriority(event.target.value as CapaPriority)}>{priorities.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          {capa ? <label className="field"><span>Status</span><select className="control" value={status} onChange={(event) => setStatus(event.target.value as Exclude<CapaStatus, "CLOSED">)}>{editableStatuses.map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}</select></label> : null}
          <label className="field field-span"><span>Description</span><textarea className="control" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={5000} /></label>
          <label className="field"><span>Linked Gap</span><select className="control" value={gapId} onChange={(event) => setGapId(event.target.value)}><option value="">No linked Gap</option>{linkedGapOptions.map((gap) => <option key={gap.id} value={gap.id}>{gap.code} · {gap.title}</option>)}</select></label>
          <label className="field"><span>Owner</span><select className="control" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} disabled={Boolean(capa)}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.code})</option>)}</select>{capa ? <small>Use Assign owner on the detail page.</small> : null}</label>
          <label className="field"><span>Department</span><select className="control" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">No department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <label className="field"><span>Progress percentage</span><input className="control" type="number" min={0} max={100} step={1} value={completion} onChange={(event) => setCompletion(Number(event.target.value))} /></label>
          <label className="field"><span>Raised on</span><input className="control" type="date" value={raisedOn} onChange={(event) => setRaisedOn(event.target.value)} /></label>
          <label className="field"><span>Due date</span><input className="control" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label className="field"><span>Source</span><input className="control" value={source} onChange={(event) => setSource(event.target.value)} maxLength={200} /></label>
          <label className="field"><span>Source reference</span><input className="control" value={sourceRef} onChange={(event) => setSourceRef(event.target.value)} maxLength={200} /></label>
          <label className="field field-span"><span>Root cause</span><textarea className="control" value={rootCause} onChange={(event) => setRootCause(event.target.value)} rows={3} maxLength={5000} /></label>
          <label className="field field-span"><span>Corrective action</span><textarea className="control" value={correctiveAction} onChange={(event) => setCorrectiveAction(event.target.value)} rows={3} maxLength={5000} /></label>
          <label className="field field-span"><span>Preventive action</span><textarea className="control" value={preventiveAction} onChange={(event) => setPreventiveAction(event.target.value)} rows={3} maxLength={5000} /></label>
        </div>
      </form>
    </Modal>
  );
}
