-- Semilla institucional idempotente recuperada del DDL aplicado en Workbench.
-- No crea usuarios ni contraseñas y no contiene datos operativos.
INSERT INTO roles (code, name, description, is_system, is_active) VALUES
  ('ADMIN', 'Administrador', 'Gestion completa de seguridad, configuracion y operacion.', 1, 1),
  ('SUPERVISOR', 'Supervisor', 'Consulta integral, supervision, reportes y resoluciones autorizadas.', 1, 1),
  ('PMT_OPERATOR', 'Operador PMT', 'Valida, devuelve y rechaza boletas.', 1, 1),
  ('AGENT', 'Agente PMT', 'Registra, corrige y sincroniza sus propias boletas.', 1, 1),
  ('RECEPTORIA', 'Receptoria', 'Gestion de caja, ordenes, pagos y conciliacion.', 1, 1),
  ('SOLVENCY_ISSUER', 'Emisor de solvencias', 'Verifica requisitos, emite y reimprime solvencias.', 1, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), description = VALUES(description), is_system = VALUES(is_system), is_active = VALUES(is_active);

INSERT INTO permissions (code, module, action, description, is_active) VALUES
  ('auth.sessions.read_own', 'auth', 'read_own_sessions', 'Consultar sesiones propias.', 1),
  ('auth.sessions.revoke_own', 'auth', 'revoke_own_sessions', 'Cerrar o revocar sesiones propias.', 1)
ON DUPLICATE KEY UPDATE
  module = VALUES(module), action = VALUES(action), description = VALUES(description), is_active = VALUES(is_active);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'ADMIN' AND p.is_active = 1
ON DUPLICATE KEY UPDATE assigned_at = assigned_at;
