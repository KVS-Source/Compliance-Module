import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { tenantApi } from "../services/tenantApi";
import { useAuth } from "./AuthContext";

interface TenantContextValue {
  switching: boolean;
  switchCompany: (companyId: string) => Promise<void>;
  contextVersion: number;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: PropsWithChildren) {
  const { setUser } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);

  const switchCompany = useCallback(
    async (companyId: string) => {
      setSwitching(true);
      try {
        const identity = await tenantApi.switchCompany(companyId);
        setUser(identity);
        setContextVersion((value) => value + 1);
      } finally {
        setSwitching(false);
      }
    },
    [setUser],
  );

  const value = useMemo(
    () => ({ switching, switchCompany, contextVersion }),
    [contextVersion, switchCompany, switching],
  );
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const value = useContext(TenantContext);
  if (!value) throw new Error("useTenant must be used within TenantProvider");
  return value;
}
