# Arquitectura — TANDAS 0 a 8, 10 y 11

El sistema es un monolito modular: React + Vite en la raíz, Express + TypeScript en `multas-backend`, MySQL `pmt_multas` y API `/api/v1`. No hay Firebase Auth, Next.js, D1, Drizzle, Supabase ni tokens en almacenamiento web.

## Capas y seguridad

- `src/app.ts` aplica Helmet, CORS allowlist, cookies con credenciales, límites, JSON y errores estables con `requestId`.
- `src/bootstrap` compone dependencias y rutas.
- Los módulos `auth`, `audit`, `administration`, `agents`, `devices`, `catalogs`, `citizens`, `vehicles`, `infractions`, `appeals`, `adjustments`, `finance`, `payments`, `solvencies` y `public-portal` viven dentro del mismo proceso y se componen desde el contenedor. No hay comunicación por red entre módulos ni duplicación de infraestructura.
- El acceso MySQL usa exclusivamente `mysql2/promise`, consultas parametrizadas y transacciones expuestas por `MySqlConnection`; no existe ORM.
- `authenticate` revalida sesión, cuenta, versión y autorización en MySQL; `authorize` aplica RBAC y audita denegaciones.
- Contraseñas Argon2id; sesiones opacas cuyo único valor persistido es SHA-256.

## Transacciones de infracciones

Crear una boleta bloquea los dos correlativos, valida agente/dispositivo, consulta tarifas efectivas, inserta snapshots, artículos, ubicación, total e historial en una transacción. Crear y enviar usan claves idempotentes. Las transiciones bloquean la boleta con `FOR UPDATE`, validan el estado y escriben historial/revisión. Auditoría conserva before/after.

Las evidencias se guardan bajo `PRIVATE_UPLOAD_DIR`, fuera del árbol público; MySQL conserva metadatos y SHA-256. El servidor valida límite, MIME, extensión y firma binaria JPEG/PNG/PDF. Solo rutas autenticadas entregan el archivo con `Cache-Control: private, no-store`.

## Impugnaciones y libro económico

La migración 007 separa el expediente legal del libro económico. Una resolución nunca sobrescribe `infractions.total_amount`: una modificación crea una corrección aprobada relacionada con la impugnación y una anulación cambia el estado legal con historial. Los reversos son contrapartidas append-only. Las decisiones bloquean filas, validan estados y prohíben resolver o aprobar el trabajo propio.

`institutional_rule_versions` conserva valores por vigencia, base legal y autorización. Los plazos sin regla se marcan pendientes; la emisión de una orden sin vigencia configurada se rechaza.

## Límite público

`public-portal` no reutiliza DTO internos. Publica solo estados terminales, conceptos y cuenta económica mediante referencias aleatorias de 160 bits. El buscador exige boleta y placa, aplica un límite independiente y audita sin persistir la entrada. El PDF de orden se genera en memoria y nunca se sirve evidencia privada.

`BalanceService` representa dinero como `DECIMAL`/cadenas y centavos `bigint`. `MySqlPaymentsLedger` suma únicamente asignaciones de pagos confirmados y resta reversos confirmados; una orden nunca modifica el saldo por sí sola.

Las órdenes se serializan con bloqueos de infracción y correlativo, guardan snapshots e idempotencia hasheada y se autoexpiran. Solo la confirmación transaccional de un pago marca una orden como `USED`.

## Caja, pagos y conciliación

`PaymentService` mantiene caja, registro, confirmación, recibo, reverso y conciliación dentro del mismo monolito. Las claves idempotentes se almacenan hasheadas; `SELECT ... FOR UPDATE` y restricciones únicas impiden doble turno, doble confirmación y doble consumo de orden. Los recibos solo nacen al confirmar. Los reversos crean `payment_reversals` y movimientos compensatorios: el pago confirmado permanece inmutable.

## Solvencias

`SolvencyService` recalcula el saldo al solicitar y nuevamente al aprobar. Saldo pendiente, pago registrado no confirmado o impugnación abierta bloquean la emisión. El documento guarda snapshots y una referencia aleatoria de 160 bits. Reversar un pago que sustentó saldo cero marca la solvencia vigente como `OBSERVED`; la consulta pública la reporta inválida y nunca devuelve PII.

El contrato `auth` y el contrato `full` coinciden después de 001–010.

## Analítica y reportes

`AnalyticsService` y `ReportService` pertenecen al módulo `analytics`. Reciben filtros validados, limitan el rango a 366 días y ejecutan agrupaciones en MySQL. No trasladan conjuntos transaccionales al navegador para calcular KPI. Los importes salen de columnas `DECIMAL` como cadenas; la aplicación no realiza aritmética monetaria con flotantes.

Los reportes están definidos mediante SQL y columnas permitidas por tipo. La API pagina a un máximo de 100 filas. CSV escribe BOM UTF-8 y procesa lotes de 500 hasta 10 000 filas, incluyendo fecha, usuario y rango; el resumen PDF agrega solo resultados acotados. Cada exportación queda auditada.

## Notificaciones

`NotificationService` materializa avisos internos a partir de plantillas configurables y una clave única por destinatario/evento. Las rutas solo consultan o modifican filas cuyo `recipient_user_id` coincide con la sesión. Los enlaces son rutas internas controladas bajo `/admin/`.

`notification_outbox` establece el límite para adaptadores futuros de correo, SMS o push. No existe despachador ni integración externa activa en TANDA 10; las preferencias externas se conservan forzosamente deshabilitadas. Los eventos conectados incluyen impugnaciones, ajustes, pagos, reversos, diferencias de caja y conciliación.

El contrato `auth` y el contrato `full` coinciden después de 001–012.

## Migración histórica

El módulo `historical-migrations` agrega una frontera anticorrupción entre formatos legados y entidades operativas. `HistoricalCsv` decodifica/valida sin ejecutar contenido; `HistoricalMigrationService` gobierna lotes, staging, revisión y auditoría; `OperationalHistoricalImporter` es el único adaptador que puede crear filas operativas y siempre recibe datos ya validados dentro de una transacción MySQL.

Los archivos viven fuera del árbol público. Las referencias legadas y mapeos versionados eliminan suposiciones entre Access y MySQL. Coincidencias naturales, referencias ausentes y catálogos desconocidos bloquean el lote. El commit es append-only y genera manifiesto previo; la reversión inspecciona dependencias antes de borrar exclusivamente filas creadas por el lote.

El contrato completo coincide con 79 tablas y migraciones 001–013. El panel React consume solo `/api/v1/admin/historical-migrations`; TANDA 11 no instala Access, no ejecuta macros y no agrega servicios externos.
