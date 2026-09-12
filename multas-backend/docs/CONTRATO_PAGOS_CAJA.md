# Contrato de caja, pagos y conciliación

## Principios

- Una orden `ISSUED` vigente autoriza registrar un pago, pero no acredita pago ni crea recibo.
- Registrar crea un pago `REGISTERED`; confirmar crea el recibo y cambia la orden a `USED` en la misma transacción.
- El monto debe coincidir exactamente con el saldo de la orden. No hay sobrepago, pago parcial ni pasarela simulada.
- Todos los importes viajan como cadenas decimales, se persisten como `DECIMAL` y se calculan en centavos `bigint`.
- Registrar, confirmar y reversar exigen `Idempotency-Key`. Los bloqueos de fila y restricciones únicas protegen contra concurrencia.
- Un pago confirmado es inmutable. Reversar agrega una contrapartida y movimientos compensatorios.

## Recibos

El recibo existe solamente después de confirmar. `GET /payments/:id/receipt` entrega el original; `?copy=true` rotula y audita una copia, incrementando el contador sin crear otro recibo.

## Caja

Un turno `OPEN` conserva monto de apertura, movimientos, ingresos por pagos y reversos. Al cerrar se persisten monto esperado, declarado y diferencia. Ingresos o egresos manuales requieren motivo y referencia de autorización.

## Conciliación

Los lotes pueden ser `MANUAL` o `IMPORTED`. Un origen importado conserva nombre y SHA-256 cuando se proveen. Cada ítem relaciona un pago real, monto observado y diferencia; cerrar no borra ni modifica ítems.

## Saldo

`saldo = monto original + ajustes aprobados - pagos confirmados + reversos`. Una orden, un pago registrado o un recibo reimpreso no alteran el saldo.
