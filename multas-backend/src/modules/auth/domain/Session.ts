export type AuthenticatedUser = {
  id: string;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
};

export type AuthenticatedSession = {
  id: string;
  user: AuthenticatedUser;
  expiresAt: Date;
};

export type SessionToken = {
  raw: string;
  hash: Buffer;
};
