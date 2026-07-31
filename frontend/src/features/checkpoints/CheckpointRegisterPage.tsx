import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Eye,
  Inbox,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { ApiError } from "../../services/apiClient";
import { checkpointApi } from "../../services/checkpointApi";
import { masterDataApi } from "../../services/masterDataApi";
import type {
  Checkpoint,
  CheckpointDetail,
  CheckpointLifecycleStatus,
  CheckpointOutcome,
  CheckpointVerificationFrequency,
  CompanyUser,
  Department,
} from "../../types/api";
import { CheckpointFormModal } from "./CheckpointFormModal";
import {
  CheckpointLifecycleDialog,
  type CheckpointLifecycleKind,
} from "./CheckpointLifecycleDialog";
import {
  OUTCOME_OPTIONS,
  VERIFICATION_FREQUENCY_OPTIONS,
  formatCheckpointDate,
  lifecycleTone,
  named,
  outcomeTone,
  statusLabel,
} from "./checkpointFormatting";

const PAGE_SIZE = 20;

type MasterState<T> =
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "forbidden" }
  | { status: "error"; message: string };

const loadMaster = async <T,>(
  loader: () => Promise<T[]>,
): Promise<MasterState<T>> => {
  try {
    return { status: "ready", items: await loader() };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { status: "forbidden" };
    }
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Supporting data could not be loaded.",
    };
  }
};

export function CheckpointRegisterPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const canWrite = hasPermission("checkpoints:write");

  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [lifecycleStatus, setLifecycleStatus] = useState<
    CheckpointLifecycleStatus | ""
  >("");
  const [verificationFrequency, setVerificationFrequency] = useState<
    CheckpointVerificationFrequency | ""
  >("");
  const [latestOutcome, setLatestOutcome] = useState<CheckpointOutcome | "">(
    "",
  );
  const [ownerId, setOwnerId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [evidenceRequired, setEvidenceRequired] = useState<
    "" | "true" | "false"
  >("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [page, setPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);

  const [users, setUsers] = useState<MasterState<CompanyUser>>({
    status: "loading",
  });
  const [departments, setDepartments] = useState<MasterState<Department>>({
    status: "loading",
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CheckpointDetail | null>(null);
  const [lifecycle, setLifecycle] = useState<{
    kind: CheckpointLifecycleKind;
    checkpoint: Checkpoint;
  } | null>(null);

  useEffect(() => {
    setDraftSearch("");
    setAppliedSearch("");
    setLifecycleStatus("");
    setVerificationFrequency("");
    setLatestOutcome("");
    setOwnerId("");
    setDepartmentId("");
    setEvidenceRequired("");
    setDueFrom("");
    setDueTo("");
    setPage(1);
    setCreating(false);
    setEditing(null);
    setLifecycle(null);
  }, [contextVersion, user?.activeCompany.id]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadMaster(() => masterDataApi.listUsers()),
      loadMaster(() => masterDataApi.listDepartments()),
    ]).then(([userState, departmentState]) => {
      if (!active) return;
      setUsers(userState);
      setDepartments(departmentState);
    });
    return () => {
      active = false;
    };
  }, [contextVersion, user?.activeCompany.id]);

  const resource = useApiResource(
    () =>
      checkpointApi.listCheckpoints({
        page,
        pageSize: PAGE_SIZE,
        q: appliedSearch || undefined,
        lifecycleStatus: lifecycleStatus || undefined,
        verificationFrequency: verificationFrequency || undefined,
        latestOutcome: latestOutcome || undefined,
        ownerId: ownerId || undefined,
        departmentId: departmentId || undefined,
        evidenceRequired:
          evidenceRequired === ""
            ? undefined
            : evidenceRequired === "true",
        dueFrom: dueFrom || undefined,
        dueTo: dueTo || undefined,
      }),
    [
      contextVersion,
      user?.activeCompany.id,
      page,
      appliedSearch,
      lifecycleStatus,
      verificationFrequency,
      latestOutcome,
      ownerId,
      departmentId,
      evidenceRequired,
      dueFrom,
      dueTo,
      listVersion,
    ],
  );

  const applySearch = () => {
    setPage(1);
    setAppliedSearch(draftSearch.trim());
  };

  const resetFilters = () => {
    setDraftSearch("");
    setAppliedSearch("");
    setLifecycleStatus("");
    setVerificationFrequency("");
    setLatestOutcome("");
    setOwnerId("");
    setDepartmentId("");
    setEvidenceRequired("");
    setDueFrom("");
    setDueTo("");
    setPage(1);
  };

  const onSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    applySearch();
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applySearch();
    }
  };

  const openEdit = async (checkpoint: Checkpoint) => {
    try {
      const detail = await checkpointApi.getCheckpoint(checkpoint.id);
      setEditing(detail);
    } catch (error) {
      showToast(
        "error",
        "Unable to open Checkpoint",
        error instanceof Error ? error.message : "Request failed",
      );
    }
  };

  const rows = resource.data?.data ?? [];
  const meta = resource.data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const total = meta?.total ?? 0;
  const hasFilters =
    Boolean(appliedSearch) ||
    Boolean(lifecycleStatus) ||
    Boolean(verificationFrequency) ||
    Boolean(latestOutcome) ||
    Boolean(ownerId) ||
    Boolean(departmentId) ||
    Boolean(evidenceRequired) ||
    Boolean(dueFrom) ||
    Boolean(dueTo);

  return (
    <div className="page">
      <PageHeader
        title="Checkpoint Register"
        section="Policies & Controls"
        description="Company-scoped verification Checkpoints and review due dates. Reads use checkpoints:read."
        connected
        actions={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setListVersion((value) => value + 1)}
            >
              <RefreshCw size={15} /> Refresh
            </button>
            {canWrite ? (
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setCreating(true)}
                data-testid="checkpoint-create-open"
              >
                <Plus size={15} /> Create Checkpoint
              </button>
            ) : null}
          </>
        }
      />

      <form
        className="filter-bar"
        style={{ flexWrap: "wrap" }}
        onSubmit={onSearchSubmit}
      >
        <label className="filter-search">
          <span className="sr-only">Search checkpoints</span>
          <Search className="icon" size={16} aria-hidden />
          <input
            className="control"
            type="search"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search code or title…"
            maxLength={100}
            aria-label="Search checkpoints by code or title"
          />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Lifecycle status</span>
          <select
            className="control"
            value={lifecycleStatus}
            aria-label="Filter by lifecycle status"
            onChange={(event) => {
              setLifecycleStatus(
                event.target.value as CheckpointLifecycleStatus | "",
              );
              setPage(1);
            }}
          >
            <option value="">All lifecycles</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Verification frequency</span>
          <select
            className="control"
            value={verificationFrequency}
            aria-label="Filter by verification frequency"
            onChange={(event) => {
              setVerificationFrequency(
                event.target.value as CheckpointVerificationFrequency | "",
              );
              setPage(1);
            }}
          >
            <option value="">All frequencies</option>
            {VERIFICATION_FREQUENCY_OPTIONS.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Latest outcome</span>
          <select
            className="control"
            value={latestOutcome}
            aria-label="Filter by latest outcome"
            onChange={(event) => {
              setLatestOutcome(event.target.value as CheckpointOutcome | "");
              setPage(1);
            }}
          >
            <option value="">All outcomes</option>
            {OUTCOME_OPTIONS.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Owner</span>
          <select
            className="control"
            value={ownerId}
            aria-label="Filter by owner"
            disabled={users.status !== "ready"}
            onChange={(event) => {
              setOwnerId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">
              {users.status === "forbidden"
                ? "Owner filter unavailable"
                : "All owners"}
            </option>
            {users.status === "ready"
              ? users.items.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))
              : null}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Department</span>
          <select
            className="control"
            value={departmentId}
            aria-label="Filter by department"
            disabled={departments.status !== "ready"}
            onChange={(event) => {
              setDepartmentId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">
              {departments.status === "forbidden"
                ? "Department filter unavailable"
                : "All departments"}
            </option>
            {departments.status === "ready"
              ? departments.items.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))
              : null}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Evidence required</span>
          <select
            className="control"
            value={evidenceRequired}
            aria-label="Filter by Evidence requirement"
            onChange={(event) => {
              setEvidenceRequired(
                event.target.value as "" | "true" | "false",
              );
              setPage(1);
            }}
          >
            <option value="">Evidence: any</option>
            <option value="true">Evidence required</option>
            <option value="false">Evidence not required</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Due from</span>
          <input
            className="control"
            type="date"
            value={dueFrom}
            aria-label="Due from"
            onChange={(event) => {
              setDueFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Due to</span>
          <input
            className="control"
            type="date"
            value={dueTo}
            aria-label="Due to"
            onChange={(event) => {
              setDueTo(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={resetFilters}
        >
          Reset filters
        </button>
      </form>

      {users.status === "forbidden" || departments.status === "forbidden" ? (
        <div className="banner warning" role="status">
          Some filter selectors are unavailable because supporting master-data
          permissions are missing. Checkpoint rows still load when
          checkpoints:read is present.
        </div>
      ) : null}

      {resource.loading ? (
        <div data-testid="checkpoint-register-loading">
          <LoadingState label="Loading Checkpoint Register…" />
        </div>
      ) : resource.error ? (
        <div data-testid="checkpoint-register-error">
          <ErrorState error={resource.error} />
        </div>
      ) : rows.length === 0 ? (
        <section className="card empty-state" id="page-content">
          <Inbox size={28} aria-hidden />
          <h3>
            {hasFilters
              ? "No Checkpoints match these filters"
              : "No Checkpoints yet"}
          </h3>
          <p>
            {hasFilters
              ? "Server-side filters returned no rows for the active Company. Adjust search or filters and try again."
              : `No Checkpoint Register records were returned for ${user?.activeCompany.name ?? "the active Company"}.`}
          </p>
        </section>
      ) : (
        <>
          <section
            className="card table-card control-register-desktop"
            id="page-content"
            data-testid="checkpoint-register-table"
          >
            <div className="table-wrap">
              <table className="data-table">
                <caption>
                  Checkpoint Register — {total} result
                  {total === 1 ? "" : "s"}
                  {user?.activeCompany.name
                    ? ` for ${user.activeCompany.name}`
                    : ""}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Checkpoint</th>
                    <th scope="col">Lifecycle</th>
                    <th scope="col">Control</th>
                    <th scope="col">Frequency</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Department</th>
                    <th scope="col">Next review</th>
                    <th scope="col">Latest outcome</th>
                    <th scope="col">Reviews</th>
                    <th scope="col">Evidence</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((checkpoint) => (
                    <CheckpointRow
                      key={checkpoint.id}
                      checkpoint={checkpoint}
                      canWrite={canWrite}
                      onView={() =>
                        navigate(`/compliance/checkpoints/${checkpoint.id}`)
                      }
                      onEdit={() => void openEdit(checkpoint)}
                      onLifecycle={(kind) =>
                        setLifecycle({ kind, checkpoint })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <CheckpointPager
              page={page}
              total={total}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </section>

          <section
            className="control-register-mobile"
            aria-label="Checkpoint Register cards"
            data-testid="checkpoint-register-cards"
          >
            {rows.map((checkpoint) => (
              <article
                className="card control-register-card"
                key={checkpoint.id}
              >
                <header className="card-head">
                  <div>
                    <h2>{checkpoint.title}</h2>
                    <p className="mono">{checkpoint.code}</p>
                  </div>
                  <Badge tone={lifecycleTone(checkpoint.lifecycleStatus)}>
                    {statusLabel(checkpoint.lifecycleStatus)}
                  </Badge>
                </header>
                <div className="card-pad">
                  <p>Owner {named(checkpoint.owner)}</p>
                  <p>
                    {checkpoint.control
                      ? `${checkpoint.control.code} · ${statusLabel(checkpoint.verificationFrequency)}`
                      : statusLabel(checkpoint.verificationFrequency)}
                  </p>
                  <p>
                    Next review {formatCheckpointDate(checkpoint.nextReviewDate)}
                  </p>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    aria-label={`View ${checkpoint.code}`}
                    onClick={() =>
                      navigate(`/compliance/checkpoints/${checkpoint.id}`)
                    }
                  >
                    <Eye size={15} /> View detail
                  </button>
                </div>
              </article>
            ))}
            <CheckpointPager
              page={page}
              total={total}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </section>
        </>
      )}

      {creating ? (
        <CheckpointFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={(created) => {
            setCreating(false);
            showToast(
              "success",
              "Checkpoint created",
              `${created.code} was created.`,
            );
            navigate(`/compliance/checkpoints/${created.id}`);
          }}
        />
      ) : null}

      {editing ? (
        <CheckpointFormModal
          mode="edit"
          checkpoint={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setListVersion((value) => value + 1);
            showToast(
              "success",
              "Checkpoint updated",
              "Metadata changes were saved.",
            );
          }}
        />
      ) : null}

      {lifecycle ? (
        <CheckpointLifecycleDialog
          kind={lifecycle.kind}
          checkpoint={lifecycle.checkpoint}
          onClose={() => setLifecycle(null)}
          onCompleted={() => {
            const kind = lifecycle.kind;
            setLifecycle(null);
            setListVersion((value) => value + 1);
            showToast(
              "success",
              kind === "activate"
                ? "Checkpoint activated"
                : kind === "deactivate"
                  ? "Checkpoint deactivated"
                  : "Checkpoint archived",
              kind === "archive"
                ? "The Checkpoint is now read-only."
                : "Lifecycle status was updated.",
            );
          }}
        />
      ) : null}
    </div>
  );
}

function CheckpointPager({
  page,
  total,
  totalPages,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="table-foot">
      <span>
        Showing {total ? (page - 1) * pageSize + 1 : 0}–
        {Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="pagination">
        <button
          className="page-btn"
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft size={15} />
        </button>
        <span>
          Page {page} of {Math.max(1, totalPages)}
        </span>
        <button
          className="page-btn"
          type="button"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

function CheckpointRow({
  checkpoint,
  canWrite,
  onView,
  onEdit,
  onLifecycle,
}: {
  checkpoint: Checkpoint;
  canWrite: boolean;
  onView: () => void;
  onEdit: () => void;
  onLifecycle: (kind: CheckpointLifecycleKind) => void;
}) {
  const archived = checkpoint.lifecycleStatus === "ARCHIVED";

  return (
    <tr>
      <td>
        <div className="cell-title">
          <strong>{checkpoint.title}</strong>
          <small className="mono">{checkpoint.code}</small>
        </div>
      </td>
      <td>
        <Badge tone={lifecycleTone(checkpoint.lifecycleStatus)}>
          {statusLabel(checkpoint.lifecycleStatus)}
        </Badge>
      </td>
      <td>
        {checkpoint.control ? (
          <>
            <span className="mono">{checkpoint.control.code}</span>
            <br />
            <small>{checkpoint.control.title}</small>
          </>
        ) : (
          "—"
        )}
      </td>
      <td>{statusLabel(checkpoint.verificationFrequency)}</td>
      <td>{named(checkpoint.owner)}</td>
      <td>{named(checkpoint.department, "Not assigned")}</td>
      <td>{formatCheckpointDate(checkpoint.nextReviewDate)}</td>
      <td>
        {checkpoint.latestOutcome ? (
          <Badge tone={outcomeTone(checkpoint.latestOutcome)}>
            {statusLabel(checkpoint.latestOutcome)}
          </Badge>
        ) : (
          "—"
        )}
      </td>
      <td>{checkpoint.totalReviewCount}</td>
      <td>{checkpoint.evidenceRequired ? "Yes" : "No"}</td>
      <td>
        <div className="stack" style={{ gap: 4 }}>
          <button
            className="tiny-btn"
            type="button"
            aria-label={`View ${checkpoint.code}`}
            onClick={onView}
          >
            <Eye size={15} />
          </button>
          {canWrite && !archived ? (
            <>
              <button
                className="tiny-btn"
                type="button"
                aria-label={`Edit ${checkpoint.code}`}
                onClick={onEdit}
              >
                <Pencil size={15} />
              </button>
              {checkpoint.lifecycleStatus === "INACTIVE" ? (
                <button
                  className="tiny-btn"
                  type="button"
                  aria-label={`Activate ${checkpoint.code}`}
                  onClick={() => onLifecycle("activate")}
                >
                  <Power size={15} />
                </button>
              ) : null}
              {checkpoint.lifecycleStatus === "ACTIVE" ? (
                <button
                  className="tiny-btn"
                  type="button"
                  aria-label={`Deactivate ${checkpoint.code}`}
                  onClick={() => onLifecycle("deactivate")}
                >
                  <PowerOff size={15} />
                </button>
              ) : null}
              <button
                className="tiny-btn"
                type="button"
                aria-label={`Archive ${checkpoint.code}`}
                onClick={() => onLifecycle("archive")}
              >
                <Archive size={15} />
              </button>
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
