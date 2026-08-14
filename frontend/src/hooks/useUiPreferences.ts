import { useEffect, useState } from "react";

const KEY = "genbioca_ui_preferences";

export interface UiPreferences {
  collapsed: boolean;
  openGroups: string[];
  workingLocations: Record<string, WorkingLocation>;
  timeZone: string;
  dateStyle: DateStyle;
  timeFormat: TimeFormat;
}

export interface WorkingLocation {
  id: string;
  code: string;
  name: string;
}

export type DateStyle = "long" | "day-first" | "month-first";
export type TimeFormat = "12-hour" | "24-hour";

const canonicalTimeZone = (value: string) =>
  value === "Asia/Calcutta" ? "Asia/Kolkata" : value;

const defaultTimeZone = (() => {
  try {
    return canonicalTimeZone(
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
  } catch {
    return "UTC";
  }
})();

export const defaultUiPreferences: UiPreferences = {
  collapsed: false,
  openGroups: ["dashboard", "administration", "frameworks"],
  workingLocations: {},
  timeZone: defaultTimeZone,
  dateStyle: "long",
  timeFormat: "12-hour",
};

const dateStyles: DateStyle[] = ["long", "day-first", "month-first"];
const timeFormats: TimeFormat[] = ["12-hour", "24-hour"];

const parseWorkingLocations = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, WorkingLocation] => {
      const location = entry[1] as Partial<WorkingLocation> | null;
      return Boolean(
        entry[0] &&
          location &&
          typeof location.id === "string" &&
          typeof location.code === "string" &&
          typeof location.name === "string",
      );
    }),
  );
};

export function useUiPreferences() {
  const [preferences, setPreferences] = useState<UiPreferences>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<UiPreferences> | null;
      return {
        collapsed: Boolean(parsed?.collapsed),
        openGroups: Array.isArray(parsed?.openGroups)
          ? parsed.openGroups.filter((value): value is string => typeof value === "string")
          : defaultUiPreferences.openGroups,
        workingLocations: parseWorkingLocations(parsed?.workingLocations),
        timeZone:
          typeof parsed?.timeZone === "string" && parsed.timeZone
            ? canonicalTimeZone(parsed.timeZone)
            : defaultUiPreferences.timeZone,
        dateStyle: dateStyles.includes(parsed?.dateStyle as DateStyle)
          ? (parsed?.dateStyle as DateStyle)
          : defaultUiPreferences.dateStyle,
        timeFormat: timeFormats.includes(parsed?.timeFormat as TimeFormat)
          ? (parsed?.timeFormat as TimeFormat)
          : defaultUiPreferences.timeFormat,
      };
    } catch {
      return defaultUiPreferences;
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
