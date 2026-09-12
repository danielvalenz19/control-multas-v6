# Contrato de solvencias

## Solicitud y revisión

La solicitud es interna y exige vehículo activo con propietario vigente. Guarda snapshots del vehículo, propietario y situación financiera. La aprobación recalcula la elegibilidad bajo bloqueo; no confía únicamente en el snapshot de solicitud.

La emisión se rechaza cuando existe:

- saldo pendiente distinto de cero;
- pago `REGISTERED` aún no confirmado;
- impugnación abierta;
- otra solvencia activa para el vehículo;
- ausencia de una regla vigente `SOLVENCY_VALIDITY_DAYS` o de correlativo institucional.

No se cobra tarifa porque no existe una definición municipal aprobada. Tampoco se inventan membrete, firma o texto legal.

## Documento

La aprobación crea un correlativo único, referencia pública aleatoria de 160 bits, emisión, vencimiento configurable y snapshots JSON. Descargar nuevamente el PDF no crea otra solvencia.

## Estados públicos

- `VALID`: documento vigente y verificable.
- `REVOKED`: revocado expresamente, inválido.
- `OBSERVED`: una condición financiera posterior —por ejemplo, reversar un pago— invalida su uso.
- `EXPIRED`: vencimiento alcanzado, inválido.

La verificación pública devuelve solo correlativo, referencia, estado, validez y fechas. Nunca devuelve placa, vehículo, propietario, identificación, saldo ni motivos internos.
