-- Migración 008: referencias públicas opacas, consulta segura y órdenes de pago.
-- No crea pagos, recibos, cajas ni solvencias; una orden emitida no acredita pago.

CREATE TABLE IF NOT EXISTS infraction_public_references (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  infraction_id BIGINT UNSIGNED NOT NULL,
  public_reference CHAR(40) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_accessed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_infraction_public_infraction (infraction_id),
  UNIQUE KEY uq_infraction_public_reference (public_reference),
  CONSTRAINT fk_infraction_public_infraction FOREIGN KEY (infraction_id) REFERENCES infractions (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_number VARCHAR(80) NOT NULL,
  public_reference CHAR(40) NOT NULL,
  infraction_id BIGINT UNSIGNED NOT NULL,
  infraction_public_reference_id BIGINT UNSIGNED NOT NULL,
  original_amount_snapshot DECIMAL(14,2) NOT NULL,
  adjustment_total_snapshot DECIMAL(14,2) NOT NULL,
  payment_total_snapshot DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  pending_balance_snapshot DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'GTQ',
  status VARCHAR(20) NOT NULL DEFAULT 'ISSUED',
  expiry_rule_version_id BIGINT UNSIGNED NOT NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  created_request_id CHAR(36) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_order_number (order_number),
  UNIQUE KEY uq_payment_order_public_reference (public_reference),
  KEY ix_payment_order_infraction (infraction_id, status, expires_at),
  CONSTRAINT fk_payment_order_infraction FOREIGN KEY (infraction_id) REFERENCES infractions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_order_public_infraction FOREIGN KEY (infraction_public_reference_id) REFERENCES infraction_public_references (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_order_expiry_rule FOREIGN KEY (expiry_rule_version_id) REFERENCES institutional_rule_versions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_payment_order_amounts CHECK (original_amount_snapshot >= 0 AND payment_total_snapshot >= 0 AND pending_balance_snapshot > 0),
  CONSTRAINT ck_payment_order_currency CHECK (currency='GTQ'),
  CONSTRAINT ck_payment_order_status CHECK (status IN ('ISSUED','EXPIRED','USED','CANCELLED')),
  CONSTRAINT ck_payment_order_expiry CHECK (expires_at > issued_at),
  CONSTRAINT ck_payment_order_not_receipt CHECK ((status='USED' AND used_at IS NOT NULL) OR (status<>'USED' AND used_at IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_order_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_order_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  action VARCHAR(40) NOT NULL,
  request_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_payment_order_history (payment_order_id, created_at, id),
  CONSTRAINT fk_payment_order_history_order FOREIGN KEY (payment_order_id) REFERENCES payment_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_payment_order_history_from CHECK (from_status IS NULL OR from_status IN ('ISSUED','EXPIRED','USED','CANCELLED')),
  CONSTRAINT ck_payment_order_history_to CHECK (to_status IN ('ISSUED','EXPIRED','USED','CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS public_idempotency_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope VARCHAR(80) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  response_status SMALLINT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_public_idempotency_scope_key (scope, key_hash),
  KEY ix_public_idempotency_expiry (expires_at),
  CONSTRAINT fk_public_idempotency_order FOREIGN KEY (resource_id) REFERENCES payment_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
