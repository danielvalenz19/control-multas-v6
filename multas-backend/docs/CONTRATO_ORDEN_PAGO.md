# Contrato de orden de pago

Una orden de pago es una instrucción temporal para presentar en receptoría. No es un cobro, recibo, comprobante, aplicación de pago ni solvencia.

## Emisión

`POST /api/v1/public/payment-orders` recibe una referencia pública de infracción y `Idempotency-Key`. Solo emite para una infracción `VALIDADA` con saldo positivo, una versión vigente `PAYMENT_ORDER_EXPIRY_DAYS` y un correlativo `PAYMENT_ORDER` configurado para sede/año. Al faltar cualquiera, la operación se rechaza sin inventar una fecha o número.

La transacción bloquea la infracción, expira órdenes vencidas, reutiliza una vigente, obtiene el correlativo con `FOR UPDATE`, guarda snapshots de original/ajustes/pagos/saldo y registra historial. La clave de idempotencia se conserva únicamente como SHA-256. Dos solicitudes concurrentes para la misma infracción obtienen la misma orden vigente; el correlativo no se duplica.

## Referencias, estados y documento

El acceso público usa una referencia aleatoria de 160 bits, nunca el ID consecutivo. Estados internos equivalentes: `ISSUED` (vigente), `EXPIRED`, `CANCELLED` y `USED`. Solo la confirmación transaccional de un pago real escribe `USED`; emitir o consultar la orden no lo hace.

El PDF incluye número, boleta, placa, saldo snapshot, emisión, vencimiento y estado. Lleva el texto inequívoco “NO ES RECIBO PAGADO NI CONSTANCIA DE PAGO”. Se entrega con `Cache-Control: private, no-store`.

La versión actual admite una infracción por orden. Agrupar infracciones queda pendiente de decisión municipal y de una migración futura, sin reinterpretar órdenes históricas.
