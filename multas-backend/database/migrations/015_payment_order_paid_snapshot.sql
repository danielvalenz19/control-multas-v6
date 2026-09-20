-- Migración 015: permite que una orden usada conserve saldo cero en su snapshot.

ALTER TABLE payment_orders DROP CHECK ck_payment_order_amounts;
ALTER TABLE payment_orders ADD CONSTRAINT ck_payment_order_amounts CHECK (
  original_amount_snapshot >= 0
  AND payment_total_snapshot >= 0
  AND ((status='USED' AND pending_balance_snapshot >= 0) OR (status<>'USED' AND pending_balance_snapshot > 0))
);
