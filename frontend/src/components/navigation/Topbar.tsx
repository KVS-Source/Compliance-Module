import { Bell, ChevronDown, ClipboardCheck, LogOut, Menu, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { routeDefinitions } from "../../app/routeDefinitions";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { user, logout } = useAuth();
  const { switching, switchCompany } = useTenant();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return routeDefinitions.filter((item) => `${item.title} ${item.section}`.toLowerCase().includes(query)).slice(0, 6);
  }, [search]);
  const initials = (user?.name ?? "User").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();

  const handleCompany = async (companyId: string) => {
    if (!companyId || companyId === user?.activeCompany.id) return;
    try {
      await switchCompany(companyId);
      showToast("success", "Company context changed", "All connected screens now use the selected Company context.");
    } catch (error) {
      showToast("error", "Company switch failed", error instanceof Error ? error.message : "The Company could not be selected.");
    }
  };

  return (
    <header className="topbar">
      <button className="top-btn mobile-toggle" type="button" aria-label="Open navigation" onClick={onOpenMobile}><Menu size={20} /></button>
      <div className="global-search">
        <label className="sr-only" htmlFor="global-search">Search screens</label>
        <div className="search-input-wrap"><Search className="icon" size={18} /><input id="global-search" className="control" type="search" placeholder="Search KPIs, policies, controls, evidence, CAPA, risks…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {matches.length ? <div className="search-results" role="listbox">{matches.map((item) => <button className="search-result" type="button" role="option" key={item.path} onClick={() => { navigate(item.path); setSearch(""); }}><item.icon size={15} /><span><strong>{item.title}</strong><small>{item.section}</small></span></button>)}</div> : null}
      </div>
      <div className="top-actions">
        <button className="top-btn mobile-search-btn" type="button" aria-label="Open global search"><Search size={17} /></button>
        <button className="btn btn-primary quick-add" type="button" onClick={() => navigate("/master/kpis")}><Plus size={16} /><span>Quick Add</span></button>
        <label className="company-switch">
          <span className="sr-only">Company Switcher</span>
          <select
            id="company-switcher"
            className="control"
            value={user?.activeCompany.id ?? ""}
            disabled={switching}
            onChange={(event) => void handleCompany(event.target.value)}
          >
            {(user?.companies ?? []).map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
          </select>
        </label>
        <button className="top-btn top-approvals" type="button" aria-label="Approval Centre"><ClipboardCheck size={17} /></button>
        <button className="top-btn top-notifications" type="button" aria-label="Notifications"><Bell size={17} /></button>
        <div className="datetime"><span>{date}</span><br /><span>{time} · Location 001</span></div>
        <button className="profile-btn" type="button" aria-label="User profile" aria-expanded={profileOpen} onClick={() => setProfileOpen((value) => !value)}><span className="avatar">{initials}</span><ChevronDown size={14} /></button>
        {profileOpen ? <div className="popover profile-menu" role="menu"><div className="profile-summary"><strong>{user?.name}</strong><small>{user?.email}<br />{user?.activeCompany.name}</small></div><button className="menu-item" type="button" onClick={() => void logout()}><LogOut size={16} /> Sign Out</button></div> : null}
      </div>
    </header>
  );
}
