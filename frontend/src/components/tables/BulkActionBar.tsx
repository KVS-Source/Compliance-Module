import { useState } from "react";

/**
 * Bulk action bar for register tables.
 *
 * Actions run one record at a time against the endpoint that already governs
 * that change, so each record keeps its own permission check, validation and
 * audit event. A bulk endpoint that wrote many records in one transaction would
 * either discard valid work because one record was refused, or bypass the
 * per-record rules — neither is acceptable in a governed register.
 *
 * A refusal never stops the records after it. The outcome is handed to the
 * caller rather than rendered here: completing an action reloads the register,
 * which unmounts this component, so a message owned by the bar would vanish
 * before it could be read. The page reports it through the toast layer, which
 * sits above the page and survives the reload.
 */

export type BulkAction = {
  key: string;
  label: string;
  /** Prompt shown when the action needs a value; omit for value-free actions. */
  prompt?: { label: string; placeholder?: string; required?: boolean };
  /** Runs for one record. Throw to mark that record refused. */
  run: (id: string, value: string) => Promise<unknown>;
};

export function BulkActionBar({
  selectedIds,
  actions,
  onClear,
  onCompleted,
}: {
  selectedIds: string[];
  actions: BulkAction[];
  onClear: () => void;
  onCompleted: (summary: { done: number; refused: number }) => void;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [running, setRunning] = useState(false);

  if (selectedIds.length === 0) return null;

  const active = actions.find((action) => action.key === activeKey) ?? null;

  const run = async () => {
    if (!active) return;
    if (active.prompt?.required && !value.trim()) return;
    setRunning(true);
    let done = 0;
    let refused = 0;
    for (const id of selectedIds) {
      try {
        await active.run(id, value.trim());
        done += 1;
      } catch {
        refused += 1;
      }
    }
    setRunning(false);
    setActiveKey(null);
    setValue("");
    onCompleted({ done, refused });
  };

  return (
    <div
      className="bulk-bar"
      role="region"
      aria-label="Bulk actions"
      data-testid="bulk-action-bar"
    >
      <strong data-testid="bulk-selected-count">
        {selectedIds.length} selected
      </strong>

      {active ? (
        <>
          {active.prompt ? (
            <label className="field bulk-bar-field">
              <span className="sr-only">{active.prompt.label}</span>
              <input
                className="control"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={active.prompt.placeholder ?? active.prompt.label}
                aria-label={active.prompt.label}
                data-testid="bulk-action-value"
              />
            </label>
          ) : null}
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void run()}
            disabled={
              running || (active.prompt?.required === true && !value.trim())
            }
            data-testid="bulk-action-confirm"
          >
            {running ? "Applying…" : `Apply ${active.label}`}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              setActiveKey(null);
              setValue("");
            }}
            disabled={running}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          {actions.map((action) => (
            <button
              className="btn btn-secondary"
              type="button"
              key={action.key}
              onClick={() => setActiveKey(action.key)}
              data-testid={`bulk-action-${action.key}`}
            >
              {action.label}
            </button>
          ))}
          <button className="btn btn-ghost" type="button" onClick={onClear}>
            Clear selection
          </button>
        </>
      )}
    </div>
  );
}
