import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { importApi } from "../../services/importApi";

const validationText = (value: unknown) => {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "Validation failed";
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return "Validation failed";
    const record = item as Record<string, unknown>;
    return `${typeof record.field === "string" ? `${record.field}: ` : ""}${String(record.message ?? "Validation failed")}`;
  }).join("; ");
};

export function ImportDetailPage() {
  const { importId = "" } = useParams(); const { user } = useAuth(); const { contextVersion } = useTenant(); const navigate = useNavigate();
  const [version, setVersion] = useState(0); const [errorPage, setErrorPage] = useState(1); const [sheet, setSheet] = useState("");
  useEffect(() => { setErrorPage(1); setSheet(""); }, [importId, contextVersion, user?.activeCompany.id]);
  const batchResource = useApiResource(() => importApi.get(importId), [importId, version, contextVersion, user?.activeCompany.id]);
  const errorsResource = useApiResource(() => importApi.errors(importId, errorPage, 50, sheet || undefined), [importId, errorPage, sheet, version, contextVersion, user?.activeCompany.id]);
  const batch = batchResource.data;
  const outcomes = useMemo(() => new Map((batch?.report?.perSheetOutcomes ?? []).map((outcome) => [outcome.sheet, outcome])), [batch]);
  if (batchResource.loading) return <div className="page"><LoadingState label="Loading import report…" /></div>;
  if (batchResource.error || !batch) return <div className="page"><ErrorState error={batchResource.error ?? new Error("Import batch not found")} /></div>;
  const sheets = batch.report?.sheets ?? []; const errors = errorsResource.data?.data ?? []; const errorMeta = errorsResource.data?.meta;
  return <div className="page"><PageHeader title={batch.originalFilename} section="Import History" description={`Batch ${batch.id} · ${user?.activeCompany.name ?? "Active Company"}`} connected actions={<><button className="btn btn-secondary" type="button" onClick={() => navigate("/data/import-history")}><ArrowLeft size={15} /> History</button><button className="btn btn-secondary" type="button" onClick={() => setVersion((value) => value + 1)}><RefreshCw size={15} /> Refresh</button></>} />
    <section className="deadline-summary-strip" aria-label="Import totals"><div><span>Status</span><Badge>{batch.status}</Badge></div><div><span>Created</span><strong>{batch.createdCount}</strong></div><div><span>Updated / skipped</span><strong>{batch.updatedCount} / {batch.skippedCount}</strong></div><div><span>Row errors</span><strong className={batch.errorCount ? "deadline-overdue" : ""}>{batch.errorCount}</strong></div></section>
    <section className="card"><header className="card-head"><div><h2>Batch details</h2></div>{batch.report?.alreadyImported ? <Badge>IDENTICAL RERUN</Badge> : null}</header><div className="card-pad"><dl className="detail-list"><div><dt>Actor</dt><dd>{batch.uploadedBy.fullName} ({batch.uploadedBy.code})</dd></div><div><dt>Started</dt><dd>{new Date(batch.startedAt).toLocaleString()}</dd></div><div><dt>Completed</dt><dd>{batch.completedAt ? new Date(batch.completedAt).toLocaleString() : "In progress"}</dd></div><div><dt>Checksum</dt><dd className="mono deadline-break">{batch.fileChecksum}</dd></div><div><dt>Sheets</dt><dd>{batch.report?.workbook?.sheetCount ?? "Not recorded"}</dd></div></dl></div></section>
    <section className="card table-card deadline-section"><header className="card-head"><div><h2>Sheet results</h2></div></header>{sheets.length ? <div className="table-wrap"><table className="data-table" data-testid="import-sheet-results"><thead><tr><th>Sheet</th><th>Target</th><th>Total</th><th>Valid</th><th>Warnings</th><th>Errors</th><th>Created</th><th>Updated</th><th>Unchanged</th><th>Skipped</th></tr></thead><tbody>{sheets.map((item) => { const outcome = outcomes.get(item.sheetName); return <tr key={item.key}><td><strong>{item.sheetName}</strong></td><td><Badge>{item.target}</Badge></td><td>{item.totalRows}</td><td>{item.validRows}</td><td>{item.flaggedRows}</td><td>{item.errorRows}</td><td>{outcome?.created ?? 0}</td><td>{outcome?.updated ?? 0}</td><td>{outcome?.unchanged ?? 0}</td><td>{outcome?.skipped ?? 0}</td></tr>; })}</tbody></table></div> : <div className="card-pad"><p className="muted">This legacy batch has no sheet-level report payload.</p></div>}</section>
    <section className="card table-card deadline-section"><header className="card-head"><div><h2>Row-level errors</h2></div><label className="toolbar-select"><span className="sr-only">Filter errors by sheet</span><select className="control" aria-label="Filter errors by sheet" value={sheet} onChange={(event) => { setSheet(event.target.value); setErrorPage(1); }}><option value="">All sheets</option>{sheets.filter((item) => item.present).map((item) => <option key={item.key} value={item.sheetName}>{item.sheetName}</option>)}</select></label></header>{errorsResource.loading ? <LoadingState label="Loading row errors…" /> : errorsResource.error ? <ErrorState error={errorsResource.error} /> : errors.length ? <><div className="table-wrap"><table className="data-table" data-testid="import-row-errors"><thead><tr><th>Sheet</th><th>Row</th><th>Business key</th><th>Validation error</th></tr></thead><tbody>{errors.map((item) => <tr key={item.id}><td>{item.sheet}</td><td>{item.rowNumber}</td><td className="mono">{item.businessKey ?? "—"}</td><td>{validationText(item.validationErrors)}</td></tr>)}</tbody></table></div><div className="table-foot"><span>{errorMeta?.total ?? errors.length} errors</span><div className="pagination"><button className="page-btn" type="button" aria-label="Previous error page" disabled={errorPage <= 1} onClick={() => setErrorPage(errorPage - 1)}><ChevronLeft size={15} /></button><span>Page {errorPage} of {Math.max(1, errorMeta?.totalPages ?? 1)}</span><button className="page-btn" type="button" aria-label="Next error page" disabled={errorPage >= (errorMeta?.totalPages ?? 1)} onClick={() => setErrorPage(errorPage + 1)}><ChevronRight size={15} /></button></div></div></> : <div className="card-pad"><p className="muted">No failed rows were returned for this batch.</p></div>}</section>
  </div>;
}
