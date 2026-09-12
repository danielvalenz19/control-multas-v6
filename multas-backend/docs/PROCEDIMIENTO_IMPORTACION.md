# Procedimiento de importación

## Precondiciones

- Migración 013 aplicada, `migration:status:full` y `rbac:status` en verde.
- Operador ADMIN autorizado; CSV y hash aprobados; respaldo/snapshot institucional documentado.
- Dependencias cargadas en orden: ciudadanos → vehículos/agentes → infracciones → conceptos → pagos → aplicaciones/recibos/ajustes → solvencias.

## Dry-run

```bash
npm run migration:historical:dry-run -- --path=/ruta/citizens.csv --entity=citizens --source=ACCESS_2026
```

Solo escribe control/staging, genera `errors.csv` y `conflicts.csv` en almacenamiento privado y no imprime PII completa. Revise en `/admin/migraciones-historicas`, registre mapeos explícitos y vuelva a validar. Un lote con hallazgos queda `REQUIRES_REVIEW`.

## Commit

Apruebe el lote y ejecute:

```bash
npm run migration:historical:commit -- --batch=42
```

Escriba `IMPORTAR <uuid-del-lote>`. Para automatización controlada puede pasar `--confirm="IMPORTAR <uuid>"`. El servicio genera un manifiesto preimportación SHA-256, bloquea el lote, escribe en una transacción y conserva referencias legadas. Si una fila falla, todo el lote hace rollback y queda `FAILED`. Repetir un lote completado es idempotente.

## Conciliación

Descargue `GET /api/v1/admin/historical-migrations/batches/:id/report`; compare total, válidas, rechazadas, duplicadas, importadas, hash, manifiesto y conteos de origen. Conserve evidencia según la política institucional. Nunca corrija directamente una fila importada para “hacerla coincidir”; abra el proceso funcional correspondiente.
