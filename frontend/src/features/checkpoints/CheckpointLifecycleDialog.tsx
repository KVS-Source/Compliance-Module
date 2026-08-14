import { TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Modal } from "../../components/feedback/Modal";
import { checkpointApi } from "../../services/checkpointApi";
import type { Checkpoint } from "../../types/api";
import { checkpointLifecycleError } from "../../utils/fieldErrors";

export type CheckpointLifecycleKind = "activate" | "deactivate" | "archive";

interface CheckpointLifecycleDialogProps {
  kind: CheckpointLifecycleKind;
  checkpoint: Pick<
    Checkpoint,
    "id" | "code" | "title" | "lifecycleStatus" | "control"
  >;
  onClose: () => void;
  onCompleted: () => void;
}

const TITLES: Record<CheckpointLifecycleKind, string> = {
  activate: "Activate Checkpoint",
  deactivate: "Deactivate Checkpoint",
  archive: "Archive Checkpoint",
};

export function CheckpointLifecycleDialog({
  kind,
  checkpoint,
  onClose,
  onCompleted,
}: CheckpointLifecycleDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "activate") {
        await checkpointApi.activateCheckpoint(checkpoint.id);
      } else if (kind === "deactivate") {
        await checkpointApi.deactivateCheckpoint(checkpoint.id);
      } else {
        await checkpointApi.archiveCheckpoint(checkpoint.id);
      }
      onCompleted();
    } catch (caught) {
      setError(checkpointLifecycleError(caught, "checkpoints:write"));
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
            form="checkpoint-lifecycle-form"
            disabled={busy}
            data-testid={`checkpoint-lifecycle-${kind}-confirm`}
          >
            {busy
              ? "Working…"
              : kind === "activate"
                ? "Activate"
                : kind === "deactivate"
                  ? "Deactivate"
                  : "Archive Checkpoint"}
          </button>
        </>
      }
    >
      <form
        id="checkpoint-lifecycle-form"
        className="stack"
        onSubmit={(event) => void onSubmit(event)}
      >
        {error ? (
          <div
            className="banner warning"
            role="alert"
            data-testid="checkpoint-lifecycle-error"
          >
            {error}
          </div>
        ) : null}

        <p>
          <strong>
            {checkpoint.code} · {checkpoint.title}
          </strong>
        </p>
        <p className="muted">
          Current lifecycle: {checkpoint.lifecycleStatus}.
          {checkpoint.control
            ? ` Parent Control: ${checkpoint.control.code} (${checkpoint.control.lifecycleStatus}).`
            : null}
        </p>

        {kind === "activate" ? (
          <p className="muted">
            Activating returns this Checkpoint to ACTIVE so Reviews may be
            submitted. Activation is blocked when the parent Control is
            ARCHIVED.
          </p>
        ) : null}

        {kind === "deactivate" ? (
          <p className="muted">
            Deactivating sets lifecycle to INACTIVE. The Checkpoint remains
            readable and can be activated again later. Reviews require ACTIVE
            status.
          </p>
        ) : null}

        {kind === "archive" ? (
          <div className="banner warning" role="status">
            <TriangleAlert size={15} aria-hidden /> Archival is terminal.
            Review and audit history remain readable. There is no unarchive
            action.
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
