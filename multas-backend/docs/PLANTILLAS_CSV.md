# Plantillas CSV históricas

Las diez plantillas descargables viven en `database/templates/historical/`. La primera fila es contractual y la segunda es un ejemplo completamente sintético. No sustituya ni reordene encabezados sin un mapeo `COLUMN` aprobado.

| Archivo | Obligatorios | Fechas/moneda | Vínculos legados |
| --- | --- | --- | --- |
| `citizens.csv` | legacy, tipo/número, nombres, apellidos, estado | — | — |
| `vehicles.csv` | legacy, placa, tarjeta, tipo, marca, línea, color, estado | `ownership_started_at` ISO | `owner_legacy_id` |
| `agents.csv` | legacy, correo de usuario, gafete, estado | `hired_at` ISO | usuario por correo |
| `infractions.csv` | legacy, boleta, expediente, sede, agente, dispositivo, vehículo, estado, fecha, lugar, total | ISO; `0.00` GTQ | ciudadano/agente/vehículo |
| `infraction_items.csv` | legacy, infracción, artículo, monto | `0.00` GTQ | infracción |
| `payments.csv` | legacy, orden, caja, método, monto, GTQ, estado | ISO; `0.00` GTQ | orden operativa |
| `payment_allocations.csv` | legacy, pago, infracción, monto | `0.00` GTQ | pago e infracción |
| `receipts.csv` | legacy, pago, recibo, emisión | ISO | pago |
| `adjustments.csv` | legacy, infracción, tipo, dirección, monto, estado, motivo, autorización, solicitud | ISO; `0.00` GTQ | infracción |
| `solvencies.csv` | legacy, solicitud, número, vehículo, estado, emisión, expiración, regla | ISO | vehículo y solicitud |

Fechas: `YYYY-MM-DD` o `YYYY-MM-DD HH:mm:ss`. Moneda: punto decimal y exactamente dos decimales, sin separador de miles. Booleanos: `0` o `1`. CSV: comas, comillas dobles escapadas duplicándolas, UTF-8 preferido; Windows-1252 se detecta y registra.
