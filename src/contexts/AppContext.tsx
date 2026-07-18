"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authService, dataService } from "@/src/services/mockApi";
import type { ApiError, AuditEvent, Infraction, Payment, SolvencyRequest, User } from "@/src/types";

interface AppContextValue {
  session: User | null;
  infractions: Infraction[];
  payments: Payment[];
  solvencies: SolvencyRequest[];
  audit: AuditEvent[];
  initializing: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  publicLookup: typeof dataService.publicLookup;
  verifySolvency: typeof dataService.verifySolvency;
  validateInfraction: (id: string) => Promise<void>;
  returnInfraction: (id: string, reason: string) => Promise<void>;
  registerPayment: (input: { infractionId: string; receiptNumber: string; concept: "MULTA" | "SOLVENCIA"; amount: number; cashDesk: string; method: string }) => Promise<void>;
  reversePayment: (paymentId: string, reason: string) => Promise<void>;
  issueSolvency: (requestId: string) => Promise<SolvencyRequest>;
  cancelSolvency: (requestId: string, reason: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<User | null>(() => authService.current());
  const [infractions, setInfractions] = useState<Infraction[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [solvencies, setSolvencies] = useState<SolvencyRequest[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [initializing, setInitializing] = useState(true);

  const refresh = useCallback(async () => {
    const data = await dataService.snapshot();
    setInfractions(data.infractions); setPayments(data.payments); setSolvencies(data.solvencies); setAudit(data.audit);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh().finally(() => setInitializing(false)); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const requireSession = useCallback(() => {
    if (!session) throw { code: "SESSION_REQUIRED", message: "La sesión ya no está disponible." } satisfies ApiError;
    return session;
  }, [session]);

  const value = useMemo<AppContextValue>(() => ({
    session, infractions, payments, solvencies, audit, initializing,
    login: async (email, password) => { const user = await authService.login(email, password); setSession(user); return user; },
    logout: async () => { await authService.logout(); setSession(null); },
    refresh,
    publicLookup: dataService.publicLookup,
    verifySolvency: dataService.verifySolvency,
    validateInfraction: async (id) => { await dataService.validateInfraction(id, requireSession()); await refresh(); },
    returnInfraction: async (id, reason) => { await dataService.returnInfraction(id, reason, requireSession()); await refresh(); },
    registerPayment: async (input) => { await dataService.registerPayment(input, requireSession()); await refresh(); },
    reversePayment: async (id, reason) => { await dataService.reversePayment(id, reason, requireSession()); await refresh(); },
    issueSolvency: async (id) => { const result = await dataService.issueSolvency(id, requireSession()); await refresh(); return result; },
    cancelSolvency: async (id, reason) => { await dataService.cancelSolvency(id, reason, requireSession()); await refresh(); },
  }), [session, infractions, payments, solvencies, audit, initializing, refresh, requireSession]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
