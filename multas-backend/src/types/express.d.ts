import type { AuthenticatedSession } from "../modules/auth/domain/Session.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedSession;
    }
  }
}

export {};
