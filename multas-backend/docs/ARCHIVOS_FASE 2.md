# Archivos de TANDA 0

Git reporta actualmente todo `multas-backend/` como directorio nuevo no versionado. `dist/` y `node_modules/` son artefactos ignorados. No se modificó ningún archivo de los módulos operativos ni del frontend.

| Ruta (dentro de `multas-backend/`) | Estado Git | Propósito |
| --- | --- | --- |
| `.env` | Nuevo local/ignorado | Credenciales locales; no se versiona ni se reproduce. |
| `.env.example` | Nuevo | Contrato de variables sin secretos. |
| `.gitignore` | Nuevo | Exclusión de secretos y artefactos. |
| `README.md` | Nuevo | Operación y comandos de TANDA 0. |
| `package.json` | Nuevo | Dependencias y comandos. |
| `package-lock.json` | Nuevo | Resolución reproducible. |
| `tsconfig.json` | Nuevo | TypeScript estricto. |
| `eslint.config.js` | Nuevo | Reglas de lint. |
| `vitest.config.ts` | Nuevo | Configuración de pruebas. |
| `database/migrations/001_existing_schema_baseline.sql` | Nuevo | Referencia no destructiva del baseline. |
| `database/seeds/001_institutional_rbac.sql` | Nuevo | Referencia RBAC institucional; no ejecutada en cierre. |
| `scripts/create-admin.ts` | Nuevo | Alta interactiva transaccional. |
| `scripts/reset-admin-password.ts` | Nuevo | Reset interactivo Argon2id. |
| `scripts/interactive.ts` | Nuevo | Entrada secreta TTY compartida. |
| `scripts/cleanup-sessions.ts` | Nuevo | Revoca expiradas sin borrar auditoría. |
| `scripts/verify-auth-flow.ts` | Nuevo | Verificación física interactiva sin revelar token. |
| `scripts/migrate.ts` | Nuevo | Valida y omite historial inmutable. |
| `scripts/migration-status.ts` | Nuevo | Estado de esquema por alcance. |
| `scripts/schema-scope.ts` | Nuevo | Parseo auth/full. |
| `scripts/rbac-status.ts` | Nuevo | Inspección física RBAC. |
| `scripts/runtime.ts` | Nuevo | Ciclo de vida de comandos. |
| `src/app.ts` | Nuevo | Seguridad HTTP y montaje API. |
| `src/server.ts` | Nuevo | Servidor. |
| `src/bootstrap/container.ts` | Nuevo | Composición. |
| `src/bootstrap/routes.ts` | Nuevo | Rutas y Swagger. |
| `src/bootstrap/shutdown.ts` | Nuevo | Cierre ordenado. |
| `src/config/env.ts` | Nuevo | Validación Zod de entorno. |
| `src/config/database.ts` | Nuevo | Pool MySQL UTC. |
| `src/config/logger.ts` | Nuevo | Pino con redacción. |
| `src/shared/domain/DomainError.ts` | Nuevo | Errores de dominio. |
| `src/shared/http/HttpError.ts` | Nuevo | Errores HTTP. |
| `src/shared/http/error-handler.ts` | Nuevo | Respuesta uniforme con requestId. |
| `src/shared/http/request-context.ts` | Nuevo | Contexto UUID. |
| `src/shared/http/request-logger.ts` | Nuevo | Log estructurado. |
| `src/shared/http/authenticate.ts` | Nuevo | Validación de sesión. |
| `src/shared/http/authorize.ts` | Nuevo | Permisos 401/403 y ACCESS_DENIED. |
| `src/shared/infrastructure/mysql/MySqlConnection.ts` | Nuevo | Abstracción MySQL/transacciones. |
| `src/shared/infrastructure/mysql/SchemaInspector.ts` | Nuevo | Contratos auth/full e historial. |
| `src/shared/infrastructure/mysql/RbacInspector.ts` | Nuevo | ADMIN 56/56 y huérfanos. |
| `src/types/express.d.ts` | Nuevo | Tipado de request.auth. |
| `src/modules/system/http/system.routes.ts` | Nuevo | Health/readiness. |
| `src/modules/audit/application/AuditRepository.ts` | Nuevo | Puerto de auditoría. |
| `src/modules/audit/infrastructure/MySqlAuditRepository.ts` | Nuevo | Persistencia audit_logs. |
| `src/modules/auth/domain/Session.ts` | Nuevo | Tipos seguros de sesión. |
| `src/modules/auth/application/AuthRepository.ts` | Nuevo | Contrato auth/sesiones. |
| `src/modules/auth/application/CreateAdminUseCase.ts` | Nuevo | ADMIN_CREATED. |
| `src/modules/auth/application/LoginUseCase.ts` | Nuevo | Login/bloqueo/token opaco. |
| `src/modules/auth/application/LogoutUseCase.ts` | Nuevo | Logout idempotente y logout-all. |
| `src/modules/auth/application/GetCurrentUserUseCase.ts` | Nuevo | Usuario actual. |
| `src/modules/auth/application/SessionUseCases.ts` | Nuevo | Listado/revocación. |
| `src/modules/auth/application/PasswordUseCases.ts` | Nuevo | Cambio/reset. |
| `src/modules/auth/infrastructure/Argon2PasswordHasher.ts` | Nuevo | Argon2id. |
| `src/modules/auth/infrastructure/MySqlAuthRepository.ts` | Nuevo | Persistencia transaccional. |
| `src/modules/auth/http/auth.controller.ts` | Nuevo | Validación/respuestas/cookies. |
| `src/modules/auth/http/auth.routes.ts` | Nuevo | Endpoints y limitador login. |
| `tests/support/fakes.ts` | Nuevo | Dobles sin secretos. |
| `tests/unit/auth.test.ts` | Nuevo | Casos de uso. |
| `tests/integration/http.test.ts` | Nuevo | Contrato HTTP. |
| `tests/integration/mysql.integration.test.ts` | Nuevo | MySQL real con rollback. |
| `docs/ARQUITECTURA.md` | Nuevo | Arquitectura y CSRF. |
| `docs/DECISIONES_TECNICAS.md` | Nuevo | Decisiones definitivas. |
| `docs/API_OPENAPI.yaml` | Nuevo | OpenAPI 3.1. |
| `docs/ESTADO_MODULOS.md` | Nuevo | Estado real. |
| `docs/MATRIZ_VERIFICACION_FASE.md` | Nuevo | Matriz 20 requisitos. |
| `docs/REPORTE_ESQUEMA_EXISTENTE.md` | Nuevo | Auth/full e historial. |
| `docs/CONTRATO_AUTENTICACION.md` | Nuevo | Contrato backend. |
| `docs/CONTRATO_INTEGRACION_FRONTEND_AUTH.md` | Nuevo | Contrato frontend futuro. |
| `docs/ARCHIVOS_FASE.md` | Nuevo | Este inventario. |
