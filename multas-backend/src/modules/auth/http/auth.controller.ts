import { parse, serialize } from "cookie";
import type { Request, Response } from "express";
import { z } from "zod";
import type { Env } from "../../../config/env.js";
import { HttpError } from "../../../shared/http/HttpError.js";
import { getRequestId } from "../../../shared/http/request-context.js";
import { GetCurrentUserUseCase } from "../application/GetCurrentUserUseCase.js";
import type { LoginUseCase } from "../application/LoginUseCase.js";
import type { LogoutAllUseCase, LogoutUseCase } from "../application/LogoutUseCase.js";
import type { ChangePasswordUseCase } from "../application/PasswordUseCases.js";
import type { ListSessionsUseCase, RevokeSessionUseCase } from "../application/SessionUseCases.js";

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(191),
  password: z.string().min(1).max(1_024),
});

const strongPassword = z.string().min(12).max(128)
  .regex(/[a-z]/, "Debe incluir una minúscula")
  .regex(/[A-Z]/, "Debe incluir una mayúscula")
  .regex(/\d/, "Debe incluir un número")
  .regex(/[^a-zA-Z0-9]/, "Debe incluir un símbolo");

const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(1_024), newPassword: strongPassword });
const sessionParamsSchema = z.object({ sessionId: z.string().regex(/^\d+$/) });

export class AuthController {
  private readonly currentUser = new GetCurrentUserUseCase();

  public constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly logoutAllUseCase: LogoutAllUseCase,
    private readonly listSessionsUseCase: ListSessionsUseCase,
    private readonly revokeSessionUseCase: RevokeSessionUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly env: Pick<Env, "API_PREFIX" | "NODE_ENV" | "SESSION_COOKIE_NAME" | "SESSION_SAME_SITE">,
  ) {}

  public login = async (request: Request, response: Response): Promise<void> => {
    const body = loginSchema.parse(request.body);
    const output = await this.loginUseCase.execute({
      ...body,
      ...requestMetadata(request),
      requestId: getRequestId(),
    });
    response.setHeader("set-cookie", this.sessionCookie(output.sessionToken, output.expiresAt));
    response.status(200).json({ data: { user: output.user, expiresAt: output.expiresAt }, meta: { requestId: getRequestId() } });
  };

  public logout = async (request: Request, response: Response): Promise<void> => {
    await this.logoutUseCase.execute({
      sessionToken: this.readSessionToken(request),
      requestId: getRequestId(),
      ...requestMetadata(request),
    });
    response.setHeader("set-cookie", this.clearSessionCookie());
    response.status(204).send();
  };

  public logoutAll = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuthentication(request);
    await this.logoutAllUseCase.execute({
      sessionId: auth.id,
      userId: auth.user.id,
      requestId: getRequestId(),
      ...requestMetadata(request),
    });
    response.setHeader("set-cookie", this.clearSessionCookie());
    response.status(204).send();
  };

  public me = (request: Request, response: Response): void => {
    const auth = requireAuthentication(request);
    response.status(200).json({ data: { user: this.currentUser.execute(auth) }, meta: { requestId: getRequestId() } });
  };

  public sessions = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuthentication(request);
    const sessions = await this.listSessionsUseCase.execute(auth);
    response.status(200).json({ data: { sessions }, meta: { requestId: getRequestId() } });
  };

  public revokeSession = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuthentication(request);
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const result = await this.revokeSessionUseCase.execute({
      actor: auth, targetSessionId: sessionId, requestId: getRequestId(), ...requestMetadata(request),
    });
    if (result.revokedCurrent) response.setHeader("set-cookie", this.clearSessionCookie());
    response.status(204).send();
  };

  public changePassword = async (request: Request, response: Response): Promise<void> => {
    const auth = requireAuthentication(request);
    const body = changePasswordSchema.parse(request.body);
    await this.changePasswordUseCase.execute({
      ...body, userId: auth.user.id, sessionId: auth.id, requestId: getRequestId(), ...requestMetadata(request),
    });
    response.status(204).send();
  };

  private sessionCookie(token: string, expiresAt: Date): string {
    return serialize(this.env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: this.env.NODE_ENV === "production",
      sameSite: this.env.SESSION_SAME_SITE,
      path: "/",
      expires: expiresAt,
      priority: "high",
    });
  }

  private clearSessionCookie(): string {
    return serialize(this.env.SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: this.env.NODE_ENV === "production",
      sameSite: this.env.SESSION_SAME_SITE,
      path: "/",
      expires: new Date(0),
      maxAge: 0,
      priority: "high",
    });
  }


  private readSessionToken(request: Request): string | null {
    return parse(request.headers.cookie ?? "")[this.env.SESSION_COOKIE_NAME] ?? null;
  }
}

function requireAuthentication(request: Request) {
  if (!request.auth) {
    throw new HttpError({ code: "AUTH_REQUIRED", message: "Se requiere una sesión válida.", statusCode: 401 });
  }
  return request.auth;
}

function requestMetadata(request: Request) {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
  };
}
