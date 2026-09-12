import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { MySqlDatabase } from "../../../shared/infrastructure/mysql/MySqlConnection.js";
import { HttpError } from "../../../shared/http/HttpError.js";

export type NotificationEvent = {
  eventCode: string;
  recipientUserIds: readonly (string | number)[];
  deduplicationKey: string;
  resourceType?: string;
  resourceId?: string | number;
  securePath?: string;
};

type TemplateRow = RowDataPacket & { id: string | number; event_code: string; title_template: string; body_template: string };

export class NotificationService {
  public constructor(private readonly database: MySqlDatabase) {}

  public async emit(event: NotificationEvent): Promise<number> {
    const templates = await this.database.query<TemplateRow[]>("SELECT id,code event_code,subject_template title_template,body_template FROM notification_templates WHERE code=? AND channel='IN_APP' AND is_active=1", [event.eventCode]);
    const template = templates[0];
    if (!template) throw new HttpError({ code: "NOTIFICATION_TEMPLATE_NOT_FOUND", message: "La plantilla de notificación no está disponible.", statusCode: 409 });
    let created = 0;
    for (const recipient of [...new Set(event.recipientUserIds.map(String).filter((value) => /^\d+$/.test(value) && value !== "0"))]) {
      const result = await this.database.query<ResultSetHeader>(`INSERT IGNORE INTO notifications (recipient_user_id,template_id,event_code,title,body,severity,resource_type,resource_id,secure_path,deduplication_key)
        SELECT ?,?,?,?,?,?,?,?,?,? FROM DUAL WHERE COALESCE((SELECT internal_enabled FROM user_notification_preferences WHERE user_id=? AND event_code=?),1)=1`,
      [recipient, template.id, template.event_code, template.title_template, template.body_template, severityFor(event.eventCode), event.resourceType ?? null, event.resourceId === undefined ? null : String(event.resourceId), event.securePath ?? null, event.deduplicationKey, recipient, event.eventCode]);
      created += result.affectedRows;
    }
    return created;
  }

  public async recipientsForPermissions(permissions: readonly string[]): Promise<string[]> {
    if (permissions.length === 0) return [];
    const rows = await this.database.query<(RowDataPacket & { id: string | number })[]>(`SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN role_permissions rp ON rp.role_id=ur.role_id JOIN permissions p ON p.id=rp.permission_id WHERE u.status='ACTIVE' AND p.code IN (${permissions.map(() => "?").join(",")})`, [...permissions]);
    return rows.map((row) => String(row.id));
  }
}

function severityFor(eventCode: string): "INFO" | "SUCCESS" | "WARNING" | "CRITICAL" {
  if (["PAYMENT_REVERSED","CASH_DIFFERENCE","RECONCILIATION_DIFFERENCE"].includes(eventCode)) return "CRITICAL";
  if (["INFRACTION_RETURNED","ADJUSTMENT_PENDING"].includes(eventCode)) return "WARNING";
  if (["PAYMENT_CONFIRMED","APPEAL_RESOLVED"].includes(eventCode)) return "SUCCESS";
  return "INFO";
}
