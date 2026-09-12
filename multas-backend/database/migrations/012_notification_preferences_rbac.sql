-- TANDA 10: todo rol con bandeja propia puede administrar sus preferencias internas.
INSERT IGNORE INTO role_permissions (role_id,permission_id)
SELECT DISTINCT rp.role_id,preferences.id
FROM role_permissions rp
JOIN permissions inbox ON inbox.id=rp.permission_id AND inbox.code='notifications.read'
JOIN permissions preferences ON preferences.code='notifications.preferences';
