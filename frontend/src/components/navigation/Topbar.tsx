import {
  AlertTriangle,
  Bell,
  ChevronDown,
  ClipboardCheck,
  KeyRound,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { routeDefinitions } from "../../app/routeDefinitions";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { notificationApi } from "../../services/notificationApi";
import type { NotificationListResult } from "../../types/api";
import type { ModuleStatus } from "../../types/navigation";
import type { UiPreferences } from "../../hooks/useUiPreferences";

const routeStatus = (status: ModuleStatus, label?: string) => {
  if (status === "LIVE") return "Live";
  if (status === "AWAITING_INTEGRATION") return label ?? "Awaiting Access";
  return label ?? "In Development";
};

export function Topbar({
  onOpenMobile,
  preferences,
}: {
  onOpenMobile: () => void;
  preferences: UiPreferences;
}) {
  const { user, logout, hasPermission } = useAuth();
  const { switching, switchCompany, contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationData, setNotificationData] =
    useState<NotificationListResult | null>(null);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  );
  const [notificationVersion, setNotificationVersion] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const closePopovers = (event: PointerEvent) => {
      if (
        headerRef.current &&
        !headerRef.current.contains(event.target as Node)
      ) {
        setSearch("");
        setMobileSearchOpen(false);
        setNotificationsOpen(false);
        setProfileOpen(false);
        setQuickAddOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearch("");
        setMobileSearchOpen(false);
        setNotificationsOpen(false);
        setProfileOpen(false);
        setQuickAddOpen(false);
      }
    };
    document.addEventListener("pointerdown", closePopovers);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePopovers);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    setSearch("");
    setMobileSearchOpen(false);
    setNotificationsOpen(false);
    setNotificationData(null);
    setNotificationLoading(false);
    setNotificationError(null);
    setProfileOpen(false);
    setQuickAddOpen(false);
  }, [contextVersion]);

  const loadNotifications = useCallback(() => {
    let active = true;
    setNotificationLoading(true);
    setNotificationError(null);
    void notificationApi
      .list(10)
      .then((result) => {
        if (active) setNotificationData(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setNotificationData(null);
          setNotificationError(
            error instanceof Error
              ? error.message
              : "Notification summary could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setNotificationLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.activeCompany.id || !hasPermission("dashboard:read")) return;
    return loadNotifications();
  }, [
    contextVersion,
    hasPermission,
    loadNotifications,
    notificationVersion,
    user?.activeCompany.id,
  ]);

  /**
   * Quick Add offers only records this build can actually create, each gated on
   * the same permission the underlying API enforces, so the menu never shows an
   * action that would fail on arrival.
   *
   * Company creation is included now that `POST /tenants` exists; it is gated on
   * `tenants:write`, which only the Client Company Administrator profile holds.
   */
  const quickAddGroups = useMemo(
    () =>
      [
        {
          heading: "Compliance",
          items: [
            {
              label: "Risk",
              to: "/compliance/risks",
              permission: "risk:write",
            },
            {
              label: "Gap",
              to: "/compliance/gaps",
              permission: "gaps:write",
            },
            { label: "CAPA", to: "/compliance/capa", permission: "capa:write" },
            {
              label: "Policy",
              to: "/compliance/policy-register",
              permission: "policies:write",
            },
            {
              label: "Control",
              to: "/compliance/controls",
              permission: "controls:write",
            },
            {
              label: "Checkpoint",
              to: "/compliance/checkpoints",
              permission: "checkpoints:write",
            },
            {
              label: "Register record",
              to: "/compliance/operational-registers",
              permission: "registers:write",
            },
          ],
        },
        {
          heading: "Evidence & KPI",
          items: [
            {
              label: "Evidence",
              to: "/evidence/new",
              permission: "evidence:write",
            },
            {
              label: "KPI actual",
              to: "/kpi/actual-entry",
              permission: "kpi-actual:write",
            },
            {
              label: "KPI configuration",
              to: "/kpi/configuration",
              permission: "kpi-config:write",
            },
            {
              label: "KPI target",
              to: "/kpi/targets",
              permission: "kpi-target:write",
            },
            {
              label: "Workbook import",
              to: "/data/import",
              permission: "imports:write",
            },
          ],
        },
        {
          heading: "Administration",
          items: [
            {
              label: "Company",
              to: "/admin/companies",
              permission: "tenants:write",
            },
            { label: "User", to: "/admin/users", permission: "users:write" },
            {
              label: "Department",
              to: "/admin/departments",
              permission: "departments:write",
            },
            {
              label: "Location",
              to: "/admin/locations",
              permission: "locations:write",
            },
            {
              label: "Organisation unit",
              to: "/admin/organisation-units",
              permission: "units:write",
            },
          ],
        },
      ]
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => hasPermission(item.permission)),
        }))
        .filter((group) => group.items.length > 0),
    [hasPermission],
  );

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return routeDefinitions
      .filter(
        (item) =>
          !item.hidden &&
          `${item.title} ${item.section}`.toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [search]);

  const initials = (user?.name ?? "User")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const date = now.toLocaleDateString(
    preferences.dateStyle === "month-first" ? "en-US" : "en-GB",
    preferences.dateStyle === "long"
      ? {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: preferences.timeZone,
        }
      : {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: preferences.timeZone,
        },
  );
  const time = now
    .toLocaleTimeString(
      preferences.timeFormat === "12-hour" ? "en-GB" : "en-GB",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: preferences.timeFormat === "12-hour",
        timeZone: preferences.timeZone,
      },
    )
    .toLowerCase();
  const workingLocation = user?.activeCompany.id
    ? preferences.workingLocations[user.activeCompany.id]
    : undefined;

  const handleCompany = async (companyId: string) => {
    if (!companyId || companyId === user?.activeCompany.id) return;
    try {
      await switchCompany(companyId);
      showToast(
        "success",
        "Company context changed",
        "All connected screens now use the selected Company context.",
      );
    } catch (error) {
      showToast(
        "error",
        "Company switch failed",
        error instanceof Error
          ? error.message
          : "The Company could not be selected.",
      );
    }
  };

  const openRoute = (path: string) => {
    navigate(path);
    setSearch("");
    setMobileSearchOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
    setQuickAddOpen(false);
  };

  const searchResults = (
    <div className="search-results" role="listbox" aria-label="Page results">
      {matches.map((item) => (
        <button
          className="search-result"
          type="button"
          role="option"
          aria-selected="false"
          key={item.path}
          onClick={() => openRoute(item.path)}
        >
          <item.icon size={15} />
          <span>
            <strong>{item.title}</strong>
            <small>
              {item.section} · {routeStatus(item.status, item.statusLabel)}
            </small>
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <header className="topbar" ref={headerRef}>
      <button
        className="top-btn mobile-toggle"
        type="button"
        aria-label="Open navigation"
        onClick={onOpenMobile}
      >
        <Menu size={20} />
      </button>
      <div className="global-search">
        <label className="sr-only" htmlFor="global-search">
          Search pages and modules
        </label>
        <div className="search-input-wrap">
          <Search className="icon" size={18} />
          <input
            id="global-search"
            className="control"
            type="search"
            placeholder="Search pages and modules"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {matches.length ? searchResults : null}
      </div>
      <div className="top-actions">
        <button
          className="top-btn mobile-search-btn"
          type="button"
          aria-label="Open global search"
          aria-expanded={mobileSearchOpen}
          aria-controls="mobile-route-search"
          onClick={() => {
            setMobileSearchOpen((value) => !value);
            setNotificationsOpen(false);
            setProfileOpen(false);
            setSearch("");
          }}
        >
          <Search size={17} />
        </button>
        {quickAddGroups.length > 0 ? (
          <div className="quick-add-wrap">
            <button
              className="btn btn-primary quick-add"
              type="button"
              data-testid="quick-add-trigger"
              aria-haspopup="menu"
              aria-expanded={quickAddOpen}
              onClick={() => {
                setQuickAddOpen((open) => !open);
                setNotificationsOpen(false);
                setProfileOpen(false);
              }}
            >
              <Plus size={16} />
              <span>Quick Add</span>
            </button>
            {quickAddOpen ? (
              <div
                className="popover quick-add-menu"
                role="menu"
                data-testid="quick-add-menu"
              >
                {quickAddGroups.map((group) => (
                  <div className="quick-add-group" key={group.heading}>
                    <p className="quick-add-heading">{group.heading}</p>
                    {group.items.map((item) => (
                      <button
                        className="menu-item"
                        type="button"
                        role="menuitem"
                        key={item.to + item.label}
                        data-testid={`quick-add-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                        onClick={() => openRoute(item.to)}
                      >
                        <Plus size={14} /> {item.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <label className="company-switch">
          <span className="sr-only">Company Switcher</span>
          <select
            id="company-switcher"
            className="control"
            value={user?.activeCompany.id ?? ""}
            disabled={switching}
            onChange={(event) => void handleCompany(event.target.value)}
          >
            {(user?.companies ?? []).map((company) => (
              <option value={company.id} key={company.id}>
                {company.name} ({company.code})
              </option>
            ))}
          </select>
        </label>
        <button
          className="top-btn top-approvals"
          type="button"
          aria-label="KPI Approval Centre"
          onClick={() => openRoute("/kpi/approval")}
        >
          <ClipboardCheck size={17} />
        </button>
        <button
          className="top-btn top-notifications"
          type="button"
          aria-label="Notifications"
          aria-expanded={notificationsOpen}
          aria-controls="notification-summary"
          onClick={() => {
            if (!notificationsOpen) {
              setNotificationVersion((value) => value + 1);
            }
            setNotificationsOpen((value) => !value);
            setMobileSearchOpen(false);
            setProfileOpen(false);
            setSearch("");
          }}
        >
          <Bell size={17} />
          {!notificationLoading && notificationData ? (
            <span className="counter" aria-hidden>
              {notificationData.unreadCount > 99
                ? "99+"
                : notificationData.unreadCount}
            </span>
          ) : null}
        </button>
        <div className="datetime">
          <span>{date}</span>
          <br />
          <span>
            {time} · {workingLocation?.name ?? "All locations"}
          </span>
        </div>
        <button
          className="profile-btn"
          type="button"
          aria-label="User profile"
          aria-expanded={profileOpen}
          onClick={() => {
            setProfileOpen((value) => !value);
            setMobileSearchOpen(false);
            setNotificationsOpen(false);
            setSearch("");
          }}
        >
          <span className="avatar">{initials}</span>
          <ChevronDown size={14} />
        </button>

        {mobileSearchOpen ? (
          <div
            className="popover mobile-search-popover"
            id="mobile-route-search"
            role="dialog"
            aria-label="Search pages and modules"
          >
            <label htmlFor="mobile-global-search">
              Search pages and modules
            </label>
            <div className="search-input-wrap">
              <Search className="icon" size={18} />
              <input
                id="mobile-global-search"
                className="control"
                type="search"
                placeholder="Search pages and modules"
                value={search}
                autoFocus
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {matches.length ? searchResults : null}
          </div>
        ) : null}

        {notificationsOpen ? (
          <div
            className="popover notification-popover"
            id="notification-summary"
            role="dialog"
            aria-label="Notifications"
          >
            <h3>Notifications</h3>
            {notificationLoading ? (
              <div className="notification-state" role="status">
                <LoaderCircle className="spin" size={17} />
                Loading in-app notifications…
              </div>
            ) : notificationError ? (
              <div className="notification-state state-error" role="alert">
                <AlertTriangle size={17} />
                {notificationError}
              </div>
            ) : (notificationData?.items.length ?? 0) > 0 ? (
              <div className="notification-summary">
                {notificationData!.items.map((item) => (
                  <button
                    key={item.id}
                    className={`notification-item${item.read ? "" : " unread"}`}
                    type="button"
                    onClick={() => {
                      void (async () => {
                        if (!item.read) {
                          try {
                            await notificationApi.markRead(item.id);
                          } catch (reason) {
                            showToast(
                              "warning",
                              "Notification was not marked read",
                              reason instanceof Error ? reason.message : "",
                            );
                          }
                        }
                        openRoute(item.targetPath);
                      })();
                    }}
                  >
                    {item.kind === "APPROVAL_REQUEST" ? (
                      <ClipboardCheck size={18} />
                    ) : item.kind === "OWNERSHIP_ASSIGNMENT" ? (
                      <ShieldAlert size={18} />
                    ) : (
                      <AlertTriangle size={18} />
                    )}
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.message}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="notification-empty">
                No in-app notifications for this Company.
              </p>
            )}
            <div className="notification-actions">
              <small>In-app only · email delivery is not configured.</small>
              {hasPermission("registers:read") ? (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => openRoute("/tasks")}
                >
                  Tasks
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {profileOpen ? (
          <div className="popover profile-menu" role="menu">
            <div className="profile-summary">
              <strong>{user?.name}</strong>
              <small>
                {user?.email}
                <br />
                {user?.activeCompany.name}
              </small>
            </div>
            <button
              className="menu-item"
              type="button"
              data-testid="profile-change-password"
              onClick={() => openRoute("/account/change-password")}
            >
              <KeyRound size={16} /> Change Password
            </button>
            <button
              className="menu-item"
              type="button"
              onClick={() => void logout()}
            >
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
