-- Migración 010: solicitudes, emisión, verificación y revocación de solvencias.
-- No inserta costo, vigencia, texto legal ni reglas institucionales predeterminadas.

CREATE TABLE IF NOT EXISTS solvency_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_number VARCHAR(80) NOT NULL,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW',
  vehicle_plate_snapshot VARCHAR(20) NOT NULL,
  vehicle_registration_snapshot VARCHAR(100) NOT NULL,
  vehicle_description_snapshot VARCHAR(400) NOT NULL,
  owner_citizen_id BIGINT UNSIGNED NOT NULL,
  owner_name_snapshot VARCHAR(300) NOT NULL,
  owner_identification_snapshot VARCHAR(150) NOT NULL,
  financial_balance_snapshot DECIMAL(14,2) NOT NULL,
  open_infractions_snapshot BIGINT UNSIGNED NOT NULL,
  open_appeals_snapshot BIGINT UNSIGNED NOT NULL,
  pending_payments_snapshot BIGINT UNSIGNED NOT NULL,
  requested_by_user_id BIGINT UNSIGNED NOT NULL,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(3) NULL,
  rejection_reason VARCHAR(1000) NULL,
  active_vehicle_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status='PENDING_REVIEW' THEN vehicle_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_solvency_request_number (request_number),
  UNIQUE KEY uq_solvency_request_active_vehicle (active_vehicle_id),
  KEY ix_solvency_requests_status (status, requested_at),
  KEY ix_solvency_requests_vehicle (vehicle_id, requested_at),
  CONSTRAINT fk_solvency_requests_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_solvency_requests_owner FOREIGN KEY (owner_citizen_id) REFERENCES citizens (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_solvency_requests_requested_by FOREIGN KEY (requested_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_solvency_requests_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_solvency_requests_status CHECK (status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
  CONSTRAINT ck_solvency_requests_balance CHECK (financial_balance_snapshot >= 0),
  CONSTRAINT ck_solvency_requests_review CHECK (
    (status='PENDING_REVIEW' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL) OR
    (status='APPROVED' AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NULL) OR
    (status='REJECTED' AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL AND rejection_reason IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS solvency_request_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  solvency_request_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NOT NULL,
  action VARCHAR(40) NOT NULL,
  reason VARCHAR(1000) NULL,
  changed_by_user_id BIGINT UNSIGNED NOT NULL,
  request_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_solvency_request_history (solvency_request_id, created_at, id),
  CONSTRAINT fk_solvency_request_history_request FOREIGN KEY (solvency_request_id) REFERENCES solvency_requests (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_solvency_request_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_solvency_request_history_from CHECK (from_status IS NULL OR from_status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
  CONSTRAINT ck_solvency_request_history_to CHECK (to_status IN ('PENDING_REVIEW','APPROVED','REJECTED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS solvencies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  solvency_request_id BIGINT UNSIGNED NOT NULL,
  solvency_number VARCHAR(80) NOT NULL,
  public_reference CHAR(40) NOT NULL,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  vehicle_snapshot JSON NOT NULL,
  owner_snapshot JSON NOT NULL,
  financial_snapshot JSON NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'VALID',
  validity_rule_version_id BIGINT UNSIGNED NOT NULL,
  issued_by_user_id BIGINT UNSIGNED NOT NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_by_user_id BIGINT UNSIGNED NULL,
  revoked_at DATETIME(3) NULL,
  revocation_reason VARCHAR(1000) NULL,
  observed_at DATETIME(3) NULL,
  observation_reason VARCHAR(1000) NULL,
  active_vehicle_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status='VALID' THEN vehicle_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_solvencies_request (solvency_request_id),
  UNIQUE KEY uq_solvencies_number (solvency_number),
  UNIQUE KEY uq_solvencies_public_reference (public_reference),
  UNIQUE KEY uq_solvencies_active_vehicle (active_vehicle_id),
  KEY ix_solvencies_vehicle (vehicle_id, issued_at),
  KEY ix_solvencies_status_expiry (status, expires_at),
  CONSTRAINT fk_solvencies_request FOREIGN KEY (solvency_request_id) REFERENCES solvency_requests (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_solvencies_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_solvencies_validity_rule FOREIGN KEY (validity_rule_version_id) REFERENCES institutional_rule_versions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_solvencies_issued_by FOREIGN KEY (issued_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_solvencies_revoked_by FOREIGN KEY (revoked_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_solvencies_status CHECK (status IN ('VALID','REVOKED','OBSERVED','EXPIRED')),
  CONSTRAINT ck_solvencies_expiry CHECK (expires_at > issued_at),
  CONSTRAINT ck_solvencies_revocation CHECK ((status='REVOKED' AND revoked_by_user_id IS NOT NULL AND revoked_at IS NOT NULL AND revocation_reason IS NOT NULL) OR status<>'REVOKED'),
  CONSTRAINT ck_solvencies_observation CHECK ((status='OBSERVED' AND observed_at IS NOT NULL AND observation_reason IS NOT NULL) OR status<>'OBSERVED')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS solvency_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  solvency_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  action VARCHAR(40) NOT NULL,
  reason VARCHAR(1000) NULL,
  changed_by_user_id BIGINT UNSIGNED NOT NULL,
  request_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_solvency_history (solvency_id, created_at, id),
  CONSTRAINT fk_solvency_history_solvency FOREIGN KEY (solvency_id) REFERENCES solvencies (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_solvency_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_solvency_history_from CHECK (from_status IS NULL OR from_status IN ('VALID','REVOKED','OBSERVED','EXPIRED')),
  CONSTRAINT ck_solvency_history_to CHECK (to_status IN ('VALID','REVOKED','OBSERVED','EXPIRED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permissions (code,module,action,description,is_active) VALUES
  ('solvencies.request','solvencies','request','Registrar solicitudes de solvencia sobre vehículos elegibles.',1),
  ('solvencies.read','solvencies','read','Consultar solicitudes, documentos e historial de solvencias.',1),
  ('solvencies.review','solvencies','review','Aprobar o rechazar solicitudes de solvencia.',1),
  ('solvencies.revoke','solvencies','revoke','Revocar solvencias sin borrar el documento histórico.',1)
ON DUPLICATE KEY UPDATE module=VALUES(module),action=VALUES(action),description=VALUES(description),is_active=VALUES(is_active);

INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='ADMIN' AND p.is_active=1
ON DUPLICATE KEY UPDATE assigned_at=assigned_at;

INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('solvencies.request','solvencies.read','solvencies.review')
WHERE r.code='SOLVENCIAS'
ON DUPLICATE KEY UPDATE assigned_at=assigned_at;

INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('solvencies.read','solvencies.review','solvencies.revoke')
WHERE r.code='SUPERVISOR'
ON DUPLICATE KEY UPDATE assigned_at=assigned_at;
