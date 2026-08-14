import { Edit3, Inbox, RefreshCw, Search, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PageHeader } from "../../components/feedback/PageHeader";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { SavedViewToolbar } from "../../components/registers/SavedViewToolbar";
import { SortableTh } from "../../components/tables/SortableTh";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import {
  useDebouncedSearchParam,
  useRegisterQueryState,
} from "../../hooks/useRegisterQueryState";
import { taskApi } from "../../services/taskApi";
import type {
  ComplianceTask,
  TaskLinkType,
  TaskStatus,
} from "../../types/api";
import { TaskFormModal } from "./TaskFormModal";

const PAGE_SIZE = 20;
const label = (value: string) => value.replaceAll("_", " ");

export function TasksPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<ComplianceTask | null | undefined>();
  const canWrite = hasPermission("registers:write");
  const {
    values,
    page,
    orderBy,
    order,
    updateParams,
    setPage,
    toggleSort,
    viewQuery,
    applyView,
  } = useRegisterQueryState({
    keys: ["q", "status", "linkedEntityType", "overdue", "ownerId"],
  });
  const search = values.q ?? "";
  const status = (values.status ?? "") as TaskStatus | "";
  const linkedEntityType = (values.linkedEntityType ?? "") as TaskLinkType | "";
  const overdue = values.overdue === "true";
  const { draftSearch, setDraftSearch } = useDebouncedSearchParam(search, updateParams);
  const resource = useApiResource(
    () => taskApi.list({
      page,
      pageSize: PAGE_SIZE,
      q: search || undefined,
      status: status || undefined,
      linkedEntityType: linkedEntityType || undefined,
      overdue: overdue || undefined,
      ownerId: values.ownerId || undefined,
      orderBy: (orderBy || undefined) as "title" | "status" | "dueDate" | "createdAt" | undefined,
      order: orderBy ? order : undefined,
    }),
    [contextVersion, user?.activeCompany.id, page, search, status, linkedEntityType, overdue, values.ownerId, orderBy, order, version],
  );
  const rows = resource.data?.data ?? [];
  const meta = resource.data?.meta;

  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    updateParams({ q: draftSearch.trim() });
  };

  const remove = async (task: ComplianceTask) => {
    if (!window.confirm(`Delete task “${task.title}”?`)) return;
    try {
      await taskApi.delete(task.id);
      setVersion((current) => current + 1);
      showToast("success", "Task deleted", "");
    } catch (reason) {
      showToast("error", "Task could not be deleted", reason instanceof Error ? reason.message : "");
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Tasks"
        section="Audit & Operations"
        description="Assigned compliance work with due dates and governed links to Gaps, CAPAs, Risks and Audit events."
        connected
        primaryLabel={canWrite ? "Create task" : undefined}
        onPrimary={() => setEditing(null)}
        actions={
          <button className="btn btn-secondary" type="button" onClick={() => setVersion((current) => current + 1)}>
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />
      <SavedViewToolbar registerKey="TASKS" currentQuery={viewQuery} onApply={applyView} />
      <form className="filter-bar deadline-filter-bar" onSubmit={applySearch}>
        <label className="filter-search">
          <span className="sr-only">Search tasks</span>
          <Search className="icon" size={16} aria-hidden />
          <input className="control" type="search" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Search title or description…" maxLength={100} />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Task status</span>
          <select className="control" value={status} onChange={(event) => updateParams({ status: event.target.value })}>
            <option value="">All statuses</option>
            <option value="TODO">TO DO</option>
            <option value="IN_PROGRESS">IN PROGRESS</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Linked record type</span>
          <select className="control" value={linkedEntityType} onChange={(event) => updateParams({ linkedEntityType: event.target.value })}>
            <option value="">All linked types</option>
            <option value="GAP">Gap</option>
            <option value="CAPA">CAPA</option>
            <option value="RISK">Risk</option>
            <option value="AUDIT">Audit event</option>
          </select>
        </label>
        <label className="deadline-check">
          <input type="checkbox" checked={overdue} onChange={(event) => updateParams({ overdue: event.target.checked ? "true" : "" })} /> Overdue only
        </label>
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>

      {resource.loading ? (
        <LoadingState label="Loading Tasks…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : rows.length === 0 ? (
        <section className="card empty-state" id="page-content">
          <Inbox size={28} />
          <h3>No tasks match this view</h3>
          <p>Create a task or adjust the current filters.</p>
        </section>
      ) : (
        <section className="card table-card" id="page-content" data-testid="tasks-register-table">
          <div className="table-wrap">
            <table className="data-table">
              <caption>Tasks — {meta?.total ?? rows.length} result{(meta?.total ?? rows.length) === 1 ? "" : "s"}</caption>
              <thead>
                <tr>
                  <SortableTh column="title" label="Task" orderBy={orderBy} order={order} onSort={toggleSort} />
                  <SortableTh column="status" label="Status" orderBy={orderBy} order={order} onSort={toggleSort} />
                  <th>Owner</th>
                  <th>Linked record</th>
                  <SortableTh column="dueDate" label="Due date" orderBy={orderBy} order={order} onSort={toggleSort} />
                  {canWrite ? <th><span className="sr-only">Actions</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((task) => (
                  <tr key={task.id} className={task.overdue ? "register-row-overdue" : undefined}>
                    <td><div className="cell-title"><strong>{task.title}</strong><small>{task.description ?? "No description"}</small></div></td>
                    <td><Badge>{label(task.status)}</Badge></td>
                    <td>{task.owner?.name ?? "Unassigned"}</td>
                    <td><div className="cell-title"><strong>{task.linked.code}</strong><small>{task.linked.title}</small></div></td>
                    <td>{task.dueDate ?? "—"}{task.overdue ? <small className="deadline-overdue"> Overdue</small> : null}</td>
                    {canWrite ? (
                      <td>
                        <div className="button-row">
                          <button className="icon-button" type="button" aria-label={`Edit ${task.title}`} onClick={() => setEditing(task)}><Edit3 size={15} /></button>
                          <button className="icon-button" type="button" aria-label={`Delete ${task.title}`} onClick={() => void remove(task)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(meta?.totalPages ?? 1) > 1 ? (
            <div className="pagination">
              <button className="btn btn-secondary" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} of {meta?.totalPages}</span>
              <button className="btn btn-secondary" type="button" disabled={page >= (meta?.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          ) : null}
        </section>
      )}

      {editing !== undefined ? (
        <TaskFormModal
          task={editing ?? undefined}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            setVersion((current) => current + 1);
            showToast("success", editing ? "Task updated" : "Task created", "");
          }}
        />
      ) : null}
    </div>
  );
}
