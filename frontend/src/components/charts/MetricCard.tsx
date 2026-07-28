import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "blue",
  to,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "amber" | "red" | "purple" | "grey";
  to?: string;
}) {
  const content = (
    <>
      <div className="card-label"><span className={`card-icon tone-${tone}`}><Icon size={18} /></span><span>{label}</span></div>
      <div className="card-value">{value}</div>
      <div className="card-sub">{note}</div>
    </>
  );
  return to ? (
    <Link
      className="summary-card clickable summary-card-link"
      to={to}
      aria-label={`${label}: ${value}. Open ${label}`}
    >
      {content}
    </Link>
  ) : (
    <article className="summary-card">{content}</article>
  );
}
