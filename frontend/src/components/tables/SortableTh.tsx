import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortOrder } from "../../hooks/useRegisterQueryState";

type SortableThProps = {
  column: string;
  label: string;
  orderBy: string;
  order: SortOrder;
  onSort: (column: string) => void;
  className?: string;
};

/**
 * Accessible sortable column header. Sets `aria-sort` on the active column and
 * cycles asc → desc → clear on repeated clicks (handled by the parent toggle).
 */
export function SortableTh({
  column,
  label,
  orderBy,
  order,
  onSort,
  className,
}: SortableThProps) {
  const active = orderBy === column;
  const ariaSort = active
    ? order === "desc"
      ? "descending"
      : "ascending"
    : "none";
  const Icon = active ? (order === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;

  return (
    <th aria-sort={ariaSort} className={className} scope="col">
      <button
        className="sort-btn"
        type="button"
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <Icon size={14} aria-hidden />
        <span className="sr-only">
          {active
            ? `Sorted ${order === "desc" ? "descending" : "ascending"}. Activate to change sort.`
            : "Not sorted. Activate to sort ascending."}
        </span>
      </button>
    </th>
  );
}
