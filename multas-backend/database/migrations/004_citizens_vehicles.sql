-- Migración 004: ciudadanos, vehículos, licencias e historial de propietarios.
-- No crea infracciones, pagos ni solvencias y no inserta datos operativos.

CREATE TABLE IF NOT EXISTS citizens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identification_type VARCHAR(30) NOT NULL,
  identification_number VARCHAR(100) NOT NULL,
  identification_normalized VARCHAR(100) NOT NULL,
  nit VARCHAR(30) NULL,
  nit_normalized VARCHAR(30) NULL,
  first_names VARCHAR(150) NOT NULL,
  last_names VARCHAR(150) NOT NULL,
  address VARCHAR(500) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(191) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  deactivated_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_citizens_identification (identification_type, identification_normalized),
  KEY ix_citizens_identification (identification_normalized),
  KEY ix_citizens_nit (nit_normalized),
  KEY ix_citizens_name (last_names, first_names),
  KEY ix_citizens_status (status),
  CONSTRAINT ck_citizens_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS vehicles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plate_original VARCHAR(20) NOT NULL,
  plate_normalized VARCHAR(20) NOT NULL,
  registration_card VARCHAR(100) NOT NULL,
  vehicle_type VARCHAR(100) NOT NULL,
  brand VARCHAR(100) NOT NULL,
  vehicle_line VARCHAR(100) NOT NULL,
  model_year SMALLINT UNSIGNED NULL,
  color VARCHAR(80) NOT NULL,
  vin_chassis VARCHAR(100) NULL,
  engine_number VARCHAR(100) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  deactivated_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_vehicles_plate_normalized (plate_normalized),
  KEY ix_vehicles_registration_card (registration_card),
  KEY ix_vehicles_status (status),
  KEY ix_vehicles_brand_line (brand, vehicle_line),
  CONSTRAINT ck_vehicles_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT ck_vehicles_model_year CHECK (model_year IS NULL OR model_year BETWEEN 1900 AND 2200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS driver_licenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  citizen_id BIGINT UNSIGNED NOT NULL,
  license_number VARCHAR(100) NOT NULL,
  license_number_normalized VARCHAR(100) NOT NULL,
  license_type VARCHAR(30) NOT NULL,
  expires_on DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_driver_licenses_number (license_number_normalized),
  KEY ix_driver_licenses_citizen (citizen_id, status),
  CONSTRAINT fk_driver_licenses_citizen FOREIGN KEY (citizen_id) REFERENCES citizens (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_driver_licenses_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS vehicle_ownerships (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  vehicle_id BIGINT UNSIGNED NOT NULL,
  citizen_id BIGINT UNSIGNED NOT NULL,
  started_at DATETIME(3) NOT NULL,
  ended_at DATETIME(3) NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 1,
  source VARCHAR(50) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  current_vehicle_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN is_current = 1 THEN vehicle_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vehicle_ownership_current (current_vehicle_id),
  KEY ix_vehicle_ownership_vehicle_history (vehicle_id, started_at),
  KEY ix_vehicle_ownership_citizen (citizen_id, is_current),
  CONSTRAINT fk_vehicle_ownership_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_vehicle_ownership_citizen FOREIGN KEY (citizen_id) REFERENCES citizens (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_vehicle_ownership_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_vehicle_ownership_current CHECK (is_current IN (0, 1)),
  CONSTRAINT ck_vehicle_ownership_dates CHECK ((is_current = 1 AND ended_at IS NULL) OR (is_current = 0 AND ended_at IS NOT NULL AND ended_at >= started_at))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permissions (code, module, action, description, is_active)
SELECT 'citizens.create', 'citizens', 'create', 'Crear ciudadanos.', 1
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'citizens.create');
INSERT INTO permissions (code, module, action, description, is_active)
SELECT 'citizens.update', 'citizens', 'update', 'Actualizar ciudadanos.', 1
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'citizens.update');
INSERT INTO permissions (code, module, action, description, is_active)
SELECT 'citizens.deactivate', 'citizens', 'deactivate', 'Activar o desactivar ciudadanos.', 1
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'citizens.deactivate');
INSERT INTO permissions (code, module, action, description, is_active)
SELECT 'vehicles.read', 'vehicles', 'read', 'Consultar vehículos.', 1
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'vehicles.read');
INSERT INTO permissions (code, module, action, description, is_active)
SELECT 'vehicles.create', 'vehicles', 'create', 'Crear vehículos.', 1
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'vehicles.create');
INSERT INTO permissions (code, module, action, description, is_active)
SELECT 'vehicles.update', 'vehicles', 'update', 'Actualizar vehículos.', 1
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'vehicles.update');
INSERT INTO permissions (code, module, action, description, is_active)
SELECT 'vehicles.deactivate', 'vehicles', 'deactivate', 'Activar o desactivar vehículos.', 1
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'vehicles.deactivate');
INSERT INTO permissions (code, module, action, description, is_active)
SELECT 'vehicle_ownerships.manage', 'vehicle_ownerships', 'manage', 'Gestionar historial de propietarios.', 1
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'vehicle_ownerships.manage');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'citizens.create', 'citizens.update', 'citizens.deactivate',
  'vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.deactivate', 'vehicle_ownerships.manage'
)
WHERE r.code = 'ADMIN'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);
