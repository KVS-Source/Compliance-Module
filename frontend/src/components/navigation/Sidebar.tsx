import {
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { navigationGroups, utilityRoutes } from "../../app/routeDefinitions";
import { GENBIOCA_LOGO } from "../../assets/branding";
import { useAuth } from "../../context/AuthContext";
import type { UiPreferences } from "../../hooks/useUiPreferences";

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  preferences: UiPreferences;
  onPreferencesChange: (value: UiPreferences) => void;
}

export function Sidebar({
  mobileOpen,
  onCloseMobile,
  preferences,
  onPreferencesChange,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const initials = (user?.name ?? "User")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const toggleGroup = (id: string) => {
    const open = preferences.openGroups.includes(id);
    onPreferencesChange({
      ...preferences,
      openGroups: open
        ? preferences.openGroups.filter((group) => group !== id)
        : [...preferences.openGroups, id],
    });
  };
  return (
    <>
      <button
        className={`mobile-backdrop ${mobileOpen ? "" : "hidden"}`}
        type="button"
        aria-label="Close navigation"
        onClick={onCloseMobile}
      />
      <aside
        className={`sidebar ${preferences.collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}
        aria-label="Primary navigation"
      >
        <header className="sidebar-head">
          <div className="brand">
            <span className="brand-mark brand-logo-mark">
              <img src={GENBIOCA_LOGO} alt="GenBioCa" />
            </span>
            <span className="brand-copy">
              <img className="brand-logo" src={GENBIOCA_LOGO} alt="GenBioCa" />
            </span>
          </div>
          <button
            className="collapse-btn"
            type="button"
            aria-label={
              preferences.collapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            onClick={() =>
              onPreferencesChange({
                ...preferences,
                collapsed: !preferences.collapsed,
              })
            }
          >
            {preferences.collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
          <button
            className="mobile-close"
            type="button"
            aria-label="Close navigation"
            onClick={onCloseMobile}
          >
            <X size={18} />
          </button>
        </header>
        <nav className="side-scroll">
          {navigationGroups.map((group) => {
            const open = preferences.openGroups.includes(group.id);
            const active = group.routes.some(
              (route) =>
                location.pathname === route.path ||
                location.pathname.startsWith(`${route.path}/`),
            );
            const GroupIcon = group.icon;
            return (
              <section
                className={`nav-group ${open ? "open" : ""} ${active ? "active-group" : ""}`}
                data-group={group.id}
                key={group.id}
              >
                <button
                  className="nav-group-btn"
                  type="button"
                  aria-expanded={open}
                  title={group.label}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="nav-icon">
                    <GroupIcon size={17} />
                  </span>
                  <span className="nav-group-label">{group.label}</span>
                  <ChevronDown className="nav-chevron" size={14} />
                  {/* Rendered only while collapsed, where the label is hidden. */}
                  {preferences.collapsed ? (
                    <span className="nav-tooltip" role="presentation">
                      {group.label}
                    </span>
                  ) : null}
                </button>
                <div className="nav-children">
                  {group.routes.map((route) => {
                    const Icon = route.icon;
                    return (
                      <NavLink
                        end
                        className={({ isActive }) =>
                          `nav-link ${isActive ? "active" : ""}`
                        }
                        to={route.path}
                        key={route.path}
                        title={route.title}
                        // Selecting a route closes the mobile drawer, so the
                        // page it opened is not hidden behind the overlay.
                        onClick={onCloseMobile}
                      >
                        <span className="nav-icon">
                          <Icon size={16} />
                        </span>
                        <span className="nav-label">{route.title}</span>
                        {preferences.collapsed ? (
                          <span className="nav-tooltip" role="presentation">
                            {route.title}
                          </span>
                        ) : null}
                        {route.status !== "LIVE" ? (
                          <span
                            className={`nav-status-badge ${
                              route.status === "AWAITING_INTEGRATION"
                                ? "nav-status-awaiting"
                                : ""
                            }`}
                            data-testid={`nav-status-${route.path}`}
                          >
                            {route.status === "AWAITING_INTEGRATION"
                              ? "Awaiting Access"
                              : "In Development"}
                          </span>
                        ) : null}
                      </NavLink>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </nav>
        <footer className="sidebar-foot">
          {utilityRoutes.map((route) => {
            const Icon = route.icon;
            return (
              <NavLink
                end
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
                to={route.path}
                key={route.path}
                onClick={onCloseMobile}
              >
                <span className="nav-icon">
                  <Icon size={16} />
                </span>
                <span className="nav-label">{route.title}</span>
              </NavLink>
            );
          })}
          <div className="sidebar-user">
            <div className="avatar">{initials}</div>
            <div className="sidebar-user-copy">
              <strong>{user?.name}</strong>
              <span>
                {user?.permissions.includes("*") ||
                user?.permissions.includes("roles:assign")
                  ? "Company Administrator"
                  : "Company User"}{" "}
                · {user?.activeCompany.name}
              </span>
            </div>
            <button
              className="logout-mini"
              type="button"
              aria-label="Sign out"
              onClick={() => void logout()}
            >
              <LogOut size={16} />
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}
