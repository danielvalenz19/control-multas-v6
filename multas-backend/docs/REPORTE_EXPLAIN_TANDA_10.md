# EXPLAIN — TANDA 10

Fecha de revisión: 2026-09-11. Base local con volumen de desarrollo; los planes pueden cambiar cuando crezca la cardinalidad.

| Consulta | Plan observado | Resultado |
| --- | --- | --- |
| KPI de infracciones por estado y rango | recorrido por `ix_infractions_status_created` y agregado por grupo | Sin recorrido de tabla completo. |
| Recaudación diaria vigente | índice `ix_payments_status`, antijoin de una fila por `uq_payment_reversal_payment`, usuario por PK | El reverso se excluye en SQL sin N+1. |
| Bandeja no leída | covering range scan inverso por `ix_notifications_inbox` | Satisface destinatario, lectura, orden y límite. |
| Auditoría por rango | covering range scan inverso por `ix_audit_logs_date` | Satisface rango y orden descendente. |

La transformación `DATE_FORMAT` requiere tabla temporal para agrupar días; el conjunto de entrada queda limitado primero por estado y rango. Se añadieron `ix_payments_reports` e índices equivalentes para cardinalidades de producción. No se incorporó Redis ni una caché distribuida.
