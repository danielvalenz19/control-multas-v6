# Backend del Sistema Municipal de Multas

API Express/TypeScript y MySQL con autenticación propia, Argon2id, sesiones opacas HttpOnly, RBAC, auditoría, operación municipal, caja, pagos, conciliación, solvencias, analítica, reportes y notificaciones internas. API oficial: `/api/v1`.

**TANDA 0: TERMINADA.** El administrador real y el flujo completo de autenticación fueron verificados; todas las sesiones generadas por la comprobación quedaron revocadas.

## Preparación y verificación

```bash
cp .env.example .env
npm install
npm run migration:status:auth
npm run migrate
npm run migration:status:full
npm run rbac:status
```

`auth` y `full` deben coincidir después de aplicar las migraciones 011–013. El migrador omite de forma segura las versiones ya registradas.

Si prefiere un MySQL instalado localmente, omita Docker y configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` en `.env`.

Docker Compose está disponible para levantar el motor de desarrollo:

```bash
cp .env.docker.example .env.docker
# Cambie DB_PASSWORD y MYSQL_ROOT_PASSWORD.
docker compose --env-file .env.docker up -d mysql
```

Un volumen nuevo necesita primero el baseline institucional 001–003 ya aprobado. El migrador lo valida pero no lo reconstruye, para no inventar ni sobrescribir el esquema o los catálogos legales existentes.

## Comandos

```bash
npm run admin:create
npm run admin:reset-password
npm run auth:verify
npm run sessions:cleanup
npm run migration:historical:dry-run -- --path=/ruta/citizens.csv --entity=citizens
npm run migration:historical:commit -- --batch=42
npm run migration:historical:revert -- --batch=42
npm run dev
npm run lint
npm run test
npm run test:integration
npm run test:mysql
npm run build
npm audit
```

Los comandos administrativos requieren TTY y ocultan contraseñas. La limpieza marca sesiones expiradas como revocadas y nunca borra auditoría.

## API

- Salud: `GET /api/v1/system/health`
- Readiness MySQL/auth: `GET /api/v1/system/readiness`
- OpenAPI: `GET /api/v1/openapi.yaml`
- Swagger UI: `GET /api/v1/docs`
- Auth: login, me, logout, logout-all, sessions, revocación individual y change-password.
- Ciudadanos: listado, detalle, alta, edición y activar/desactivar.
- Vehículos: listado, detalle, alta, edición, activar/desactivar e historial/asignación/finalización de propietarios.
- Administración: usuarios, roles/permisos, agentes, dispositivos/asignaciones, catálogos, tarifas y correlativos.
- Infracciones: borradores, múltiples artículos, evidencias privadas, envío, devolución, rechazo, validación, anulación y línea de tiempo.
- Impugnaciones: presentación, revisión, información adicional, desistimiento, resolución, evidencia privada e historial.
- Ajustes: descuentos, exoneraciones, recargos, correcciones, doble control y reversión por contrapartida.
- Portal público: consulta boleta+placa, saldo exacto, órdenes idempotentes con PDF no-recibo y checkout alojado para tarjeta o enlace Visa.
- Caja y pagos: apertura/cierre, movimientos autorizados, pago exacto contra orden vigente, confirmación presencial, recibo/copia, reverso compensatorio y bandeja de intentos en línea para receptoría.
- Conciliación: lotes manuales o importados, ítems, diferencias y cierre sin pérdida de historial.
- Solvencias: solicitud/revisión, saldo real, emisión única, PDF, revocación/observación y verificación pública sin PII.
- Dashboard: KPIs y gráficas agregadas en MySQL con rango máximo de 366 días y filtro por dependencia.
- Reportes: once consultas paginadas, CSV UTF-8 por lotes y resumen administrativo PDF, con RBAC y auditoría.
- Notificaciones: bandeja individual, conteo, lectura individual/masiva, preferencias y plantillas internas; los canales externos permanecen deshabilitados.
- Migraciones históricas: carga CSV privada, SHA-256, staging, validación/mapeos, aprobación, commit transaccional, conciliación y reversión segura. MDB/ACCDB no se reciben.

Las evidencias usan `PRIVATE_UPLOAD_DIR` (por defecto `storage/private`) y `MAX_EVIDENCE_BYTES`; el directorio no se sirve de forma pública.

Los archivos históricos usan `HISTORICAL_MIGRATION_DIR`, `HISTORICAL_MIGRATION_MAX_BYTES` y `HISTORICAL_MIGRATION_RETENTION_DAYS`. Consulte `docs/MIGRACION_HISTORICA.md`; las plantillas solo contienen ejemplos sintéticos.

`PUBLIC_RATE_LIMIT_WINDOW_MS` y `PUBLIC_RATE_LIMIT_MAX` controlan las consultas ciudadanas; `PUBLIC_PAYMENT_RATE_LIMIT_MAX` separa el sondeo de estado de los checkouts para que una actualización automática no bloquee la consulta principal. Antes de emitir órdenes o solvencias, una autoridad debe configurar `PAYMENT_ORDER_EXPIRY_DAYS`, `SOLVENCY_VALIDITY_DAYS` y los correlativos del año; el sistema no inventa estos valores.

El flujo de pago en línea se controla con `PAYMENT_GATEWAY_MODE`: `disabled` no muestra checkout, `test` habilita únicamente la confirmación sintética QA local y `external` genera enlaces hacia el proveedor configurado en `PAYMENT_GATEWAY_BASE_URL` y acepta webhooks HMAC con `PAYMENT_GATEWAY_WEBHOOK_SECRET`. La aplicación no recibe ni almacena números de tarjeta. Para producción hace falta contratar/configurar el proveedor Visa o adquirente y adaptar su contrato de webhook a los eventos `PAYMENT_SUCCEEDED` y `PAYMENT_FAILED`.

Use clientes con `credentials: include`. El token solo viaja en cookie HttpOnly; no aparece en JSON, logs ni localStorage. Consulte `docs/CONTRATO_AUTENTICACION.md` y `docs/CONTRATO_INTEGRACION_FRONTEND_AUTH.md`.
