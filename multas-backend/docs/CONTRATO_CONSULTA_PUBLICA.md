# Contrato de consulta pública

## Entrada y protección contra enumeración

`POST /api/v1/public/infractions/search` exige simultáneamente `ticketNumber` completo y `plate`. La placa se normaliza a caracteres alfanuméricos en mayúscula y la boleta se compara de forma exacta tras recortar y normalizar mayúsculas. No existe endpoint de búsqueda solo por placa.

Una combinación inexistente, un expediente no público o una referencia inválida no revela cuál dato falló. La API usa códigos estables, `requestId`, límite público independiente y auditoría anónima. La auditoría guarda acción, referencia opaca cuando existe, IP y agente HTTP; no guarda la boleta ni la placa ingresadas.

## Salida permitida

La respuesta contiene únicamente referencia aleatoria de 160 bits, boleta, placa, fecha, ubicación del hecho, estado legal terminal público, conceptos, monto original, ajustes aprobados netos, pagos aplicados, saldo, elegibilidad de orden y un resumen mínimo del último pago confirmado (`status`, recibo y fecha). No incluye proveedor, identificadores internos ni datos de tarjeta.

Se excluyen IDs internos, DPI, nombre, dirección personal, teléfono, correo, propietario, datos del agente, notas internas, evidencias y el historial administrativo. La referencia pública no es secuencial y no sustituye la doble clave de la búsqueda inicial.

## Estados y dinero

Solo `VALIDADA` y `ANULADA` son visibles. Una anulada muestra saldo cobrable cero y no admite orden. Los importes viajan como cadenas decimales; MySQL usa `DECIMAL(14,2)` y TypeScript usa centavos `bigint`. `MySqlPaymentsLedger` incluye pagos confirmados y excluye sus reversos, sin que una orden o un pago registrado alteren el saldo.

Cuando la orden está vigente, el ciudadano puede iniciar un checkout alojado para tarjeta o un enlace Visa. El portal solo recibe la referencia opaca y el estado del intento; la confirmación del proveedor genera el pago y recibo. La consulta vuelve a mostrar saldo `0.00` y el recibo sin publicar PII.
