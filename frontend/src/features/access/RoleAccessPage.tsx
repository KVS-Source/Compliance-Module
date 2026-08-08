import { Check, Lock, ShieldCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { accessApi } from "../../services/submissionApi";

/**
 * Role & Access profile matrix, read-only.
 *
 * The production access profiles are the authority on what each role may do,
 * and cannot be edited here. Sanctioned profile assignments are managed from
 * `frontend/src/features/users/UsersPage.tsx` without making this catalogue
 * mutable.
 */
export function RoleAccessPage() {
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const [moduleFilter, setModuleFilter] = useState("");
  const resource = useApiResource(accessApi.profiles, [
    contextVersion,
    user?.activeCompany.id,
  ]);
  const data = resource.data;

  const modules = useMemo(
    () =>
      [
        ...new Set((data?.permissions ?? []).map((entry) => entry.module)),
      ].sort(),
    [data],
  );
  const permissions = useMemo(
    () =>
      (data?.permissions ?? []).filter(
        (entry) => !moduleFilter || entry.module === moduleFilter,
      ),
    [data, moduleFilter],
  );
  const roles = useMemo(
    () => [...(data?.profiles ?? []), ...(data?.additionalRoles ?? [])],
    [data],
  );

  return (
    <div className="page">
      <PageHeader
        title="Role & Access"
        section="Administration"
        description="The production access profiles for this Company, the permissions each one carries and how many active users hold it."
        connected
      />

      {resource.loading ? (
        <LoadingState label="Loading access profiles…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : data ? (
        <>
          <section
            className="card information-card"
            data-testid="role-access-readonly"
          >
            <span className="feature-icon tone-blue">
              <Lock size={19} />
            </span>
            <div>
              <strong>This matrix is read-only in this release</strong>
              <p>
                Role permissions come from the reviewed production access
                profiles rather than from an editable table, so they cannot
                drift from what the API enforces. Assigning a role to a person
                is done from Users; changing what a role may do is a governed
                change to the platform, not a screen action.
              </p>
            </div>
          </section>

          <div className="cards" data-testid="role-access-cards">
            {data.profiles.map((profile) => (
              <article
                className="summary-card"
                key={profile.code}
                data-testid={`role-card-${profile.code}`}
              >
                <div className="card-label">
                  <span className="card-icon tone-blue">
                    <ShieldCheck size={18} />
                  </span>
                  <span>{profile.name}</span>
                </div>
                <div className="card-value">{profile.userCount}</div>
                <div className="card-sub">
                  {profile.userCount === 1 ? "active user" : "active users"} ·{" "}
                  {profile.permissionCount} permissions ·{" "}
                  {profile.provisioned
                    ? profile.enabled
                      ? "Enabled"
                      : "Disabled"
                    : "Not provisioned in this Company"}
                </div>
              </article>
            ))}
          </div>

          {data.additionalRoles.length > 0 ? (
            <section className="card">
              <header className="card-head">
                <div>
                  <h2>Other Company roles</h2>
                  <p>
                    Roles present in this Company that sit outside the
                    production access profiles.
                  </p>
                </div>
              </header>
              <ul className="chart-hbars">
                {data.additionalRoles.map((role) => (
                  <li key={role.code}>
                    <div className="hbar-head">
                      <span className="hbar-label">
                        {role.name}
                        <em>
                          {role.code} · {role.userCount} active user
                          {role.userCount === 1 ? "" : "s"} ·{" "}
                          {role.permissionCount} permissions
                        </em>
                      </span>
                      <strong className="hbar-value">
                        {role.holdsWildcard ? (
                          <Badge tone="amber">Wildcard permission</Badge>
                        ) : (
                          <Badge tone={role.enabled ? "green" : "grey"}>
                            {role.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        )}
                      </strong>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="chart-source">
                A role holding the wildcard permission is a bootstrap artefact.
                Production readiness fails while one is assigned, so it is never
                offered as a production option.
              </p>
            </section>
          ) : null}

          <section className="card">
            <header className="card-head">
              <div>
                <h2>Permission matrix</h2>
                <p>
                  {permissions.length} permission
                  {permissions.length === 1 ? "" : "s"} across {roles.length}{" "}
                  role{roles.length === 1 ? "" : "s"}.
                </p>
              </div>
              <label className="toolbar-select">
                <span className="sr-only">Filter by module</span>
                <select
                  className="control"
                  value={moduleFilter}
                  aria-label="Filter permissions by module"
                  onChange={(event) => setModuleFilter(event.target.value)}
                >
                  <option value="">All modules</option>
                  {modules.map((module) => (
                    <option key={module} value={module}>
                      {module}
                    </option>
                  ))}
                </select>
              </label>
            </header>
            <div className="table-wrap">
              <table className="data-table access-matrix">
                <caption>
                  Role & Access for {user?.activeCompany.name} — read-only
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Permission</th>
                    {roles.map((role) => (
                      <th scope="col" key={role.code}>
                        <span className="access-role-head">
                          {role.name}
                          <em>
                            <Users size={11} /> {role.userCount}
                          </em>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((permission) => (
                    <tr key={permission.code}>
                      <th scope="row">
                        <span className="mono">{permission.code}</span>
                        <em className="access-permission-note">
                          {permission.description}
                        </em>
                      </th>
                      {roles.map((role) => (
                        <td
                          className="access-cell"
                          key={`${role.code}:${permission.code}`}
                        >
                          {role.permissions.includes(permission.code) ? (
                            <span
                              className="access-granted"
                              aria-label={`${role.name} holds ${permission.code}`}
                            >
                              <Check size={14} />
                            </span>
                          ) : (
                            <span
                              className="access-denied"
                              aria-label={`${role.name} does not hold ${permission.code}`}
                            >
                              —
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
