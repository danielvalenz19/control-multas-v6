# Reporte del esquema existente

Verificación final: 2026-08-30. Base `pmt_multas`, 38 tablas.

## Autenticación

`migration:status:auth`: `matches: true`, `differences: []`, sin migraciones pendientes.

Comprobación física final de autenticación:

| Evidencia | Resultado |
| --- | ---: |
| Usuarios activos | 1 |
| Usuarios activos con Argon2id | 1 |
| Asignaciones ADMIN activas | 1 |
| Permisos ADMIN | 64/64 |
| Asignaciones huérfanas | 0 |
| Sesiones totales/revocadas/activas | 2 / 2 / 0 |
| Eventos de autenticación | 4 |
| Registros de auditoría | 5 |

El flujo físico obtuvo health 200, readiness 200, login 200, me 200, sessions 200, logout 204, logout-all 204 y 401 después de cada revocación. `secretsPrinted` fue `false`.

## TANDA 2

La versión 004 creó `citizens`, `vehicles`, `driver_licenses` y `vehicle_ownerships`. Incluye identificación y placa normalizadas, unicidad, estados, claves foráneas e historial con una sola propiedad vigente por vehículo. No insertó datos operativos.

## Sistema completo

`migration:status:full`: `matches: false`. Diferencias exactas posteriores a 004:

```json
[
  { "table": "infractions", "kind": "MISSING_TABLE" },
  { "table": "payments", "kind": "MISSING_TABLE" },
  { "table": "solvencies", "kind": "MISSING_TABLE" }
]
```

Son obligatorias del producto completo y se implementarán mediante migraciones posteriores; no bloquean TANDA 1 ni TANDA 2.

| Versión | Descripción | applied_at UTC |
| --- | --- | --- |
| 001 | Base tecnica, autenticacion propia, RBAC, sesiones y auditoria | 2026-08-10 02:52:03.252 |
| 002 | Catalogos administrativos, tarifas versionadas y correlativos | 2026-08-10 02:52:03.296 |
| 003 | Semillas institucionales, roles y permisos RBAC | 2026-08-10 02:52:03.310 |
| 004 | Ciudadanos, vehiculos, licencias y propietarios | 2026-08-31 00:07:42.172 |

001–003 no cambiaron versión, descripción ni fecha. El historial se valida y omite; no usa `ON DUPLICATE KEY UPDATE`. `schema_migrations` no posee checksum, por lo que esa validación se reporta como no soportada. La integración MySQL de TANDA 2 usa rollback y dejó cero residuos.
