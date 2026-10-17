import { CircleHelp, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Modal } from "./Modal";

interface PageHeaderProps {
  title: string;
  section: string;
  description: string;
  connected?: boolean;
  primaryLabel?: string;
  onPrimary?: () => void;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  section,
  description,
  primaryLabel,
  onPrimary,
  actions,
}: PageHeaderProps) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="breadcrumb">
            <Link to="/dashboard">Home</Link>
            <span>/</span>
            {section}
          </div>
          <h1>{title}</h1>
        </div>
        <div className="button-row">
          {actions}
          {primaryLabel ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={onPrimary}
            >
              <Plus size={16} /> {primaryLabel}
            </button>
          ) : null}
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setHelpOpen(true)}
          >
            <CircleHelp size={16} /> Help
          </button>
        </div>
      </header>

      {helpOpen ? (
        <Modal
          title={`${title} help`}
          onClose={() => setHelpOpen(false)}
          footer={
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setHelpOpen(false)}
            >
              Close
            </button>
          }
        >
          <div className="page-help-content">
            <p>{description}</p>
            <div className="page-help-links">
              <Link to="/dashboard" onClick={() => setHelpOpen(false)}>
                Dashboard
              </Link>
              <Link to="/settings" onClick={() => setHelpOpen(false)}>
                Settings
              </Link>
              <Link to="/audit-trail" onClick={() => setHelpOpen(false)}>
                Audit Trail
              </Link>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
