import { ArrowLeft, Blocks, Database } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { routeByPath } from "../../app/routeDefinitions";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { NotFoundPage } from "./NotFoundPage";

export function ModuleStatusPage() {
  const { pathname } = useLocation();
  const route = routeByPath.get(pathname);
  if (!route) return <NotFoundPage />;
  const integration = route.status === "AWAITING_INTEGRATION";
  const compatibility = route.status === "COMPATIBILITY";
  return (
    <div className="page module-status-page" data-testid="module-status-page">
      <PageHeader title={route.title} section={route.section} description={compatibility ? "This address has been retired." : "This feature is not available."} />
      <section className="card module-status-hero">
        <div className="module-status-icon" aria-hidden="true">
          {integration ? <Database size={26} /> : <Blocks size={26} />}
        </div>
        <div>
          <Badge tone={integration ? "blue" : "amber"}>
            {compatibility ? "Compatibility Route" : integration ? "Not configured" : "In Development"}
          </Badge>
          <h2>{compatibility ? "Use the current navigation" : integration ? "No connection configured" : "Feature unavailable"}</h2>
          <p data-testid={compatibility ? "compatibility-status-message" : integration ? "genrac-status-message" : "development-status-message"}>
            {compatibility ? "Open a current page from the navigation menu." : integration ? "View connection status in GenRAC Integration." : "This feature is not enabled for operational use."}
          </p>
          {integration ? <Link className="btn btn-secondary" to="/data/genrac-integration">GenRAC Integration</Link> : null}
        </div>
      </section>
      <Link className="btn btn-secondary module-status-back" to={route.backPath ?? "/dashboard"}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>
    </div>
  );
}
