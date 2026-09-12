-- TANDA 11: control, staging, validación y trazabilidad de migraciones históricas.
-- No importa datos operativos ni modifica migraciones anteriores.

CREATE TABLE IF NOT EXISTS migration_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_reference CHAR(36) NOT NULL,
  source_system VARCHAR(100) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'UPLOADED',
  total_rows BIGINT UNSIGNED NOT NULL DEFAULT 0,
  valid_rows BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rejected_rows BIGINT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_rows BIGINT UNSIGNED NOT NULL DEFAULT 0,
  result_summary JSON NULL,
  backup_reference VARCHAR(500) NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  approved_by_user_id BIGINT UNSIGNED NULL,
  imported_by_user_id BIGINT UNSIGNED NULL,
  reverted_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  validation_started_at DATETIME(3) NULL,
  validation_finished_at DATETIME(3) NULL,
  approved_at DATETIME(3) NULL,
  import_started_at DATETIME(3) NULL,
  import_finished_at DATETIME(3) NULL,
  reverted_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_migration_batches_reference (public_reference),
  KEY ix_migration_batches_status_created (status,created_at),
  KEY ix_migration_batches_entity_created (entity_type,created_at),
  CONSTRAINT fk_migration_batches_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_migration_batches_approved_by FOREIGN KEY (approved_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_migration_batches_imported_by FOREIGN KEY (imported_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_migration_batches_reverted_by FOREIGN KEY (reverted_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_migration_batches_entity CHECK (entity_type IN ('citizens','vehicles','agents','infractions','infraction_items','payments','payment_allocations','receipts','adjustments','solvencies')),
  CONSTRAINT ck_migration_batches_status CHECK (status IN ('UPLOADED','VALIDATING','VALIDATED','REQUIRES_REVIEW','READY','IMPORTING','COMPLETED','FAILED','CANCELLED','REVERTED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS migration_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id BIGINT UNSIGNED NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  detected_encoding VARCHAR(30) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  uploaded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  retained_until DATETIME(3) NOT NULL,
  purged_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_migration_files_batch (batch_id),
  UNIQUE KEY uq_migration_files_source_checksum (entity_type,checksum_sha256),
  CONSTRAINT fk_migration_files_batch FOREIGN KEY (batch_id) REFERENCES migration_batches (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS migration_staging_rows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id BIGINT UNSIGNED NOT NULL,
  `row_number` BIGINT UNSIGNED NOT NULL,
  legacy_id VARCHAR(191) NULL,
  raw_data JSON NOT NULL,
  normalized_data JSON NULL,
  row_hash CHAR(64) NOT NULL,
  validation_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  imported_target_table VARCHAR(80) NULL,
  imported_target_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  validated_at DATETIME(3) NULL,
  imported_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_migration_staging_batch_row (batch_id,`row_number`),
  KEY ix_migration_staging_status (batch_id,validation_status,`row_number`),
  KEY ix_migration_staging_legacy (batch_id,legacy_id),
  CONSTRAINT fk_migration_staging_batch FOREIGN KEY (batch_id) REFERENCES migration_batches (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_migration_staging_status CHECK (validation_status IN ('PENDING','VALID','INVALID','CONFLICT','IMPORTED','REVERTED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS migration_validation_errors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id BIGINT UNSIGNED NOT NULL,
  staging_row_id BIGINT UNSIGNED NULL,
  `row_number` BIGINT UNSIGNED NOT NULL,
  severity VARCHAR(20) NOT NULL,
  error_code VARCHAR(80) NOT NULL,
  column_name VARCHAR(100) NULL,
  message VARCHAR(500) NOT NULL,
  masked_value VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_migration_errors_batch_row (batch_id,`row_number`),
  CONSTRAINT fk_migration_errors_batch FOREIGN KEY (batch_id) REFERENCES migration_batches (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_migration_errors_staging FOREIGN KEY (staging_row_id) REFERENCES migration_staging_rows (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_migration_errors_severity CHECK (severity IN ('ERROR','WARNING'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS migration_conflicts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id BIGINT UNSIGNED NOT NULL,
  staging_row_id BIGINT UNSIGNED NULL,
  `row_number` BIGINT UNSIGNED NOT NULL,
  conflict_type VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NULL,
  source_value_masked VARCHAR(255) NULL,
  candidate_target_type VARCHAR(80) NULL,
  candidate_target_id BIGINT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  resolution JSON NULL,
  resolved_by_user_id BIGINT UNSIGNED NULL,
  resolved_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_migration_conflicts_batch_status (batch_id,status,`row_number`),
  CONSTRAINT fk_migration_conflicts_batch FOREIGN KEY (batch_id) REFERENCES migration_batches (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_migration_conflicts_staging FOREIGN KEY (staging_row_id) REFERENCES migration_staging_rows (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_migration_conflicts_resolved_by FOREIGN KEY (resolved_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_migration_conflicts_type CHECK (conflict_type IN ('INTERNAL_DUPLICATE','EXISTING_RECORD','MAPPING_REQUIRED','MISSING_REFERENCE','CATALOG_VALUE_UNKNOWN')),
  CONSTRAINT ck_migration_conflicts_status CHECK (status IN ('OPEN','RESOLVED','IGNORED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS migration_entity_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_system VARCHAR(100) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  mapping_type VARCHAR(30) NOT NULL,
  source_value VARCHAR(255) NOT NULL,
  target_entity_type VARCHAR(80) NULL,
  target_entity_id BIGINT UNSIGNED NULL,
  target_value VARCHAR(255) NULL,
  version INT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_migration_mapping_version (source_system,entity_type,mapping_type,source_value,version),
  KEY ix_migration_mapping_active (source_system,entity_type,mapping_type,status,source_value,version),
  CONSTRAINT fk_migration_mappings_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_migration_mapping_type CHECK (mapping_type IN ('TABLE','COLUMN','STATUS','ARTICLE','AGENT','PAYMENT_METHOD')),
  CONSTRAINT ck_migration_mapping_status CHECK (status IN ('PENDING','APPROVED','REJECTED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS migration_execution_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(50) NOT NULL,
  outcome VARCHAR(20) NOT NULL,
  message VARCHAR(500) NOT NULL,
  metadata JSON NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  request_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_migration_execution_batch (batch_id,created_at,id),
  CONSTRAINT fk_migration_execution_batch FOREIGN KEY (batch_id) REFERENCES migration_batches (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_migration_execution_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_migration_execution_outcome CHECK (outcome IN ('SUCCESS','FAILED','BLOCKED','IN_PROGRESS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS legacy_source_references (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_system VARCHAR(100) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  legacy_id VARCHAR(191) NOT NULL,
  target_table VARCHAR(80) NOT NULL,
  target_id BIGINT UNSIGNED NOT NULL,
  imported_by_batch_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reverted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_legacy_source_reference (source_system,entity_type,legacy_id),
  KEY ix_legacy_target (target_table,target_id),
  KEY ix_legacy_batch (imported_by_batch_id,entity_type),
  CONSTRAINT fk_legacy_source_batch FOREIGN KEY (imported_by_batch_id) REFERENCES migration_batches (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permissions (code,module,action,description,is_active) VALUES
  ('historical_migrations.read','historical_migrations','read','Consultar lotes y reportes de migración histórica.',1),
  ('historical_migrations.upload','historical_migrations','upload','Cargar archivos CSV históricos hacia staging privado.',1),
  ('historical_migrations.validate','historical_migrations','validate','Validar lotes históricos sin escribir datos operativos.',1),
  ('historical_migrations.map','historical_migrations','map','Resolver y versionar mapeos de migración histórica.',1),
  ('historical_migrations.approve','historical_migrations','approve','Aprobar lotes históricos listos para importar.',1),
  ('historical_migrations.import','historical_migrations','import','Importar lotes históricos aprobados transaccionalmente.',1),
  ('historical_migrations.revert','historical_migrations','revert','Revertir lotes históricos cuando no existan referencias posteriores.',1)
ON DUPLICATE KEY UPDATE module=VALUES(module),action=VALUES(action),description=VALUES(description),is_active=VALUES(is_active);

INSERT IGNORE INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code LIKE 'historical_migrations.%'
WHERE r.code='ADMIN';
