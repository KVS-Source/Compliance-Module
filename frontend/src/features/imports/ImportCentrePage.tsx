import { FileSpreadsheet, Link2, RefreshCw, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { ApiError } from "../../services/apiClient";
import {
  importApi,
  type CsvTemplateMeta,
  type ImportCommitResponse,
  type ImportPreviewResponse,
} from "../../services/importApi";
import { getAccessToken } from "../../services/apiClient";

type Mode = "XLSX" | "CSV";

/**
 * CSV import types offered as one-click shortcuts. Every entry must be an
 * approved template the API already serves; a shortcut for a type the backend
 * does not accept would be a dead button.
 */
const SHORTCUT_CSV_TYPES = [
  "KPI_ACTUALS",
  "GAPS",
  "CAPAS",
  "TRAINING_RECORDS",
  "INCIDENTS",
  "VENDOR_COMPLIANCE",
  "ACTION_ITEMS",
] as const;

const CSV_SHORTCUT_LABEL: Record<string, string> = {
  KPI_ACTUALS: "KPI Actuals CSV",
  GAPS: "Gaps CSV",
  CAPAS: "CAPAs CSV",
  TRAINING_RECORDS: "Training Records CSV",
  INCIDENTS: "Incidents CSV",
  VENDOR_COMPLIANCE: "Vendor Compliance CSV",
  ACTION_ITEMS: "Action Items CSV",
};
type Phase =
  | "empty"
  | "uploading"
  | "validating"
  | "preview"
  | "committing"
  | "complete"
  | "partial"
  | "failed"
  | "duplicate";

export function ImportCentrePage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const canWrite = hasPermission("imports:write");

  const [mode, setMode] = useState<Mode>("XLSX");
  const [csvType, setCsvType] = useState("");
  const [templates, setTemplates] = useState<CsvTemplateMeta[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("empty");
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [commit, setCommit] = useState<ImportCommitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode("XLSX");
    setCsvType("");
    setFile(null);
    setPhase("empty");
    setPreview(null);
    setCommit(null);
    setError(null);
  }, [contextVersion, user?.activeCompany.id]);

  useEffect(() => {
    let cancelled = false;
    void importApi
      .listCsvTemplates()
      .then((data) => {
        if (!cancelled) {
          setTemplates(data);
          setTemplatesError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setTemplatesError(
            err instanceof Error ? err.message : "Failed to load CSV templates",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [contextVersion, user?.activeCompany.id]);

  /**
   * Preselects the format and CSV type on the form below. Any file already
   * chosen and any preview already produced are discarded, so a shortcut can
   * never leave a preview from one import type paired with another.
   */
  const selectShortcut = (nextMode: Mode, nextCsvType = "") => {
    if (busy) return;
    setMode(nextMode);
    setCsvType(nextCsvType);
    setFile(null);
    setPreview(null);
    setCommit(null);
    setError(null);
    setPhase("empty");
  };

  const runPreview = async () => {
    if (!file || !canWrite || busy) return;
    if (mode === "CSV" && !csvType) {
      setError("Choose an approved CSV import type before uploading.");
      return;
    }
    setBusy(true);
    setError(null);
    setCommit(null);
    setPhase("uploading");
    try {
      setPhase("validating");
      const result =
        mode === "XLSX"
          ? await importApi.previewWorkbook(file)
          : await importApi.previewCsv(file, csvType);
      setPreview(result);
      if (result.alreadyImported) setPhase("duplicate");
      else setPhase("preview");
    } catch (err) {
      setPhase("failed");
      setError(err instanceof ApiError ? err.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async () => {
    if (!preview || !canWrite || busy || phase === "duplicate") return;
    setBusy(true);
    setPhase("committing");
    setError(null);
    try {
      const result = await importApi.commit(preview.importId);
      setCommit(result);
      if (result.alreadyImported) setPhase("duplicate");
      else if (result.status === "PARTIAL") setPhase("partial");
      else if (result.status === "FAILED") setPhase("failed");
      else setPhase("complete");
      showToast(
        result.alreadyImported ? "info" : "success",
        result.alreadyImported ? "Already imported" : "Import committed",
        result.alreadyImported
          ? "This file checksum was already committed for the active Company."
          : `${result.counts.created} created · ${result.counts.updated} updated`,
      );
    } catch (err) {
      setPhase("failed");
      setError(err instanceof ApiError ? err.message : "Commit failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    if (!csvType) return;
    const token = getAccessToken();
    const response = await fetch(importApi.templateUrl(csvType), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "same-origin",
    });
    if (!response.ok) {
      showToast("error", "Template download failed", "Could not download the approved CSV template.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `genbioca-${csvType.toLowerCase()}-template.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const totals = preview?.preview.totals;
  const batchId = commit?.batchId ?? preview?.importId;

  return (
    <div className="page">
      <PageHeader
        title="Data Import"
        section="Data Management"
        description="Upload an approved XLSX workbook or typed CSV template, review the preview, then commit into the active Company."
        connected
        actions={
          <Link className="btn btn-secondary" to="/data/import-history">
            <Link2 size={15} /> Import History
          </Link>
        }
      />

      {!canWrite ? (
        <section className="card empty-state" id="page-content">
          <Upload size={28} />
          <h3>Import write permission required</h3>
          <p>
            Your role can review Import History but cannot upload or commit
            imports for {user?.activeCompany.name ?? "this Company"}.
          </p>
        </section>
      ) : (
        <>
          {/* Shortcuts only preselect the format and type on the form below.
              They reuse the same preview/commit pipeline — there is no second
              upload path, so validation and checksums cannot diverge. */}
          <section className="card" data-testid="import-shortcuts">
            <header className="card-head">
              <div>
                <h2>Import shortcuts</h2>
              </div>
            </header>
            <div className="report-grid">
              <button
                className={`report-tile import-shortcut ${mode === "XLSX" ? "is-selected" : ""}`}
                type="button"
                disabled={busy}
                data-testid="import-shortcut-XLSX"
                onClick={() => selectShortcut("XLSX")}
              >
                <span className="feature-icon tone-blue">
                  <FileSpreadsheet size={18} />
                </span>
                <strong>Full XLSX Workbook</strong>
                <span>
                  The complete approved workbook. Every sheet is validated and
                  checksummed before anything is committed.
                </span>
              </button>
              {SHORTCUT_CSV_TYPES.map((type) => {
                const template = templates.find(
                  (candidate) => candidate.type === type,
                );
                return (
                  <button
                    className={`report-tile import-shortcut ${mode === "CSV" && csvType === type ? "is-selected" : ""}`}
                    type="button"
                    key={type}
                    disabled={busy || !template}
                    data-testid={`import-shortcut-${type}`}
                    onClick={() => selectShortcut("CSV", type)}
                  >
                    <span className="feature-icon tone-blue">
                      <Upload size={18} />
                    </span>
                    <strong>{template?.label ?? CSV_SHORTCUT_LABEL[type]}</strong>
                    <span>
                      {template
                        ? `${template.headers.length} approved columns · CSV`
                        : "This import type is not available on this deployment."}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card card-pad" data-testid="import-centre-form">
            <div className="filter-bar deadline-filter-bar">
              <label className="toolbar-select">
                <span className="sr-only">Import format</span>
                <select
                  className="control"
                  value={mode}
                  onChange={(event) => {
                    setMode(event.target.value as Mode);
                    setPreview(null);
                    setCommit(null);
                    setPhase("empty");
                  }}
                  disabled={busy}
                >
                  <option value="XLSX">XLSX workbook</option>
                  <option value="CSV">CSV template</option>
                </select>
              </label>
              {mode === "CSV" ? (
                <>
                  <label className="toolbar-select">
                    <span className="sr-only">CSV import type</span>
                    <select
                      className="control"
                      value={csvType}
                      onChange={(event) => setCsvType(event.target.value)}
                      disabled={busy}
                    >
                      <option value="">Select import type…</option>
                      {templates.map((template) => (
                        <option key={template.type} value={template.type}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={!csvType || busy}
                    onClick={() => void downloadTemplate()}
                  >
                    <FileSpreadsheet size={15} /> Download template
                  </button>
                </>
              ) : null}
              <label className="filter-search">
                <span className="sr-only">Choose file</span>
                <input
                  className="control"
                  type="file"
                  accept={mode === "XLSX" ? ".xlsx" : ".csv,text/csv"}
                  disabled={busy}
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setPreview(null);
                    setCommit(null);
                    setPhase(event.target.files?.[0] ? "empty" : "empty");
                  }}
                />
              </label>
              <button
                className="btn btn-primary"
                type="button"
                disabled={!file || busy || (mode === "CSV" && !csvType)}
                onClick={() => void runPreview()}
              >
                <Upload size={15} /> Upload for preview
              </button>
            </div>
            {templatesError ? <p className="form-error">{templatesError}</p> : null}
            {error ? <p className="form-error">{error}</p> : null}
            <p className="muted">
              Status: <Badge>{phase}</Badge>
              {file ? ` · ${file.name}` : ""}
            </p>
          </section>

          {phase === "uploading" || phase === "validating" ? (
            <LoadingState label="Validating import…" />
          ) : null}

          {preview ? (
            <section className="card table-card" data-testid="import-preview">
              <div className="card-pad">
                <h2>Preview</h2>
                <p>
                  {preview.preview.workbook.filename} · checksum{" "}
                  <span className="mono">
                    {preview.preview.workbook.checksum.slice(0, 12)}…
                  </span>
                </p>
                <p>
                  Source rows {totals?.totalRows ?? 0} · Valid{" "}
                  {totals?.validRows ?? 0} · Invalid {totals?.errorRows ?? 0} ·
                  Flagged {totals?.flaggedRows ?? 0}
                </p>
                {preview.alreadyImported || phase === "duplicate" ? (
                  <p role="status">
                    This file was already imported for the active Company.
                    Commit will return the recorded result without rewriting.
                  </p>
                ) : null}
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Sheet / type</th>
                      <th>Rows</th>
                      <th>Valid</th>
                      <th>Invalid</th>
                      <th>Flagged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.sheets
                      .filter((sheet) => sheet.present && sheet.totalRows > 0)
                      .map((sheet) => (
                        <tr key={sheet.key}>
                          <td>{sheet.sheetName}</td>
                          <td>{sheet.totalRows}</td>
                          <td>{sheet.validRows}</td>
                          <td>{sheet.errorRows}</td>
                          <td>{sheet.flaggedRows}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {preview.preview.issues.length > 0 ? (
                <div className="card-pad" data-testid="import-row-errors">
                  <h3>Row errors</h3>
                  <ul>
                    {preview.preview.issues.slice(0, 50).map((issue, index) => (
                      <li key={`${issue.sheet}-${issue.rowNumber}-${index}`}>
                        {issue.sheet} row {issue.rowNumber}
                        {issue.businessKey ? ` (${issue.businessKey})` : ""}:{" "}
                        {issue.field} — {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="card-pad">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={
                    busy ||
                    phase === "committing" ||
                    phase === "complete" ||
                    phase === "partial"
                  }
                  onClick={() => void runCommit()}
                >
                  {busy && phase === "committing" ? (
                    <RefreshCw className="spin" size={15} />
                  ) : (
                    <Upload size={15} />
                  )}{" "}
                  Commit import
                </button>
                {batchId ? (
                  <Link
                    className="btn btn-secondary"
                    to={`/data/import-history/${batchId}`}
                    style={{ marginLeft: 8 }}
                  >
                    Open batch
                  </Link>
                ) : null}
              </div>
              {commit ? (
                <div className="card-pad" data-testid="import-commit-result">
                  <p>
                    Commit {commit.status}
                    {commit.alreadyImported ? " · already imported" : ""}:{" "}
                    {commit.counts.created} created · {commit.counts.updated}{" "}
                    updated · {commit.counts.skipped} skipped ·{" "}
                    {commit.counts.errors} invalid
                  </p>
                </div>
              ) : null}
            </section>
          ) : phase === "failed" && error ? (
            <ErrorState error={{ message: error, status: 400, code: "IMPORT_FAILED", name: "ApiError" } as ApiError} />
          ) : null}
        </>
      )}
    </div>
  );
}
