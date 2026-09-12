# Decisiones técnicas

## Plataforma

Frontend React/Vite/Material UI/React Router y backend Express/TypeScript/MySQL. El frontend usa `VITE_API_URL=/api/v1`, proxy local y `credentials: include`. Se retiraron Next.js, Vinext, Cloudflare D1, Drizzle, ChatGPT Auth y Firebase Auth.

## Autenticación

Argon2id, token opaco almacenado como SHA-256, cookie HttpOnly SameSite=Lax y revalidación de sesión/RBAC en MySQL. Nunca se guarda el token en `localStorage`. El backend puede iniciar con `users=0` sin degradar readiness; actualmente el administrador real ya existe y fue verificado.

## Migraciones

001–003 son el baseline institucional inmutable; 004 incorpora ciudadanos, vehículos, licencias y propiedades; 005 crea infracciones; 006 agrega evidencias e historial; 007 incorpora impugnaciones, ajustes y reglas; 008 agrega referencias y órdenes; 009 incorpora caja, pagos, recibos, reversos y conciliación; 010 incorpora solicitudes y solvencias; 011 agrega bandeja, preferencias, outbox e índices de analítica; 012 extiende preferencias a todo rol que ya posee bandeja. Las doce están aplicadas. Una versión aplicada se valida y omite; no se actualizan `applied_at`, descripción o versión. El checksum no puede almacenarse porque la tabla existente no incluye esa columna.

`auth` gobierna readiness y coincide. El contrato `full` también coincide. Un MySQL Docker vacío necesita importar primero el baseline aprobado; el migrador no inventa ni reconstruye 001–003.

## Datos y privacidad

Las búsquedas internas requieren sesión y permisos; no existe búsqueda pública solo por placa. Los campos sensibles del ciudadano solo se devuelven con `citizens.read_sensitive`. Las bajas son lógicas. La propiedad, los correlativos y las transiciones de infracciones se modifican transaccionalmente y conservan historial. Las pruebas MySQL se revierten y verifican que no queden fixtures.

Las tarifas se versionan y las boletas guardan snapshots. Las evidencias permanecen fuera del árbol público y se validan por tamaño, extensión, MIME, firma binaria y SHA-256 antes de registrar sus metadatos.

## Dinero, pagos y caja

Los cálculos convierten cadenas decimales a centavos `bigint`; no usan flotantes de JavaScript. El libro de pagos considera únicamente pagos confirmados menos reversos. La creación exige monto exacto porque no existe una regla municipal de sobrepago o pago parcial. Se reutilizan `cash_desks` y `payment_methods` del baseline como catálogos configurables. No existe pasarela bancaria ficticia.

Una orden conserva snapshots pero no acredita un pago. Registrar tampoco: confirmación, consumo de orden y recibo se ejecutan juntos. El recibo original es único; reimprimir genera una copia rotulada y auditada. Reversar no actualiza ni elimina el pago: agrega una contrapartida.

## Solvencias y portal público

La vigencia requiere una versión activa de `SOLVENCY_VALIDITY_DAYS`; no hay valor por defecto. No se implementa tarifa de solvencia porque falta definición municipal. Las impugnaciones abiertas son bloqueantes. La reversión posterior de un pago marca como `OBSERVED` cualquier solvencia `VALID` sustentada por ese vehículo.

El portal público tiene DTO propio, referencias aleatorias, límite independiente y auditoría. La verificación de solvencias expone únicamente correlativo, estado y fechas; omite vehículo, placa, propietario e identificación.

Las reglas obligatorias se versionan y no tienen valores semilla. Cuando falta un plazo legal, queda pendiente; cuando falta vigencia de orden, la emisión se bloquea. La lista completa está en `REGLAS_ECONOMICAS_PENDIENTES.md`.

## Mocks remanentes

`mockApi` queda limitado a pruebas heredadas y pantallas históricas fuera del alcance. Caja, pagos, conciliación, solvencias, dashboard, reportes, auditoría y notificaciones usan exclusivamente clientes de API real. El mock nunca escribe en `pmt_multas`.

## TANDA 10

Se eligieron consultas agregadas y paginadas directamente en MySQL sin Redis ni caché distribuida. El rango máximo es 366 días; una página contiene como máximo 100 filas y un CSV como máximo 10 000. La tabla histórica `notification_templates` se reutiliza con canal `IN_APP`; no se duplicó. La deduplicación se aplica con índice único `recipient_user_id + deduplication_key`.

Los reportes de auditoría omiten `previous_values`, `new_values`, IP y agente de usuario para reducir exposición. Las plantillas admiten configuración solo con `notifications.templates`. El outbox es infraestructura preparada y permanece sin adaptadores externos, tal como exige esta tanda.
