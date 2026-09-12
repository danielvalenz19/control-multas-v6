import type { RowDataPacket } from "mysql2/promise";
import type { MySqlDatabase } from "./MySqlConnection.js";

type CountRow = RowDataPacket & { total: number };

export type RbacReport = {
  checkedAt: string;
  adminRole: { exists: boolean; active: boolean };
  activePermissions: number;
  adminAssignedPermissions: number;
  requiredAuthPermissions: { code: string; exists: boolean }[];
  orphanAssignments: {
    userRoles: number;
    rolePermissions: number;
    userPermissionOverrides: number;
  };
  matches: boolean;
};

const requiredAuthPermissionCodes = ["auth.sessions.read_own", "auth.sessions.revoke_own"] as const;

export class RbacInspector {
  public constructor(private readonly database: MySqlDatabase) {}

  public async inspect(): Promise<RbacReport> {
    const roles = await this.database.query<(RowDataPacket & { isActive: number })[]>(
      "SELECT is_active AS isActive FROM roles WHERE code = 'ADMIN' LIMIT 1",
    );
    const activePermissions = await this.count("SELECT COUNT(*) AS total FROM permissions WHERE is_active = 1");
    const adminAssignedPermissions = await this.count(
      `SELECT COUNT(*) AS total
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id AND p.is_active = 1
       WHERE r.code = 'ADMIN' AND r.is_active = 1`,
    );
    const requiredRows = await this.database.query<(RowDataPacket & { code: string })[]>(
      "SELECT code FROM permissions WHERE code IN (?, ?) AND is_active = 1",
      [...requiredAuthPermissionCodes],
    );
    const existingCodes = new Set(requiredRows.map((row) => row.code));
    const userRoles = await this.count(
      `SELECT COUNT(*) AS total FROM user_roles ur
       LEFT JOIN users u ON u.id = ur.user_id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id IS NULL OR r.id IS NULL`,
    );
    const rolePermissions = await this.count(
      `SELECT COUNT(*) AS total FROM role_permissions rp
       LEFT JOIN roles r ON r.id = rp.role_id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.id IS NULL OR p.id IS NULL`,
    );
    const userPermissionOverrides = await this.count(
      `SELECT COUNT(*) AS total FROM user_permission_overrides o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN permissions p ON p.id = o.permission_id
       LEFT JOIN users grantor ON grantor.id = o.granted_by_user_id
       WHERE u.id IS NULL OR p.id IS NULL OR (o.granted_by_user_id IS NOT NULL AND grantor.id IS NULL)`,
    );
    const requiredAuthPermissions = requiredAuthPermissionCodes.map((code) => ({ code, exists: existingCodes.has(code) }));
    const adminRole = { exists: roles.length === 1, active: roles[0]?.isActive === 1 };
    const orphanAssignments = { userRoles, rolePermissions, userPermissionOverrides };
    return {
      checkedAt: new Date().toISOString(),
      adminRole,
      activePermissions,
      adminAssignedPermissions,
      requiredAuthPermissions,
      orphanAssignments,
      matches: adminRole.exists
        && adminRole.active
        && activePermissions > 0
        && adminAssignedPermissions === activePermissions
        && requiredAuthPermissions.every((permission) => permission.exists)
        && Object.values(orphanAssignments).every((count) => count === 0),
    };
  }

  private async count(sql: string): Promise<number> {
    const rows = await this.database.query<CountRow[]>(sql);
    return rows[0]?.total ?? 0;
  }
}
