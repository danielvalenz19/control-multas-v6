import type { AuthenticatedSession, AuthenticatedUser } from "../domain/Session.js";

export class GetCurrentUserUseCase {
  public execute(session: AuthenticatedSession): AuthenticatedUser {
    return session.user;
  }
}
