# Contrato de integración frontend-auth

Usar JSON contra `/api/v1` con `credentials: "include"`. El frontend nunca lee o persiste el token HttpOnly.

- GET /auth/me hidrata identidad/roles/permisos; 401 vuelve a login.
- Login envía identifier/password y trata 401 como genérico.
- Logout cierra actual; logout-all todos los dispositivos.
- Sessions lista y revoca sesiones.
- El menú puede orientar, pero el backend autoriza.
- AUTH_SESSION_EXPIRED, AUTH_SESSION_REVOKED, AUTH_REQUIRED o AUTH_ACCOUNT_DISABLED limpian el estado UI.
- Mostrar requestId para soporte; nunca registrar contraseñas.

CSRF: SameSite=Lax, CORS allowlist y JSON. Firebase Authentication no interviene; FCM solo podría usarse después para notificaciones.
