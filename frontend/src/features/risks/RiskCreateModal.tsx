import { Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../components/feedback/Modal";
import { ApiError } from "../../services/apiClient";
import { masterDataApi } from "../../services/masterDataApi";
import { riskApi } from "../../services/riskApi";
import type { CompanyUser, Risk } from "../../types/api";

export function RiskCreateModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (risk: Risk) => void;
}) {
  const [values, setValues] = useState({
    title: "",
    description: "",
    category: "",
    inherentLikelihood: "3",
    inherentImpact: "3",
    ownerId: "",
  });
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingUsers(true);
    void masterDataApi
      .listUsers()
      .then((items) => {
        if (active) setUsers(items);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Company users could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingUsers(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const setField = (key: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const risk = await riskApi.create({
        title: values.title.trim(),
        description: values.description.trim(),
        category: values.category.trim(),
        inherentLikelihood: Number(values.inherentLikelihood),
        inherentImpact: Number(values.inherentImpact),
        ownerId: values.ownerId || null,
      });
      onSaved(risk);
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : reason instanceof Error
            ? reason.message
            : "The risk could not be created.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add manual risk"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" form="manual-risk-form" disabled={saving || loadingUsers}>
            <Save size={15} /> {saving ? "Creating…" : "Create risk"}
          </button>
        </>
      }
    >
      <form id="manual-risk-form" className="form-grid" onSubmit={(event) => void submit(event)}>
        {error ? <div className="banner warning field-span" role="alert">{error}</div> : null}
        <div className="field span-2">
          <label htmlFor="risk-title">Title</label>
          <input id="risk-title" className="control" value={values.title} onChange={(event) => setField("title", event.target.value)} maxLength={300} required />
        </div>
        <div className="field span-2">
          <label htmlFor="risk-description">Description</label>
          <textarea id="risk-description" className="control" value={values.description} onChange={(event) => setField("description", event.target.value)} maxLength={5_000} rows={4} required />
        </div>
        <div className="field">
          <label htmlFor="risk-category">Category</label>
          <input id="risk-category" className="control" value={values.category} onChange={(event) => setField("category", event.target.value)} maxLength={200} required />
        </div>
        <div className="field">
          <label htmlFor="risk-owner">Owner</label>
          <select id="risk-owner" className="control" value={values.ownerId} onChange={(event) => setField("ownerId", event.target.value)}>
            <option value="">Unassigned</option>
            {users.map((user) => <option value={user.id} key={user.id}>{user.name} ({user.code})</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="risk-likelihood">Inherent likelihood</label>
          <select id="risk-likelihood" className="control" value={values.inherentLikelihood} onChange={(event) => setField("inherentLikelihood", event.target.value)}>
            {[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="risk-impact">Inherent impact</label>
          <select id="risk-impact" className="control" value={values.inherentImpact} onChange={(event) => setField("inherentImpact", event.target.value)}>
            {[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </div>
        <p className="field-span">
          The server assigns the next RSK code and derives the general risk level from the inherent score.
        </p>
      </form>
    </Modal>
  );
}
