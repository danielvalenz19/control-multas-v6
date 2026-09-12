# Matriz de estados y transiciones

| Desde | Acción | Hacia | Permiso | Condiciones |
| --- | --- | --- | --- | --- |
| — | Crear | BORRADOR | `infractions.create` | Agente/dispositivo activos, artículos y correlativos; clave idempotente. |
| BORRADOR | Editar | BORRADOR | `infractions.update_own` | Propia para agente; total recalculado en servidor. |
| BORRADOR | Enviar | PENDIENTE_VALIDACION | `infractions.submit` | Artículos y evidencia requerida; clave idempotente. |
| DEVUELTA_CORRECCION | Editar | DEVUELTA_CORRECCION | `infractions.update_own` | Solo agente propietario o privilegiado. |
| DEVUELTA_CORRECCION | Reenviar | PENDIENTE_VALIDACION | `infractions.submit` | Mismas validaciones que el primer envío. |
| PENDIENTE_VALIDACION | Devolver | DEVUELTA_CORRECCION | `infractions.return` | Motivo, comentario y campos señalados. |
| PENDIENTE_VALIDACION | Rechazar | RECHAZADA | `infractions.reject` | Motivo y comentario obligatorios. |
| PENDIENTE_VALIDACION | Validar | VALIDADA | `infractions.validate` | El agente asociado no puede validar su propia boleta. |
| Estado no anulado | Anular | ANULADA | `infractions.cancel` | Motivo y comentario; nunca hay borrado físico. |

`VALIDADA`, `RECHAZADA` y `ANULADA` no admiten edición. Cada transición inserta `infraction_status_history`, cuando corresponde `validation_reviews`, y auditoría before/after.

## Impugnaciones

| Desde | Acción | Hacia | Permiso/condición |
| --- | --- | --- | --- |
| — | Presentar | PRESENTADA | `appeals.create`; infracción VALIDADA. |
| PRESENTADA / REQUIERE_INFORMACION | Enviar | EN_REVISION | Creador o revisor autorizado. |
| EN_REVISION | Solicitar información | REQUIERE_INFORMACION | `appeals.review`; comentario obligatorio. |
| PRESENTADA / EN_REVISION / REQUIERE_INFORMACION | Desistir | DESISTIDA | Comentario; conserva expediente. |
| EN_REVISION | Confirmar | RESUELTA_CONFIRMADA | `appeals.resolve`; decisor distinto del creador. |
| EN_REVISION | Modificar | RESUELTA_MODIFICADA | Crea corrección contable; no cambia monto original. |
| EN_REVISION | Anular | RESUELTA_ANULADA | Cambia infracción VALIDADA → ANULADA con historial. |

## Ajustes y órdenes

| Entidad | Desde | Acción | Hacia | Condición |
| --- | --- | --- | --- | --- |
| Ajuste | — | Solicitar | PENDING_APPROVAL | Infracción VALIDADA, monto exacto y autorización. |
| Ajuste | PENDING_APPROVAL | Aprobar/rechazar | APPROVED / REJECTED | Decisor distinto del solicitante. |
| Ajuste | APPROVED | Reversar | REVERSED | Crea contrapartida APPROVED; nunca borra. |
| Orden | — | Emitir | ISSUED | Saldo positivo, regla y correlativo vigentes. |
| Orden | ISSUED | Vencer | EXPIRED | `expires_at` transcurrido. |
| Orden | ISSUED | Confirmar pago | USED | Pago exacto registrado, orden vigente y bloqueo transaccional. |

## Caja y pagos

| Entidad | Desde | Acción | Hacia | Condición |
| --- | --- | --- | --- | --- |
| Turno | — | Abrir | OPEN | Caja activa; un turno compatible por cajero/caja. |
| Turno | OPEN | Movimiento | OPEN | Ingreso/egreso con motivo y autorización. |
| Turno | OPEN | Cerrar | CLOSED | Monto declarado; diferencia calculada en centavos exactos. |
| Pago | — | Registrar | REGISTERED | Orden `ISSUED`, no expirada/no usada y monto exacto. |
| Pago | REGISTERED | Confirmar | CONFIRMED | Clave idempotente; crea recibo y usa orden en una transacción. |
| Pago | CONFIRMED | Reversar | CONFIRMED | El original no cambia; se crea contrapartida única y movimiento compensatorio. |
| Conciliación | — | Crear | OPEN | Ítems reales y diferencias calculadas. |
| Conciliación | OPEN | Cerrar | CLOSED | Conserva ítems y diferencia. |

## Solvencias

| Entidad | Desde | Acción | Hacia | Condición |
| --- | --- | --- | --- | --- |
| Solicitud | — | Registrar | PENDING_REVIEW | Vehículo/propietario activos; snapshots reales. |
| Solicitud | PENDING_REVIEW | Aprobar | APPROVED | Saldo cero, sin pago pendiente, sin impugnación abierta y vigencia configurada. |
| Solicitud | PENDING_REVIEW | Rechazar | REJECTED | Motivo obligatorio. |
| Solvencia | — | Emitir | VALID | Correlativo/referencia únicos; una emisión por solicitud. |
| Solvencia | VALID / OBSERVED | Revocar | REVOKED | Motivo; historial; sin borrado. |
| Solvencia | VALID | Reverso de pago posterior | OBSERVED | La verificación pública la invalida. |
| Solvencia | VALID | Verificar vencida | EXPIRED | La vigencia terminó y se conserva historial. |
