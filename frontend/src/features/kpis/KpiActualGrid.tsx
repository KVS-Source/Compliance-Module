import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "../../components/feedback/Badge";
import { kpiApi } from "../../services/kpiApi";
import type { KpiConfiguration } from "../../types/api";
import { kpiActualSubmissionError } from "../../utils/fieldErrors";

/**
 * Multi-row KPI actual entry.
 *
 * A department owner reporting a monthly cycle would otherwise repeat the
 * single-record form once per KPI. This lists every active configuration for a
 * chosen period and submits the rows that carry a value.
 *
 * Rows are submitted one at a time against the existing `POST /kpi-actuals`
 * rather than through a batch endpoint. Each submission computes RAG, may raise
 * an automatic Risk and writes its own audit event, so a single transaction
 * would make one rejected value discard a whole cycle of valid entries. Each
 * row therefore reports its own outcome and a failure never blocks its
 * neighbours.
 *
 * Approved targets are deliberately not pre-loaded: `listApprovedTargets` is
 * per configuration, and this Company has 91 of them. The server returns the
 * target snapshot, variance and RAG on submission, which is when the comparison
 * actually matters.
 */

type RowState = {
  value: string;
  status: "idle" | "saving" | "saved" | "error";
  message?: string;
  rag?: string | null;
  code?: string;
};

const ragTone = (rag?: string | null): "green" | "amber" | "red" | "grey" =>
  rag === "GREEN"
    ? "green"
    : rag === "AMBER"
      ? "amber"
      : rag === "RED"
        ? "red"
        : "grey";

export function KpiActualGrid({
  configurations,
  canWrite,
}: {
  configurations: KpiConfiguration[];
  canWrite: boolean;
}) {
  const [period, setPeriod] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [submitting, setSubmitting] = useState(false);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return configurations;
    return configurations.filter((configuration) =>
      `${configuration.kpi.code ?? ""} ${configuration.kpi.name ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [configurations, search]);

  const pending = Object.entries(rows).filter(
    ([, row]) => row.value.trim() !== "" && row.status !== "saved",
  );

  const setValue = (id: string, value: string) =>
    setRows((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { status: "idle" }), value, status: "idle" },
    }));

  const submitAll = async () => {
    if (!canWrite || !period.trim() || pending.length === 0) return;
    setSubmitting(true);
    for (const [id] of pending) {
      setRows((current) => ({
        ...current,
        [id]: { ...current[id]!, status: "saving" },
      }));
      try {
        const saved = await kpiApi.submitActual({
          kpiConfigurationId: id,
          period: period.trim(),
          actualValue: rows[id]!.value.trim(),
          comments: null,
        });
        setRows((current) => ({
          ...current,
          [id]: {
            ...current[id]!,
            status: "saved",
            rag: saved.ragStatus,
            code: saved.code,
            message: saved.risk ? `${saved.risk.code} raised` : "Submitted",
          },
        }));
      } catch (error) {
        const mapped = kpiActualSubmissionError(error);
        setRows((current) => ({
          ...current,
          [id]: {
            ...current[id]!,
            status: "error",
            message:
              mapped.formError ??
              Object.values(mapped.fieldErrors)[0] ??
              "Not submitted.",
          },
        }));
      }
    }
    setSubmitting(false);
  };

  const savedCount = Object.values(rows).filter(
    (row) => row.status === "saved",
  ).length;
  const errorCount = Object.values(rows).filter(
    (row) => row.status === "error",
  ).length;

  return (
    <section className="card" data-testid="kpi-actual-grid">
      <header className="card-head">
        <div>
          <h2>Grid entry</h2>
          <p>
            Enter a value against any number of KPIs for one period. Rows are
            submitted individually, so one rejected value does not discard the
            rest.
          </p>
        </div>
      </header>
      <div className="card-pad">
        <div className="filter-bar">
          <label className="field">
            <span>Period *</span>
            <input
              className="control"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              placeholder="2026-Q4"
              data-testid="kpi-grid-period"
            />
          </label>
          <label className="field">
            <span>Filter KPIs</span>
            <input
              className="control"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search code or name…"
              data-testid="kpi-grid-search"
            />
          </label>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void submitAll()}
            disabled={
              !canWrite || submitting || !period.trim() || pending.length === 0
            }
            data-testid="kpi-grid-submit"
          >
            <Save size={15} />
            {submitting
              ? "Submitting…"
              : `Submit ${pending.length || ""} ${pending.length === 1 ? "entry" : "entries"}`.trim()}
          </button>
        </div>

        {savedCount > 0 || errorCount > 0 ? (
          <p className="chart-source" data-testid="kpi-grid-summary">
            {savedCount} submitted
            {errorCount > 0 ? `, ${errorCount} not accepted` : ""}.
          </p>
        ) : null}

        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">
              KPI actual grid entry — {visible.length} configurations
            </caption>
            <thead>
              <tr>
                <th scope="col">KPI</th>
                <th scope="col">Scope</th>
                <th scope="col">Actual value</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((configuration) => {
                const row = rows[configuration.id];
                return (
                  <tr key={configuration.id}>
                    <td>
                      <div className="cell-title">
                        <strong>{configuration.kpi.name}</strong>
                        <small className="mono">{configuration.kpi.code}</small>
                      </div>
                    </td>
                    <td>{configuration.department?.name ?? "—"}</td>
                    <td>
                      <input
                        className="control"
                        value={row?.value ?? ""}
                        onChange={(event) =>
                          setValue(configuration.id, event.target.value)
                        }
                        disabled={!canWrite || row?.status === "saved"}
                        inputMode="decimal"
                        aria-label={`Actual value for ${configuration.kpi.code}`}
                        data-testid={`kpi-grid-value-${configuration.kpi.code}`}
                      />
                    </td>
                    <td>
                      {row?.status === "saved" ? (
                        <span className="cell-title">
                          <Badge tone={ragTone(row.rag)}>
                            {row.rag ?? "SUBMITTED"}
                          </Badge>
                          <small>{row.message}</small>
                        </span>
                      ) : row?.status === "error" ? (
                        <small className="form-error">{row.message}</small>
                      ) : row?.status === "saving" ? (
                        <small>Submitting…</small>
                      ) : (
                        <small className="text-muted">—</small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
