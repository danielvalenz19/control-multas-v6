-- BASELINE DE REFERENCIA; NO EJECUTAR COMO MIGRACIÓN DDL.
-- El esquema pmt_multas fue creado previamente. scripts/migrate.ts consulta
-- information_schema y solo registra las versiones 001-003 cuando todas las
-- tablas y columnas del contrato de src/shared/infrastructure/mysql/SchemaInspector.ts coinciden.
-- No contiene DROP, ALTER ni CREATE para impedir recreaciones accidentales.

SELECT table_name, column_name, column_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'pmt_multas'
ORDER BY table_name, ordinal_position;
