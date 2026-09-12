import { httpRequest } from "@/src/services/httpClient";
import type { ApiAuthenticatedUser, SessionSummary } from "../types/auth.types";

type UserResponse = { data: { user: ApiAuthenticatedUser } };

export const authApi = {
  login: (identifier: string, password: string) =>
    httpRequest<UserResponse>("/auth/login", { method: "POST", body: { identifier, password }, handleUnauthorized: false }),
  me: () => httpRequest<UserResponse>("/auth/me", { handleUnauthorized: false }),
  logout: () => httpRequest<void>("/auth/logout", { method: "POST", handleUnauthorized: false }),
  logoutAll: () => httpRequest<void>("/auth/logout-all", { method: "POST" }),
  sessions: () => httpRequest<{ data: { sessions: SessionSummary[] } }>("/auth/sessions"),
  revokeSession: (sessionId: string) => httpRequest<void>(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    httpRequest<void>("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
};
