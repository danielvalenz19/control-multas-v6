# Respaldo previo a TANDAS 7–8

Antes de aplicar 009 se generó un respaldo lógico de `pmt_multas`:

- Archivo local ignorado por Git: `backups/pmt_multas_pre_tandas_7_8_2026-09-11T15-41-57-732Z.sql`
- Tamaño: 125103 bytes.
- SHA-256: `0b4352f494b031ec6f14f8c8c62eb132e82bc530a3b313c9581160b89ba154a5`.
- Opciones: transacción única, lectura rápida, blobs hexadecimales, triggers, rutinas y eventos.
- Momento: 2026-09-11, antes de ejecutar 009 y 010.

El respaldo contiene datos reales y credenciales hasheadas: permanece fuera del repositorio y debe tratarse como confidencial. Antes de restaurar, valide el hash y use una base aislada; nunca restaure sobre el entorno vigente sin autorización y una copia más reciente.

Las migraciones nuevas quedaron aplicadas una sola vez:

- 009: `c18516bebca5a66b5915d6d1b07c30cb58b93b029942408f3773baee263e2c1c`
- 010: `442db959acc19ddb6f73f02f8ed6f65713e16e0e80f96f235039cadf57b70d2e`
