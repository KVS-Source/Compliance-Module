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
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { SortableTh } from "../../components/tables/SortableTh";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import {
  useDebouncedSearchParam,
  useRegisterQueryState,
} from "../../hooks/useRegisterQueryState";
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
  const activeCompanyId = user?.activeCompany.id;
  // Keep latest tenant identity for async openEdit completion checks.
  // Closure values alone cannot detect a company switch after await.
  const tenantGuardRef = useRef({
    companyId: activeCompanyId,
    contextVersion,
  });
  tenantGuardRef.current = {
    companyId: activeCompanyId,
    contextVersion,
  };

  const [listVersion, setListVersion] = useState(0);

  const { values, page, orderBy, order, updateParams, setPage, toggleSort } =
    useRegisterQueryState({
      keys: [
        "q",
        "lifecycleStatus",
        "verificationFrequency",
        "latestOutcome",
        "ownerId",
        "departmentId",
        "evidenceRequired",
        "dueFrom",
        "dueTo",
      ],
    });
  const appliedSearch = values.q ?? "";
  const lifecycleStatus = (values.lifecycleStatus ?? "") as
    | CheckpointLifecycleStatus
    | "";
  const verificationFrequency = (values.verificationFrequency ?? "") as
    | CheckpointVerificationFrequency
    | "";
  const latestOutcome = (values.latestOutcome ?? "") as CheckpointOutcome | "";
  const ownerId = values.ownerId ?? "";
  const departmentId = values.departmentId ?? "";
  const evidenceRequired = (values.evidenceRequired ?? "") as
    | ""
    | "true"
    | "false";
  const dueFrom = values.dueFrom ?? "";
  const dueTo = values.dueTo ?? "";
  const { draftSearch, setDraftSearch } = useDebouncedSearchParam(
    appliedSearch,
    updateParams,
  );

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
    setCreating(false);
    setEditing(null);
    setLifecycle(null);
  }, [contextVersion, activeCompanyId]);

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
  }, [contextVersion, activeCompanyId]);

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
        orderBy: orderBy || undefined,
        order: orderBy ? order : undefined,
      }),
    [
      contextVersion,
      activeCompanyId,
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
      orderBy,
      order,
      listVersion,
    ],
  );

  const resetFilters = () => {
    setDraftSearch("");
    updateParams({
      q: "",
      lifecycleStatus: "",
      verificationFrequency: "",
      latestOutcome: "",
      ownerId: "",
      departmentId: "",
      evidenceRequired: "",
      dueFrom: "",
      dueTo: "",
      orderBy: "",
      order: "",
    });
  };

  const onSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    updateParams({ q: draftSearch.trim() });
  };

  const openEdit = async (checkpoint: Checkpoint) => {
    const requestCompanyId = tenantGuardRef.current.companyId;
    const requestContextVersion = tenantGuardRef.current.contextVersion;
    try {
      const detail = await checkpointApi.getCheckpoint(checkpoint.id);
      if (
        tenantGuardRef.current.companyId !== requestCompanyId ||
        tenantGuardRef.current.contextVersion !== requestContextVersion
      ) {
        // Company switched while detail was in flight — do not open/populate.
        return;
      }
      setEditing(detail);
    } catch (error) {
      if (
        tenantGuardRef.current.companyId !== requestCompanyId ||
        tenantGuardRef.current.contextVersion !== requestContextVersion
      ) {
        // Stale failure after tenant switch must not toast for the new Company.
        return;
      }
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
            onChange={(event) =>
              updateParams({ lifecycleStatus: event.target.value })
            }
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
            onChange={(event) =>
              updateParams({ verificationFrequency: event.target.value })
            }
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
            onChange={(event) =>
              updateParams({ latestOutcome: event.target.value })
            }
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
            onChange={(event) => updateParams({ ownerId: event.target.value })}
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
            onChange={(event) =>
              updateParams({ departmentId: event.target.value })
            }
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
            onChange={(event) =>
              updateParams({ evidenceRequired: event.target.value })
            }
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
            onChange={(event) => updateParams({ dueFrom: event.target.value })}
          />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Due to</span>
          <input
            className="control"
            type="date"
            value={dueTo}
            aria-label="Due to"
            onChange={(event) => updateParams({ dueTo: event.target.value })}
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
        <section
          className="card empty-state guided-empty"
          id="page-content"
          data-testid="checkpoint-register-empty"
        >
          <Inbox size={28} aria-hidden />
          <h3>
            {hasFilters
              ? "No Checkpoints match these filters"
              : "No Checkpoints yet"}
          </h3>
          {hasFilters ? (
            <p>
              Server-side filters returned no rows for the active Company.
              Adjust search or filters and try again.
            </p>
          ) : (
            <>
              <p>
                No Checkpoint Register records were returned for{" "}
                {user?.activeCompany.name ?? "the active Company"}. A Checkpoint
                verifies a Control on a recurring schedule, so a Control has to
                exist before one can be created.
              </p>
              <ol className="guided-steps" data-testid="checkpoint-empty-steps">
                <li>
                  <Link to="/master/rules">Framework Rules</Link>
                  <span>The regulatory requirements in scope.</span>
                </li>
                <li>
                  <Link to="/compliance/controls">Controls</Link>
                  <span>This Company&rsquo;s implementation of those requirements.</span>
                </li>
                <li>
                  <Link to="/compliance/controls">Create Control</Link>
                  <span>Record an implementation if none exists yet.</span>
                </li>
                <li>
                  {canWrite ? (
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setCreating(true)}
                      data-testid="checkpoint-empty-create"
                    >
                      Create Checkpoint
                    </button>
                  ) : (
                    <span className="guided-step-locked">
                      Create Checkpoint — requires checkpoints:write
                    </span>
                  )}
                  <span>Schedule the recurring verification.</span>
                </li>
              </ol>
            </>
          )}
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
                    <SortableTh
                      column="title"
                      label="Checkpoint"
                      orderBy={orderBy}
                      order={order}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      column="lifecycleStatus"
                      label="Lifecycle"
                      orderBy={orderBy}
                      order={order}
                      onSort={toggleSort}
                    />
                    <th scope="col">Control</th>
                    <th scope="col">Frequency</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Department</th>
                    <SortableTh
                      column="nextReviewDate"
                      label="Next review"
                      orderBy={orderBy}
                      order={order}
                      onSort={toggleSort}
                    />
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
