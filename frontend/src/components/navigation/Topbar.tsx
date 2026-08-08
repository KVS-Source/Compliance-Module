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
import { dashboardApi } from "../../services/dashboardApi";
import type { DashboardSummary } from "../../types/api";
import type { ModuleStatus } from "../../types/navigation";

const routeStatus = (status: ModuleStatus, label?: string) => {
  if (status === "LIVE") return "Live";
  if (status === "AWAITING_INTEGRATION") return label ?? "Awaiting Access";
  return label ?? "In Development";
};

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { user, logout, hasPermission } = useAuth();
  const { switching, switchCompany, contextVersion } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationSummary, setNotificationSummary] =
    useState<DashboardSummary | null>(null);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  );
  const [notificationVersion, setNotificationVersion] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
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
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearch("");
        setMobileSearchOpen(false);
        setNotificationsOpen(false);
        setProfileOpen(false);
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
    setNotificationSummary(null);
    setNotificationLoading(false);
    setNotificationError(null);
    setProfileOpen(false);
  }, [contextVersion]);

  const loadNotificationSummary = useCallback(() => {
    let active = true;
    setNotificationLoading(true);
    setNotificationError(null);
    void dashboardApi
      .summary()
      .then((summary) => {
        if (active) setNotificationSummary(summary);
      })
      .catch((error: unknown) => {
        if (active) {
          setNotificationSummary(null);
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
    return loadNotificationSummary();
  }, [
    contextVersion,
    hasPermission,
    loadNotificationSummary,
    notificationVersion,
    user?.activeCompany.id,
  ]);

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

  const workQueue = useMemo(() => {
    const queue = notificationSummary?.analytics?.actionQueue ?? [];
    const supported = queue.filter((item) =>
      ["kpi-approval", "gap-open", "capa-overdue"].includes(item.key),
    );
    const present = new Set(supported.map((item) => item.key));
    if (
      !present.has("kpi-approval") &&
      (notificationSummary?.kpis?.pendingApprovals ?? 0) > 0
    ) {
      supported.push({
        key: "kpi-approval",
        label: "KPI actuals awaiting approval",
        description: "Submitted KPI actuals with no approval decision.",
        count: notificationSummary!.kpis!.pendingApprovals,
        to: "/kpi/approval",
        tone: "blue",
      });
    }
    if (
      !present.has("gap-open") &&
      (notificationSummary?.gaps?.open ?? 0) > 0
    ) {
      supported.push({
        key: "gap-open",
        label: "Open Gaps",
        description: "Compliance gaps still awaiting remediation.",
        count: notificationSummary!.gaps!.open,
        to: "/compliance/gaps",
        tone: "amber",
      });
    }
    if (
      !present.has("capa-overdue") &&
      (notificationSummary?.capas?.overdue ?? 0) > 0
    ) {
      supported.push({
        key: "capa-overdue",
        label: "Overdue CAPAs",
        description: "Open corrective actions past their recorded due date.",
        count: notificationSummary!.capas!.overdue,
        to: "/compliance/capa",
        tone: "red",
      });
    }
    return supported.sort(
      (left, right) =>
        right.count - left.count || left.key.localeCompare(right.key),
    );
  }, [notificationSummary]);
  const workQueueCount = workQueue.reduce(
    (total, item) => total + item.count,
    0,
  );
  const hasVisibleWorkQueueSource = Boolean(
    notificationSummary &&
      [
        notificationSummary.kpis,
        notificationSummary.gaps,
        notificationSummary.capas,
      ].some((source) => source !== undefined && source !== null),
  );

  const initials = (user?.name ?? "User")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const date = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = now
    .toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();

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
        <button
          className="btn btn-primary quick-add"
          type="button"
          onClick={() => openRoute("/master/kpis")}
        >
          <Plus size={16} />
          <span>Quick Add</span>
        </button>
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
                {company.name}
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
          {!notificationLoading && notificationSummary ? (
            <span className="counter" aria-hidden>
              {workQueueCount > 99 ? "99+" : workQueueCount}
            </span>
          ) : null}
        </button>
        <div className="datetime">
          <span>{date}</span>
          <br />
          <span>{time} · Location 001</span>
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
            <label htmlFor="mobile-global-search">Search pages and modules</label>
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
            <h3>Work queue</h3>
            {notificationLoading ? (
              <div className="notification-state" role="status">
                <LoaderCircle className="spin" size={17} />
                Loading live Company work queue…
              </div>
            ) : notificationError ? (
              <div className="notification-state state-error" role="alert">
                <AlertTriangle size={17} />
                {notificationError}
              </div>
            ) : workQueue.length > 0 ? (
              <div className="notification-summary">
                {workQueue.map((item) => (
                  <button
                    key={item.key}
                    className="notification-item"
                    type="button"
                    onClick={() => openRoute(item.to)}
                  >
                    {item.key === "kpi-approval" ? (
                      <ClipboardCheck size={18} />
                    ) : item.key === "gap-open" ? (
                      <ShieldAlert size={18} />
                    ) : (
                      <AlertTriangle size={18} />
                    )}
                    <span>
                      <strong>
                        {item.count}{" "}
                        {item.count === 1
                          ? item.key === "kpi-approval"
                            ? "KPI actual awaiting approval"
                            : item.key === "gap-open"
                              ? "Open Gap"
                              : "Overdue CAPA"
                          : item.label}
                      </strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="notification-empty">
                {hasVisibleWorkQueueSource
                  ? "No pending KPI approvals, open gaps, or overdue CAPAs."
                  : "No work-queue sources are visible with your current permissions."}
              </p>
            )}
            <div className="notification-actions">
              {hasPermission("kpis:read") ? (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => openRoute("/kpi/approval")}
                >
                  KPI Approval
                </button>
              ) : null}
              {hasPermission("gaps:read") ? (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => openRoute("/compliance/gaps")}
                >
                  Gap Register
                </button>
              ) : null}
              {hasPermission("capa:read") ? (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => openRoute("/compliance/capa")}
                >
                  CAPA Register
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
