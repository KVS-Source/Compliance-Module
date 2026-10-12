import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Eye,
  FilePlus2,
  Inbox,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
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
import { frameworkApi } from "../../services/frameworkApi";
import { masterDataApi } from "../../services/masterDataApi";
import { policyApi } from "../../services/policyApi";
import type {
  CompanyUser,
  Department,
  Framework,
  Policy,
  PolicyDetail,
  PolicyLifecycleStatus,
  PolicyVersionStatus,
} from "../../types/api";
import { PolicyDecisionModal } from "./PolicyDecisionModal";
import { PolicyFormModal } from "./PolicyFormModal";
import { PolicyVersionFormModal } from "./PolicyVersionFormModal";
import {
  formatPolicyDate,
  lifecycleTone,
  named,
  statusLabel,
  versionStatusTone,
} from "./policyFormatting";

const PAGE_SIZE = 20;

type MasterState<T> =
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "forbidden" }
  | { status: "error"; message: string };

const loadMaster = async <T,>(loader: () => Promise<T[]>): Promise<MasterState<T>> => {
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

export function PolicyRegisterPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const canWrite = hasPermission("policies:write");
  const [listVersion, setListVersion] = useState(0);

  const { values, page, orderBy, order, updateParams, setPage, toggleSort } =
    useRegisterQueryState({
      keys: [
        "q",
        "lifecycleStatus",
        "versionStatus",
        "ownerId",
        "departmentId",
        "frameworkId",
        "reviewDueFrom",
        "reviewDueTo",
      ],
    });
  const appliedSearch = values.q ?? "";
  const lifecycleStatus = (values.lifecycleStatus ?? "") as
    | PolicyLifecycleStatus
    | "";
  const versionStatus = (values.versionStatus ?? "") as PolicyVersionStatus | "";
  const ownerId = values.ownerId ?? "";
  const departmentId = values.departmentId ?? "";
  const frameworkId = values.frameworkId ?? "";
  const reviewDueFrom = values.reviewDueFrom ?? "";
  const reviewDueTo = values.reviewDueTo ?? "";
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
  const [frameworks, setFrameworks] = useState<MasterState<Framework>>({
    status: "loading",
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PolicyDetail | null>(null);
  const [creatingVersionFor, setCreatingVersionFor] =
    useState<PolicyDetail | null>(null);
  const [archiving, setArchiving] = useState<Policy | null>(null);

  useEffect(() => {
    setCreating(false);
    setEditing(null);
    setCreatingVersionFor(null);
    setArchiving(null);
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
      policyApi.listPolicies({
        page,
        pageSize: PAGE_SIZE,
        q: appliedSearch || undefined,
        lifecycleStatus: lifecycleStatus || undefined,
        versionStatus: versionStatus || undefined,
        ownerId: ownerId || undefined,
        departmentId: departmentId || undefined,
        frameworkId: frameworkId || undefined,
        reviewDueFrom: reviewDueFrom || undefined,
        reviewDueTo: reviewDueTo || undefined,
        orderBy: orderBy || undefined,
        order: orderBy ? order : undefined,
      }),
    [
      contextVersion,
      user?.activeCompany.id,
      page,
      appliedSearch,
      lifecycleStatus,
      versionStatus,
      ownerId,
      departmentId,
      frameworkId,
      reviewDueFrom,
      reviewDueTo,
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
      versionStatus: "",
      ownerId: "",
      departmentId: "",
      frameworkId: "",
      reviewDueFrom: "",
      reviewDueTo: "",
      orderBy: "",
      order: "",
    });
  };

  const onSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    updateParams({ q: draftSearch.trim() });
  };

  const openEdit = async (policy: Policy) => {
    try {
      const detail = await policyApi.getPolicy(policy.id);
      setEditing(detail);
    } catch (error) {
      showToast(
        "error",
        "Unable to open Policy",
        error instanceof Error ? error.message : "Request failed",
      );
    }
  };

  const openCreateVersion = async (policy: Policy) => {
    try {
      const detail = await policyApi.getPolicy(policy.id);
      setCreatingVersionFor(detail);
    } catch (error) {
      showToast(
        "error",
        "Unable to open Version create",
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
    Boolean(versionStatus) ||
    Boolean(ownerId) ||
    Boolean(departmentId) ||
    Boolean(frameworkId) ||
    Boolean(reviewDueFrom) ||
    Boolean(reviewDueTo);

  return (
    <div className="page">
      <PageHeader
        title="Policy Register"
        section="Policies & Controls"
        description="Policies, version status and review dates."
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
                data-testid="policy-create-open"
              >
                <Plus size={15} /> Create Policy
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
          <span className="sr-only">Search policies</span>
          <Search className="icon" size={16} aria-hidden />
          <input
            className="control"
            type="search"
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search code or title…"
            maxLength={100}
            aria-label="Search policies by code or title"
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
          <span className="sr-only">Latest Version status</span>
          <select
            className="control"
            value={versionStatus}
            aria-label="Filter by latest Version status"
            onChange={(event) =>
              updateParams({ versionStatus: event.target.value })
            }
          >
            <option value="">All Version statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="SUBMITTED">SUBMITTED</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="SUPERSEDED">SUPERSEDED</option>
            <option value="OBSOLETE">OBSOLETE</option>
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
          <span className="sr-only">Framework</span>
          <select
            className="control"
            value={frameworkId}
            aria-label="Filter by Framework"
            disabled={frameworks.status !== "ready"}
            onChange={(event) =>
              updateParams({ frameworkId: event.target.value })
            }
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
          <span className="sr-only">Review due from</span>
          <input
            className="control"
            type="date"
            value={reviewDueFrom}
            aria-label="Review due from"
            onChange={(event) =>
              updateParams({ reviewDueFrom: event.target.value })
            }
          />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Review due to</span>
          <input
            className="control"
            type="date"
            value={reviewDueTo}
            aria-label="Review due to"
            onChange={(event) =>
              updateParams({ reviewDueTo: event.target.value })
            }
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
          permissions are missing. Policy rows still load when policies:read is
          present.
        </div>
      ) : null}

      {resource.loading ? (
        <div data-testid="policy-register-loading">
          <LoadingState label="Loading Policy Register…" />
        </div>
      ) : resource.error ? (
        <div data-testid="policy-register-error">
          <ErrorState error={resource.error} />
        </div>
      ) : rows.length === 0 ? (
        <section className="card empty-state" id="page-content">
          <Inbox size={28} aria-hidden />
          <h3>
            {hasFilters ? "No Policies match these filters" : "No Policies yet"}
          </h3>
          <p>
            {hasFilters
              ? "Server-side filters returned no rows for the active Company. Adjust search or filters and try again."
              : `No Policy Register records were returned for ${user?.activeCompany.name ?? "the active Company"}.`}
          </p>
        </section>
      ) : (
        <>
          <section
            className="card table-card policy-register-desktop"
            id="page-content"
            data-testid="policy-register-table"
          >
            <div className="table-wrap">
              <table className="data-table">
                <caption>
                  Policy Register — {total} result{total === 1 ? "" : "s"}
                  {user?.activeCompany.name
                    ? ` for ${user.activeCompany.name}`
                    : ""}
                </caption>
                <thead>
                  <tr>
                    <SortableTh
                      column="title"
                      label="Policy"
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
                    <th scope="col">Owner</th>
                    <th scope="col">Department</th>
                    <th scope="col">Latest Version</th>
                    <th scope="col">Current approved</th>
                    <th scope="col">Review date</th>
                    <th scope="col">Frameworks</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((policy) => (
                    <PolicyRow
                      key={policy.id}
                      policy={policy}
                      canWrite={canWrite}
                      onView={() =>
                        navigate(`/compliance/policies/${policy.id}`)
                      }
                      onEdit={() => void openEdit(policy)}
                      onCreateVersion={() => void openCreateVersion(policy)}
                      onArchive={() => setArchiving(policy)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <PolicyPager
              page={page}
              total={total}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </section>

          <section
            className="policy-register-mobile"
            aria-label="Policy Register cards"
            data-testid="policy-register-cards"
          >
            {rows.map((policy) => (
              <article className="card policy-register-card" key={policy.id}>
                <header className="card-head">
                  <div>
                    <h2>{policy.title}</h2>
                    <p className="mono">{policy.code}</p>
                  </div>
                  <Badge tone={lifecycleTone(policy.lifecycleStatus)}>
                    {statusLabel(policy.lifecycleStatus)}
                  </Badge>
                </header>
                <div className="card-pad">
                  <p>Owner {named(policy.owner)}</p>
                  <p>
                    Latest{" "}
                    {policy.latestVersion
                      ? `${policy.latestVersion.version} (${statusLabel(policy.latestVersion.status)})`
                      : "—"}
                  </p>
                  <p>
                    Approved{" "}
                    {policy.currentApprovedVersion?.version ?? "None"}
                  </p>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    aria-label={`View ${policy.code}`}
                    onClick={() =>
                      navigate(`/compliance/policies/${policy.id}`)
                    }
                  >
                    <Eye size={15} /> View detail
                  </button>
                </div>
              </article>
            ))}
            <PolicyPager
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
        <PolicyFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={(created) => {
            setCreating(false);
            showToast(
              "success",
              "Policy created",
              `${created.code} was created as Version 1.0 DRAFT.`,
            );
            navigate(`/compliance/policies/${created.id}`);
          }}
        />
      ) : null}

      {editing ? (
        <PolicyFormModal
          mode="edit"
          policy={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setListVersion((value) => value + 1);
            showToast("success", "Policy updated", "Metadata changes were saved.");
          }}
        />
      ) : null}

      {creatingVersionFor ? (
        <PolicyVersionFormModal
          mode="create"
          policyId={creatingVersionFor.id}
          latestVersion={creatingVersionFor.latestVersion}
          onClose={() => setCreatingVersionFor(null)}
          onSaved={(version) => {
            setCreatingVersionFor(null);
            setListVersion((value) => value + 1);
            showToast(
              "success",
              "Version created",
              `Version ${version.version} is ready as ${version.status}.`,
            );
            navigate(`/compliance/policies/${creatingVersionFor.id}`);
          }}
        />
      ) : null}

      {archiving ? (
        <PolicyDecisionModal
          kind="archive"
          policy={archiving}
          onClose={() => setArchiving(null)}
          onCompleted={() => {
            setArchiving(null);
            setListVersion((value) => value + 1);
            showToast(
              "success",
              "Policy archived",
              "The Policy is now read-only.",
            );
          }}
        />
      ) : null}
    </div>
  );
}

function PolicyPager({
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

function PolicyRow({
  policy,
  canWrite,
  onView,
  onEdit,
  onCreateVersion,
  onArchive,
}: {
  policy: Policy;
  canWrite: boolean;
  onView: () => void;
  onEdit: () => void;
  onCreateVersion: () => void;
  onArchive: () => void;
}) {
  const archived = policy.lifecycleStatus === "ARCHIVED";
  const latest = policy.latestVersion;
  const approved = policy.currentApprovedVersion;
  const reviewDate =
    approved?.reviewDate ?? latest?.reviewDate ?? null;
  const frameworkCount =
    latest?.frameworks.filter((mapping) => mapping.isActive).length ?? 0;

  return (
    <tr>
      <td>
        <div className="cell-title">
          <strong>{policy.title}</strong>
          <small className="mono">{policy.code}</small>
        </div>
      </td>
      <td>
        <Badge tone={lifecycleTone(policy.lifecycleStatus)}>
          {statusLabel(policy.lifecycleStatus)}
        </Badge>
      </td>
      <td>{named(policy.owner)}</td>
      <td>{named(policy.department, "Not assigned")}</td>
      <td>
        {latest ? (
          <div className="cell-title">
            <strong className="mono">{latest.version}</strong>
            <Badge tone={versionStatusTone(latest.status)}>
              {statusLabel(latest.status)}
            </Badge>
          </div>
        ) : (
          "—"
        )}
      </td>
      <td>
        {approved ? (
          <span className="mono">{approved.version}</span>
        ) : (
          "None"
        )}
      </td>
      <td>{formatPolicyDate(reviewDate)}</td>
      <td>{frameworkCount}</td>
      <td>
        <div className="stack" style={{ gap: 4 }}>
          <button
            className="tiny-btn"
            type="button"
            aria-label={`View ${policy.code}`}
            onClick={onView}
          >
            <Eye size={15} />
          </button>
          {canWrite && !archived ? (
            <>
              <button
                className="tiny-btn"
                type="button"
                aria-label={`Edit ${policy.code}`}
                onClick={onEdit}
              >
                <Pencil size={15} />
              </button>
              <button
                className="tiny-btn"
                type="button"
                aria-label={`Create Version for ${policy.code}`}
                onClick={onCreateVersion}
              >
                <FilePlus2 size={15} />
              </button>
              <button
                className="tiny-btn"
                type="button"
                aria-label={`Archive ${policy.code}`}
                onClick={onArchive}
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
