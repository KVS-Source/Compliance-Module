import { CircleHelp, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

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
  connected,
  primaryLabel,
  onPrimary,
  actions,
}: PageHeaderProps) {
  return (
    <header className="page-head">
      <div>
        <div className="breadcrumb">
          <Link to="/dashboard">Home</Link>
          <span>/</span>
          {section}
        </div>
        <h1>
          {title}
          {connected !== undefined ? (
            <span className="sr-only">
              {" "}
              · {connected ? "API connected" : "Prototype workflow"}
            </span>
          ) : null}
        </h1>
        <p>{description}</p>
      </div>
      <div className="button-row">
        {actions}
        {primaryLabel ? (
          <button className="btn btn-primary" type="button" onClick={onPrimary}>
            <Plus size={16} /> {primaryLabel}
          </button>
        ) : null}
        <a
          className="btn btn-ghost"
          href="/prototype/GenBioCa-Compliance-Platform-v2.html"
          target="_blank"
          rel="noreferrer"
        >
          <CircleHelp size={16} /> Help
        </a>
      </div>
    </header>
  );
}
