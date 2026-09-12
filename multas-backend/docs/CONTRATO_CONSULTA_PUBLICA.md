# Contrato de consulta pública

## Entrada y protección contra enumeración

`POST /api/v1/public/infractions/search` exige simultáneamente `ticketNumber` completo y `plate`. La placa se normaliza a caracteres alfanuméricos en mayúscula y la boleta se compara de forma exacta tras recortar y normalizar mayúsculas. No existe endpoint de búsqueda solo por placa.

Una combinación inexistente, un expediente no público o una referencia inválida no revela cuál dato falló. La API usa códigos estables, `requestId`, límite público independiente y auditoría anónima. La auditoría guarda acción, referencia opaca cuando existe, IP y agente HTTP; no guarda la boleta ni la placa ingresadas.

## Salida permitida

La respuesta contiene únicamente referencia aleatoria de 160 bits, boleta, placa, fecha, ubicación del hecho, estado legal terminal público, conceptos, monto original, ajustes aprobados netos, pagos aplicados mediante el puerto futuro, saldo y elegibilidad de orden.

Se excluyen IDs internos, DPI, nombre, dirección personal, teléfono, correo, propietario, datos del agente, notas internas, evidencias y el historial administrativo. La referencia pública no es secuencial y no sustituye la doble clave de la búsqueda inicial.

## Estados y dinero

Solo `VALIDADA` y `ANULADA` son visibles. Una anulada muestra saldo cobrable cero y no admite orden. Los importes viajan como cadenas decimales; MySQL usa `DECIMAL(14,2)` y TypeScript usa centavos `bigint`. `MySqlPaymentsLedger` incluye pagos confirmados y excluye sus reversos, sin que una orden o un pago registrado alteren el saldo.
