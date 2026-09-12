import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { authApi } from "../api/authApi";
import type { AuthSession } from "../types/auth.types";
import { toAuthSession } from "../types/auth.types";

export type AuthContextValue = {
  user: AuthSession | null;
  initializing: boolean;
  login: (identifier: string, password: string) => Promise<AuthSession>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refresh: () => Promise<AuthSession | null>;
  hasPermission: (permission: string) => boolean;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthSession | null>(null);
  const [initializing, setInitializing] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await authApi.me();
      const next = toAuthSession(response.data.user);
      setUser(next);
      return next;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setInitializing(false));
  }, [refresh]);

  useEffect(() => {
    const clear = () => setUser(null);
    window.addEventListener("pmt:unauthorized", clear);
    return () => window.removeEventListener("pmt:unauthorized", clear);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    initializing,
    login: async (identifier, password) => {
      const response = await authApi.login(identifier, password);
      const next = toAuthSession(response.data.user);
      setUser(next);
      return next;
    },
    logout: async () => { await authApi.logout(); setUser(null); },
    logoutAll: async () => { await authApi.logoutAll(); setUser(null); },
    refresh,
    hasPermission: (permission) => user?.permissions.includes(permission) ?? false,
  }), [initializing, refresh, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
