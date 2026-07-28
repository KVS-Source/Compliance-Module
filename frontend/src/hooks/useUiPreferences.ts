import { useEffect, useState } from "react";

const KEY = "genbioca_ui_preferences";

export interface UiPreferences {
  collapsed: boolean;
  openGroups: string[];
}

const fallback: UiPreferences = {
  collapsed: false,
  openGroups: ["dashboard", "administration", "frameworks"],
};

export function useUiPreferences() {
  const [preferences, setPreferences] = useState<UiPreferences>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<UiPreferences> | null;
      return {
        collapsed: Boolean(parsed?.collapsed),
        openGroups: Array.isArray(parsed?.openGroups)
          ? parsed.openGroups.filter((value): value is string => typeof value === "string")
          : fallback.openGroups,
      };
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(preferences));
    } catch {
      // UI preferences are optional and never authoritative.
    }
  }, [preferences]);

  return { preferences, setPreferences };
}
