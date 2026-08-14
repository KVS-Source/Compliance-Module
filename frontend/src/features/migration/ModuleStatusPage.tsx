import {
  ArrowLeft,
  Blocks,
  CalendarClock,
  CheckCircle2,
  Database,
  Link2,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { routeByPath } from "../../app/routeDefinitions";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { NotFoundPage } from "./PendingPage";

export function ModuleStatusPage() {
  const location = useLocation();
  const route = routeByPath.get(location.pathname);

  if (!route) return <NotFoundPage />;

  const awaitingIntegration = route.status === "AWAITING_INTEGRATION";
  const compatibility = route.status === "COMPATIBILITY";
  const statusLabel =
    route.statusLabel ??
    (awaitingIntegration
      ? "Awaiting GenRAC Access"
      : compatibility
        ? "Compatibility Route"
        : "In Development");

  return (
    <div className="page module-status-page" data-testid="module-status-page">
      <PageHeader
        title={route.title}
        section={route.section}
        description={route.description}
      />

      <section
        className={`card module-status-hero ${
          awaitingIntegration ? "module-status-integration" : ""
        }`}
      >
        <div className="module-status-icon" aria-hidden>
          {awaitingIntegration ? <Database size={26} /> : <Blocks size={26} />}
        </div>
        <div>
          <Badge tone={awaitingIntegration ? "blue" : "amber"}>
            {statusLabel}
          </Badge>
          <h2>
            {awaitingIntegration
              ? "No live GenRAC connection is configured"
              : compatibility
                ? "This URL is retained for backwards compatibility"
              : "This module is not enabled for operational use"}
          </h2>
          {awaitingIntegration ? (
            <>
              <p data-testid="genrac-status-message">
                GenRAC and GenBioCa are independent systems. The approved
                integration direction is to read selected master data from
                GenRAC into GenBioCa through a one-way, read-only connection.
              </p>
              <p>
                Client access and interface details are still pending. A
                manual or CSV process is planned independently and is not
                represented here as a working integration.
              </p>
            </>
          ) : compatibility ? (
            <p data-testid="compatibility-status-message">
              This route is not an operational authority and is hidden from
              product navigation and search. Use the current product
              navigation to find implemented modules.
            </p>
          ) : (
            <p data-testid="development-status-message">
              This module is part of the approved GenBioCa Compliance Platform
              and is currently being completed. It is not enabled for
              operational use in this UAT release.
            </p>
          )}
        </div>
      </section>

      <div className="module-status-grid">
        <section className="card module-status-card">
          <div className="module-status-card-heading">
            <CheckCircle2 size={19} aria-hidden />
            <h2>Planned capabilities</h2>
          </div>
          <ul>
            {(route.plannedCapabilities ?? [
              "Complete the reviewed workflow",
              "Connect an authorised API",
              "Add acceptance and tenant-isolation coverage",
            ]).map((capability) => (
              <li key={capability}>{capability}</li>
            ))}
          </ul>
        </section>

        <section className="card module-status-card">
          <div className="module-status-card-heading">
            <Link2 size={19} aria-hidden />
            <h2>Dependency or blocker</h2>
          </div>
          <p>
            {route.dependency ??
              "Reviewed API authority and workflow acceptance criteria are still required."}
          </p>
        </section>

        <section className="card module-status-card">
          <div className="module-status-card-heading">
            <CalendarClock size={19} aria-hidden />
            <h2>Target milestone</h2>
          </div>
          <p>{route.targetMilestone ?? "Post-UAT product milestone"}</p>
        </section>
      </div>

      <Link className="btn btn-secondary module-status-back" to={route.backPath ?? "/dashboard"}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>
    </div>
  );
}
