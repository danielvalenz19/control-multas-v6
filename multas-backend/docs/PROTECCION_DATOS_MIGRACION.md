# Protección de datos en migraciones

- Minimización: exportar solo campos contractuales; no adjuntos, contraseñas, macros ni columnas innecesarias.
- Transporte/almacenamiento: CSV fuera de rutas públicas, permisos restrictivos, TLS y canal institucional. `HISTORICAL_MIGRATION_DIR` no se versiona.
- Integridad: SHA-256, conteos, `legacy_id`, manifiesto previo, transacciones y auditoría con `requestId`.
- Confidencialidad: errores y conflictos guardan valores sensibles enmascarados; logs no contienen filas crudas. Reportes no exportan PII original.
- Acceso: permisos `historical_migrations.*` asignados exclusivamente a `ADMIN`; los intentos denegados se auditan.
- Retención: `HISTORICAL_MIGRATION_RETENTION_DAYS` registra vencimiento. `npm run migration:historical:cleanup` elimina archivos vencidos del directorio privado, marca `purged_at` y preserva hash, metadatos y auditoría. Prográmelo solo bajo el procedimiento institucional de conservación.
- Pruebas: únicamente datos sintéticos o muestra irreversiblemente anonimizada; nunca copiar producción a QA.
- Incidente: suspender lote, preservar hashes/bitácoras, revocar acceso si aplica y seguir el protocolo municipal. No “sanear” borrando evidencia.

La aplicación rechaza nombres con rutas, extensiones distintas a `.csv`, MIME no admitido, tamaño excesivo y firmas MZ/ZIP/OLE/NUL. El contenido se interpreta como datos; jamás se ejecuta.
