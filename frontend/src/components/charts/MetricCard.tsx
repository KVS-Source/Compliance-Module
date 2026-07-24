import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "amber" | "red" | "purple" | "grey";
}) {
  return (
    <article className="summary-card">
      <div className="card-label"><span className={`card-icon tone-${tone}`}><Icon size={18} /></span><span>{label}</span></div>
      <div className="card-value">{value}</div>
      <div className="card-sub">{note}</div>
    </article>
  );
}
