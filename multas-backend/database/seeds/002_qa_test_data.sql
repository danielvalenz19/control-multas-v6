-- Datos sintéticos reproducibles para QA local.
-- No contiene información real. Credencial común: PmtQA2026!
-- Ejecutar después de las migraciones contra una base de desarrollo/QA.

START TRANSACTION;

SET @password_hash = '$argon2id$v=19$m=65536,t=3,p=4$jL3Ny2wHbiPIY9GPu0qC5w$EIdxo0ZxLUNMaFyxvwL6pzYlaBjtinZwNbS4gbIzF80';
SET @site_id = (SELECT id FROM sites WHERE code='CENTRAL' LIMIT 1);
SET @admin_role = (SELECT id FROM roles WHERE code='ADMIN' LIMIT 1);
SET @supervisor_role = (SELECT id FROM roles WHERE code='SUPERVISOR' LIMIT 1);
SET @operator_role = (SELECT id FROM roles WHERE code='PMT_OPERATOR' LIMIT 1);
SET @agent_role = (SELECT id FROM roles WHERE code='AGENT' LIMIT 1);
SET @receptoria_role = (SELECT id FROM roles WHERE code='RECEPTORIA' LIMIT 1);
SET @solvency_role = (SELECT id FROM roles WHERE code='SOLVENCY_ISSUER' LIMIT 1);

-- Usuarios de prueba por rol. Son cuentas sintéticas y se pueden desactivar sin afectar usuarios reales.
INSERT INTO users (username,email,password_hash,first_name,last_name,employee_code,site_id,department_id,position_id,status,must_change_password,password_changed_at,email_verified_at)
VALUES
  ('qa.admin','qa.admin@pmt.local',@password_hash,'Administrador','QA','QA-ADMIN',@site_id,1,1,'ACTIVE',0,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
  ('qa.supervisor','qa.supervisor@pmt.local',@password_hash,'Supervisor','QA','QA-SUPERVISOR',@site_id,2,2,'ACTIVE',0,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
  ('qa.pmt','qa.pmt@pmt.local',@password_hash,'Operador','PMT QA','QA-OPERATOR',@site_id,3,3,'ACTIVE',0,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
  ('qa.agent','qa.agent@pmt.local',@password_hash,'Agente','QA','QA-AGENT',@site_id,3,4,'ACTIVE',0,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
  ('qa.receptoria','qa.receptoria@pmt.local',@password_hash,'Receptoría','QA','QA-RECEPTORIA',@site_id,5,5,'ACTIVE',0,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
  ('qa.solvencias','qa.solvencias@pmt.local',@password_hash,'Emisor','Solvencias QA','QA-SOLVENCY',@site_id,6,6,'ACTIVE',0,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  email=VALUES(email),password_hash=VALUES(password_hash),first_name=VALUES(first_name),last_name=VALUES(last_name),
  employee_code=VALUES(employee_code),site_id=VALUES(site_id),department_id=VALUES(department_id),position_id=VALUES(position_id),
  status='ACTIVE',must_change_password=0,password_changed_at=COALESCE(password_changed_at,UTC_TIMESTAMP(3)),email_verified_at=COALESCE(email_verified_at,UTC_TIMESTAMP(3));

SET @qa_admin = (SELECT id FROM users WHERE username='qa.admin');
SET @qa_supervisor = (SELECT id FROM users WHERE username='qa.supervisor');
SET @qa_pmt = (SELECT id FROM users WHERE username='qa.pmt');
SET @qa_agent = (SELECT id FROM users WHERE username='qa.agent');
SET @qa_receptoria = (SELECT id FROM users WHERE username='qa.receptoria');
SET @qa_solvencias = (SELECT id FROM users WHERE username='qa.solvencias');

INSERT INTO user_roles (user_id,role_id,assigned_by_user_id)
VALUES
  (@qa_admin,@admin_role,@qa_admin),
  (@qa_supervisor,@supervisor_role,@qa_admin),
  (@qa_pmt,@operator_role,@qa_admin),
  (@qa_agent,@agent_role,@qa_admin),
  (@qa_receptoria,@receptoria_role,@qa_admin),
  (@qa_solvencias,@solvency_role,@qa_admin)
ON DUPLICATE KEY UPDATE assigned_by_user_id=VALUES(assigned_by_user_id),expires_at=NULL;

-- Catálogos mínimos necesarios para probar boletas, caja, órdenes y solvencias.
INSERT INTO zones (site_id,code,name,description,is_active)
VALUES (@site_id,'QA-CENTRO','Zona QA Centro','Ubicación sintética para pruebas locales.',1)
ON DUPLICATE KEY UPDATE site_id=VALUES(site_id),name=VALUES(name),description=VALUES(description),is_active=1;
SET @qa_zone = (SELECT id FROM zones WHERE code='QA-CENTRO');

INSERT INTO frequent_locations (zone_id,code,name,address,latitude,longitude,is_active)
VALUES (@qa_zone,'QA-PLAZA','Plaza QA','Avenida de Pruebas 100, San Antonio',14.6349150,-90.5068820,1)
ON DUPLICATE KEY UPDATE zone_id=VALUES(zone_id),name=VALUES(name),address=VALUES(address),is_active=1;
SET @qa_location = (SELECT id FROM frequent_locations WHERE code='QA-PLAZA');

INSERT INTO infraction_types (code,name,legal_basis,description,requires_driver_data,requires_evidence,is_active,created_by_user_id,updated_by_user_id)
VALUES ('QA-TRAFICO','Infracción sintética QA','Reglamento de tránsito (dato de prueba)','Tipo creado exclusivamente para validar el flujo local.',0,0,1,@qa_admin,@qa_admin)
ON DUPLICATE KEY UPDATE name=VALUES(name),legal_basis=VALUES(legal_basis),description=VALUES(description),requires_driver_data=0,requires_evidence=0,is_active=1,updated_by_user_id=@qa_admin;
SET @qa_type = (SELECT id FROM infraction_types WHERE code='QA-TRAFICO');

INSERT INTO infraction_rate_versions (infraction_type_id,amount,effective_from,effective_to,legal_reference,change_reason,approved_by,created_by_user_id)
VALUES (@qa_type,150.00,'2026-01-01',NULL,'QA-001','Tarifa sintética para pruebas.', 'qa.admin', @qa_admin)
ON DUPLICATE KEY UPDATE amount=VALUES(amount),effective_to=NULL,legal_reference=VALUES(legal_reference),change_reason=VALUES(change_reason),approved_by=VALUES(approved_by),created_by_user_id=@qa_admin;
SET @qa_rate = (SELECT id FROM infraction_rate_versions WHERE infraction_type_id=@qa_type AND effective_from='2026-01-01');

INSERT INTO institutional_rule_versions (rule_code,value_type,value_integer,value_boolean,effective_from,effective_to,legal_basis,authorization_reference,created_by_user_id)
VALUES
  ('PAYMENT_ORDER_EXPIRY_DAYS','INTEGER',7,NULL,'2026-01-01 00:00:00.000',NULL,'Configuración de QA','QA-RULE-PO-2026',@qa_admin),
  ('SOLVENCY_VALIDITY_DAYS','INTEGER',30,NULL,'2026-01-01 00:00:00.000',NULL,'Configuración de QA','QA-RULE-SOL-2026',@qa_admin),
  ('APPEAL_DEADLINE_DAYS','INTEGER',15,NULL,'2026-01-01 00:00:00.000',NULL,'Configuración de QA','QA-RULE-APP-2026',@qa_admin),
  ('ADJUSTMENT_DUAL_CONTROL_REQUIRED','BOOLEAN',NULL,1,'2026-01-01 00:00:00.000',NULL,'Configuración de QA','QA-RULE-ADJ-2026',@qa_admin)
ON DUPLICATE KEY UPDATE value_type=VALUES(value_type),value_integer=VALUES(value_integer),value_boolean=VALUES(value_boolean),effective_to=NULL,authorization_reference=VALUES(authorization_reference),created_by_user_id=@qa_admin;
SET @expiry_rule = (SELECT id FROM institutional_rule_versions WHERE rule_code='PAYMENT_ORDER_EXPIRY_DAYS' AND effective_from='2026-01-01 00:00:00.000');
SET @solvency_rule = (SELECT id FROM institutional_rule_versions WHERE rule_code='SOLVENCY_VALIDITY_DAYS' AND effective_from='2026-01-01 00:00:00.000');

INSERT INTO payment_methods (code,name,requires_reference,requires_evidence,is_cash,is_active)
VALUES
  ('QA_CASH','Efectivo QA',0,0,1,1),
  ('QA_TRANSFER','Transferencia QA',1,0,0,1),
  ('CARD_ONLINE','Tarjeta en línea (checkout QA)',1,0,0,1),
  ('VISA_LINK','Enlace Visa (checkout QA)',1,0,0,1)
ON DUPLICATE KEY UPDATE name=VALUES(name),requires_reference=VALUES(requires_reference),requires_evidence=VALUES(requires_evidence),is_cash=VALUES(is_cash),is_active=1;
SET @qa_cash_method = (SELECT id FROM payment_methods WHERE code='QA_CASH');

INSERT INTO cash_desks (site_id,code,name,description,is_active)
VALUES (@site_id,'QA-RECEP-1','Caja QA 1','Caja sintética para pruebas de recepción.',1)
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),is_active=1;
SET @qa_cash_desk = (SELECT id FROM cash_desks WHERE site_id=@site_id AND code='QA-RECEP-1');

INSERT INTO document_sequences (site_id,document_type,sequence_year,prefix,next_number,padding_length)
VALUES
  (@site_id,'INFRACTION',2026,'QA-BOL-',100,6),
  (@site_id,'CASE_FILE',2026,'QA-EXP-',100,6),
  (@site_id,'PAYMENT_ORDER',2026,'QA-OP-',100,6),
  (@site_id,'PAYMENT_RECEIPT',2026,'QA-REC-',100,6),
  (@site_id,'SOLVENCY_REQUEST',2026,'QA-SREQ-',100,6),
  (@site_id,'SOLVENCY',2026,'QA-SOL-',100,6),
  (@site_id,'APPEAL',2026,'QA-IMP-',100,6),
  (@site_id,'CASH_CLOSURE',2026,'QA-CIERRE-',100,6)
ON DUPLICATE KEY UPDATE prefix=VALUES(prefix),next_number=GREATEST(next_number,VALUES(next_number)),padding_length=VALUES(padding_length);

INSERT INTO action_reasons (category,code,name,description,requires_comment,requires_evidence,is_active)
VALUES ('INFRACTION_RETURN','QA_CORRECCION','Corrección QA','Motivo sintético para devolver una boleta.',1,0,1)
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),is_active=1;
SET @qa_return_reason = (SELECT id FROM action_reasons WHERE category='INFRACTION_RETURN' AND code='QA_CORRECCION');

-- Personas y vehículos sintéticos. La placa y boleta son los datos que se copian en la guía.
INSERT INTO citizens (identification_type,identification_number,identification_normalized,nit,nit_normalized,first_names,last_names,address,phone,email,status)
VALUES
  ('DPI','QA-0001','QA-0001','CF','CF','Ana','Prueba','Calle QA 1, San Antonio','5555-0001','ana.qa@pmt.local','ACTIVE'),
  ('DPI','QA-0002','QA-0002','CF','CF','Bruno','QA','Calle QA 2, San Antonio','5555-0002','bruno.qa@pmt.local','ACTIVE'),
  ('DPI','QA-0003','QA-0003','CF','CF','Carla','Pruebas','Calle QA 3, San Antonio','5555-0003','carla.qa@pmt.local','ACTIVE'),
  ('DPI','QA-0004','QA-0004','CF','CF','Diego','Online','Calle QA 4, San Antonio','5555-0004','diego.qa@pmt.local','ACTIVE')
ON DUPLICATE KEY UPDATE first_names=VALUES(first_names),last_names=VALUES(last_names),address=VALUES(address),phone=VALUES(phone),email=VALUES(email),status='ACTIVE';
SET @citizen_1 = (SELECT id FROM citizens WHERE identification_type='DPI' AND identification_normalized='QA-0001');
SET @citizen_2 = (SELECT id FROM citizens WHERE identification_type='DPI' AND identification_normalized='QA-0002');
SET @citizen_3 = (SELECT id FROM citizens WHERE identification_type='DPI' AND identification_normalized='QA-0003');
SET @citizen_4 = (SELECT id FROM citizens WHERE identification_type='DPI' AND identification_normalized='QA-0004');

INSERT INTO vehicles (plate_original,plate_normalized,registration_card,vehicle_type,brand,vehicle_line,model_year,color,status)
VALUES
  ('QA-001Q','QA-001Q','QA-TARJ-001','AUTOMOVIL','Toyota','Corolla',2020,'Blanco','ACTIVE'),
  ('QA-002Q','QA-002Q','QA-TARJ-002','AUTOMOVIL','Honda','Civic',2021,'Gris','ACTIVE'),
  ('QA-003Q','QA-003Q','QA-TARJ-003','MOTOCICLETA','Yamaha','FZ',2022,'Negro','ACTIVE'),
  ('QA-004Q','QA-004Q','QA-TARJ-004','AUTOMOVIL','Kia','Rio',2023,'Azul','ACTIVE')
ON DUPLICATE KEY UPDATE plate_original=VALUES(plate_original),registration_card=VALUES(registration_card),vehicle_type=VALUES(vehicle_type),brand=VALUES(brand),vehicle_line=VALUES(vehicle_line),model_year=VALUES(model_year),color=VALUES(color),status='ACTIVE';
SET @vehicle_1 = (SELECT id FROM vehicles WHERE plate_normalized='QA-001Q');
SET @vehicle_2 = (SELECT id FROM vehicles WHERE plate_normalized='QA-002Q');
SET @vehicle_3 = (SELECT id FROM vehicles WHERE plate_normalized='QA-003Q');
SET @vehicle_4 = (SELECT id FROM vehicles WHERE plate_normalized='QA-004Q');

INSERT INTO driver_licenses (citizen_id,license_number,license_number_normalized,license_type,expires_on,status)
VALUES (@citizen_1,'QA-LIC-0001','QA-LIC-0001','C', '2028-12-31','ACTIVE')
ON DUPLICATE KEY UPDATE citizen_id=VALUES(citizen_id),license_type=VALUES(license_type),expires_on=VALUES(expires_on),status='ACTIVE';
INSERT INTO driver_licenses (citizen_id,license_number,license_number_normalized,license_type,expires_on,status)
VALUES (@citizen_4,'QA-LIC-0004','QA-LIC-0004','C', '2028-12-31','ACTIVE')
ON DUPLICATE KEY UPDATE citizen_id=VALUES(citizen_id),license_type=VALUES(license_type),expires_on=VALUES(expires_on),status='ACTIVE';

INSERT INTO vehicle_ownerships (vehicle_id,citizen_id,started_at,ended_at,is_current,source,created_by_user_id)
SELECT @vehicle_1,@citizen_1,'2026-01-01 00:00:00.000',NULL,1,'QA_SEED',@qa_admin
WHERE NOT EXISTS (SELECT 1 FROM vehicle_ownerships WHERE vehicle_id=@vehicle_1 AND is_current=1);
INSERT INTO vehicle_ownerships (vehicle_id,citizen_id,started_at,ended_at,is_current,source,created_by_user_id)
SELECT @vehicle_2,@citizen_2,'2026-01-01 00:00:00.000',NULL,1,'QA_SEED',@qa_admin
WHERE NOT EXISTS (SELECT 1 FROM vehicle_ownerships WHERE vehicle_id=@vehicle_2 AND is_current=1);
INSERT INTO vehicle_ownerships (vehicle_id,citizen_id,started_at,ended_at,is_current,source,created_by_user_id)
SELECT @vehicle_3,@citizen_3,'2026-01-01 00:00:00.000',NULL,1,'QA_SEED',@qa_admin
WHERE NOT EXISTS (SELECT 1 FROM vehicle_ownerships WHERE vehicle_id=@vehicle_3 AND is_current=1);
INSERT INTO vehicle_ownerships (vehicle_id,citizen_id,started_at,ended_at,is_current,source,created_by_user_id)
SELECT @vehicle_4,@citizen_4,'2026-01-01 00:00:00.000',NULL,1,'QA_SEED',@qa_admin
WHERE NOT EXISTS (SELECT 1 FROM vehicle_ownerships WHERE vehicle_id=@vehicle_4 AND is_current=1);

INSERT INTO agents (user_id,badge_number,status,hired_at)
VALUES (@qa_agent,'QA-AG-001','ACTIVE','2026-01-01')
ON DUPLICATE KEY UPDATE badge_number=VALUES(badge_number),status='ACTIVE';
SET @qa_agent_id = (SELECT id FROM agents WHERE user_id=@qa_agent);

INSERT INTO devices (device_uuid,institutional_code,device_type,platform,model,operating_system,app_version,status)
VALUES ('qa-device-0001','QA-DEVICE-001','MOBILE','ANDROID','QA Pixel','Android QA','1.0.0','ACTIVE')
ON DUPLICATE KEY UPDATE institutional_code=VALUES(institutional_code),status='ACTIVE',app_version=VALUES(app_version);
SET @qa_device_id = (SELECT id FROM devices WHERE device_uuid='qa-device-0001');

-- Boleta validada y consultable en el portal ciudadano.
INSERT INTO infractions (ticket_number,case_number,site_id,agent_id,device_id,citizen_id,vehicle_id,status,occurred_at,observations,agent_badge_snapshot,agent_name_snapshot,citizen_identification_snapshot,citizen_name_snapshot,citizen_nit_snapshot,citizen_address_snapshot,vehicle_plate_snapshot,vehicle_registration_card_snapshot,vehicle_type_snapshot,vehicle_brand_snapshot,vehicle_line_snapshot,vehicle_color_snapshot,location_snapshot,total_amount,created_by_user_id,submitted_at,validated_at,validated_by_user_id)
VALUES ('QA-BOLETA-0001','QA-EXP-0001',@site_id,@qa_agent_id,@qa_device_id,@citizen_1,@vehicle_1,'VALIDADA','2026-09-10 14:30:00.000','Registro sintético QA.','QA-AG-001','Agente QA','QA-0001','Ana Prueba','CF','Calle QA 1, San Antonio','QA-001Q','QA-TARJ-001','AUTOMOVIL','Toyota','Corolla','Blanco','Avenida de Pruebas 100, San Antonio',150.00,@qa_agent,'2026-09-10 14:31:00.000','2026-09-10 14:35:00.000',@qa_pmt)
ON DUPLICATE KEY UPDATE status='VALIDADA',total_amount=150.00,validated_at=VALUES(validated_at),validated_by_user_id=@qa_pmt,observations=VALUES(observations);
SET @infraction_1 = (SELECT id FROM infractions WHERE ticket_number='QA-BOLETA-0001');

INSERT INTO infraction_items (infraction_id,infraction_type_id,rate_version_id,type_code_snapshot,type_name_snapshot,legal_basis_snapshot,amount_snapshot)
SELECT @infraction_1,@qa_type,@qa_rate,'QA-TRAFICO','Infracción sintética QA','Reglamento de tránsito (dato de prueba)',150.00
WHERE NOT EXISTS (SELECT 1 FROM infraction_items WHERE infraction_id=@infraction_1 AND infraction_type_id=@qa_type);
UPDATE infraction_items
SET type_code_snapshot='QA-TRAFICO',
    type_name_snapshot='Infracción sintética QA',
    legal_basis_snapshot='Reglamento de tránsito (dato de prueba)',
    amount_snapshot=150.00
WHERE infraction_id=@infraction_1 AND infraction_type_id=@qa_type;
INSERT INTO infraction_locations (infraction_id,frequent_location_id,place_name,address,latitude,longitude)
SELECT @infraction_1,@qa_location,'Plaza QA','Avenida de Pruebas 100, San Antonio',14.6349150,-90.5068820
WHERE NOT EXISTS (SELECT 1 FROM infraction_locations WHERE infraction_id=@infraction_1);
INSERT INTO infraction_public_references (infraction_id,public_reference)
SELECT @infraction_1,'1111111111111111111111111111111111111111'
WHERE NOT EXISTS (SELECT 1 FROM infraction_public_references WHERE infraction_id=@infraction_1);
INSERT INTO infraction_status_history (infraction_id,from_status,to_status,action,comment,changed_by_user_id)
SELECT @infraction_1,NULL,'VALIDADA','QA_SEED','Boleta validada para pruebas del portal.',@qa_pmt
WHERE NOT EXISTS (SELECT 1 FROM infraction_status_history WHERE infraction_id=@infraction_1 AND action='QA_SEED');

-- Boleta en validación para probar devolución/rechazo desde el panel municipal.
INSERT INTO infractions (ticket_number,case_number,site_id,agent_id,device_id,citizen_id,vehicle_id,status,occurred_at,observations,agent_badge_snapshot,agent_name_snapshot,citizen_identification_snapshot,citizen_name_snapshot,citizen_nit_snapshot,citizen_address_snapshot,vehicle_plate_snapshot,vehicle_registration_card_snapshot,vehicle_type_snapshot,vehicle_brand_snapshot,vehicle_line_snapshot,vehicle_color_snapshot,location_snapshot,total_amount,created_by_user_id,submitted_at)
VALUES ('QA-BOLETA-0002','QA-EXP-0002',@site_id,@qa_agent_id,@qa_device_id,@citizen_2,@vehicle_2,'PENDIENTE_VALIDACION','2026-09-11 09:00:00.000','Pendiente de revisión QA.','QA-AG-001','Agente QA','QA-0002','Bruno QA','CF','Calle QA 2, San Antonio','QA-002Q','QA-TARJ-002','AUTOMOVIL','Honda','Civic','Gris','Plaza QA',150.00,@qa_agent,'2026-09-11 09:05:00.000')
ON DUPLICATE KEY UPDATE status='PENDIENTE_VALIDACION',total_amount=150.00,observations=VALUES(observations);
SET @infraction_2 = (SELECT id FROM infractions WHERE ticket_number='QA-BOLETA-0002');
INSERT INTO infraction_items (infraction_id,infraction_type_id,rate_version_id,type_code_snapshot,type_name_snapshot,legal_basis_snapshot,amount_snapshot)
SELECT @infraction_2,@qa_type,@qa_rate,'QA-TRAFICO','Infracción sintética QA','Reglamento de tránsito (dato de prueba)',150.00
WHERE NOT EXISTS (SELECT 1 FROM infraction_items WHERE infraction_id=@infraction_2 AND infraction_type_id=@qa_type);
UPDATE infraction_items
SET type_code_snapshot='QA-TRAFICO',
    type_name_snapshot='Infracción sintética QA',
    legal_basis_snapshot='Reglamento de tránsito (dato de prueba)',
    amount_snapshot=150.00
WHERE infraction_id=@infraction_2 AND infraction_type_id=@qa_type;
INSERT INTO infraction_locations (infraction_id,frequent_location_id,place_name,address,latitude,longitude)
SELECT @infraction_2,@qa_location,'Plaza QA','Avenida de Pruebas 100, San Antonio',14.6349150,-90.5068820
WHERE NOT EXISTS (SELECT 1 FROM infraction_locations WHERE infraction_id=@infraction_2);
INSERT INTO infraction_status_history (infraction_id,from_status,to_status,action,comment,changed_by_user_id)
SELECT @infraction_2,NULL,'PENDIENTE_VALIDACION','QA_SEED','Boleta pendiente de revisión QA.',@qa_agent
WHERE NOT EXISTS (SELECT 1 FROM infraction_status_history WHERE infraction_id=@infraction_2 AND action='QA_SEED');

-- Boleta adicional vigente para probar checkout de tarjeta y enlace Visa sin reutilizar QA-OP-0001.
INSERT INTO infractions (ticket_number,case_number,site_id,agent_id,device_id,citizen_id,vehicle_id,status,occurred_at,observations,agent_badge_snapshot,agent_name_snapshot,citizen_identification_snapshot,citizen_name_snapshot,citizen_nit_snapshot,citizen_address_snapshot,vehicle_plate_snapshot,vehicle_registration_card_snapshot,vehicle_type_snapshot,vehicle_brand_snapshot,vehicle_line_snapshot,vehicle_color_snapshot,location_snapshot,total_amount,created_by_user_id,submitted_at,validated_at,validated_by_user_id)
VALUES ('QA-BOLETA-0003','QA-EXP-0003',@site_id,@qa_agent_id,@qa_device_id,@citizen_4,@vehicle_4,'VALIDADA','2026-09-12 09:00:00.000','Registro sintético QA para checkout en línea.','QA-AG-001','Agente QA','QA-0004','Diego Online','CF','Calle QA 4, San Antonio','QA-004Q','QA-TARJ-004','AUTOMOVIL','Kia','Rio','Azul','Plaza QA',175.00,@qa_agent,'2026-09-12 09:05:00.000','2026-09-12 09:10:00.000',@qa_pmt)
ON DUPLICATE KEY UPDATE status='VALIDADA',total_amount=175.00,validated_at=VALUES(validated_at),validated_by_user_id=@qa_pmt,observations=VALUES(observations);
SET @infraction_3 = (SELECT id FROM infractions WHERE ticket_number='QA-BOLETA-0003');
INSERT INTO infraction_items (infraction_id,infraction_type_id,rate_version_id,type_code_snapshot,type_name_snapshot,legal_basis_snapshot,amount_snapshot)
SELECT @infraction_3,@qa_type,@qa_rate,'QA-TRAFICO','Infracción sintética QA','Reglamento de tránsito (dato de prueba)',175.00
WHERE NOT EXISTS (SELECT 1 FROM infraction_items WHERE infraction_id=@infraction_3 AND infraction_type_id=@qa_type);
UPDATE infraction_items SET amount_snapshot=175.00 WHERE infraction_id=@infraction_3 AND infraction_type_id=@qa_type;
INSERT INTO infraction_locations (infraction_id,frequent_location_id,place_name,address,latitude,longitude)
SELECT @infraction_3,@qa_location,'Plaza QA','Avenida de Pruebas 100, San Antonio',14.6349150,-90.5068820
WHERE NOT EXISTS (SELECT 1 FROM infraction_locations WHERE infraction_id=@infraction_3);
INSERT INTO infraction_public_references (infraction_id,public_reference)
SELECT @infraction_3,'4444444444444444444444444444444444444444'
WHERE NOT EXISTS (SELECT 1 FROM infraction_public_references WHERE infraction_id=@infraction_3);
INSERT INTO infraction_status_history (infraction_id,from_status,to_status,action,comment,changed_by_user_id)
SELECT @infraction_3,NULL,'VALIDADA','QA_SEED','Boleta vigente para checkout en línea.',@qa_pmt
WHERE NOT EXISTS (SELECT 1 FROM infraction_status_history WHERE infraction_id=@infraction_3 AND action='QA_SEED');

-- Otra boleta vigente para repetir la prueba de checkout sin reiniciar pagos previos.
INSERT INTO infractions (ticket_number,case_number,site_id,agent_id,device_id,citizen_id,vehicle_id,status,occurred_at,observations,agent_badge_snapshot,agent_name_snapshot,citizen_identification_snapshot,citizen_name_snapshot,citizen_nit_snapshot,citizen_address_snapshot,vehicle_plate_snapshot,vehicle_registration_card_snapshot,vehicle_type_snapshot,vehicle_brand_snapshot,vehicle_line_snapshot,vehicle_color_snapshot,location_snapshot,total_amount,created_by_user_id,submitted_at,validated_at,validated_by_user_id)
VALUES ('QA-BOLETA-0004','QA-EXP-0004',@site_id,@qa_agent_id,@qa_device_id,@citizen_4,@vehicle_4,'VALIDADA','2026-09-13 09:00:00.000','Registro sintético QA para repetir pagos en línea.','QA-AG-001','Agente QA','QA-0004','Diego Online','CF','Calle QA 4, San Antonio','QA-004Q','QA-TARJ-004','AUTOMOVIL','Kia','Rio','Azul','Plaza QA',200.00,@qa_agent,'2026-09-13 09:05:00.000','2026-09-13 09:10:00.000',@qa_pmt)
ON DUPLICATE KEY UPDATE status='VALIDADA',total_amount=200.00,validated_at=VALUES(validated_at),validated_by_user_id=@qa_pmt,observations=VALUES(observations);
SET @infraction_4 = (SELECT id FROM infractions WHERE ticket_number='QA-BOLETA-0004');
INSERT INTO infraction_items (infraction_id,infraction_type_id,rate_version_id,type_code_snapshot,type_name_snapshot,legal_basis_snapshot,amount_snapshot)
SELECT @infraction_4,@qa_type,@qa_rate,'QA-TRAFICO','Infracción sintética QA','Reglamento de tránsito (dato de prueba)',200.00
WHERE NOT EXISTS (SELECT 1 FROM infraction_items WHERE infraction_id=@infraction_4 AND infraction_type_id=@qa_type);
UPDATE infraction_items SET amount_snapshot=200.00 WHERE infraction_id=@infraction_4 AND infraction_type_id=@qa_type;
INSERT INTO infraction_locations (infraction_id,frequent_location_id,place_name,address,latitude,longitude)
SELECT @infraction_4,@qa_location,'Plaza QA','Avenida de Pruebas 100, San Antonio',14.6349150,-90.5068820
WHERE NOT EXISTS (SELECT 1 FROM infraction_locations WHERE infraction_id=@infraction_4);
INSERT INTO infraction_public_references (infraction_id,public_reference)
SELECT @infraction_4,'6666666666666666666666666666666666666666'
WHERE NOT EXISTS (SELECT 1 FROM infraction_public_references WHERE infraction_id=@infraction_4);
INSERT INTO infraction_status_history (infraction_id,from_status,to_status,action,comment,changed_by_user_id)
SELECT @infraction_4,NULL,'VALIDADA','QA_SEED','Boleta adicional vigente para repetir checkout.',@qa_pmt
WHERE NOT EXISTS (SELECT 1 FROM infraction_status_history WHERE infraction_id=@infraction_4 AND action='QA_SEED');

-- Orden de pago emitida y vigente para probar consulta, documento PDF y pago.
INSERT INTO payment_orders (order_number,public_reference,infraction_id,infraction_public_reference_id,original_amount_snapshot,adjustment_total_snapshot,payment_total_snapshot,pending_balance_snapshot,currency,status,expiry_rule_version_id,issued_at,expires_at,created_request_id)
SELECT 'QA-OP-0001','2222222222222222222222222222222222222222',@infraction_1,ipr.id,150.00,0.00,0.00,150.00,'GTQ','ISSUED',@expiry_rule,UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 7 DAY),'00000000-0000-4000-8000-000000000001'
FROM infraction_public_references ipr
WHERE ipr.infraction_id=@infraction_1
  AND NOT EXISTS (SELECT 1 FROM payment_orders WHERE order_number='QA-OP-0001');
SET @payment_order_1 = (SELECT id FROM payment_orders WHERE order_number='QA-OP-0001');
INSERT INTO payment_order_status_history (payment_order_id,from_status,to_status,action,request_id)
SELECT @payment_order_1,NULL,'ISSUED','QA_SEED','00000000-0000-4000-8000-000000000001'
WHERE NOT EXISTS (SELECT 1 FROM payment_order_status_history WHERE payment_order_id=@payment_order_1 AND action='QA_SEED');

INSERT INTO payment_orders (order_number,public_reference,infraction_id,infraction_public_reference_id,original_amount_snapshot,adjustment_total_snapshot,payment_total_snapshot,pending_balance_snapshot,currency,status,expiry_rule_version_id,issued_at,expires_at,created_request_id)
SELECT 'QA-OP-0002','5555555555555555555555555555555555555555',@infraction_3,ipr.id,175.00,0.00,0.00,175.00,'GTQ','ISSUED',@expiry_rule,UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 7 DAY),'00000000-0000-4000-8000-000000000007'
FROM infraction_public_references ipr
WHERE ipr.infraction_id=@infraction_3
  AND NOT EXISTS (SELECT 1 FROM payment_orders WHERE order_number='QA-OP-0002');
SET @payment_order_2 = (SELECT id FROM payment_orders WHERE order_number='QA-OP-0002');
INSERT INTO payment_order_status_history (payment_order_id,from_status,to_status,action,request_id)
SELECT @payment_order_2,NULL,'ISSUED','QA_SEED','00000000-0000-4000-8000-000000000007'
WHERE NOT EXISTS (SELECT 1 FROM payment_order_status_history WHERE payment_order_id=@payment_order_2 AND action='QA_SEED');

INSERT INTO payment_orders (order_number,public_reference,infraction_id,infraction_public_reference_id,original_amount_snapshot,adjustment_total_snapshot,payment_total_snapshot,pending_balance_snapshot,currency,status,expiry_rule_version_id,issued_at,expires_at,created_request_id)
SELECT 'QA-OP-0003','7777777777777777777777777777777777777777',@infraction_4,ipr.id,200.00,0.00,0.00,200.00,'GTQ','ISSUED',@expiry_rule,UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 7 DAY),'00000000-0000-4000-8000-000000000008'
FROM infraction_public_references ipr
WHERE ipr.infraction_id=@infraction_4
  AND NOT EXISTS (SELECT 1 FROM payment_orders WHERE order_number='QA-OP-0003');
SET @payment_order_3 = (SELECT id FROM payment_orders WHERE order_number='QA-OP-0003');
INSERT INTO payment_order_status_history (payment_order_id,from_status,to_status,action,request_id)
SELECT @payment_order_3,NULL,'ISSUED','QA_SEED','00000000-0000-4000-8000-000000000008'
WHERE NOT EXISTS (SELECT 1 FROM payment_order_status_history WHERE payment_order_id=@payment_order_3 AND action='QA_SEED');

-- Si una ejecución QA anterior ya confirmó una orden, conserva sus snapshots coherentes
-- para que la consulta pública no muestre saldo antiguo. No reabre ni borra la orden.
UPDATE payment_orders po
LEFT JOIN (
  SELECT p.payment_order_id,
         COALESCE(SUM(CASE WHEN p.status='CONFIRMED' AND pr.id IS NULL THEN p.amount ELSE 0 END),0) AS confirmed_total
  FROM payments p
  LEFT JOIN payment_reversals pr ON pr.payment_id=p.id
  GROUP BY p.payment_order_id
) ledger ON ledger.payment_order_id=po.id
SET po.payment_total_snapshot=COALESCE(ledger.confirmed_total,0),
    po.pending_balance_snapshot=GREATEST(po.original_amount_snapshot+po.adjustment_total_snapshot-COALESCE(ledger.confirmed_total,0),0)
WHERE po.status='USED' AND po.order_number IN ('QA-OP-0001','QA-OP-0002');

-- Turno de caja abierto para qa.receptoria; permite probar registro y confirmación de pago.
INSERT INTO cash_sessions (cash_desk_id,cashier_user_id,opened_by_user_id,status,opening_amount,opened_at)
SELECT @qa_cash_desk,@qa_receptoria,@qa_receptoria,'OPEN',500.00,UTC_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM cash_sessions WHERE cash_desk_id=@qa_cash_desk AND status='OPEN');
SET @qa_cash_session = (SELECT id FROM cash_sessions WHERE cash_desk_id=@qa_cash_desk AND status='OPEN' LIMIT 1);
INSERT INTO cash_movements (cash_session_id,movement_type,direction,amount,reason,created_by_user_id,request_id)
SELECT @qa_cash_session,'OPENING','IN',500.00,'Apertura sintética QA',@qa_receptoria,'00000000-0000-4000-8000-000000000002'
WHERE NOT EXISTS (SELECT 1 FROM cash_movements WHERE cash_session_id=@qa_cash_session AND movement_type='OPENING');

-- Solicitud aprobada + solvencia vigente para validar el documento público.
INSERT INTO solvency_requests (request_number,vehicle_id,status,vehicle_plate_snapshot,vehicle_registration_snapshot,vehicle_description_snapshot,owner_citizen_id,owner_name_snapshot,owner_identification_snapshot,financial_balance_snapshot,open_infractions_snapshot,open_appeals_snapshot,pending_payments_snapshot,requested_by_user_id,requested_at,reviewed_by_user_id,reviewed_at)
VALUES ('QA-SREQ-0001',@vehicle_2,'APPROVED','QA-002Q','QA-TARJ-002','Honda Civic · Gris',@citizen_2,'Bruno QA','QA-0002',0.00,0,0,0,@qa_solvencias,'2026-09-12 10:00:00.000',@qa_solvencias,'2026-09-12 10:05:00.000')
ON DUPLICATE KEY UPDATE status='APPROVED',reviewed_by_user_id=@qa_solvencias,reviewed_at=VALUES(reviewed_at),financial_balance_snapshot=0.00,open_infractions_snapshot=0,open_appeals_snapshot=0,pending_payments_snapshot=0;
SET @solvency_req_1 = (SELECT id FROM solvency_requests WHERE request_number='QA-SREQ-0001');
INSERT INTO solvency_request_status_history (solvency_request_id,from_status,to_status,action,changed_by_user_id,request_id)
SELECT @solvency_req_1,NULL,'PENDING_REVIEW','QA_SEED',@qa_solvencias,'00000000-0000-4000-8000-000000000003'
WHERE NOT EXISTS (SELECT 1 FROM solvency_request_status_history WHERE solvency_request_id=@solvency_req_1 AND action='QA_SEED');
INSERT INTO solvency_request_status_history (solvency_request_id,from_status,to_status,action,changed_by_user_id,request_id)
SELECT @solvency_req_1,'PENDING_REVIEW','APPROVED','QA_SEED_APPROVE',@qa_solvencias,'00000000-0000-4000-8000-000000000004'
WHERE NOT EXISTS (SELECT 1 FROM solvency_request_status_history WHERE solvency_request_id=@solvency_req_1 AND action='QA_SEED_APPROVE');
INSERT INTO solvencies (solvency_request_id,solvency_number,public_reference,vehicle_id,vehicle_snapshot,owner_snapshot,financial_snapshot,status,validity_rule_version_id,issued_by_user_id,issued_at,expires_at)
SELECT @solvency_req_1,'QA-SOL-0001','3333333333333333333333333333333333333333',@vehicle_2,
  JSON_OBJECT('plate','QA-002Q','registration','QA-TARJ-002','description','Honda Civic · Gris'),
  JSON_OBJECT('citizenId',CAST(@citizen_2 AS CHAR),'name','Bruno QA','identification','QA-0002'),
  JSON_OBJECT('balance','0.00','debtCount',0,'openAppeals',0,'pendingPayments',0,'currency','GTQ'),
  'VALID',@solvency_rule,@qa_solvencias,UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 DAY)
WHERE NOT EXISTS (SELECT 1 FROM solvencies WHERE solvency_number='QA-SOL-0001');
SET @solvency_1 = (SELECT id FROM solvencies WHERE solvency_number='QA-SOL-0001');
INSERT INTO solvency_status_history (solvency_id,from_status,to_status,action,changed_by_user_id,request_id)
SELECT @solvency_1,NULL,'VALID','QA_SEED',@qa_solvencias,'00000000-0000-4000-8000-000000000005'
WHERE NOT EXISTS (SELECT 1 FROM solvency_status_history WHERE solvency_id=@solvency_1 AND action='QA_SEED');

-- Solicitud pendiente para probar aprobación/rechazo desde administración.
INSERT INTO solvency_requests (request_number,vehicle_id,status,vehicle_plate_snapshot,vehicle_registration_snapshot,vehicle_description_snapshot,owner_citizen_id,owner_name_snapshot,owner_identification_snapshot,financial_balance_snapshot,open_infractions_snapshot,open_appeals_snapshot,pending_payments_snapshot,requested_by_user_id,requested_at)
VALUES ('QA-SREQ-0002',@vehicle_3,'PENDING_REVIEW','QA-003Q','QA-TARJ-003','Yamaha FZ · Negro',@citizen_3,'Carla Pruebas','QA-0003',0.00,0,0,0,@qa_solvencias,'2026-09-13 11:00:00.000')
ON DUPLICATE KEY UPDATE status='PENDING_REVIEW',reviewed_by_user_id=NULL,reviewed_at=NULL,rejection_reason=NULL;
SET @solvency_req_2 = (SELECT id FROM solvency_requests WHERE request_number='QA-SREQ-0002');
INSERT INTO solvency_request_status_history (solvency_request_id,from_status,to_status,action,changed_by_user_id,request_id)
SELECT @solvency_req_2,NULL,'PENDING_REVIEW','QA_SEED',@qa_solvencias,'00000000-0000-4000-8000-000000000006'
WHERE NOT EXISTS (SELECT 1 FROM solvency_request_status_history WHERE solvency_request_id=@solvency_req_2 AND action='QA_SEED');

-- Bandeja de notificaciones para validar el panel administrativo.
INSERT INTO notifications (recipient_user_id,template_id,event_code,title,body,severity,resource_type,resource_id,secure_path,deduplication_key)
SELECT @qa_admin,nt.id,'QA_SEED','Datos QA disponibles','Se cargaron boletas, órdenes y solvencias sintéticas para pruebas locales.','INFO','qa_dataset','QA-2026','/admin','QA_SEED_ADMIN_2026'
FROM notification_templates nt WHERE nt.code='SOLVENCY_STATUS' AND nt.channel='IN_APP'
ON DUPLICATE KEY UPDATE title=VALUES(title),body=VALUES(body),read_at=NULL;
INSERT INTO notifications (recipient_user_id,template_id,event_code,title,body,severity,resource_type,resource_id,secure_path,deduplication_key)
SELECT @qa_supervisor,nt.id,'QA_SEED','Boleta pendiente de revisión','La boleta QA-BOLETA-0002 está lista para validar el flujo de supervisión.','WARNING','infraction',CAST(@infraction_2 AS CHAR),'/admin/infractions','QA_SEED_SUPERVISOR_2026'
FROM notification_templates nt WHERE nt.code='INFRACTION_RETURNED' AND nt.channel='IN_APP'
ON DUPLICATE KEY UPDATE title=VALUES(title),body=VALUES(body),read_at=NULL;

COMMIT;

SELECT 'QA seed completed' AS result,
       (SELECT COUNT(*) FROM users WHERE username LIKE 'qa.%') AS qa_users,
       (SELECT COUNT(*) FROM citizens WHERE identification_normalized LIKE 'QA-%') AS qa_citizens,
       (SELECT COUNT(*) FROM vehicles WHERE plate_normalized LIKE 'QA-%') AS qa_vehicles,
       (SELECT COUNT(*) FROM infractions WHERE ticket_number LIKE 'QA-%') AS qa_infractions,
       (SELECT COUNT(*) FROM payment_orders WHERE order_number LIKE 'QA-%') AS qa_orders,
       (SELECT COUNT(*) FROM solvency_requests WHERE request_number LIKE 'QA-%') AS qa_solvency_requests,
       (SELECT COUNT(*) FROM solvencies WHERE solvency_number LIKE 'QA-%') AS qa_solvencies;
