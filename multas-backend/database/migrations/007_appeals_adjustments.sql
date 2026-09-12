-- Migración 007: impugnaciones, ajustes económicos y reglas institucionales versionadas.
-- No crea pagos, solvencias ni valores legales/económicos predeterminados.

CREATE TABLE IF NOT EXISTS institutional_rule_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_code VARCHAR(80) NOT NULL,
  value_type VARCHAR(20) NOT NULL,
  value_integer BIGINT NULL,
  value_decimal DECIMAL(14,4) NULL,
  value_text VARCHAR(500) NULL,
  value_boolean TINYINT(1) NULL,
  effective_from DATETIME(3) NOT NULL,
  effective_to DATETIME(3) NULL,
  legal_basis VARCHAR(500) NULL,
  authorization_reference VARCHAR(200) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rule_version_start (rule_code, effective_from),
  KEY ix_rule_effective (rule_code, effective_from, effective_to),
  CONSTRAINT fk_rule_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_rule_value_type CHECK (value_type IN ('INTEGER','DECIMAL','TEXT','BOOLEAN')),
  CONSTRAINT ck_rule_boolean CHECK (value_boolean IS NULL OR value_boolean IN (0,1)),
  CONSTRAINT ck_rule_dates CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT ck_rule_single_value CHECK (
    (value_type='INTEGER' AND value_integer IS NOT NULL AND value_decimal IS NULL AND value_text IS NULL AND value_boolean IS NULL) OR
    (value_type='DECIMAL' AND value_integer IS NULL AND value_decimal IS NOT NULL AND value_text IS NULL AND value_boolean IS NULL) OR
    (value_type='TEXT' AND value_integer IS NULL AND value_decimal IS NULL AND value_text IS NOT NULL AND value_boolean IS NULL) OR
    (value_type='BOOLEAN' AND value_integer IS NULL AND value_decimal IS NULL AND value_text IS NULL AND value_boolean IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS appeals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appeal_number VARCHAR(80) NOT NULL,
  infraction_id BIGINT UNSIGNED NOT NULL,
  appellant_citizen_id BIGINT UNSIGNED NULL,
  appellant_name_snapshot VARCHAR(300) NOT NULL,
  appellant_identification_snapshot VARCHAR(150) NULL,
  filed_at DATETIME(3) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PRESENTADA',
  municipal_assignee_user_id BIGINT UNSIGNED NULL,
  deadline_at DATETIME(3) NULL,
  deadline_rule_version_id BIGINT UNSIGNED NULL,
  deadline_configuration_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  resolution_type VARCHAR(20) NULL,
  resolution_summary TEXT NULL,
  resolution_legal_basis VARCHAR(500) NULL,
  resolved_amount DECIMAL(14,2) NULL,
  resolved_at DATETIME(3) NULL,
  resolved_by_user_id BIGINT UNSIGNED NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_appeals_number (appeal_number),
  KEY ix_appeals_infraction (infraction_id, filed_at),
  KEY ix_appeals_status (status, deadline_at),
  KEY ix_appeals_assignee (municipal_assignee_user_id, status),
  CONSTRAINT fk_appeals_infraction FOREIGN KEY (infraction_id) REFERENCES infractions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_appeals_citizen FOREIGN KEY (appellant_citizen_id) REFERENCES citizens (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_appeals_assignee FOREIGN KEY (municipal_assignee_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_appeals_deadline_rule FOREIGN KEY (deadline_rule_version_id) REFERENCES institutional_rule_versions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_appeals_resolved_by FOREIGN KEY (resolved_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_appeals_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_appeals_status CHECK (status IN ('PRESENTADA','EN_REVISION','REQUIERE_INFORMACION','RESUELTA_CONFIRMADA','RESUELTA_MODIFICADA','RESUELTA_ANULADA','DESISTIDA')),
  CONSTRAINT ck_appeals_deadline_status CHECK (deadline_configuration_status IN ('CONFIGURED','PENDING_CONFIRMATION')),
  CONSTRAINT ck_appeals_resolution_type CHECK (resolution_type IS NULL OR resolution_type IN ('CONFIRM','MODIFY','ANNUL')),
  CONSTRAINT ck_appeals_resolved_amount CHECK (resolved_amount IS NULL OR resolved_amount >= 0),
  CONSTRAINT ck_appeals_resolution_consistency CHECK (
    (status IN ('RESUELTA_CONFIRMADA','RESUELTA_MODIFICADA','RESUELTA_ANULADA') AND resolution_type IS NOT NULL AND resolution_summary IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL) OR
    status NOT IN ('RESUELTA_CONFIRMADA','RESUELTA_MODIFICADA','RESUELTA_ANULADA')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS appeal_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appeal_id BIGINT UNSIGNED NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_extension VARCHAR(20) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  voided_at DATETIME(3) NULL,
  voided_by_user_id BIGINT UNSIGNED NULL,
  void_reason VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_appeal_evidence_storage (storage_key),
  KEY ix_appeal_evidence_appeal (appeal_id, status, created_at),
  KEY ix_appeal_evidence_checksum (checksum_sha256),
  CONSTRAINT fk_appeal_evidence_appeal FOREIGN KEY (appeal_id) REFERENCES appeals (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_appeal_evidence_uploaded_by FOREIGN KEY (uploaded_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_appeal_evidence_voided_by FOREIGN KEY (voided_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_appeal_evidence_status CHECK (status IN ('ACTIVE','VOID')),
  CONSTRAINT ck_appeal_evidence_size CHECK (size_bytes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS appeal_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appeal_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NOT NULL,
  action VARCHAR(50) NOT NULL,
  comment VARCHAR(1000) NULL,
  changed_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_appeal_history_timeline (appeal_id, created_at, id),
  CONSTRAINT fk_appeal_history_appeal FOREIGN KEY (appeal_id) REFERENCES appeals (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_appeal_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_appeal_history_from CHECK (from_status IS NULL OR from_status IN ('PRESENTADA','EN_REVISION','REQUIERE_INFORMACION','RESUELTA_CONFIRMADA','RESUELTA_MODIFICADA','RESUELTA_ANULADA','DESISTIDA')),
  CONSTRAINT ck_appeal_history_to CHECK (to_status IN ('PRESENTADA','EN_REVISION','REQUIERE_INFORMACION','RESUELTA_CONFIRMADA','RESUELTA_MODIFICADA','RESUELTA_ANULADA','DESISTIDA'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS infraction_adjustments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  infraction_id BIGINT UNSIGNED NOT NULL,
  adjustment_type VARCHAR(30) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  legal_basis VARCHAR(500) NULL,
  authorization_reference VARCHAR(200) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_APPROVAL',
  source_appeal_id BIGINT UNSIGNED NULL,
  reverses_adjustment_id BIGINT UNSIGNED NULL,
  requested_by_user_id BIGINT UNSIGNED NOT NULL,
  decided_by_user_id BIGINT UNSIGNED NULL,
  decision_comment VARCHAR(1000) NULL,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  decided_at DATETIME(3) NULL,
  reversed_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_adjustment_reversal (reverses_adjustment_id),
  KEY ix_adjustments_infraction (infraction_id, status, requested_at),
  KEY ix_adjustments_appeal (source_appeal_id),
  CONSTRAINT fk_adjustments_infraction FOREIGN KEY (infraction_id) REFERENCES infractions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_adjustments_appeal FOREIGN KEY (source_appeal_id) REFERENCES appeals (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_adjustments_reversal FOREIGN KEY (reverses_adjustment_id) REFERENCES infraction_adjustments (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_adjustments_requested_by FOREIGN KEY (requested_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_adjustments_decided_by FOREIGN KEY (decided_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_adjustments_type CHECK (adjustment_type IN ('DISCOUNT','PARTIAL_EXEMPTION','TOTAL_EXEMPTION','SURCHARGE','AMOUNT_CORRECTION','REVERSAL')),
  CONSTRAINT ck_adjustments_direction CHECK (direction IN ('CREDIT','DEBIT')),
  CONSTRAINT ck_adjustments_amount CHECK (amount > 0),
  CONSTRAINT ck_adjustments_status CHECK (status IN ('PENDING_APPROVAL','APPROVED','REJECTED','REVERSED')),
  CONSTRAINT ck_adjustments_decision CHECK (
    (status='PENDING_APPROVAL' AND decided_by_user_id IS NULL AND decided_at IS NULL) OR
    (status<>'PENDING_APPROVAL' AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS infraction_adjustment_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  adjustment_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NOT NULL,
  action VARCHAR(40) NOT NULL,
  comment VARCHAR(1000) NULL,
  changed_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_adjustment_history_timeline (adjustment_id, created_at, id),
  CONSTRAINT fk_adjustment_history_adjustment FOREIGN KEY (adjustment_id) REFERENCES infraction_adjustments (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_adjustment_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_adjustment_history_from CHECK (from_status IS NULL OR from_status IN ('PENDING_APPROVAL','APPROVED','REJECTED','REVERSED')),
  CONSTRAINT ck_adjustment_history_to CHECK (to_status IN ('PENDING_APPROVAL','APPROVED','REJECTED','REVERSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permissions (code,module,action,description,is_active) VALUES
  ('appeals.review','appeals','review','Revisar, solicitar información y tramitar impugnaciones.',1),
  ('adjustments.create','adjustments','create','Registrar solicitudes de ajustes económicos.',1),
  ('adjustments.approve','adjustments','approve','Aprobar o rechazar ajustes económicos.',1),
  ('adjustments.reverse','adjustments','reverse','Revertir ajustes aprobados conservando historial.',1)
ON DUPLICATE KEY UPDATE module=VALUES(module),action=VALUES(action),description=VALUES(description),is_active=VALUES(is_active);

INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='ADMIN' AND p.is_active=1
ON DUPLICATE KEY UPDATE assigned_at=assigned_at;

INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('appeals.review','adjustments.create')
WHERE r.code='PMT_OPERATOR'
ON DUPLICATE KEY UPDATE assigned_at=assigned_at;

INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('appeals.review','adjustments.create','adjustments.approve','adjustments.reverse')
WHERE r.code='SUPERVISOR'
ON DUPLICATE KEY UPDATE assigned_at=assigned_at;
