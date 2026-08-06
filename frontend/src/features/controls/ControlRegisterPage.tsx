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
import { Link, useNavigate } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { ApiError } from "../../services/apiClient";
import { controlApi } from "../../services/controlApi";
import { frameworkApi } from "../../services/frameworkApi";
import { masterDataApi } from "../../services/masterDataApi";
import type {
  CompanyUser,
  Control,
  ControlDetail,
  ControlFrequency,
  ControlImplementationStatus,
  ControlLifecycleStatus,
  ControlType,
  Department,
  Framework,
} from "../../types/api";
import { ControlFormModal } from "./ControlFormModal";
import {
  ControlLifecycleDialog,
  type ControlLifecycleKind,
} from "./ControlLifecycleDialog";
import {
  CONTROL_TYPE_OPTIONS,
  FREQUENCY_OPTIONS,
  IMPLEMENTATION_STATUS_OPTIONS,
  formatControlDate,
  implementationTone,
  lifecycleTone,
  named,
  statusLabel,
} from "./controlFormatting";

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

export function ControlRegisterPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const canWrite = hasPermission("controls:write");

  const [draftSearch, setDraftSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [lifecycleStatus, setLifecycleStatus] = useState<
    ControlLifecycleStatus | ""
  >("");
  const [implementationStatus, setImplementationStatus] = useState<
    ControlImplementationStatus | ""
  >("");
  const [controlType, setControlType] = useState<ControlType | "">("");
  const [frequency, setFrequency] = useState<ControlFrequency | "">("");
  const [ownerId, setOwnerId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [frameworkId, setFrameworkId] = useState("");
  const [requiresEvidence, setRequiresEvidence] = useState<"" | "true" | "false">(
    "",
  );
  const [reviewDueFrom, setReviewDueFrom] = useState("");
  const [reviewDueTo, setReviewDueTo] = useState("");
  const [page, setPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);

  const [users, setUsers] = useState<MasterState<CompanyUser>>({
    status: "loading",
  });
  const [departments, setDepartments] = useState<MasterState<Department>>({
    status: "loading",
  });
  const [frameworks, setFrameworks] = useState<MasterState<Framework>>({
    status: "loading",
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ControlDetail | null>(null);
  const [lifecycle, setLifecycle] = useState<{
    kind: ControlLifecycleKind;
    control: Control;
  } | null>(null);

  useEffect(() => {
    setDraftSearch("");
    setAppliedSearch("");
    setLifecycleStatus("");
    setImplementationStatus("");
    setControlType("");
    setFrequency("");
    setOwnerId("");
    setDepartmentId("");
    setFrameworkId("");
    setRequiresEvidence("");
    setReviewDueFrom("");
    setReviewDueTo("");
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
      loadMaster(() => frameworkApi.list()),
    ]).then(([userState, departmentState, frameworkState]) => {
      if (!active) return;
      setUsers(userState);
      setDepartments(departmentState);
      setFrameworks(frameworkState);
    });
    return () => {
      active = false;
    };
  }, [contextVersion, user?.activeCompany.id]);

  const resource = useApiResource(
    () =>
      controlApi.listControls({
        page,
        pageSize: PAGE_SIZE,
        q: appliedSearch || undefined,
        lifecycleStatus: lifecycleStatus || undefined,
        implementationStatus: implementationStatus || undefined,
        controlType: controlType || undefined,
        frequency: frequency || undefined,
        ownerId: ownerId || undefined,
        departmentId: departmentId || undefined,
        frameworkId: frameworkId || undefined,
        requiresEvidence:
          requiresEvidence === ""
            ? undefined
            : requiresEvidence === "true",
        reviewDueFrom: reviewDueFrom || undefined,
        reviewDueTo: reviewDueTo || undefined,
      }),
    [
      contextVersion,
      user?.activeCompany.id,
      page,
      appliedSearch,
      lifecycleStatus,
      implementationStatus,
      controlType,
      frequency,
      ownerId,
      departmentId,
      frameworkId,
      requiresEvidence,
      reviewDueFrom,
      reviewDueTo,
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
    setImplementationStatus("");
    setControlType("");
    setFrequency("");
    setOwnerId("");
    setDepartmentId("");
    setFrameworkId("");
    setRequiresEvidence("");
    setReviewDueFrom("");
    setReviewDueTo("");
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

  const openEdit = async (control: Control) => {
    try {
      const detail = await controlApi.getControl(control.id);
      setEditing(detail);
    } catch (error) {
      showToast(
        "error",
        "Unable to open Control",
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
    Boolean(implementationStatus) ||
    Boolean(controlType) ||
    Boolean(frequency) ||
    Boolean(ownerId) ||
    Boolean(departmentId) ||
    Boolean(frameworkId) ||
    Boolean(requiresEvidence) ||
    Boolean(reviewDueFrom) ||
    Boolean(reviewDueTo);

  return (
    <div className="page">
      <PageHeader
        title="Control Register"
        section="Policies & Controls"
        description="Company-scoped Controls, implementation status, mappings and review dates. Reads use controls:read."
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
                data-testid="control-create-open"
              >
                <Plus size={15} /> Create Control
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
          <span className="sr-only">Search controls</span>
          <Search className="icon" size={16} aria-hidden />
          <input
            className="control"
            type="search"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search code or title…"
            maxLength={100}
            aria-label="Search controls by code or title"
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
                event.target.value as ControlLifecycleStatus | "",
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
          <span className="sr-only">Implementation status</span>
          <select
            className="control"
            value={implementationStatus}
            aria-label="Filter by implementation status"
            onChange={(event) => {
              setImplementationStatus(
                event.target.value as ControlImplementationStatus | "",
              );
              setPage(1);
            }}
          >
            <option value="">All implementation statuses</option>
            {IMPLEMENTATION_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Control type</span>
          <select
            className="control"
            value={controlType}
            aria-label="Filter by control type"
            onChange={(event) => {
              setControlType(event.target.value as ControlType | "");
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {CONTROL_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Frequency</span>
          <select
            className="control"
            value={frequency}
            aria-label="Filter by frequency"
            onChange={(event) => {
              setFrequency(event.target.value as ControlFrequency | "");
              setPage(1);
            }}
          >
            <option value="">All frequencies</option>
            {FREQUENCY_OPTIONS.map((entry) => (
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
          <span className="sr-only">Framework</span>
          <select
            className="control"
            value={frameworkId}
            aria-label="Filter by Framework"
            disabled={frameworks.status !== "ready"}
            onChange={(event) => {
              setFrameworkId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">
              {frameworks.status === "forbidden"
                ? "Framework filter unavailable"
                : "All Frameworks"}
            </option>
            {frameworks.status === "ready"
              ? frameworks.items.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.code} · {entry.name}
                  </option>
                ))
              : null}
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Requires Evidence</span>
          <select
            className="control"
            value={requiresEvidence}
            aria-label="Filter by Evidence requirement"
            onChange={(event) => {
              setRequiresEvidence(
                event.target.value as "" | "true" | "false",
              );
              setPage(1);
            }}
          >
            <option value="">Evidence: any</option>
            <option value="true">Requires Evidence</option>
            <option value="false">Evidence not required</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Review due from</span>
          <input
            className="control"
            type="date"
            value={reviewDueFrom}
            aria-label="Review due from"
            onChange={(event) => {
              setReviewDueFrom(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Review due to</span>
          <input
            className="control"
            type="date"
            value={reviewDueTo}
            aria-label="Review due to"
            onChange={(event) => {
              setReviewDueTo(event.target.value);
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

      {users.status === "forbidden" ||
      departments.status === "forbidden" ||
      frameworks.status === "forbidden" ? (
        <div className="banner warning" role="status">
          Some filter selectors are unavailable because supporting master-data
          permissions are missing. Control rows still load when controls:read is
          present.
        </div>
      ) : null}

      {resource.loading ? (
        <div data-testid="control-register-loading">
          <LoadingState label="Loading Control Register…" />
        </div>
      ) : resource.error ? (
        <div data-testid="control-register-error">
          <ErrorState error={resource.error} />
        </div>
      ) : rows.length === 0 ? (
        <section
          className="card empty-state guided-empty"
          id="page-content"
          data-testid="control-register-empty"
        >
          <Inbox size={28} aria-hidden />
          <h3>
            {hasFilters
              ? "No Controls match these filters"
              : "No Controls yet"}
          </h3>
          {hasFilters ? (
            <p>
              Server-side filters returned no rows for the active Company.
              Adjust search or filters and try again.
            </p>
          ) : (
            <>
              {/* The distinction clients most often ask about: an imported
                  workbook carries the regulator's requirements, not this
                  company's implementation of them. */}
              <p data-testid="control-empty-explainer">
                Framework Rules are regulatory requirements. Controls are the
                company&rsquo;s implementation of those requirements.
              </p>
              <p>
                No Control Register records were returned for{" "}
                {user?.activeCompany.name ?? "the active Company"}. Start from a
                Framework Rule, create the Control that implements it, then add
                the Checkpoint that verifies it.
              </p>
              <ol className="guided-steps" data-testid="control-empty-steps">
                <li>
                  <Link to="/master/rules">Framework Rule</Link>
                  <span>Find the requirement this Company must satisfy.</span>
                </li>
                <li>
                  {canWrite ? (
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setCreating(true)}
                      data-testid="control-empty-create"
                    >
                      Create Control
                    </button>
                  ) : (
                    <span className="guided-step-locked">
                      Create Control — requires controls:write
                    </span>
                  )}
                  <span>Record how this Company implements it, and who owns it.</span>
                </li>
                <li>
                  <Link to="/compliance/checkpoints">Create Checkpoint</Link>
                  <span>Schedule the recurring verification of that Control.</span>
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
            data-testid="control-register-table"
          >
            <div className="table-wrap">
              <table className="data-table">
                <caption>
                  Control Register — {total} result{total === 1 ? "" : "s"}
                  {user?.activeCompany.name
                    ? ` for ${user.activeCompany.name}`
                    : ""}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Control</th>
                    <th scope="col">Lifecycle</th>
                    <th scope="col">Implementation</th>
                    <th scope="col">Type</th>
                    <th scope="col">Frequency</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Department</th>
                    <th scope="col">Next review</th>
                    <th scope="col">Evidence</th>
                    <th scope="col">Policies</th>
                    <th scope="col">Frameworks</th>
                    <th scope="col">Rules</th>
                    <th scope="col">Checkpoints</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((control) => (
                    <ControlRow
                      key={control.id}
                      control={control}
                      canWrite={canWrite}
                      onView={() =>
                        navigate(`/compliance/controls/${control.id}`)
                      }
                      onEdit={() => void openEdit(control)}
                      onLifecycle={(kind) => setLifecycle({ kind, control })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <ControlPager
              page={page}
              total={total}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </section>

          <section
            className="control-register-mobile"
            aria-label="Control Register cards"
            data-testid="control-register-cards"
          >
            {rows.map((control) => (
              <article className="card control-register-card" key={control.id}>
                <header className="card-head">
                  <div>
                    <h2>{control.title}</h2>
                    <p className="mono">{control.code}</p>
                  </div>
                  <Badge tone={lifecycleTone(control.lifecycleStatus)}>
                    {statusLabel(control.lifecycleStatus)}
                  </Badge>
                </header>
                <div className="card-pad">
                  <p>Owner {named(control.owner)}</p>
                  <p>
                    {statusLabel(control.implementationStatus)} ·{" "}
                    {statusLabel(control.controlType)}
                  </p>
                  <p>Next review {formatControlDate(control.nextReviewDate)}</p>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    aria-label={`View ${control.code}`}
                    onClick={() =>
                      navigate(`/compliance/controls/${control.id}`)
                    }
                  >
                    <Eye size={15} /> View detail
                  </button>
                </div>
              </article>
            ))}
            <ControlPager
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
        <ControlFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={(created) => {
            setCreating(false);
            showToast(
              "success",
              "Control created",
              `${created.code} was created.`,
            );
            navigate(`/compliance/controls/${created.id}`);
          }}
        />
      ) : null}

      {editing ? (
        <ControlFormModal
          mode="edit"
          control={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setListVersion((value) => value + 1);
            showToast(
              "success",
              "Control updated",
              "Metadata changes were saved.",
            );
          }}
        />
      ) : null}

      {lifecycle ? (
        <ControlLifecycleDialog
          kind={lifecycle.kind}
          control={lifecycle.control}
          onClose={() => setLifecycle(null)}
          onCompleted={() => {
            const kind = lifecycle.kind;
            setLifecycle(null);
            setListVersion((value) => value + 1);
            showToast(
              "success",
              kind === "activate"
                ? "Control activated"
                : kind === "deactivate"
                  ? "Control deactivated"
                  : "Control archived",
              kind === "archive"
                ? "The Control is now read-only."
                : "Lifecycle status was updated.",
            );
          }}
        />
      ) : null}
    </div>
  );
}

function ControlPager({
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

function ControlRow({
  control,
  canWrite,
  onView,
  onEdit,
  onLifecycle,
}: {
  control: Control;
  canWrite: boolean;
  onView: () => void;
  onEdit: () => void;
  onLifecycle: (kind: ControlLifecycleKind) => void;
}) {
  const archived = control.lifecycleStatus === "ARCHIVED";

  return (
    <tr>
      <td>
        <div className="cell-title">
          <strong>{control.title}</strong>
          <small className="mono">{control.code}</small>
        </div>
      </td>
      <td>
        <Badge tone={lifecycleTone(control.lifecycleStatus)}>
          {statusLabel(control.lifecycleStatus)}
        </Badge>
      </td>
      <td>
        <Badge tone={implementationTone(control.implementationStatus)}>
          {statusLabel(control.implementationStatus)}
        </Badge>
      </td>
      <td>{statusLabel(control.controlType)}</td>
      <td>{statusLabel(control.frequency)}</td>
      <td>{named(control.owner)}</td>
      <td>{named(control.department, "Not assigned")}</td>
      <td>{formatControlDate(control.nextReviewDate)}</td>
      <td>{control.requiresEvidence ? "Yes" : "No"}</td>
      <td>{control.activePolicyVersionMappingCount}</td>
      <td>{control.activeFrameworkMappingCount}</td>
      <td>{control.activeFrameworkRuleMappingCount}</td>
      <td>{control.activeCheckpointCount}</td>
      <td>
        <div className="stack" style={{ gap: 4 }}>
          <button
            className="tiny-btn"
            type="button"
            aria-label={`View ${control.code}`}
            onClick={onView}
          >
            <Eye size={15} />
          </button>
          {canWrite && !archived ? (
            <>
              <button
                className="tiny-btn"
                type="button"
                aria-label={`Edit ${control.code}`}
                onClick={onEdit}
              >
                <Pencil size={15} />
              </button>
              {control.lifecycleStatus === "INACTIVE" ? (
                <button
                  className="tiny-btn"
                  type="button"
                  aria-label={`Activate ${control.code}`}
                  onClick={() => onLifecycle("activate")}
                >
                  <Power size={15} />
                </button>
              ) : null}
              {control.lifecycleStatus === "ACTIVE" ? (
                <button
                  className="tiny-btn"
                  type="button"
                  aria-label={`Deactivate ${control.code}`}
                  onClick={() => onLifecycle("deactivate")}
                >
                  <PowerOff size={15} />
                </button>
              ) : null}
              <button
                className="tiny-btn"
                type="button"
                aria-label={`Archive ${control.code}`}
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
