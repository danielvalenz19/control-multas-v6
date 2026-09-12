# Matriz de permisos TANDAS 3 a 8, 10 y 11

Se reutilizan los códigos existentes; no se duplicaron permisos conceptuales. `infractions.read` aplica filtro de propiedad a AGENT, `infractions.validate/return/reject` constituye revisión y `evidence.upload` constituye creación de evidencia.

| Capacidad | Código real | ADMIN | AGENT | PMT_OPERATOR | SUPERVISOR |
| --- | --- | ---: | ---: | ---: | ---: |
| Usuarios | `users.read/create/update/change_status/assign_roles` | Sí | No | No | Según asignación vigente |
| Roles | `roles.read/manage` | Sí | No | No | Según asignación vigente |
| Dispositivos | `devices.read/manage/assign` | Sí | Según permiso | Según permiso | Según permiso |
| Catálogos | `catalogs.read/manage` | Sí | Lectura según rol | Lectura según rol | Según permiso |
| Leer infracciones | `infractions.read` | Todas | Propias | Todas | Todas |
| Crear/editar/enviar | `infractions.create/update_own/submit` | Sí | Propias | Según permiso | Según permiso |
| Validar/devolver/rechazar | `infractions.validate/return/reject` | Sí | No por RBAC y autovalidación bloqueada | Sí | Según permiso |
| Anular | `infractions.cancel` | Sí | No | No | Sí, asignado por migración 006 |
| Evidencia | `evidence.upload/read` | Sí | Propias | Lectura | Lectura |

Las rutas aplican 401 a sesión ausente, 403 a permiso ausente y reglas de propiedad adicionales aun cuando exista el permiso genérico.

| Capacidad | Código | ADMIN | AGENT | PMT_OPERATOR | SUPERVISOR |
| --- | --- | ---: | ---: | ---: | ---: |
| Presentar impugnación | `appeals.create` | Sí | Según rol previo | Sí | Sí |
| Consultar impugnación | `appeals.read` | Sí | Según rol previo | Sí | Sí |
| Revisar impugnación | `appeals.review` | Sí | No | Sí | Sí |
| Resolver impugnación | `appeals.resolve` | Sí | No | No | Sí |
| Solicitar ajuste | `adjustments.create` | Sí | No | Sí | Sí |
| Aprobar/rechazar ajuste | `adjustments.approve` | Sí | No | No | Sí |
| Revertir ajuste | `adjustments.reverse` | Sí | No | No | Sí |

Aunque un rol tenga permiso, la autorresolución y la autoaprobación/reversión se rechazan. Las rutas `/public` no requieren sesión ni permisos internos; poseen DTO reducido, rate limit y auditoría anónima.

| Capacidad | Código | ADMIN | RECEPTORIA | SUPERVISOR |
| --- | --- | ---: | ---: | ---: |
| Administrar turno y movimientos | `cash.manage` | Sí | Sí | Sí |
| Registrar pago | `payments.create` | Sí | Sí | Según asignación |
| Consultar pago | `payments.read` | Sí | Sí | Según asignación |
| Confirmar pago/recibo | `payments.confirm` / `payments.receipt` | Sí | Sí | Según asignación |
| Reversar pago | `payments.reverse` | Sí | No por defecto | Sí |
| Conciliar | `reconciliations.manage` | Sí | Según asignación | Sí |

| Capacidad | Código | ADMIN | SOLVENCIAS | SUPERVISOR |
| --- | --- | ---: | ---: | ---: |
| Solicitar | `solvencies.request` | Sí | Sí | Sí |
| Consultar | `solvencies.read` | Sí | Sí | Sí |
| Aprobar/rechazar | `solvencies.review` | Sí | Sí | Sí |
| Descargar/reimprimir | `solvencies.read` / `solvencies.reprint` | Sí | Sí | Sí |
| Revocar | `solvencies.revoke` | Sí | Según asignación | Sí |

Antes de TANDA 10, el contrato RBAC físico coincidía 75/75. Las rutas públicas de verificación no aceptan sesión como sustituto de una referencia válida y no exponen capacidades internas.

| Capacidad TANDA 10 | Código | ADMIN | SUPERVISOR | Otros perfiles operativos |
| --- | --- | ---: | ---: | ---: |
| Dashboard | `dashboard.read` | Sí | Sí | No |
| Consultar reportes | `reports.read` | Sí | Sí | No |
| Exportar | `reports.export` | Sí | Sí | No |
| Bandeja propia | `notifications.read` | Sí | Sí | Según rol vigente |
| Preferencias propias | `notifications.preferences` | Sí | Sí | Receptoría según rol vigente |
| Plantillas | `notifications.templates` | Sí | No | No |

El contrato RBAC físico coincide 77/77 después de TANDA 10. Toda denegación conserva código `AUTH_FORBIDDEN`, `requestId` y auditoría.

| Migración histórica TANDA 11 | Código | ADMIN | Otros roles |
| --- | --- | ---: | ---: |
| Consultar lotes/plantillas/reportes | `historical_migrations.read` | Sí | No |
| Cargar CSV privado | `historical_migrations.upload` | Sí | No |
| Validar staging | `historical_migrations.validate` | Sí | No |
| Crear mapeos versionados | `historical_migrations.map` | Sí | No |
| Aprobar | `historical_migrations.approve` | Sí | No |
| Importar transaccionalmente | `historical_migrations.import` | Sí | No |
| Revertir de forma segura | `historical_migrations.revert` | Sí | No |

La migración 013 asigna estas siete capacidades únicamente a `ADMIN`. El contrato físico coincide 84/84; cada ruta conserva 401/403, `requestId` y auditoría de denegación.
