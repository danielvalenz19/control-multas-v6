# Modelo de datos

El esquema `pmt_multas` conserva las 68 tablas del contrato previo. TANDA 10 reutiliza `notification_templates` y añade tres tablas, para un total de 71.

## Tablas TANDA 10

- `notification_templates`: catálogo histórico reutilizado por `code + channel`; TANDA 10 usa únicamente `IN_APP`.
- `user_notification_preferences`: preferencia por usuario y código de evento. Los canales externos quedan en cero.
- `notifications`: bandeja individual, plantilla, contenido materializado, severidad, recurso/enlace controlado, clave de deduplicación y `read_at`.
- `notification_outbox`: frontera transaccional para adaptadores futuros; ningún proceso externo la consume en esta tanda.

`notifications.recipient_user_id` y las preferencias eliminan en cascada al eliminar físicamente un usuario, operación que no forma parte del flujo normal. La plantilla referenciada no puede borrarse mientras tenga avisos.

## Índices de consulta

La migración 011 agrega índices de fecha/estado para infracciones, pagos, impugnaciones, ajustes y auditoría. La bandeja usa `ix_notifications_inbox (recipient_user_id, read_at, created_at)`; la deduplicación usa `uq_notifications_recipient_dedupe`.

Los importes de dashboard y reportes provienen de `DECIMAL(14,2)`. MySQL y `mysql2` los conservan como cadenas; solo los conteos se convierten a número.

## Tablas TANDA 11

La migración 013 agrega ocho tablas y eleva el contrato a 79: `migration_batches`, `migration_files`, `migration_staging_rows`, `migration_validation_errors`, `migration_conflicts`, `migration_entity_mappings`, `migration_execution_logs` y `legacy_source_references`.

El lote es la raíz agregada de control. Archivo y staging no tienen cascadas destructivas; errores/conflictos referencian la fila staged; responsables referencian usuarios. La identidad legada es única por `(source_system, entity_type, legacy_id)` y el archivo por entidad+SHA-256. No existen claves foráneas dinámicas hacia `target_table/target_id`; la integridad polimórfica se valida y revierte en el importador con una allowlist y bloqueos transaccionales.

Los datos crudos/normalizados están en JSON solo dentro de staging. Las tablas operativas continúan normalizadas y reciben exclusivamente DTO validados. Los importes conservan formato decimal exacto y los originales de placa/documento conviven con su valor normalizado.
