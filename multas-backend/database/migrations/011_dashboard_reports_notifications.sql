-- TANDA 10: analítica administrativa, reportes y notificaciones internas.
-- Las plantillas contienen únicamente texto operativo; no crean datos transaccionales.

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id BIGINT UNSIGNED NOT NULL,
  event_code VARCHAR(50) NOT NULL,
  internal_enabled TINYINT(1) NOT NULL DEFAULT 1,
  email_enabled TINYINT(1) NOT NULL DEFAULT 0,
  sms_enabled TINYINT(1) NOT NULL DEFAULT 0,
  push_enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id,event_code),
  CONSTRAINT fk_notification_preferences_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ck_notification_preferences_channels CHECK (internal_enabled IN (0,1) AND email_enabled IN (0,1) AND sms_enabled IN (0,1) AND push_enabled IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipient_user_id BIGINT UNSIGNED NOT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  event_code VARCHAR(50) NOT NULL,
  title VARCHAR(180) NOT NULL,
  body VARCHAR(1000) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  resource_type VARCHAR(80) DEFAULT NULL,
  resource_id VARCHAR(100) DEFAULT NULL,
  secure_path VARCHAR(500) DEFAULT NULL,
  deduplication_key VARCHAR(191) NOT NULL,
  read_at DATETIME(3) DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_notifications_recipient_dedupe (recipient_user_id,deduplication_key),
  KEY ix_notifications_inbox (recipient_user_id,read_at,created_at),
  KEY ix_notifications_event_created (event_code,created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_notifications_template FOREIGN KEY (template_id) REFERENCES notification_templates (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_notifications_severity CHECK (severity IN ('INFO','SUCCESS','WARNING','CRITICAL'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS notification_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  notification_id BIGINT UNSIGNED NOT NULL,
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  deduplication_key VARCHAR(191) NOT NULL,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at DATETIME(3) DEFAULT NULL,
  last_error VARCHAR(500) DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_notification_outbox_channel_dedupe (channel,deduplication_key),
  KEY ix_notification_outbox_dispatch (status,available_at),
  CONSTRAINT fk_notification_outbox_notification FOREIGN KEY (notification_id) REFERENCES notifications (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT ck_notification_outbox_channel CHECK (channel IN ('EMAIL','SMS','PUSH')),
  CONSTRAINT ck_notification_outbox_status CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','DISABLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX ix_infractions_dashboard ON infractions (occurred_at,site_id,status);
CREATE INDEX ix_payments_reports ON payments (confirmed_at,status,payment_method_id);
CREATE INDEX ix_appeals_reports ON appeals (filed_at,status);
CREATE INDEX ix_adjustments_reports ON infraction_adjustments (requested_at,status,adjustment_type);
CREATE INDEX ix_audit_reports ON audit_logs (created_at,module,outcome);

INSERT INTO notification_templates (code,channel,subject_template,body_template,is_active) VALUES
  ('INFRACTION_RETURNED','IN_APP','Infracción devuelta','La infracción requiere correcciones antes de continuar.',1),
  ('INFRACTION_RESOLVED','IN_APP','Revisión de infracción finalizada','La revisión de la infracción fue resuelta.',1),
  ('APPEAL_FILED','IN_APP','Nueva impugnación','Se presentó una impugnación que requiere seguimiento.',1),
  ('APPEAL_RESOLVED','IN_APP','Impugnación resuelta','La impugnación recibió una resolución.',1),
  ('ADJUSTMENT_PENDING','IN_APP','Ajuste pendiente','Existe un ajuste económico pendiente de decisión.',1),
  ('PAYMENT_CONFIRMED','IN_APP','Pago confirmado','El pago fue confirmado y cuenta con recibo oficial.',1),
  ('PAYMENT_REVERSED','IN_APP','Pago reversado','Un pago fue reversado y requiere trazabilidad administrativa.',1),
  ('CASH_DIFFERENCE','IN_APP','Diferencia de caja','El cierre de caja registró una diferencia.',1),
  ('SOLVENCY_STATUS','IN_APP','Estado de solvencia actualizado','Una solvencia cambió de estado.',1),
  ('RECONCILIATION_DIFFERENCE','IN_APP','Diferencia de conciliación','La conciliación cerró con una diferencia.',1)
ON DUPLICATE KEY UPDATE code=VALUES(code);

INSERT INTO permissions (code,module,action,description,is_active) VALUES
  ('dashboard.read','dashboard','read','Consultar indicadores y gráficas administrativas.',1),
  ('reports.read','reports','read','Consultar reportes operativos y financieros.',1),
  ('reports.export','reports','export','Exportar reportes autorizados.',1),
  ('notifications.read','notifications','read','Consultar y marcar notificaciones propias.',1),
  ('notifications.preferences','notifications','preferences','Configurar preferencias propias de notificación.',1),
  ('notifications.templates','notifications','templates','Administrar plantillas internas de notificación.',1)
ON DUPLICATE KEY UPDATE description=VALUES(description),is_active=VALUES(is_active);

INSERT IGNORE INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('dashboard.read','reports.read','reports.export','notifications.read','notifications.preferences','notifications.templates')
WHERE r.code='ADMIN';

INSERT IGNORE INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('dashboard.read','reports.read','reports.export','notifications.read','notifications.preferences')
WHERE r.code='SUPERVISOR';

INSERT IGNORE INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('notifications.read','notifications.preferences')
WHERE r.code IN ('PMT','RECEPTORIA','SOLVENCIAS');
