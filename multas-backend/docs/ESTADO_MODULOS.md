# Estado de módulos

| Módulo | Estado | Evidencia |
| --- | --- | --- |
| TANDA 0 auth/RBAC/sesiones/auditoría | **TERMINADA** | Administrador real, Argon2id, sesión opaca, eventos y auditoría verificados. |
| TANDA 1 frontend/integración | **TERMINADA** | React/Vite → Express `/api/v1` → MySQL, cookie HttpOnly. |
| TANDA 2 ciudadanos/vehículos | **TERMINADA** | Migración 004, API, UI, propietarios y rollback de integración. |
| TANDA 3 administración/catálogos | **TERMINADA** | Usuarios, RBAC, agentes, dispositivos, tarifas y correlativos reales. |
| TANDA 4 infracciones | **TERMINADA** | Migraciones 005–006, API/UI, snapshots, idempotencia, flujo y evidencia privada. |
| TANDA 5 impugnaciones/ajustes | **TERMINADA** | Migración 007, API/UI real, resolución confirmar/modificar/anular, segregación, libro económico, evidencia, auditoría e integración MySQL. |
| TANDA 6 consulta/órdenes | **TERMINADA** | Migración 008, doble clave, referencias opacas, límite antiabuso, saldo exacto, orden idempotente/concurrente, expiración y PDF no-recibo. |
| Licencias | Esquema preparado | Gestión funcional queda para su propia fase. |
| TANDA 7 pagos/caja/recibos | **TERMINADA** | Migración 009, API/UI real, dinero exacto, idempotencia, concurrencia, recibos posteriores a confirmación, reversos compensatorios, conciliación, auditoría e integración MySQL. |
| Mejora pagos en línea y verificación ciudadana | **TERMINADA EN QA / GATEWAY EXTERNO PENDIENTE** | Migraciones 014–015, checkout alojado para tarjeta/enlace Visa, referencias opacas, idempotencia, webhook HMAC, recibo sin turno de caja, bandeja de receptoría, saldo/orden/boleta actualizados y datos QA `QA-OP-0002`. Falta configurar el proveedor Visa/adquirente real y sus credenciales/webhook de producción. |
| TANDA 8 solvencias | **TERMINADA** | Migración 010, API/UI real, elegibilidad sobre saldo confiable, emisión concurrente única, PDF, revocación/observación, consulta pública sin PII, auditoría e integración MySQL. |
| TANDA 9 | **POSPUESTA** | No se implementó ninguna capacidad móvil, offline ni sincronización en este trabajo. |
| TANDA 10 dashboard/reportes/notificaciones | **TERMINADA** | Migraciones 011–012, agregaciones MySQL, 11 reportes paginados, CSV por lotes, resumen PDF, bandeja y preferencias internas, plantillas configurables, RBAC, auditoría y pruebas MySQL con rollback. |
| TANDA 11 migración histórica | **TERMINADA** | Migración 013, 8 tablas de control, 10 plantillas sintéticas, exportación Access documentada, API/CLI/UI, validación, mapeos, commit/reversión transaccionales y pruebas MySQL sin residuos operativos. |

Verificación de TANDAS 7–8: frontend con 16 pruebas y backend con 23 pruebas unitarias/HTTP más una integración MySQL transaccional que cubre caja, pago, recibo, reverso, conciliación, solvencia, revocación/observación, permisos, concurrencia y cero residuos. El contrato `auth` y `full` coinciden, RBAC coincide 75/75 y las migraciones 001–010 están aplicadas; 001–008 conservaron sus hashes. La revisión visual autenticada y pública pasó en 1440, 900 y 390 px sin desborde horizontal ni errores de consola.

Verificación de TANDA 10: el contrato completo coincide con 71 tablas y migraciones 001–012 aplicadas; RBAC coincide 77/77. El backend pasa 27 pruebas unitarias/HTTP y una integración MySQL transaccional; el frontend pasa 19 pruebas. La cobertura incorpora rango máximo y fechas válidas, CSV, dinero exacto, exclusión de pagos reversados, estados de solvencia, paginación, 403, notificación por evento, lectura individual/total, deduplicación y cero residuos tras rollback. Lint, build y auditoría de dependencias pasan en ambos proyectos. Dashboard, reportes, auditoría y notificaciones ya no consumen `mockApi`; la revisión autenticada en 1440×900, 900×900 y 390×844 no presentó desborde horizontal ni errores visibles.

Verificación de TANDA 11: contrato completo 79 tablas, migraciones 001–013 y RBAC 84/84. Se probaron las diez plantillas en dry-run, parser UTF-8/Windows-1252, archivos maliciosos, encabezados, fechas, montos, normalización, mapeo explícito, importación/reintento, rollback total, reversión segura y reversión bloqueada. Todo el material QA es sintético; no se importó información institucional.
La pantalla `/admin/migraciones-historicas` fue revisada autenticada en 1440×900, 900×900 y 390×844: carga, listado, detalle, pestañas y acciones permanecen accesibles, sin desborde horizontal ni errores visibles. El usuario y los lotes QA temporales fueron retirados; la comprobación final reportó cero residuos sintéticos operativos y de control.

Verificación de pagos en línea: migraciones 014–015 aplicadas sin diferencias; seed QA incorpora métodos `CARD_ONLINE`/`VISA_LINK`, `QA-BOLETA-0003`/`0004`, `QA-OP-0002`/`0003` y la cuenta `qa.admin`. Se validó creación del intento, enlace alojado, confirmación QA, recibo `QA-REC-000101`, orden `USED`, saldo `0.00`, consulta pública de pago confirmado y listado protegido de intentos para receptoría. `QA-OP-0003` queda como expediente pendiente para repetir la prueba sin borrar el historial anterior. El modo `external` queda deliberadamente sin activar hasta recibir contrato, credenciales y firma oficial del proveedor.
La consulta automática del estado del checkout usa un límite separado (`PUBLIC_PAYMENT_RATE_LIMIT_MAX`) y los sondeos silenciosos no muestran una alerta global cuando hay una respuesta temporal 429; así no se bloquea la consulta ciudadana por actualizar un pago.
