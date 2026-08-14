import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Upload,
  UserPlus,
} from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { Badge } from "../../components/feedback/Badge";
import { Modal } from "../../components/feedback/Modal";
import { ApiError } from "../../services/apiClient";
import { userImportApi } from "../../services/userImportApi";
import type {
  UserImportPreview,
  UserImportReport,
  UserImportTemplate,
} from "../../types/api";

interface UserImportModalProps {
  canAssignRole: boolean;
  onClose: () => void;
  onImported: (report: UserImportReport) => void;
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : fallback;

/**
 * Bulk user onboarding in three visible steps: take the approved template,
 * review what the API says about every row, then commit the rows it accepted.
 *
 * Nothing is created until commit, and the commit sends the rows the API
 * itself validated — the browser never decides that a role or a department is
 * acceptable. The initial password is typed here rather than carried in the
 * file, so credentials never travel in a spreadsheet.
 */
export function UserImportModal({
  canAssignRole,
  onClose,
  onImported,
}: UserImportModalProps) {
  const [template, setTemplate] = useState<UserImportTemplate | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<UserImportPreview | null>(null);
  const [report, setReport] = useState<UserImportReport | null>(null);
  const [initialPassword, setInitialPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void userImportApi
      .template()
      .then((value) => {
        if (active) setTemplate(value);
      })
      .catch(() => {
        if (active) setTemplate(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const downloadTemplate = async () => {
    setError(null);
    try {
      const result = await userImportApi.downloadTemplate();
      const objectUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = result.fileName;
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (caught) {
      setError(errorMessage(caught, "The template could not be downloaded."));
    }
  };

  const onFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file after a failed parse.
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setReport(null);
    setFileName(file.name);
    try {
      setPreview(await userImportApi.preview(await file.text()));
    } catch (caught) {
      setFileName("");
      setError(errorMessage(caught, "The file could not be read."));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    const candidates = (preview?.rows ?? [])
      .map((row) => row.candidate)
      .filter((candidate) => candidate !== null);
    if (candidates.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await userImportApi.commit(initialPassword, candidates);
      setReport(result);
      setInitialPassword("");
      onImported(result);
    } catch (caught) {
      setError(errorMessage(caught, "The import could not be committed."));
    } finally {
      setBusy(false);
    }
  };

  const validRows = preview?.validRows ?? 0;
  const canCommit =
    !busy && validRows > 0 && initialPassword.length >= 8 && report === null;

  return (
    <Modal
      title="Import users"
      wide
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            {report ? "Done" : "Cancel"}
          </button>
          {report ? null : (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void commit()}
              disabled={!canCommit}
              data-testid="user-import-commit"
            >
              <UserPlus size={15} />{" "}
              {busy
                ? "Importing…"
                : `Create ${validRows} user${validRows === 1 ? "" : "s"}`}
            </button>
          )}
        </>
      }
    >
      <div className="user-import" data-testid="user-import">
        {error ? (
          <div className="banner warning" role="alert">
            {error}
          </div>
        ) : null}

        <section className="user-import-step">
          <h3>1 · Start from the approved template</h3>
          <p>
            The header row must match exactly. Role accepts a profile code or
            the name shown on this screen; Department must already exist in this
            Company. Status defaults to ACTIVE.
          </p>
          <div className="user-import-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => void downloadTemplate()}
              disabled={busy}
            >
              <Download size={15} /> Download template
            </button>
            <label className="btn btn-secondary user-import-file">
              <Upload size={15} /> Choose CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void onFileChosen(event)}
                disabled={busy}
                data-testid="user-import-file"
              />
            </label>
            {fileName ? <span className="mono">{fileName}</span> : null}
          </div>
          {template ? (
            <p className="chart-source">
              Up to {template.maxRows} rows per import · columns:{" "}
              {template.headers.join(", ")}
            </p>
          ) : null}
          {/* Department matches by name against this Company only, so the
              exact spellings belong here. Otherwise a refused row sends the
              administrator off to another screen to find out what is valid. */}
          {template ? (
            <p className="chart-source" data-testid="user-import-departments">
              {template.departments.length > 0 ? (
                <>
                  Departments in this Company:{" "}
                  {template.departments.map((name, index) => (
                    <span key={name}>
                      {index > 0 ? ", " : ""}
                      <span className="mono">{name}</span>
                    </span>
                  ))}
                  . Any other name is refused rather than created.
                </>
              ) : (
                <>
                  This Company has no departments yet, so leave the Department
                  column empty. Departments are created on the Departments
                  screen.
                </>
              )}
            </p>
          ) : null}
          {canAssignRole ? null : (
            <p className="chart-source">
              Your role cannot assign roles, so the Role column must be left
              empty. Imported people can be given a role later from this screen.
            </p>
          )}
        </section>

        {preview ? (
          <section className="user-import-step">
            <h3>2 · Review what the platform accepted</h3>
            <p>
              {preview.validRows} of {preview.totalRows} row
              {preview.totalRows === 1 ? "" : "s"} can be created
              {preview.invalidRows > 0
                ? `; ${preview.invalidRows} will be skipped until the file is corrected.`
                : "."}{" "}
              Nothing has been created yet.
            </p>
            <div className="table-wrap">
              <table className="data-table" data-testid="user-import-preview">
                <caption>Import preview</caption>
                <thead>
                  {/* Four columns, not seven: the reason a row was refused is
                      the point of this step and must not be pushed off the
                      side of the dialog by one cell per source column. */}
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">User</th>
                    <th scope="col">Department, role and status</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr
                      key={row.line}
                      className={row.valid ? "" : "register-row-overdue"}
                      data-testid={`user-import-row-${row.line}`}
                    >
                      <th scope="row" className="mono">
                        {row.line}
                      </th>
                      <td>
                        <div className="cell-title">
                          <strong>
                            {row.candidate?.name || row.source?.name || "—"}
                          </strong>
                          <small>
                            {row.candidate?.email || row.source?.email || "—"} ·{" "}
                            {row.candidate?.code || row.source?.code || "—"}
                          </small>
                        </div>
                      </td>
                      <td>
                        <div className="cell-title">
                          <strong>
                            {row.candidate?.roleCode ||
                              row.source?.role ||
                              "No role"}
                          </strong>
                          <small>
                            {row.candidate?.departmentName ||
                              row.source?.department ||
                              "No department"}{" "}
                            ·{" "}
                            {row.candidate?.status ||
                              row.source?.status ||
                              "ACTIVE"}
                          </small>
                        </div>
                      </td>
                      <td>
                        {row.valid ? (
                          <Badge tone="green">Ready</Badge>
                        ) : (
                          <ul className="user-import-errors">
                            {row.errors.map((message) => (
                              <li key={`${row.line}:${message}`}>{message}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {preview && !report ? (
          <section className="user-import-step">
            <h3>3 · Set the initial password</h3>
            <div className="banner warning">
              <AlertTriangle size={17} />
              <span>
                Every person in this file receives this same initial password,
                so give it out privately and ask each of them to change it from
                Settings at first sign-in. The platform never sends it and never
                shows it again.
              </span>
            </div>
            <div className="field">
              <label htmlFor="user-import-password">Initial password</label>
              <input
                id="user-import-password"
                className="control"
                type="password"
                autoComplete="new-password"
                value={initialPassword}
                onChange={(event) => setInitialPassword(event.target.value)}
                disabled={busy}
                aria-describedby="user-import-password-hint"
              />
              <div className="error" id="user-import-password-hint">
                {initialPassword.length > 0 && initialPassword.length < 8
                  ? "Use at least 8 characters"
                  : ""}
              </div>
            </div>
          </section>
        ) : null}

        {report ? (
          <section className="user-import-step">
            <h3>Import complete</h3>
            <div
              className={`banner ${report.failed > 0 ? "warning" : "banner-success"}`}
            >
              {report.failed > 0 ? (
                <AlertTriangle size={17} />
              ) : (
                <CheckCircle2 size={17} />
              )}
              <span>
                {report.created} created · {report.failed} failed ·{" "}
                {report.rolesAssigned} role
                {report.rolesAssigned === 1 ? "" : "s"} assigned. Each account
                was created as its own audited record.
              </span>
            </div>
            {report.failed > 0 ? (
              <div className="table-wrap">
                <table className="data-table" data-testid="user-import-report">
                  <caption>Rows that were not created</caption>
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">User</th>
                      <th scope="col">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.results
                      .filter((result) => result.outcome === "FAILED")
                      .map((result) => (
                        <tr key={result.line}>
                          <th scope="row" className="mono">
                            {result.line}
                          </th>
                          <td>
                            {result.code} · {result.email}
                          </td>
                          <td>{result.errors?.join(" ") ?? "Refused"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
