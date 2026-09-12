import type { RoleName, User } from "@/src/types";

export type ApiAuthenticatedUser = {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
};

export type AuthSession = User & {
  username: string;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
};

export type SessionSummary = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  current: boolean;
};

const roleLabels: Record<RoleName, string> = {
  ADMIN: "Administrador", SUPERVISOR: "Supervisor", PMT: "Operador PMT",
  RECEPTORIA: "Receptoría", SOLVENCIAS: "Emisor de solvencias",
};

export const roleHome: Record<RoleName, string> = {
  ADMIN: "/admin/dashboard", SUPERVISOR: "/admin/dashboard", PMT: "/admin/bandeja",
  RECEPTORIA: "/admin/receptoria", SOLVENCIAS: "/admin/solvencias",
};

export function toAuthSession(user: ApiAuthenticatedUser): AuthSession {
  const role = legacyRole(user.roles);
  return {
    id: user.id,
    username: user.username,
    name: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email ?? user.username,
    role,
    roleLabel: roleLabels[role],
    dependency: "Municipalidad de San Antonio Suchitepéquez",
    enabled: true,
    lastAccess: "Ahora",
    roles: user.roles,
    permissions: user.permissions,
    mustChangePassword: user.mustChangePassword,
  };
}

function legacyRole(roles: string[]): RoleName {
  if (roles.includes("ADMIN")) return "ADMIN";
  if (roles.includes("SUPERVISOR")) return "SUPERVISOR";
  if (roles.includes("RECEPTORIA")) return "RECEPTORIA";
  if (roles.includes("SOLVENCY_ISSUER")) return "SOLVENCIAS";
  return "PMT";
}
