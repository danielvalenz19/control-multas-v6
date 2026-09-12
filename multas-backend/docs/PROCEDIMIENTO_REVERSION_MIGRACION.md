# Procedimiento de reversión de migración

La reversión solo aplica a un lote `COMPLETED` identificable. Antes de ejecutarla, detenga nuevas operaciones sobre sus registros, conserve el reporte y valide el motivo con el responsable institucional.

```bash
npm run migration:historical:revert -- --batch=42
```

Escriba `REVERTIR <uuid-del-lote>`. El servicio bloquea las referencias, comprueba dependencias posteriores y elimina en orden únicamente filas creadas por el lote dentro de una transacción. No revierte filas mapeadas ni datos previos. Si existen propiedades, licencias, infracciones, pagos, recursos, historiales, conciliaciones u otras referencias posteriores, responde `MIGRATION_REVERT_UNSAFE`, conserva el lote y registra `BLOCKED`.

Tras una reversión correcta el lote queda `REVERTED`, staging queda marcado, las referencias legadas conservan `reverted_at` para trazabilidad y el reporte permanece disponible. Repetir la misma reversión es idempotente. No borre manualmente controles ni use `DROP TABLE`.
