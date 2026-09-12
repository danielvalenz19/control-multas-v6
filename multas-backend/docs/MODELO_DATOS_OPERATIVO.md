# Modelo de datos operativo — TANDAS 3 a 8

Las migraciones aplicadas son inmutables: 001–004 no fueron editadas; 005 agregó el núcleo de infracciones y 006 el flujo y las evidencias. Todas las relaciones usan InnoDB, llaves foráneas restrictivas y fechas UTC.

## Administración y catálogos

- `users`, `roles`, `permissions`, `user_roles` y `role_permissions`: cuentas y autorización RBAC.
- `agents`: relación única con `users` y `badge_number` único. Solo `ACTIVE` emite boletas.
- `devices` y `device_assignments`: equipo institucional, asignación vigente única mediante columna generada e historial de liberaciones.
- `infraction_types` y `infraction_rate_versions`: artículo legal y monto versionado. Una tarifa anterior conserva el monto y recibe `effective_to`.
- `action_reasons`, `frequent_locations`, `departments`: catálogos sin borrado físico.
- `document_sequences`: secuencia única por sede, tipo y año. `SELECT ... FOR UPDATE` serializa el incremento.

## Infracciones

- `infractions`: boleta/expediente únicos, estado legal, relaciones operativas, total `DECIMAL(14,2)` y snapshots de agente, ciudadano, vehículo y dirección.
- `infraction_items`: cantidad variable de artículos; conserva código, nombre, base legal y monto de la versión aplicada.
- `infraction_locations`: lugar, dirección y coordenadas validadas.
- `infraction_evidence`: metadatos privados, MIME, extensión, tamaño, SHA-256, usuario/dispositivo y anulación lógica. El binario queda fuera del árbol público y su firma mágica debe coincidir con el MIME.
- `infraction_status_history`: historial append-only de transiciones.
- `validation_reviews`: decisiones, motivo, comentario y campos señalados.
- `idempotency_records`: clave única por alcance, hash de solicitud y respuesta persistida durante 24 horas.

## Impugnaciones y ajustes (007)

- `institutional_rule_versions`: configuración legal/económica por vigencia, tipo, base legal y autorización; no contiene valores semilla inventados.
- `appeals`, `appeal_status_history` y `appeal_evidence`: expediente único, interesado en snapshot, plazo configurable, resolución, historial y documentos privados.
- `infraction_adjustments` e `infraction_adjustment_history`: débitos/créditos, solicitud/decisión, autorización, relación a impugnación y contrapartida de reversión. El original permanece inmutable.

## Consulta y órdenes (008)

- `infraction_public_references`: relación única entre infracción y referencia aleatoria pública.
- `payment_orders`: número institucional y referencia pública únicos, una infracción, snapshots `DECIMAL`, moneda GTQ, vigencia versionada y estado. No es una tabla de pagos.
- `payment_order_status_history`: creación y expiración append-only con `requestId`.
- `public_idempotency_records`: hash de clave/solicitud, recurso y expiración; nunca almacena la clave original.

## Caja, pagos y conciliación (009)

- `cash_desks` y `payment_methods`: catálogos del baseline reutilizados sin duplicar conceptos.
- `cash_sessions`: apertura, cierre, esperado, declarado y diferencia. Columnas generadas y restricciones únicas impiden turnos activos incompatibles.
- `cash_movements`: apertura, cierre, pagos, reversos e ingresos/egresos autorizados; nunca se borra el libro.
- `payments` y `payment_allocations`: registro contra una orden y asignación a su infracción. El esquema admite varias asignaciones aunque la orden actual corresponda a una sola infracción.
- `payment_receipts`: correlativo único creado solamente con pago confirmado; registra cantidad de copias.
- `payment_reversals`: contrapartida única con motivo, autorización y actor; no modifica el pago original.
- `payment_idempotency_records`: hashes por operación y usuario para registrar, confirmar y reversar.
- `reconciliation_batches` y `reconciliation_items`: fuente manual/importada, sumas observadas, diferencias y cierre.

## Solvencias (010)

- `solvency_requests`: solicitud, snapshots del vehículo/propietario/saldo y decisión.
- `solvency_request_status_history`: historial append-only de solicitud, aprobación o rechazo.
- `solvencies`: correlativo y referencia pública únicos, snapshots JSON, emisión, vigencia, revocación u observación. Una columna generada limita a una solvencia activa por vehículo.
- `solvency_status_history`: historial append-only de `VALID`, `REVOKED`, `OBSERVED` y `EXPIRED`.

Las migraciones 001–010 están aplicadas. El contrato `full` coincide con las 68 tablas físicas esperadas.
