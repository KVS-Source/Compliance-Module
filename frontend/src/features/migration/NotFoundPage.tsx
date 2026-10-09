import { Blocks } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="page">
      <section className="card permission-card">
        <span className="feature-icon tone-amber"><Blocks size={22} /></span>
        <h1>Page not found</h1>
        <p>This address is unavailable.</p>
        <Link className="btn btn-primary" to="/dashboard">Return to Dashboard</Link>
      </section>
    </div>
  );
}
