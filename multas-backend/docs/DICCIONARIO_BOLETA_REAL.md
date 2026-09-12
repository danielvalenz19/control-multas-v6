# Diccionario de la boleta real

| Dato | Persistencia | Regla |
| --- | --- | --- |
| Número de boleta | `infractions.ticket_number` | Único, generado desde `document_sequences/INFRACTION`. |
| Expediente | `infractions.case_number` | Único, generado desde `document_sequences/CASE_FILE`. |
| Agente/dispositivo | `agent_id`, `device_id` | Agente y dispositivo activos; dispositivo asignado al usuario del agente. |
| Infractor | `citizen_id` nullable + snapshots | Opcional; nombre, identificación, NIT y dirección quedan congelados. |
| Vehículo | `vehicle_id` + snapshots | Placa, tarjeta, tipo, marca, línea y color quedan congelados. |
| Lugar | `infraction_locations` + `location_snapshot` | Dirección histórica; latitud −90..90 y longitud −180..180. |
| Momento | `occurred_at` | UTC en MySQL; interfaz en `America/Guatemala`. |
| Artículos | `infraction_items` | Sin columnas numeradas; 1–25 artículos únicos por tipo. |
| Monto | `amount_snapshot`, `total_amount` | `DECIMAL`; solo el servidor consulta tarifa efectiva y suma. |
| Firma/negativa | `infraction_evidence.evidence_type=SIGNATURE`, `driver_refused_signature` | Evidencia privada o negativa explícita. |
| Evidencia | `infraction_evidence` | JPEG/PNG/PDF, no base64, firma binaria validada, SHA-256 y acceso autenticado. |
| Envío/validación | `submitted_at`, `validated_at`, `validated_by_user_id` | Se registran en UTC durante la transición. |

Una boleta validada no se actualiza. Cambios posteriores en catálogos, ciudadano, vehículo, agente o dirección no alteran sus snapshots.
