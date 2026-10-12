import { ArrowLeft, CheckCircle2, Link as LinkIcon, Pencil, RefreshCw, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { Modal } from "../../components/feedback/Modal";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { ApiError } from "../../services/apiClient";
import { capaApi } from "../../services/capaApi";
import { masterDataApi } from "../../services/masterDataApi";
import type { Capa, CompanyUser } from "../../types/api";
import { CapaFormModal } from "./CapaFormModal";
import { RecordCommentsPanel } from "../comments/RecordCommentsPanel";

const display = (value: string | null | undefined) => value?.trim() || "Not provided";
const named = (value: { code: string; name?: string; title?: string } | null) => value ? `${value.name ?? value.title ?? value.code} (${value.code})` : "Not linked";
const closureMessage = (error: unknown) => error instanceof ApiError && error.code === "EVIDENCE_REQUIRED" ? "Closure requires linked, approved Evidence with an available physical file. Link and approve qualifying Evidence, then try again." : error instanceof Error ? error.message : "Unable to close this CAPA.";

export function CapaDetailPage() {
  const { capaId = "" } = useParams();
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const resource = useApiResource(() => capaApi.get(capaId), [capaId, contextVersion, user?.activeCompany.id, version]);
  const capa = resource.data;
  if (resource.loading) return <div className="page"><LoadingState label="Loading CAPA detail…" /></div>;
  if (resource.error || !capa) return <div className="page"><ErrorState error={resource.error ?? new Error("CAPA not found")} /></div>;
  const reload = () => setVersion((value) => value + 1);

  return (
    <div className="page">
      <PageHeader title={capa.title} section="CAPA Register" description={`${capa.code} · Corrective and preventive action`} showDescription connected actions={<><button className="btn btn-secondary" type="button" onClick={() => navigate("/compliance/capa")}><ArrowLeft size={15} /> Register</button><button className="btn btn-secondary" type="button" onClick={reload}><RefreshCw size={15} /> Refresh</button>{hasPermission("capa:write") && capa.status !== "CLOSED" ? <button className="btn btn-secondary" type="button" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</button> : null}</>} />
      <section className="deadline-summary-strip" aria-label="CAPA summary"><div><span>Status</span><Badge>{capa.status.replaceAll("_", " ")}</Badge></div><div><span>Priority</span><Badge>{capa.priority}</Badge></div><div><span>Progress</span><strong>{capa.completionPercentage}%</strong></div><div><span>Due date</span><strong className={capa.overdue ? "deadline-overdue" : ""}>{capa.dueDate ?? "Not set"}{capa.overdue ? " · Overdue" : ""}</strong></div></section>
      <div className="deadline-progress" aria-label={`${capa.completionPercentage}% complete`}><span style={{ width: `${capa.completionPercentage}%` }} /></div>
      {capa.needsReview ? <section className="card deadline-notice" role="status"><strong>Review required</strong><p>{capa.reviewReason ?? "This imported record needs human review."}</p></section> : null}
      <div className="detail-grid" id="page-content">
        <section className="card"><header className="card-head"><div><h2>Action plan</h2><p>Root cause and remediation activities</p></div></header><div className="card-pad"><dl className="detail-list"><div><dt>Description</dt><dd>{display(capa.description)}</dd></div><div><dt>Root cause</dt><dd>{display(capa.rootCause)}</dd></div><div><dt>Corrective action</dt><dd>{display(capa.correctiveAction)}</dd></div><div><dt>Preventive action</dt><dd>{display(capa.preventiveAction)}</dd></div><div><dt>Owner</dt><dd>{capa.owner?.name ?? capa.sourceOwnerRef ?? "Unassigned"}</dd></div><div><dt>Department</dt><dd>{named(capa.department)}</dd></div></dl></div></section>
        <section className="card"><header className="card-head"><div><h2>Context and dates</h2></div></header><div className="card-pad"><dl className="detail-list"><div><dt>Linked Gap</dt><dd>{capa.gap ? <Link to={`/compliance/gaps/${capa.gap.id}`}>{capa.gap.code} · {capa.gap.title}</Link> : "Not linked"}</dd></div><div><dt>Framework</dt><dd>{named(capa.framework)}</dd></div><div><dt>Source</dt><dd>{display(capa.source)}</dd></div><div><dt>Source reference</dt><dd>{display(capa.sourceRef)}</dd></div><div><dt>Raised on</dt><dd>{capa.raisedOn ?? "Not provided"}</dd></div><div><dt>Closed at</dt><dd>{capa.closedAt ? new Date(capa.closedAt).toLocaleString() : "Not closed"}</dd></div><div><dt>Closure note</dt><dd>{display(capa.closureNote)}</dd></div><div><dt>Last updated</dt><dd>{new Date(capa.updatedAt).toLocaleString()}</dd></div></dl></div></section>
      </div>
      <section className="card deadline-section"><header className="card-head"><div><h2>Closure Evidence</h2><p>Approved evidence with an uploaded file is required for closure.</p></div><Link className="btn btn-secondary" to="/evidence"><LinkIcon size={15} /> Evidence library</Link></header><div className="card-pad">{capa.evidence.length ? <div className="deadline-link-list">{capa.evidence.map((evidence) => <Link key={evidence.linkId} to={`/evidence/${evidence.id}`}><span><strong>{evidence.title}</strong><small className="mono">{evidence.code} · {evidence.file.available ? "File available" : "Metadata only"}</small></span><Badge>{evidence.lifecycleStatus}</Badge></Link>)}</div> : <p className="muted">No closure evidence linked.</p>}</div></section>
      <section className="card deadline-actions"><div><h2>Workflow actions</h2></div><div className="button-row">{hasPermission("capa:write") && capa.status !== "CLOSED" ? <button className="btn btn-secondary" type="button" onClick={() => setOwnerOpen(true)}><UserRound size={15} /> Assign owner</button> : null}{hasPermission("capa:close") && capa.status !== "CLOSED" ? <button className="btn btn-primary" type="button" onClick={() => setClosing(true)}><CheckCircle2 size={15} /> Close CAPA</button> : null}{hasPermission("capa:close") && capa.status === "CLOSED" ? <button className="btn btn-secondary" type="button" onClick={() => setReopening(true)}><RefreshCw size={15} /> Reopen CAPA</button> : null}</div></section>

      <RecordCommentsPanel entityType="CAPA" entityId={capa.id} recordCode={capa.code} />
      {editing ? <CapaFormModal capa={capa} onClose={() => setEditing(false)} onSaved={(saved) => { setEditing(false); reload(); showToast("success", "CAPA updated", `${saved.code} was updated.`); }} /> : null}
      {ownerOpen ? <OwnerModal capa={capa} onClose={() => setOwnerOpen(false)} onSaved={() => { setOwnerOpen(false); reload(); showToast("success", "Owner updated", "The CAPA owner was updated."); }} /> : null}
      {closing ? <TransitionModal title={`Close ${capa.code}`} label="Closure note" actionLabel="Close CAPA" help="At least 10 characters. The server will verify file-backed approved Evidence." onClose={() => setClosing(false)} onSubmit={(note) => capaApi.close(capa.id, note)} errorMessage={closureMessage} onSaved={() => { setClosing(false); reload(); showToast("success", "CAPA closed", `${capa.code} is closed at 100% completion.`); }} /> : null}
      {reopening ? <TransitionModal title={`Reopen ${capa.code}`} label="Reason (optional)" actionLabel="Reopen CAPA" required={false} onClose={() => setReopening(false)} onSubmit={(reason) => capaApi.reopen(capa.id, reason || null)} onSaved={() => { setReopening(false); reload(); showToast("success", "CAPA reopened", `${capa.code} is in progress again.`); }} /> : null}
    </div>
  );
}

function OwnerModal({ capa, onClose, onSaved }: { capa: Capa; onClose: () => void; onSaved: () => void }) {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [ownerId, setOwnerId] = useState(capa.owner?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void masterDataApi.listUsers().then((value) => { if (active) setUsers(value); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load users."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const save = async () => { setSaving(true); setError(""); try { await capaApi.assignOwner(capa.id, ownerId || null); onSaved(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to assign owner."); } finally { setSaving(false); } };
  return <Modal title={`Assign owner · ${capa.code}`} onClose={onClose} footer={<><button className="btn btn-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" type="button" onClick={() => void save()} disabled={saving || loading}>{saving ? "Saving…" : "Save owner"}</button></>}><label className="field"><span>Owner</span><select className="control" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} disabled={loading}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.code})</option>)}</select></label>{error ? <div className="form-error" role="alert">{error}</div> : null}</Modal>;
}

function TransitionModal({ title, label, actionLabel, help, required = true, onClose, onSubmit, onSaved, errorMessage }: { title: string; label: string; actionLabel: string; help?: string; required?: boolean; onClose: () => void; onSubmit: (note: string) => Promise<Capa>; onSaved: () => void; errorMessage?: (error: unknown) => string }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(""); try { await onSubmit(note.trim()); onSaved(); } catch (reason) { setError(errorMessage ? errorMessage(reason) : reason instanceof Error ? reason.message : "Unable to complete this action."); } finally { setSaving(false); } };
  return <Modal title={title} onClose={onClose} footer={<><button className="btn btn-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" type="submit" form="capa-transition-form" disabled={saving || (required && !note.trim())}>{saving ? "Working…" : actionLabel}</button></>}><form id="capa-transition-form" onSubmit={submit}>{error ? <div className="form-error" role="alert">{error}</div> : null}<label className="field"><span>{label}</span><textarea className="control" rows={4} maxLength={5000} value={note} onChange={(event) => setNote(event.target.value)} required={required} autoFocus />{help ? <small>{help}</small> : null}</label></form></Modal>;
}
