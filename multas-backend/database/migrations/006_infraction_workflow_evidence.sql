-- Migración 006: flujo legal, evidencias privadas e historial de infracciones.
-- Los archivos se guardan fuera del directorio público; MySQL conserva metadatos y checksum.

CREATE TABLE IF NOT EXISTS infraction_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  infraction_id BIGINT UNSIGNED NOT NULL,
  evidence_type VARCHAR(30) NOT NULL DEFAULT 'PHOTO',
  storage_key VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_extension VARCHAR(20) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  voided_at DATETIME(3) NULL,
  voided_by_user_id BIGINT UNSIGNED NULL,
  void_reason VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_infraction_evidence_storage (storage_key),
  KEY ix_infraction_evidence_infraction (infraction_id, status, created_at),
  KEY ix_infraction_evidence_checksum (checksum_sha256),
  CONSTRAINT fk_infraction_evidence_infraction FOREIGN KEY (infraction_id) REFERENCES infractions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_infraction_evidence_uploaded_by FOREIGN KEY (uploaded_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_infraction_evidence_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_infraction_evidence_voided_by FOREIGN KEY (voided_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_infraction_evidence_type CHECK (evidence_type IN ('PHOTO','DOCUMENT','SIGNATURE')),
  CONSTRAINT ck_infraction_evidence_status CHECK (status IN ('ACTIVE','VOID')),
  CONSTRAINT ck_infraction_evidence_size CHECK (size_bytes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS infraction_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  infraction_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NOT NULL,
  action VARCHAR(40) NOT NULL,
  reason_id BIGINT UNSIGNED NULL,
  comment VARCHAR(1000) NULL,
  indicated_fields JSON NULL,
  changed_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_infraction_history_timeline (infraction_id, created_at, id),
  CONSTRAINT fk_infraction_history_infraction FOREIGN KEY (infraction_id) REFERENCES infractions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_infraction_history_reason FOREIGN KEY (reason_id) REFERENCES action_reasons (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_infraction_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_infraction_history_from CHECK (from_status IS NULL OR from_status IN ('BORRADOR','PENDIENTE_VALIDACION','DEVUELTA_CORRECCION','VALIDADA','RECHAZADA','ANULADA')),
  CONSTRAINT ck_infraction_history_to CHECK (to_status IN ('BORRADOR','PENDIENTE_VALIDACION','DEVUELTA_CORRECCION','VALIDADA','RECHAZADA','ANULADA'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS validation_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  infraction_id BIGINT UNSIGNED NOT NULL,
  decision VARCHAR(30) NOT NULL,
  reason_id BIGINT UNSIGNED NULL,
  comment VARCHAR(1000) NULL,
  indicated_fields JSON NULL,
  reviewed_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_validation_reviews_infraction (infraction_id, created_at),
  CONSTRAINT fk_validation_reviews_infraction FOREIGN KEY (infraction_id) REFERENCES infractions (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_validation_reviews_reason FOREIGN KEY (reason_id) REFERENCES action_reasons (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_validation_reviews_user FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_validation_reviews_decision CHECK (decision IN ('VALIDATE','RETURN','REJECT','CANCEL'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'infractions.cancel'
WHERE r.code = 'SUPERVISOR'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
