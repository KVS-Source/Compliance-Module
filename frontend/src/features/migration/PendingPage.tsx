import { ArrowRight, Blocks, ExternalLink } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { PageHeader } from "../../components/feedback/PageHeader";
import { routeByPath } from "../../app/routeDefinitions";

const trace = ["Policy", "Framework", "Rule", "Evidence", "Control", "KPI", "Target vs Actual", "Risk"];

export function PendingPage() {
  const location = useLocation();
  const route = routeByPath.get(location.pathname);
  if (!route) return <NotFoundPage />;
  return <div className="page"><PageHeader title={route.title} section={route.section} description={route.description} />
    <section className="card pending-hero"><span className="feature-icon tone-purple"><Blocks size={22} /></span><div><BadgeLine phase={route.phase} /><h2>Route preserved for its scheduled React migration phase</h2><p>The approved screen name, path, terminology and workflow boundary remain in the router. Its operational UI and backend authority are intentionally not being implemented during React Milestone 1.</p><a className="btn btn-secondary" href="/prototype/GenBioCa-Compliance-Platform.html" target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open approved prototype reference</a></div></section>
    {route.section.includes("KPI") || route.section === "Compliance Management" ? <section className="card"><header className="card-head"><div><h2>Accepted traceability order</h2><p>This business rule remains unchanged.</p></div></header><div className="trace-ribbon">{trace.map((item, index) => <div key={item}><span>{item}</span>{index < trace.length - 1 ? <ArrowRight size={15} /> : null}</div>)}</div></section> : null}
    <div className="grid-3"><section className="card mini-card"><strong>Route</strong><span className="mono">{route.path}</span></section><section className="card mini-card"><strong>Prototype route</strong><span className="mono">{route.legacyHash}</span></section><section className="card mini-card"><strong>API authority</strong><span>{route.api ?? `Scheduled in migration phase ${route.phase}`}</span></section></div>
  </div>;
}

function BadgeLine({ phase }: { phase: number }) {
  return <span className="migration-label">Remaining screen · Phase {phase}</span>;
}

export function NotFoundPage() {
  return <div className="page"><section className="card permission-card"><span className="feature-icon tone-amber"><Blocks size={22} /></span><h1>Page not found</h1><p>The requested React route is not part of the approved route inventory.</p><Link className="btn btn-primary" to="/dashboard">Return to Dashboard</Link></section></div>;
}
