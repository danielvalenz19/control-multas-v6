# Diccionario Access/CSV → MySQL

Los nombres Access son desconocidos hasta recibir el archivo. Primero se registran mapeos `TABLE` y `COLUMN`; la tabla siguiente define el destino, no presupone el origen.

| Entidad CSV | Destino principal | Clave natural/legada | Relaciones |
| --- | --- | --- | --- |
| `citizens` | `citizens` | tipo + identificación normalizada / `legacy_id` | — |
| `vehicles` | `vehicles` | placa normalizada / `legacy_id` | propietario → citizen legado o mapeado |
| `agents` | `agents` | gafete / `legacy_id` | correo → usuario activo |
| `infractions` | `infractions` | boleta y expediente / `legacy_id` | sede, dispositivo, agente, vehículo, ciudadano |
| `infraction_items` | `infraction_items` | `legacy_id` | infracción, artículo y tarifa exacta |
| `payments` | `payments` | orden usada / `legacy_id` | orden, sesión de caja, método |
| `payment_allocations` | `payment_allocations` | `legacy_id` | pago e infracción |
| `receipts` | `payment_receipts` | correlativo / `legacy_id` | pago |
| `adjustments` | `infraction_adjustments` | `legacy_id` | infracción |
| `solvencies` | `solvencies` | número / `legacy_id` | solicitud aprobada, vehículo y regla |

Los tipos de mapeo son: `TABLE`, `COLUMN`, `STATUS`, `ARTICLE`, `AGENT` y `PAYMENT_METHOD`. Cada nueva decisión incrementa `version`; solo la última aprobada se aplica. Los estados vigentes se validan contra las restricciones y servicios actuales. Montos se reciben como decimal textual con dos dígitos; fechas como ISO; identificaciones y placas se normalizan de forma determinista, conservando el original.
