import { TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/feedback/Modal";
import { controlApi } from "../../services/controlApi";
import type { Control } from "../../types/api";
import { controlLifecycleError } from "../../utils/fieldErrors";

export type ControlLifecycleKind = "activate" | "deactivate" | "archive";

interface ControlLifecycleDialogProps {
  kind: ControlLifecycleKind;
  control: Pick<
    Control,
    "id" | "code" | "title" | "lifecycleStatus" | "activeCheckpointCount"
  >;
  onClose: () => void;
  onCompleted: () => void;
}

const TITLES: Record<ControlLifecycleKind, string> = {
  activate: "Activate Control",
  deactivate: "Deactivate Control",
  archive: "Archive Control",
};

export function ControlLifecycleDialog({
  kind,
  control,
  onClose,
  onCompleted,
}: ControlLifecycleDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "activate") {
        await controlApi.activateControl(control.id);
      } else if (kind === "deactivate") {
        await controlApi.deactivateControl(control.id);
      } else {
        await controlApi.archiveControl(control.id);
      }
      onCompleted();
    } catch (caught) {
      setError(controlLifecycleError(caught, "controls:write"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={TITLES[kind]}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="control-lifecycle-form"
            disabled={busy}
            data-testid={`control-lifecycle-${kind}-confirm`}
          >
            {busy
              ? "Working…"
              : kind === "activate"
                ? "Activate"
                : kind === "deactivate"
                  ? "Deactivate"
                  : "Archive Control"}
          </button>
        </>
      }
    >
      <form
        id="control-lifecycle-form"
        className="stack"
        onSubmit={(event) => void onSubmit(event)}
      >
        {error ? (
          <div
            className="banner warning"
            role="alert"
            data-testid="control-lifecycle-error"
          >
            {error}
          </div>
        ) : null}

        <p>
          <strong>
            {control.code} · {control.title}
          </strong>
        </p>
        <p className="muted">Current lifecycle: {control.lifecycleStatus}.</p>

        {kind === "activate" ? (
          <p className="muted">
            Activating returns this Control to an ACTIVE lifecycle state so
            mappings and operational workflows may continue.
          </p>
        ) : null}

        {kind === "deactivate" ? (
          <p className="muted">
            Deactivating sets lifecycle to INACTIVE. The Control remains
            readable and can be activated again later.
          </p>
        ) : null}

        {kind === "archive" ? (
          <div className="banner warning" role="status">
            <TriangleAlert size={15} aria-hidden /> Archival is terminal.
            Mapping history remains readable. Active Checkpoints block archival
            ({control.activeCheckpointCount} active). There is no unarchive
            action.
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
