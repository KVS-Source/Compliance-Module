import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { TenantProvider } from "../context/TenantContext";
import { ToastProvider } from "../context/ToastContext";
import { router } from "./router";

export function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </TenantProvider>
    </AuthProvider>
  );
}
