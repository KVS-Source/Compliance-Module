import { BookmarkPlus, LoaderCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { savedViewApi } from "../../services/savedViewApi";
import type { SavedView, SavedViewRegisterKey } from "../../types/api";
import { Modal } from "../feedback/Modal";

export function SavedViewToolbar({
  registerKey,
  currentQuery,
  onApply,
}: {
  registerKey: SavedViewRegisterKey;
  currentQuery: Record<string, string>;
  onApply: (query: Record<string, string>) => void;
}) {
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const [views, setViews] = useState<SavedView[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setViews(await savedViewApi.list(registerKey));
    } catch (reason) {
      setViews([]);
      setError(reason instanceof Error ? reason.message : "Saved views could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [registerKey]);

  useEffect(() => {
    setSelectedId("");
    void load();
  }, [contextVersion, load]);

  const select = (id: string) => {
    setSelectedId(id);
    const view = views.find((item) => item.id === id);
    if (view) onApply(view.query);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const created = await savedViewApi.create({
        registerKey,
        name: name.trim(),
        query: currentQuery,
      });
      setViews((current) =>
        [...current, created].sort((left, right) => left.name.localeCompare(right.name)),
      );
      setSelectedId(created.id);
      setName("");
      setSaveOpen(false);
      showToast("success", "View saved", "This private view is available only to your user in this Company.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The view could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError("");
    try {
      await savedViewApi.delete(selectedId);
      setViews((current) => current.filter((view) => view.id !== selectedId));
      setSelectedId("");
      showToast("success", "Saved view deleted", "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The view could not be deleted.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="saved-view-toolbar" aria-label="Saved views">
        <label>
          <span>Saved view</span>
          <select
            className="control"
            aria-label="Saved view"
            value={selectedId}
            disabled={loading}
            onChange={(event) => select(event.target.value)}
          >
            <option value="">Current filters</option>
            {views.map((view) => (
              <option value={view.id} key={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            setError("");
            setSaveOpen(true);
          }}
        >
          <BookmarkPlus size={15} /> Save current view
        </button>
        {selectedId ? (
          <button
            className="btn btn-ghost"
            type="button"
            disabled={saving}
            onClick={() => void remove()}
            aria-label="Delete selected saved view"
          >
            <Trash2 size={15} /> Delete
          </button>
        ) : null}
        {loading ? <LoaderCircle className="spin" size={16} aria-label="Loading saved views" /> : null}
        {error && !saveOpen ? <small role="alert">{error}</small> : null}
        <small>Private to your user · filter and sort only</small>
      </section>

      {saveOpen ? (
        <Modal
          title="Save current view"
          onClose={() => setSaveOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" type="button" onClick={() => setSaveOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" form="saved-view-form" disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Save view"}
              </button>
            </>
          }
        >
          <form id="saved-view-form" onSubmit={save}>
            {error ? <div className="form-error" role="alert">{error}</div> : null}
            <label className="field">
              <span>View name</span>
              <input
                className="control"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoFocus
                required
              />
            </label>
            <p className="detail-help">
              Saves the current register filters and column sort. Page number is not saved.
            </p>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
