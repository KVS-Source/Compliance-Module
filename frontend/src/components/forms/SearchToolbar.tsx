import { Search, SlidersHorizontal } from "lucide-react";

interface SearchToolbarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  status?: string;
  onStatusChange?: (value: string) => void;
}

export function SearchToolbar({
  value,
  onChange,
  placeholder,
  status,
  onStatusChange,
}: SearchToolbarProps) {
  return (
    <div className="filter-bar">
      <label className="filter-search">
        <span className="sr-only">Search records</span>
        <Search className="icon" size={16} />
        <input
          className="control"
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </label>
      {onStatusChange ? (
        <label className="toolbar-select">
          <SlidersHorizontal size={15} />
          <span className="sr-only">Filter by status</span>
          <select className="control" value={status} onChange={(event) => onStatusChange(event.target.value)}>
            <option>All Statuses</option>
            <option>ACTIVE</option>
            <option>DISABLED</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}
