import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useUiPreferences } from "../../hooks/useUiPreferences";
import { Sidebar } from "../navigation/Sidebar";
import { Topbar } from "../navigation/Topbar";

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { preferences, setPreferences } = useUiPreferences();
  return (
    <div className={`app-shell ${preferences.collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        preferences={preferences}
        onPreferencesChange={setPreferences}
      />
      <div className="application-area">
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        <main id="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
