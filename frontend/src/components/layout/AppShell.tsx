import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useUiPreferencesContext } from "../../context/UiPreferencesContext";
import { Sidebar } from "../navigation/Sidebar";
import { Topbar } from "../navigation/Topbar";

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { preferences, setPreferences } = useUiPreferencesContext();
  return (
    <div className={`app-shell ${preferences.collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        preferences={preferences}
        onPreferencesChange={setPreferences}
      />
      <div className="application-area">
        <Topbar
          onOpenMobile={() => setMobileOpen(true)}
          preferences={preferences}
        />
        <main id="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
