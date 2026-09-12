# Matriz de datos sensibles

| Dato | Exposición | Control |
| --- | --- | --- |
| Identificación y nombre | Interna restringida | Sesión + `citizens.read_restricted`. |
| NIT, dirección, teléfono, correo | Interna sensible | Solo `citizens.read_sensitive`; omitidos en otro caso. |
| Placa y datos registrales | Interna | Sesión + `vehicles.read`; sin búsqueda pública solo por placa. |
| Contraseña | Nunca se devuelve | Argon2id; entrada oculta. |
| Token de sesión | Solo cookie | HttpOnly; en MySQL solo SHA-256. |
| Auditoría | Administrativa | Sin contraseña, hash ni token. |
| Referencia externa/autorización de pago | Interna financiera | Sesión y permiso de pagos; no aparece en el portal público. |
| Recibo y conciliación | Interna financiera | Sesión + permiso; PDF con caché privada deshabilitada. |
| Snapshot de propietario en solvencia | Interna restringida | Guardado para trazabilidad; omitido por completo del DTO público. |
| Referencia pública de solvencia | Pública y aleatoria | 160 bits, no secuencial; solo expone correlativo, estado y vigencia. |
| Motivos de reverso/revocación | Interna auditada | No se publican ni se incluyen secretos o credenciales. |
