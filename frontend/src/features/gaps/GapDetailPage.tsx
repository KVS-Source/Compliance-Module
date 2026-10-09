import {
  ArrowLeft,
  CheckCircle2,
  Link as LinkIcon,
  Pencil,
  RefreshCw,
  UserRound,
  Wrench,
} from "lucide-react";
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
import { gapApi } from "../../services/gapApi";
import { masterDataApi } from "../../services/masterDataApi";
import type { CompanyUser, Gap } from "../../types/api";
import { GapFormModal } from "./GapFormModal";
import { RecordCommentsPanel } from "../comments/RecordCommentsPanel";

const display = (value: string | null | undefined) => value?.trim() || "Not provided";
const named = (value: { code: string; name?: string; title?: string } | null) =>
  value ? `${value.name ?? value.title ?? value.code} (${value.code})` : "Not linked";

const closureConflict = (error: unknown) => {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : "Unable to close this Gap.";
  if (error.code === "EVIDENCE_REQUIRED") {
    return "Closure requires linked, approved Evidence with an available physical file. Link and approve qualifying Evidence, then try again.";
  }
  if (error.code === "GAP_HAS_OPEN_CAPA") {
    return "This Gap still has an open CAPA. Complete or close every linked CAPA before closing the Gap.";
  }
  return error.message;
};

export function GapDetailPage() {
  const { gapId = "" } = useParams();
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);

  const resource = useApiResource(
    () => gapApi.get(gapId),
    [gapId, contextVersion, user?.activeCompany.id, version],
  );
  const gap = resource.data;

  if (resource.loading) return <div className="page"><LoadingState label="Loading Gap detail…" /></div>;
  if (resource.error || !gap) return <div className="page"><ErrorState error={resource.error ?? new Error("Gap not found")} /></div>;

  const reload = () => setVersion((value) => value + 1);
  return (
    <div className="page">
      <PageHeader
        title={gap.title}
        section="Gap Register"
        description={`${gap.code} · Company-scoped remediation record`}
        connected
        actions={
          <>
            <button className="btn btn-secondary" type="button" onClick={() => navigate("/compliance/gaps")}><ArrowLeft size={15} /> Register</button>
            <button className="btn btn-secondary" type="button" onClick={reload}><RefreshCw size={15} /> Refresh</button>
            {hasPermission("gaps:write") && gap.status !== "CLOSED" ? <button className="btn btn-secondary" type="button" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</button> : null}
          </>
        }
      />

      <section className="deadline-summary-strip" aria-label="Gap summary">
        <div><span>Status</span><Badge>{gap.status.replaceAll("_", " ")}</Badge></div>
        <div><span>Severity</span><Badge>{gap.severity}</Badge></div>
        <div><span>Owner</span><strong>{gap.owner?.name ?? gap.sourceOwnerRef ?? "Unassigned"}</strong></div>
        <div><span>Due date</span><strong className={gap.overdue ? "deadline-overdue" : ""}>{gap.dueDate ?? "Not set"}{gap.overdue ? " · Overdue" : ""}</strong></div>
      </section>

      {gap.needsReview ? <section className="card deadline-notice" role="status"><strong>Review required</strong><p>{gap.reviewReason ?? "This imported record needs human review."}</p></section> : null}

      <div className="detail-grid" id="page-content">
        <section className="card"><header className="card-head"><div><h2>Gap details</h2><p>Identification and remediation context</p></div></header><div className="card-pad"><dl className="detail-list"><div><dt>Description</dt><dd>{display(gap.description)}</dd></div><div><dt>Source</dt><dd>{display(gap.source)}</dd></div><div><dt>Clause</dt><dd>{display(gap.clauseRef)}</dd></div><div><dt>Recommended action</dt><dd>{display(gap.recommendedAction)}</dd></div><div><dt>Department</dt><dd>{named(gap.department)}</dd></div><div><dt>Identified on</dt><dd>{gap.identifiedOn ?? "Not provided"}</dd></div><div><dt>Closed at</dt><dd>{gap.closedAt ? new Date(gap.closedAt).toLocaleString() : "Not closed"}</dd></div><div><dt>Closure note</dt><dd>{display(gap.closureNote)}</dd></div></dl></div></section>
        <section className="card"><header className="card-head"><div><h2>Source context</h2></div></header><div className="card-pad"><dl className="detail-list"><div><dt>Framework</dt><dd>{named(gap.framework)}</dd></div><div><dt>Rule</dt><dd>{named(gap.frameworkRule)}</dd></div><div><dt>Control</dt><dd>{named(gap.control)}</dd></div><div><dt>Checkpoint</dt><dd>{named(gap.checkpoint)}</dd></div><div><dt>Created</dt><dd>{new Date(gap.createdAt).toLocaleString()}</dd></div><div><dt>Last updated</dt><dd>{new Date(gap.updatedAt).toLocaleString()}</dd></div></dl></div></section>
      </div>

      <section className="card deadline-section"><header className="card-head"><div><h2>Linked CAPAs</h2><p>Open CAPAs must be resolved before Gap closure.</p></div>{hasPermission("capa:write") && gap.status !== "CLOSED" ? <Link className="btn btn-primary" to={`/compliance/capa?gapId=${encodeURIComponent(gap.id)}`}><Wrench size={15} /> Create linked CAPA</Link> : null}</header><div className="card-pad">{gap.capas.length ? <div className="deadline-link-list">{gap.capas.map((capa) => <Link key={capa.id} to={`/compliance/capa/${capa.id}`}><span><strong>{capa.title}</strong><small className="mono">{capa.code} · {capa.completionPercentage}% complete</small></span><Badge>{capa.status.replaceAll("_", " ")}</Badge></Link>)}</div> : <p className="muted">No CAPA is linked to this Gap.</p>}</div></section>

      <section className="card deadline-section"><header className="card-head"><div><h2>Closure Evidence</h2><p>Approved evidence with an uploaded file is required for closure.</p></div><Link className="btn btn-secondary" to="/evidence"><LinkIcon size={15} /> Evidence library</Link></header><div className="card-pad">{gap.evidence.length ? <div className="deadline-link-list">{gap.evidence.map((evidence) => <Link key={evidence.linkId} to={`/evidence/${evidence.id}`}><span><strong>{evidence.title}</strong><small className="mono">{evidence.code} · {evidence.file.available ? "File available" : "Metadata only"}</small></span><Badge>{evidence.lifecycleStatus}</Badge></Link>)}</div> : <p className="muted">No closure evidence linked.</p>}</div></section>

      <section className="card deadline-actions"><div><h2>Workflow actions</h2></div><div className="button-row">{hasPermission("gaps:write") && gap.status !== "CLOSED" ? <button className="btn btn-secondary" type="button" onClick={() => setOwnerOpen(true)}><UserRound size={15} /> Assign owner</button> : null}{hasPermission("gaps:close") && gap.status !== "CLOSED" ? <button className="btn btn-primary" type="button" onClick={() => setClosing(true)}><CheckCircle2 size={15} /> Close Gap</button> : null}{hasPermission("gaps:close") && gap.status === "CLOSED" ? <button className="btn btn-secondary" type="button" onClick={() => setReopening(true)}><RefreshCw size={15} /> Reopen Gap</button> : null}</div></section>

      <RecordCommentsPanel entityType="GAP" entityId={gap.id} recordCode={gap.code} />

      {editing ? <GapFormModal gap={gap} onClose={() => setEditing(false)} onSaved={(saved) => { setEditing(false); reload(); showToast("success", "Gap updated", `${saved.code} was updated.`); }} /> : null}
      {ownerOpen ? <OwnerModal gap={gap} onClose={() => setOwnerOpen(false)} onSaved={() => { setOwnerOpen(false); reload(); showToast("success", "Owner updated", "The Gap owner was updated."); }} /> : null}
      {closing ? <TransitionModal title={`Close ${gap.code}`} label="Closure note" actionLabel="Close Gap" help="At least 10 characters. The server will verify linked CAPAs and file-backed approved Evidence." onClose={() => setClosing(false)} onSubmit={(note) => gapApi.close(gap.id, note)} errorMessage={closureConflict} onSaved={() => { setClosing(false); reload(); showToast("success", "Gap closed", `${gap.code} is closed.`); }} /> : null}
      {reopening ? <TransitionModal title={`Reopen ${gap.code}`} label="Reason (optional)" actionLabel="Reopen Gap" required={false} onClose={() => setReopening(false)} onSubmit={(reason) => gapApi.reopen(gap.id, reason || null)} onSaved={() => { setReopening(false); reload(); showToast("success", "Gap reopened", `${gap.code} is open again.`); }} /> : null}
    </div>
  );
}

function OwnerModal({ gap, onClose, onSaved }: { gap: Gap; onClose: () => void; onSaved: () => void }) {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [ownerId, setOwnerId] = useState(gap.owner?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void masterDataApi.listUsers().then((value) => { if (active) setUsers(value); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load users."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const save = async () => { setSaving(true); setError(""); try { await gapApi.assignOwner(gap.id, ownerId || null); onSaved(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to assign owner."); } finally { setSaving(false); } };
  return <Modal title={`Assign owner · ${gap.code}`} onClose={onClose} footer={<><button className="btn btn-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" type="button" onClick={() => void save()} disabled={saving || loading}>{saving ? "Saving…" : "Save owner"}</button></>}><label className="field"><span>Owner</span><select className="control" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} disabled={loading}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.code})</option>)}</select></label>{error ? <div className="form-error" role="alert">{error}</div> : null}</Modal>;
}

function TransitionModal({ title, label, actionLabel, help, required = true, onClose, onSubmit, onSaved, errorMessage }: { title: string; label: string; actionLabel: string; help?: string; required?: boolean; onClose: () => void; onSubmit: (note: string) => Promise<Gap>; onSaved: () => void; errorMessage?: (error: unknown) => string }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(""); try { await onSubmit(note.trim()); onSaved(); } catch (reason) { setError(errorMessage ? errorMessage(reason) : reason instanceof Error ? reason.message : "Unable to complete this action."); } finally { setSaving(false); } };
  return <Modal title={title} onClose={onClose} footer={<><button className="btn btn-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" type="submit" form="gap-transition-form" disabled={saving || (required && !note.trim())}>{saving ? "Working…" : actionLabel}</button></>}><form id="gap-transition-form" onSubmit={submit}>{error ? <div className="form-error" role="alert">{error}</div> : null}<label className="field"><span>{label}</span><textarea className="control" rows={4} maxLength={5000} value={note} onChange={(event) => setNote(event.target.value)} required={required} autoFocus />{help ? <small>{help}</small> : null}</label></form></Modal>;
}
