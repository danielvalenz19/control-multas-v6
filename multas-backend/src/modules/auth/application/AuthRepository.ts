import type { AuthenticatedSession, AuthenticatedUser } from "../domain/Session.js";

export type LoginUser = AuthenticatedUser & {
  passwordHash: string;
  status: "ACTIVE" | "DISABLED" | "LOCKED";
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  sessionVersion: number;
};

export type RequestMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type AuthenticationEvent = RequestMetadata & {
  userId: string | null;
  identifierMasked: string | null;
  eventType: "LOGIN" | "LOGOUT" | "SESSION_REVOKE" | "PASSWORD_CHANGE" | "PASSWORD_RESET";
  outcome: "SUCCESS" | "FAILURE" | "BLOCKED";
  failureCode?: string;
};

export type CreateSessionInput = RequestMetadata & {
  userId: string;
  tokenHash: Buffer;
  sessionVersion: number;
  idleExpiresAt: Date;
  expiresAt: Date;
};

export type CreateAdminInput = {
  username: string;
  email: string | null;
  passwordHash: string;
  firstName: string;
  lastName: string;
};

export type SessionState =
  | { status: "ACTIVE"; session: AuthenticatedSession }
  | { status: "NOT_FOUND" | "REVOKED" | "EXPIRED" | "ACCOUNT_DISABLED" | "VERSION_MISMATCH" };

export type StoredSession = {
  id: string;
  userId: string;
  revokedAt: Date | null;
};

export type SessionSummary = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  current: boolean;
};

export type RevokedTokenSession = StoredSession & { changed: boolean };

export type AuthRepository = {
  findUserByIdentifier: (identifier: string) => Promise<LoginUser | null>;
  findUserById: (userId: string) => Promise<LoginUser | null>;
  registerFailedAttempt: (userId: string, maximumAttempts: number, lockMinutes: number) => Promise<Date | null>;
  resetFailedAttempts: (userId: string) => Promise<void>;
  createSession: (input: CreateSessionInput) => Promise<string>;
  findSession: (tokenHash: Buffer) => Promise<AuthenticatedSession | null>;
  getSessionState: (tokenHash: Buffer) => Promise<SessionState>;
  touchSession: (sessionId: string, idleExpiresAt: Date) => Promise<void>;
  revokeSession: (sessionId: string, userId: string, reason: string) => Promise<void>;
  revokeAllSessions: (userId: string, reason: string) => Promise<void>;
  revokeSessionByTokenHash: (tokenHash: Buffer, reason: string) => Promise<RevokedTokenSession | null>;
  listSessions: (userId: string, currentSessionId: string) => Promise<SessionSummary[]>;
  findStoredSession: (sessionId: string) => Promise<StoredSession | null>;
  revokeSessionAsActor: (sessionId: string, actorUserId: string, reason: string) => Promise<boolean>;
  changePassword: (userId: string, currentSessionId: string, passwordHash: string) => Promise<void>;
  resetPassword: (userId: string, passwordHash: string) => Promise<void>;
  cleanupExpiredSessions: () => Promise<number>;
  recordAuthenticationEvent: (event: AuthenticationEvent) => Promise<void>;
  createAdmin: (input: CreateAdminInput) => Promise<AuthenticatedUser>;
};

export type PasswordHasher = {
  hash: (password: string) => Promise<string>;
  verify: (hash: string, password: string) => Promise<boolean>;
  verifyDummy: (password: string) => Promise<void>;
};
