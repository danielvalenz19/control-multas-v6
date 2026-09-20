-- Migración 014: checkout alojado, enlaces de pago y confirmación por webhook.
-- La aplicación nunca recibe ni almacena números de tarjeta, CVV o PIN.

ALTER TABLE payments MODIFY cash_session_id BIGINT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS payment_intents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_reference CHAR(40) NOT NULL,
  payment_order_id BIGINT UNSIGNED NOT NULL,
  payment_method_id BIGINT UNSIGNED NOT NULL,
  provider_code VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'GTQ',
  checkout_url VARCHAR(1000) NOT NULL,
  provider_payment_id VARCHAR(200) NULL,
  payment_id BIGINT UNSIGNED NULL,
  idempotency_key_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_request_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3) NULL,
  last_error VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_intents_public_reference (public_reference),
  UNIQUE KEY uq_payment_intents_idempotency (payment_order_id,payment_method_id,idempotency_key_hash),
  KEY ix_payment_intents_order_status (payment_order_id,status,created_at),
  KEY ix_payment_intents_status_expiry (status,expires_at),
  CONSTRAINT fk_payment_intents_order FOREIGN KEY (payment_order_id) REFERENCES payment_orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_intents_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_intents_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_payment_intents_status CHECK (status IN ('PENDING','SUCCEEDED','FAILED','EXPIRED','CANCELLED')),
  CONSTRAINT ck_payment_intents_amount CHECK (amount > 0),
  CONSTRAINT ck_payment_intents_currency CHECK (currency='GTQ')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider_code VARCHAR(40) NOT NULL,
  event_id VARCHAR(200) NOT NULL,
  intent_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(60) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  signature_verified TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
  provider_payment_id VARCHAR(200) NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at DATETIME(3) NULL,
  failure_reason VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_webhook_provider_event (provider_code,event_id),
  KEY ix_payment_webhook_intent (intent_id,received_at),
  CONSTRAINT fk_payment_webhook_intent FOREIGN KEY (intent_id) REFERENCES payment_intents (id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT ck_payment_webhook_signature CHECK (signature_verified IN (0,1)),
  CONSTRAINT ck_payment_webhook_status CHECK (status IN ('RECEIVED','PROCESSED','REJECTED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permissions (code,module,action,description,is_active) VALUES
  ('payments.online.read','payments','online_read','Consultar intentos y confirmaciones de pagos en línea.',1)
ON DUPLICATE KEY UPDATE module=VALUES(module),action=VALUES(action),description=VALUES(description),is_active=VALUES(is_active);

INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code='payments.online.read'
WHERE r.code IN ('ADMIN','SUPERVISOR','RECEPTORIA')
ON DUPLICATE KEY UPDATE assigned_at=assigned_at;
