import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { authApi } from "../services/authApi";
import {
  SERVICE_UNAVAILABLE_MESSAGE,
  isExplicitSessionInvalid,
  onSessionExpired,
} from "../services/apiClient";
import type { AuthUser } from "../types/api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  restoreError: Error | null;
  retrySessionRestore: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  hasPermission: (permission?: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoreError, setRestoreError] = useState<Error | null>(null);

  const retrySessionRestore = useCallback(async () => {
    setLoading(true);
    setRestoreError(null);
    try {
      const identity = await authApi.refresh();
      setUserState(identity);
    } catch (error) {
      if (isExplicitSessionInvalid(error)) {
        setUserState(null);
      } else {
        setRestoreError(
          error instanceof Error
            ? error
            : new Error(SERVICE_UNAVAILABLE_MESSAGE),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    onSessionExpired(() => {
      setUserState(null);
      setRestoreError(null);
    });
    void retrySessionRestore();
    return () => onSessionExpired(null);
  }, [retrySessionRestore]);

  const login = useCallback(async (email: string, password: string) => {
    const identity = await authApi.login(email, password);
    setRestoreError(null);
    setUserState(identity);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setRestoreError(null);
      setUserState(null);
    }
  }, []);

  const setUser = useCallback((identity: AuthUser | null) => {
    setRestoreError(null);
    setUserState(identity);
  }, []);

  const hasPermission = useCallback(
    (permission?: string) =>
      !permission ||
      Boolean(user?.permissions.includes("*") || user?.permissions.includes(permission)),
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      restoreError,
      retrySessionRestore,
      login,
      logout,
      setUser,
      hasPermission,
    }),
    [
      hasPermission,
      loading,
      login,
      logout,
      restoreError,
      retrySessionRestore,
      setUser,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
