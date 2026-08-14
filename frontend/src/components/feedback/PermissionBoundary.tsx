import { LockKeyhole } from "lucide-react";
import type { PropsWithChildren } from "react";
import { useAuth } from "../../context/AuthContext";

export function PermissionBoundary({
  permission,
  children,
}: PropsWithChildren<{ permission?: string }>) {
  const { hasPermission } = useAuth();
  if (hasPermission(permission)) return children;
  return (
    <section className="card permission-card" id="page-content">
      <span className="feature-icon tone-amber"><LockKeyhole size={21} /></span>
      <h1>Permission required</h1>
      <p>Your active Company role does not include <code>{permission}</code>. The route is preserved, but its database records are not requested.</p>
    </section>
  );
}
