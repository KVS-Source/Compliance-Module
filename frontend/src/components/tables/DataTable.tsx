import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Eye,
  Inbox,
  Pencil,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { SortOrder } from "../../hooks/useRegisterQueryState";
import { SortableTh } from "./SortableTh";

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  searchable?: (row: T) => string;
  /** When set with sort props, renders a SortableTh using this server column key. */
  sortColumn?: string;
}

interface DataTableProps<T extends { id: string }> {
  rows: T[];
  columns: Column<T>[];
  caption: string;
  companyName?: string;
  onView?: (row: T) => void;
  onEdit?: (row: T) => void;
  onMore?: (row: T) => void;
  selectable?: boolean;
  pageSize?: number;
  orderBy?: string;
  order?: SortOrder;
  onSort?: (column: string) => void;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  caption,
  companyName,
  onView,
  onEdit,
  onMore,
  selectable = false,
  pageSize = 10,
  orderBy = "",
  order = "asc",
  onSort,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [pageSize, rows, safePage],
  );
  return (
    <section className="card table-card">
      <div className="table-wrap">
        <table className="data-table">
          <caption>
            {caption} — {rows.length} result{rows.length === 1 ? "" : "s"}
            {companyName ? ` for ${companyName}` : ""}
          </caption>
          <thead>
            <tr>
              {selectable ? (
                <th>
                  <input type="checkbox" aria-label="Select all rows" />
                </th>
              ) : null}
              {columns.map((column) =>
                column.sortColumn && onSort ? (
                  <SortableTh
                    key={column.key}
                    column={column.sortColumn}
                    label={column.label}
                    orderBy={orderBy}
                    order={order}
                    onSort={onSort}
                  />
                ) : (
                  <th key={column.key}>{column.label}</th>
                ),
              )}
              {onView || onEdit || onMore ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {pageRows.length ? (
              pageRows.map((row) => (
                <tr key={row.id}>
                  {selectable ? (
                    <td>
                      <input type="checkbox" aria-label={`Select ${row.id}`} />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td key={column.key}>{column.render(row)}</td>
                  ))}
                  {onView || onEdit || onMore ? (
                    <td>
                      <div className="actions">
                        {onView ? (
                          <button
                            className="tiny-btn"
                            type="button"
                            aria-label={`View ${row.id}`}
                            onClick={() => onView(row)}
                          >
                            <Eye size={15} />
                          </button>
                        ) : null}
                        {onEdit ? (
                          <button
                            className="tiny-btn"
                            type="button"
                            aria-label={`Edit ${row.id}`}
                            onClick={() => onEdit(row)}
                          >
                            <Pencil size={15} />
                          </button>
                        ) : null}
                        {onMore ? (
                          <button
                            className="tiny-btn"
                            type="button"
                            aria-label={`More actions for ${row.id}`}
                            onClick={() => onMore(row)}
                          >
                            <Ellipsis size={15} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={
                    columns.length +
                    (selectable ? 1 : 0) +
                    (onView || onEdit || onMore ? 1 : 0)
                  }
                >
                  <div className="empty-state">
                    <Inbox size={24} />
                    <h3>No records match this view</h3>
                    <p>Adjust the search or status filter.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="table-foot">
        <span>
          Showing {rows.length ? (safePage - 1) * pageSize + 1 : 0}–
          {Math.min(safePage * pageSize, rows.length)} of {rows.length}
        </span>
        <div className="pagination" aria-label={`${caption} pages`}>
          <button
            className="page-btn"
            type="button"
            aria-label="Previous page"
            disabled={safePage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft size={14} />
          </button>
          <span>
            Page {safePage} of {totalPages}
          </span>
          <button
            className="page-btn"
            type="button"
            aria-label="Next page"
            disabled={safePage === totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </footer>
    </section>
  );
}
