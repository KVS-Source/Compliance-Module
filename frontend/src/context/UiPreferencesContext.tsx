import { createContext, useContext, type PropsWithChildren } from "react";
import { useUiPreferences } from "../hooks/useUiPreferences";

type UiPreferencesContextValue = ReturnType<typeof useUiPreferences>;

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(
  null,
);

export function UiPreferencesProvider({ children }: PropsWithChildren) {
  const value = useUiPreferences();
  return (
    <UiPreferencesContext.Provider value={value}>
      {children}
    </UiPreferencesContext.Provider>
  );
}

export function useUiPreferencesContext() {
  const value = useContext(UiPreferencesContext);
  if (!value) {
    throw new Error(
      "useUiPreferencesContext must be used within UiPreferencesProvider",
    );
  }
  return value;
}
