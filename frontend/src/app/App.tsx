import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { TenantProvider } from "../context/TenantContext";
import { ToastProvider } from "../context/ToastContext";
import { UiPreferencesProvider } from "../context/UiPreferencesContext";
import { router } from "./router";

export function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <ToastProvider>
          <UiPreferencesProvider>
            <RouterProvider router={router} />
          </UiPreferencesProvider>
        </ToastProvider>
      </TenantProvider>
    </AuthProvider>
  );
}
