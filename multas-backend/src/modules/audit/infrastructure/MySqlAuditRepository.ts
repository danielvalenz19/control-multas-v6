import type { ResultSetHeader } from "mysql2";
import type { MySqlDatabase } from "../../../shared/infrastructure/mysql/MySqlConnection.js";
import type { AuditEvent, AuditRepository } from "../application/AuditRepository.js";

export class MySqlAuditRepository implements AuditRepository {
  public constructor(private readonly database: MySqlDatabase) {}

  public async record(event: AuditEvent): Promise<void> {
    await this.database.query<ResultSetHeader>(
      `INSERT INTO audit_logs
       (actor_user_id, actor_session_id, action, module, entity_type, entity_id, outcome, reason,
        previous_values, new_values, request_id, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, INET6_ATON(?), ?)`,
      [
        event.actorUserId,
        event.actorSessionId,
        event.action,
        event.module,
        event.entityType,
        event.entityId,
        event.outcome,
        event.reason ?? null,
        event.previousValues === undefined ? null : JSON.stringify(event.previousValues),
        event.newValues === undefined ? null : JSON.stringify(event.newValues),
        event.requestId ?? null,
        event.ipAddress,
        event.userAgent,
      ],
    );
  }
}
