# Migración histórica

TANDA 11 implementa un carril controlado y auditable; no contiene información institucional. El flujo obligatorio es `Access/CSV → exportación → carga privada → staging → validación → revisión/mapeo → aprobación → confirmación → transacción → conciliación`. Nunca se inserta el CSV crudo directamente en tablas operativas.

## Estados

`UPLOADED`, `VALIDATING`, `VALIDATED`, `REQUIRES_REVIEW`, `READY`, `IMPORTING`, `COMPLETED`, `FAILED`, `CANCELLED` y `REVERTED`. Solo un lote sin errores ni conflictos abiertos puede aprobarse. Los valores dudosos quedan bloqueados; no existe corrección heurística.

## Componentes

- `migration_batches`, `migration_files` y `migration_staging_rows`: identidad, SHA-256, archivo privado, conteos y staging.
- `migration_validation_errors` y `migration_conflicts`: hallazgos enmascarados y revisión humana.
- `migration_entity_mappings`: decisiones versionadas por sistema, entidad, tipo y valor.
- `legacy_source_references`: vínculo durable `(sistema, entidad, legacy_id) → fila MySQL`.
- `migration_execution_logs` y `audit_logs`: bitácora técnica y auditoría HTTP.

La importación es append-only, por fragmentos de 250 dentro de una única transacción. No actualiza coincidencias existentes. Antes de importar crea un manifiesto privado con hash, archivo fuente y conteos de tablas; en producción debe complementarse con snapshot o respaldo administrado de MySQL.

## Límites

No se aceptan MDB/ACCDB, ZIP, ejecutables, OLE, bytes NUL ni macros. TANDA 11 no implementa Access en el servidor, aplicación móvil, despliegue, proveedores externos ni carga de datos reales.
