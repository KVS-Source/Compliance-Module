import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Dashboard chart primitives.
 *
 * These are deliberately plain SVG and CSS rather than a charting library: the
 * bundle already ships no chart dependency, and every mark here is simple
 * enough that adding one would cost more than it saves.
 *
 * Two conventions hold throughout:
 *
 *  - a series colour never carries meaning on its own. Every mark is paired
 *    with a printed label and value, so the chart is readable without colour
 *    vision and in a black-and-white printout;
 *  - a section with no rows renders `emptyLabel`, never a zeroed axis. An empty
 *    company must look empty.
 */

/** Status hues. Ordered so red and green are never adjacent in a legend. */
export const STATUS_COLOURS: Record<string, string> = {
  DRAFT: "#6b7280",
  SUBMITTED: "#2563eb",
  APPROVED: "#16a34a",
  ARCHIVED: "#7c3aed",
  REJECTED: "#dc2626",
};

/** Legend order for Evidence lifecycle, chosen for colour-vision separation. */
export const EVIDENCE_STATUS_ORDER = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "ARCHIVED",
  "REJECTED",
];

const SERIES_COLOURS = ["#2563eb", "#16a34a"];

export const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-GB").format(value);

export const formatDate = (value: string | null) =>
  value === null
    ? "—"
    : new Date(value).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

export const formatDateTime = (value: string | null) =>
  value === null
    ? "—"
    : new Date(value).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

export function ChartSection({
  title,
  subtitle,
  source,
  action,
  isEmpty,
  emptyLabel,
  restricted,
  children,
  testId,
}: {
  title: string;
  subtitle: string;
  /** How the numbers were derived, printed under the chart. */
  source?: string;
  action?: ReactNode;
  isEmpty: boolean;
  emptyLabel: string;
  /** True when the API withheld this section for lack of permission. */
  restricted?: boolean;
  children: ReactNode;
  testId: string;
}) {
  return (
    <section className="card chart-card" data-testid={testId}>
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {action}
      </header>
      {restricted ? (
        <p className="chart-empty" data-testid={`${testId}-restricted`}>
          Your role does not include permission to read this data.
        </p>
      ) : isEmpty ? (
        <p className="chart-empty" data-testid={`${testId}-empty`}>
          {emptyLabel}
        </p>
      ) : (
        children
      )}
      {source && !restricted ? <p className="chart-source">{source}</p> : null}
    </section>
  );
}

/**
 * Grouped vertical bars for two count series sharing one axis.
 *
 * Both series are counts of KPIs, so they belong on the same scale. Values of
 * different units would need separate charts — this component deliberately
 * offers no second axis.
 */
export function GroupedBarChart({
  rows,
  seriesLabels,
  testId,
}: {
  rows: Array<{ label: string; values: [number, number]; caption?: string }>;
  seriesLabels: [string, string];
  testId: string;
}) {
  const max = Math.max(1, ...rows.flatMap((row) => row.values));
  return (
    <div className="chart-bars" data-testid={testId}>
      <ul className="chart-legend">
        {seriesLabels.map((label, index) => (
          <li key={label}>
            <span
              className="legend-swatch"
              style={{ background: SERIES_COLOURS[index] }}
            />
            {label}
          </li>
        ))}
      </ul>
      <div className="grouped-bars" role="list">
        {rows.map((row) => (
          <div className="grouped-bar-column" role="listitem" key={row.label}>
            <div className="grouped-bar-pair">
              {row.values.map((value, index) => (
                <span
                  className="grouped-bar"
                  key={seriesLabels[index]}
                  style={{
                    height: `${Math.max(2, (value / max) * 100)}%`,
                    background: SERIES_COLOURS[index],
                  }}
                  title={`${row.label} · ${seriesLabels[index]}: ${formatNumber(value)}`}
                />
              ))}
            </div>
            <strong className="grouped-bar-value">
              {formatNumber(row.values[0])} / {formatNumber(row.values[1])}
            </strong>
            <span className="grouped-bar-label">{row.label}</span>
            {row.caption ? (
              <span className="grouped-bar-caption">{row.caption}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Donut over a status distribution, with the total printed in the middle. */
export function StatusDonut({
  slices,
  total,
  totalLabel,
  testId,
}: {
  slices: Array<{ key: string; label: string; count: number; colour: string }>;
  total: number;
  totalLabel: string;
  testId: string;
}) {
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="chart-donut" data-testid={testId}>
      <svg viewBox="0 0 140 140" role="img" aria-label={totalLabel}>
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="var(--grey-200)"
          strokeWidth="16"
        />
        {slices.map((slice) => {
          const fraction = total === 0 ? 0 : slice.count / total;
          // A 2px surface gap keeps adjacent segments from reading as one arc.
          const length = Math.max(0, fraction * circumference - 2);
          const dash = `${length} ${circumference - length}`;
          const rotation = offset;
          offset += fraction * circumference;
          return (
            <circle
              key={slice.key}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={slice.colour}
              strokeWidth="16"
              strokeDasharray={dash}
              strokeDashoffset={-rotation}
              transform="rotate(-90 70 70)"
            >
              <title>{`${slice.label}: ${formatNumber(slice.count)}`}</title>
            </circle>
          );
        })}
        <text className="donut-total" x="70" y="66" textAnchor="middle">
          {formatNumber(total)}
        </text>
        <text className="donut-caption" x="70" y="84" textAnchor="middle">
          total
        </text>
      </svg>
      <ul className="chart-legend chart-legend-stacked">
        {slices.map((slice) => (
          <li key={slice.key}>
            <span
              className="legend-swatch"
              style={{ background: slice.colour }}
            />
            <span className="legend-label">{slice.label}</span>
            <strong>{formatNumber(slice.count)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Horizontal bars for a single count or percentage series.
 *
 * `value` of `null` means the figure could not be derived from the data —
 * an unmapped framework, for instance — and prints `note` instead of a bar.
 */
export function HorizontalBars({
  rows,
  suffix,
  testId,
}: {
  rows: Array<{
    key: string;
    label: string;
    caption?: string;
    value: number | null;
    max: number;
    note?: string;
    colour?: string;
  }>;
  suffix?: string;
  testId: string;
}) {
  return (
    <ul className="chart-hbars" data-testid={testId}>
      {rows.map((row) => (
        <li key={row.key}>
          <div className="hbar-head">
            <span className="hbar-label">
              {row.label}
              {row.caption ? <em>{row.caption}</em> : null}
            </span>
            <strong className="hbar-value">
              {row.value === null
                ? (row.note ?? "Not available")
                : `${formatNumber(row.value)}${suffix ?? ""}`}
            </strong>
          </div>
          <div className="hbar-track">
            {row.value === null ? null : (
              <span
                className="hbar-fill"
                style={{
                  width: `${row.max === 0 ? 0 : Math.max(1, (row.value / row.max) * 100)}%`,
                  background: row.colour ?? "#2563eb",
                }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Likelihood × impact grid.
 *
 * The axis bounds come from the rows, so a company that scores risks 1–3 gets
 * a 3×3 grid rather than a 5×5 grid padded with empty cells it never uses.
 */
export function RiskHeatMap({
  cells,
  maxLikelihood,
  maxImpact,
  testId,
}: {
  cells: Array<{ likelihood: number; impact: number; count: number }>;
  maxLikelihood: number;
  maxImpact: number;
  testId: string;
}) {
  const peak = Math.max(1, ...cells.map((cell) => cell.count));
  const lookup = new Map(
    cells.map((cell) => [`${cell.likelihood}:${cell.impact}`, cell.count]),
  );
  const impacts = Array.from({ length: maxImpact }, (_, index) => maxImpact - index);
  const likelihoods = Array.from({ length: maxLikelihood }, (_, index) => index + 1);
  return (
    <div className="chart-heatmap" data-testid={testId}>
      <div
        className="heatmap-grid"
        style={{
          gridTemplateColumns: `auto repeat(${maxLikelihood}, minmax(0, 1fr))`,
        }}
      >
        {impacts.map((impact) => (
          <div className="heatmap-row" key={impact} style={{ display: "contents" }}>
            <span className="heatmap-axis-label">Impact {impact}</span>
            {likelihoods.map((likelihood) => {
              const count = lookup.get(`${likelihood}:${impact}`) ?? 0;
              // One hue, light to dark: intensity is magnitude, not category.
              const intensity = count === 0 ? 0 : 0.16 + (count / peak) * 0.74;
              return (
                <span
                  className={`heatmap-cell ${count > 0 ? "has-risks" : ""}`}
                  key={`${likelihood}:${impact}`}
                  style={{
                    background:
                      count === 0
                        ? "var(--grey-100)"
                        : `rgba(185, 28, 28, ${intensity})`,
                    color: intensity > 0.5 ? "#fff" : "var(--text-primary)",
                  }}
                  title={`Likelihood ${likelihood} × Impact ${impact}: ${formatNumber(count)} open risk(s)`}
                >
                  {count === 0 ? "" : formatNumber(count)}
                </span>
              );
            })}
          </div>
        ))}
        <span />
        {likelihoods.map((likelihood) => (
          <span className="heatmap-axis-label" key={`axis-${likelihood}`}>
            L{likelihood}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A compact list row used by the recent-activity and due-soon panels. */
export function ListRow({
  to,
  primary,
  secondary,
  trailing,
}: {
  to?: string;
  primary: ReactNode;
  secondary: ReactNode;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      <span className="list-row-copy">
        <strong>{primary}</strong>
        <span>{secondary}</span>
      </span>
      {trailing ? <span className="list-row-trailing">{trailing}</span> : null}
    </>
  );
  return to ? (
    <Link className="chart-list-row" to={to}>
      {body}
    </Link>
  ) : (
    <div className="chart-list-row">{body}</div>
  );
}
