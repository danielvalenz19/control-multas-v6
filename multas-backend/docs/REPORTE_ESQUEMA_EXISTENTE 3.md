# Reporte del esquema existente

Verificación: 2026-08-29. Base `pmt_multas`, 34 tablas.

## Autenticación

`migration:status:auth`: `matches: true`, `differences: []`, sin migraciones pendientes. RBAC: ADMIN activo, 56 permisos asignados y cero huérfanos.

## Sistema completo

`migration:status:full`: `matches: false`. Diferencias exactas:

```json
[
  { "table": "citizens", "kind": "MISSING_TABLE" },
  { "table": "vehicles", "kind": "MISSING_TABLE" },
  { "table": "infractions", "kind": "MISSING_TABLE" },
  { "table": "payments", "kind": "MISSING_TABLE" },
  { "table": "solvencies", "kind": "MISSING_TABLE" }
]
```

Son obligatorias del producto completo y quedan planificadas para migraciones versionadas posteriores; no bloquean auth y no fueron tocadas.

| Versión | Descripción | applied_at UTC |
| --- | --- | --- |
| 001 | Base tecnica, autenticacion propia, RBAC, sesiones y auditoria | 2026-08-10 02:52:03.252 |
| 002 | Catalogos administrativos, tarifas versionadas y correlativos | 2026-08-10 02:52:03.296 |
| 003 | Semillas institucionales, roles y permisos RBAC | 2026-08-10 02:52:03.310 |

No se ejecutó migrate porque no hay pendientes. No se cambiaron fechas/descripciones/versiones ni hubo DDL. La tabla no posee checksum. `test:integration` creó auth temporal dentro de una transacción revertida; no dejó residuos ni alteró las cinco tablas.
