# Contrato de autenticación

API oficial: `/api/v1`. Sesión propia, opaca y MySQL.

| Operación | Contrato |
| --- | --- |
| POST /auth/login | 200 crea cookie; 401 genérico; nunca token JSON. |
| GET /auth/me | Identidad, roles y permisos; nunca hash. |
| POST /auth/logout | 204 idempotente; revoca solo actual. |
| POST /auth/logout-all | 204; revoca todas. |
| GET /auth/sessions | Solo sesiones propias y metadatos no secretos. |
| DELETE /auth/sessions/:sessionId | Propia; ADMIN autorizado puede ajena. |
| POST /auth/change-password | Verifica actual, Argon2id y revoca otras. |

Errores estables incluyen AUTH_INVALID_CREDENTIALS, AUTH_REQUIRED, AUTH_ACCOUNT_LOCKED, AUTH_ACCOUNT_DISABLED, AUTH_FORBIDDEN, AUTH_SESSION_EXPIRED y AUTH_SESSION_REVOKED, siempre con meta.requestId. Cookie: HttpOnly, Secure en producción, SameSite=Lax, Path=/ y expiración.
