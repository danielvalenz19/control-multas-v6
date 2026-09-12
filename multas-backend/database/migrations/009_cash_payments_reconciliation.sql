-- Migración 009: caja, pagos, recibos, reversos y conciliación.
-- Reutiliza cash_desks y payment_methods del baseline institucional.
-- No inserta métodos, cajas, tarifas ni reglas económicas predeterminadas.

CREATE TABLE IF NOT EXISTS cash_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cash_desk_id BIGINT UNSIGNED NOT NULL,
  cashier_user_id BIGINT UNSIGNED NOT NULL,
  opened_by_user_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  opening_amount DECIMAL(14,2) NOT NULL,
  opened_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closing_declared_amount DECIMAL(14,2) NULL,
  expected_closing_amount DECIMAL(14,2) NULL,
  difference_amount DECIMAL(14,2) NULL,
  closing_note VARCHAR(1000) NULL,
  closed_at DATETIME(3) NULL,
  closed_by_user_id BIGINT UNSIGNED NULL,
  active_cash_desk_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status='OPEN' THEN cash_desk_id ELSE NULL END) STORED,
  active_cashier_user_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status='OPEN' THEN cashier_user_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cash_session_active_desk (active_cash_desk_id),
  UNIQUE KEY uq_cash_session_active_cashier (active_cashier_user_id),
  KEY ix_cash_sessions_cashier (cashier_user_id, opened_at),
  KEY ix_cash_sessions_status (status, opened_at),
  CONSTRAINT fk_cash_sessions_desk FOREIGN KEY (cash_desk_id) REFERENCES cash_desks (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cash_sessions_cashier FOREIGN KEY (cashier_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cash_sessions_opened_by FOREIGN KEY (opened_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cash_sessions_closed_by FOREIGN KEY (closed_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_cash_sessions_status CHECK (status IN ('OPEN','CLOSED')),
  CONSTRAINT ck_cash_sessions_amounts CHECK (opening_amount >= 0 AND (closing_declared_amount IS NULL OR closing_declared_amount >= 0)),
  CONSTRAINT ck_cash_sessions_close CHECK (
    (status='OPEN' AND closed_at IS NULL AND closed_by_user_id IS NULL AND closing_declared_amount IS NULL AND expected_closing_amount IS NULL AND difference_amount IS NULL) OR
    (status='CLOSED' AND closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL AND closing_declared_amount IS NOT NULL AND expected_closing_amount IS NOT NULL AND difference_amount IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_reference CHAR(40) NOT NULL,
  payment_order_id BIGINT UNSIGNED NOT NULL,
  cash_session_id BIGINT UNSIGNED NOT NULL,
  payment_method_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'GTQ',
  external_reference VARCHAR(200) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'REGISTERED',
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_request_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  confirmed_by_user_id BIGINT UNSIGNED NULL,
  confirmation_request_id CHAR(36) NULL,
  confirmed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_public_reference (public_reference),
  UNIQUE KEY uq_payments_order (payment_order_id),
  KEY ix_payments_session (cash_session_id, status, created_at),
  KEY ix_payments_method (payment_method_id, status, created_at),
  KEY ix_payments_status (status, created_at),
  CONSTRAINT fk_payments_order FOREIGN KEY (payment_order_id) REFERENCES payment_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payments_session FOREIGN KEY (cash_session_id) REFERENCES cash_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payments_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payments_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payments_confirmed_by FOREIGN KEY (confirmed_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_payments_amount CHECK (amount > 0),
  CONSTRAINT ck_payments_currency CHECK (currency='GTQ'),
  CONSTRAINT ck_payments_status CHECK (status IN ('REGISTERED','CONFIRMED')),
  CONSTRAINT ck_payments_confirmation CHECK (
    (status='REGISTERED' AND confirmed_by_user_id IS NULL AND confirmation_request_id IS NULL AND confirmed_at IS NULL) OR
    (status='CONFIRMED' AND confirmed_by_user_id IS NOT NULL AND confirmation_request_id IS NOT NULL AND confirmed_at IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  infraction_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_allocation_infraction (payment_id, infraction_id),
  KEY ix_payment_allocations_infraction (infraction_id, payment_id),
  CONSTRAINT fk_payment_allocations_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_allocations_infraction FOREIGN KEY (infraction_id) REFERENCES infractions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_payment_allocations_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  receipt_number VARCHAR(80) NOT NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  issued_by_user_id BIGINT UNSIGNED NOT NULL,
  original_request_id CHAR(36) NOT NULL,
  copy_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_copied_at DATETIME(3) NULL,
  last_copied_by_user_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_receipt_payment (payment_id),
  UNIQUE KEY uq_payment_receipt_number (receipt_number),
  CONSTRAINT fk_payment_receipts_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_receipts_issued_by FOREIGN KEY (issued_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_receipts_copied_by FOREIGN KEY (last_copied_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_reversals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id BIGINT UNSIGNED NOT NULL,
  reversal_reference CHAR(40) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  authorization_reference VARCHAR(200) NOT NULL,
  cash_session_id BIGINT UNSIGNED NOT NULL,
  reversed_by_user_id BIGINT UNSIGNED NOT NULL,
  request_id CHAR(36) NOT NULL,
  reversed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_reversal_payment (payment_id),
  UNIQUE KEY uq_payment_reversal_reference (reversal_reference),
  KEY ix_payment_reversals_session (cash_session_id, reversed_at),
  CONSTRAINT fk_payment_reversals_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_reversals_session FOREIGN KEY (cash_session_id) REFERENCES cash_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_reversals_user FOREIGN KEY (reversed_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_payment_reversal_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cash_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cash_session_id BIGINT UNSIGNED NOT NULL,
  movement_type VARCHAR(30) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  payment_id BIGINT UNSIGNED NULL,
  payment_reversal_id BIGINT UNSIGNED NULL,
  reason VARCHAR(1000) NOT NULL,
  authorization_reference VARCHAR(200) NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  request_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cash_movement_payment (payment_id),
  UNIQUE KEY uq_cash_movement_reversal (payment_reversal_id),
  KEY ix_cash_movements_session (cash_session_id, created_at),
  CONSTRAINT fk_cash_movements_session FOREIGN KEY (cash_session_id) REFERENCES cash_sessions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cash_movements_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cash_movements_reversal FOREIGN KEY (payment_reversal_id) REFERENCES payment_reversals (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_cash_movements_user FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_cash_movements_type CHECK (movement_type IN ('OPENING','PAYMENT','MANUAL_INCOME','MANUAL_EXPENSE','PAYMENT_REVERSAL')),
  CONSTRAINT ck_cash_movements_direction CHECK (direction IN ('IN','OUT')),
  CONSTRAINT ck_cash_movements_amount CHECK (amount >= 0),
  CONSTRAINT ck_cash_movements_source CHECK (
    (movement_type='PAYMENT' AND payment_id IS NOT NULL AND payment_reversal_id IS NULL) OR
    (movement_type='PAYMENT_REVERSAL' AND payment_id IS NULL AND payment_reversal_id IS NOT NULL) OR
    (movement_type IN ('OPENING','MANUAL_INCOME','MANUAL_EXPENSE') AND payment_id IS NULL AND payment_reversal_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_idempotency_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  scope VARCHAR(80) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  response_status SMALLINT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_idempotency_actor_scope_key (actor_user_id, scope, key_hash),
  KEY ix_payment_idempotency_expiry (expires_at),
  CONSTRAINT fk_payment_idempotency_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_idempotency_resource FOREIGN KEY (resource_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_payment_idempotency_status CHECK (response_status BETWEEN 100 AND 599)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS reconciliation_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_reference CHAR(40) NOT NULL,
  payment_method_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  source_reference VARCHAR(200) NOT NULL,
  source_file_name VARCHAR(255) NULL,
  source_checksum_sha256 CHAR(64) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  expected_total DECIMAL(14,2) NOT NULL,
  observed_total DECIMAL(14,2) NOT NULL,
  difference_amount DECIMAL(14,2) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closed_by_user_id BIGINT UNSIGNED NULL,
  closed_at DATETIME(3) NULL,
  closing_note VARCHAR(1000) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reconciliation_reference (public_reference),
  UNIQUE KEY uq_reconciliation_source (payment_method_id, source_type, source_reference),
  KEY ix_reconciliation_status (status, created_at),
  CONSTRAINT fk_reconciliation_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reconciliation_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reconciliation_closed_by FOREIGN KEY (closed_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_reconciliation_source CHECK (source_type IN ('MANUAL','IMPORTED')),
  CONSTRAINT ck_reconciliation_status CHECK (status IN ('OPEN','CLOSED')),
  CONSTRAINT ck_reconciliation_close CHECK ((status='OPEN' AND closed_at IS NULL AND closed_by_user_id IS NULL) OR (status='CLOSED' AND closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS reconciliation_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reconciliation_batch_id BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NOT NULL,
  expected_amount DECIMAL(14,2) NOT NULL,
  observed_amount DECIMAL(14,2) NOT NULL,
  difference_amount DECIMAL(14,2) NOT NULL,
  external_reference VARCHAR(200) NULL,
  status VARCHAR(20) NOT NULL,
  note VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_reconciliation_item_payment (reconciliation_batch_id, payment_id),
  KEY ix_reconciliation_items_status (reconciliation_batch_id, status),
  CONSTRAINT fk_reconciliation_items_batch FOREIGN KEY (reconciliation_batch_id) REFERENCES reconciliation_batches (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reconciliation_items_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_reconciliation_item_amounts CHECK (expected_amount >= 0 AND observed_amount >= 0),
  CONSTRAINT ck_reconciliation_item_status CHECK (status IN ('MATCHED','DIFFERENCE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permissions (code,module,action,description,is_active) VALUES
  ('cash.manage','cash','manage','Abrir, operar y cerrar cajas institucionales.',1),
  ('payments.create','payments','create','Registrar pagos manuales autorizados contra órdenes vigentes.',1),
  ('payments.read','payments','read','Consultar pagos, asignaciones, recibos y reversos.',1),
  ('payments.confirm','payments','confirm','Confirmar pagos y emitir el recibo oficial.',1),
  ('payments.reverse','payments','reverse','Reversar pagos mediante contrapartida trazable.',1),
  ('payments.receipt','payments','receipt','Descargar y reimprimir recibos identificados.',1),
  ('reconciliations.manage','reconciliations','manage','Crear, revisar y cerrar conciliaciones.',1)
ON DUPLICATE KEY UPDATE module=VALUES(module),action=VALUES(action),description=VALUES(description),is_active=VALUES(is_active);

INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='ADMIN' AND p.is_active=1
ON DUPLICATE KEY UPDATE assigned_at=assigned_at;

INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('cash.manage','payments.create','payments.read','payments.confirm','payments.receipt','reconciliations.manage')
WHERE r.code='RECEPTORIA'
ON DUPLICATE KEY UPDATE assigned_at=assigned_at;

INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('payments.read','payments.reverse','reconciliations.manage')
WHERE r.code='SUPERVISOR'
ON DUPLICATE KEY UPDATE assigned_at=assigned_at;
