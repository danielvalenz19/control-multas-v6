# Reglas legales y económicas pendientes de confirmación municipal

El software no asigna valores predeterminados a estas decisiones. `institutional_rule_versions` permite vigencias versionadas, base legal y referencia de autorización; si una regla obligatoria falta, el flujo queda pendiente o se rechaza de manera explícita.

Pendientes de confirmación:

- Días legales para presentar, subsanar y resolver una impugnación, calendario hábil/inhábil y autoridad competente.
- Días de vigencia de una orden de pago y tratamiento de feriados.
- Porcentajes o montos permitidos para descuentos, exoneraciones parciales/totales, recargos, mora e intereses.
- Causales, documentación, base legal y nivel de autorización para cada ajuste.
- Si el doble control de ajustes tiene excepciones adicionales. La implementación actual aplica segregación obligatoria y segura: nadie aprueba ni revierte su propia solicitud.
- Límites por rol, sede, monto o tipo de ajuste.
- Política para agrupar varias infracciones en una orden. TANDA 6 usa una sola infracción.
- Proveedores y reglas para canales electrónicos/POS/banco. TANDA 7 implementa únicamente caja y registro manual autorizado; la orden pasa a `USED` al confirmar el pago.
- Formato, firmas, membrete y texto legal definitivo del PDF de orden y de las resoluciones.
- Plazos de conservación de referencias públicas, órdenes, evidencia y registros de idempotencia.
- Costo o exoneración, requisitos documentales, firma/membrete y texto legal definitivo de las solvencias. La vigencia se debe configurar explícitamente en `SOLVENCY_VALIDITY_DAYS`; no existe valor semilla.

Decisiones conservadoras ya implementadas:

- No se acepta sobrepago, pago parcial ni agrupación multiorden sin regla municipal.
- Una impugnación abierta bloquea la solvencia.
- Un pago registrado pero no confirmado bloquea la solvencia.
- Reversar un pago después de emitir marca la solvencia como `OBSERVED` e inválida públicamente.
- Reimprimir recibo o solvencia no crea un nuevo documento.

Las pruebas crean reglas transaccionales marcadas como fixtures sin valor legal y las revierten; no quedan datos de prueba en MySQL.
