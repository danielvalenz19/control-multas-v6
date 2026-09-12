# Arquitectura

La API se organiza por módulos y separa HTTP, casos de uso, dominio e infraestructura.

- `src/app.ts`: seguridad HTTP, CORS, límites y montaje de `/api/v1`.
- `src/bootstrap`: composición de dependencias y rutas.
- `src/modules/auth`: autenticación propia, sesiones y CLI del administrador.
- `src/modules/audit`: persistencia de trazabilidad.
- `src/modules/system`: salud y readiness.
- `src/shared`: errores, contexto de solicitudes, middleware y MySQL.

## Flujo de inicio de sesión

1. Se valida el cuerpo con Zod.
2. Se busca usuario por nombre o correo sin revelar si existe.
3. Argon2id verifica la contraseña.
4. Los fallos incrementan el contador y pueden activar un bloqueo temporal.
5. Un acceso correcto genera 32 bytes aleatorios. Solo SHA-256 del token se guarda en `user_sessions`.
6. El token crudo se entrega en cookie `HttpOnly` y nunca se registra en logs.
7. Cada acceso se registra en `authentication_events` y `audit_logs`.

## RBAC

Los permisos efectivos combinan roles activos y overrides personales vigentes. Un override `DENY` prevalece sobre los permisos del rol. `authenticate` valida la sesión; `authorize` exige el permiso puntual y devuelve 403 si falta.

## Base existente

`SchemaInspector` compara tablas y columnas de `pmt_multas` mediante `information_schema`. El baseline es deliberadamente no destructivo: ante cualquier diferencia devuelve un reporte y no escribe versiones.
