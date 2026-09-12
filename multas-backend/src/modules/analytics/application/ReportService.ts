import type { RowDataPacket } from "mysql2/promise";
import type { MySqlDatabase } from "../../../shared/infrastructure/mysql/MySqlConnection.js";
import type { AnalyticsFilter } from "./AnalyticsFilters.js";

export const reportTypes = ["infractions","collection","cash","payments-reversals","reconciliation","aging","adjustments-exemptions","appeals","solvencies","agent-activity","audit"] as const;
export type ReportType = (typeof reportTypes)[number];

type Definition = { select: string; from: string; date: string; department?: string; order: string };
type ReportRow = RowDataPacket & Record<string, unknown>;

const definitions: Record<ReportType, Definition> = {
  infractions: { select: "i.ticket_number boleta,i.status estado,i.occurred_at fecha,i.agent_name_snapshot agente,i.location_snapshot ubicacion,i.total_amount monto", from: "infractions i JOIN users u ON u.id=i.created_by_user_id", date: "i.occurred_at", department: "u.department_id", order: "i.occurred_at DESC" },
  collection: { select: "p.id pago,p.confirmed_at fecha,pm.name metodo,p.amount monto,p.currency moneda,po.order_number orden,CASE WHEN pr.id IS NULL THEN 'VIGENTE' ELSE 'REVERSADO' END estado", from: "payments p JOIN users u ON u.id=p.created_by_user_id JOIN payment_methods pm ON pm.id=p.payment_method_id JOIN payment_orders po ON po.id=p.payment_order_id LEFT JOIN payment_reversals pr ON pr.payment_id=p.id", date: "p.confirmed_at", department: "u.department_id", order: "p.confirmed_at DESC" },
  cash: { select: "cs.id sesion,cd.name caja,cs.status estado,cs.opened_at apertura,cs.closed_at cierre,cs.opening_amount fondo_inicial,cs.expected_closing_amount esperado,cs.closing_declared_amount declarado,cs.difference_amount diferencia", from: "cash_sessions cs JOIN users u ON u.id=cs.cashier_user_id JOIN cash_desks cd ON cd.id=cs.cash_desk_id", date: "cs.opened_at", department: "u.department_id", order: "cs.opened_at DESC" },
  "payments-reversals": { select: "p.id pago,p.confirmed_at fecha_pago,p.amount monto_pagado,pr.reversal_reference reverso,pr.amount monto_reversado,pr.reversed_at fecha_reverso,pr.reason motivo", from: "payments p JOIN users u ON u.id=p.created_by_user_id LEFT JOIN payment_reversals pr ON pr.payment_id=p.id", date: "COALESCE(pr.reversed_at,p.created_at)", department: "u.department_id", order: "COALESCE(pr.reversed_at,p.created_at) DESC" },
  reconciliation: { select: "rb.public_reference referencia,pm.name metodo,rb.source_type origen,rb.status estado,rb.expected_total esperado,rb.observed_total observado,rb.difference_amount diferencia,rb.created_at fecha", from: "reconciliation_batches rb JOIN users u ON u.id=rb.created_by_user_id JOIN payment_methods pm ON pm.id=rb.payment_method_id", date: "rb.created_at", department: "u.department_id", order: "rb.created_at DESC" },
  aging: { select: "po.order_number orden,i.ticket_number boleta,po.issued_at emision,po.status estado,po.pending_balance_snapshot saldo,DATEDIFF(UTC_DATE(),po.issued_at) dias", from: "payment_orders po JOIN infractions i ON i.id=po.infraction_id JOIN users u ON u.id=i.created_by_user_id", date: "po.issued_at", department: "u.department_id", order: "dias DESC" },
  "adjustments-exemptions": { select: "ia.id ajuste,i.ticket_number boleta,ia.adjustment_type tipo,ia.direction direccion,ia.amount monto,ia.status estado,ia.reason motivo,ia.requested_at fecha", from: "infraction_adjustments ia JOIN infractions i ON i.id=ia.infraction_id JOIN users u ON u.id=ia.requested_by_user_id", date: "ia.requested_at", department: "u.department_id", order: "ia.requested_at DESC" },
  appeals: { select: "a.appeal_number recurso,i.ticket_number boleta,a.filed_at fecha,a.status estado,a.deadline_at vencimiento,a.resolution_type resolucion,a.resolved_amount monto_resuelto", from: "appeals a JOIN infractions i ON i.id=a.infraction_id JOIN users u ON u.id=a.created_by_user_id", date: "a.filed_at", department: "u.department_id", order: "a.filed_at DESC" },
  solvencies: { select: "s.solvency_number solvencia,s.status estado,s.issued_at emision,s.expires_at vencimiento,s.revoked_at revocacion,s.observed_at observacion", from: "solvencies s JOIN users u ON u.id=s.issued_by_user_id", date: "s.issued_at", department: "u.department_id", order: "s.issued_at DESC" },
  "agent-activity": { select: "i.agent_badge_snapshot codigo,i.agent_name_snapshot agente,COUNT(*) infracciones,COALESCE(SUM(i.total_amount),0) monto,MIN(i.occurred_at) primera,MAX(i.occurred_at) ultima", from: "infractions i JOIN users u ON u.id=i.created_by_user_id", date: "i.occurred_at", department: "u.department_id", order: "infracciones DESC" },
  audit: { select: "al.id id,al.created_at fecha,al.action accion,al.module modulo,al.entity_type entidad,al.entity_id entidad_id,al.outcome resultado,al.request_id request_id", from: "audit_logs al LEFT JOIN users u ON u.id=al.actor_user_id", date: "al.created_at", department: "u.department_id", order: "al.created_at DESC" },
};

export class ReportService {
  public constructor(private readonly database: MySqlDatabase) {}

  public async list(type: ReportType, filter: AnalyticsFilter, page: number, pageSize: number, status?: string, search?: string) {
    const definition = definitions[type];
    const where: string[] = [`${definition.date}>=?`, `${definition.date}<?`];
    const values: unknown[] = [filter.start, filter.endExclusive];
    if (filter.departmentId && definition.department) { where.push(`${definition.department}=?`); values.push(filter.departmentId); }
    if (status) { where.push(this.statusColumn(type) + "=?"); values.push(status); }
    if (search) { where.push(this.searchColumn(type) + " LIKE ?"); values.push(`%${search}%`); }
    if (type === "aging") where.push("po.pending_balance_snapshot>0");
    const grouping = type === "agent-activity" ? " GROUP BY i.agent_badge_snapshot,i.agent_name_snapshot" : "";
    const base = ` FROM ${definition.from} WHERE ${where.join(" AND ")}${grouping}`;
    const totals = await this.database.query<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) total FROM (SELECT 1${base}) report_rows`, values);
    const rows = await this.database.query<ReportRow[]>(`SELECT ${definition.select}${base} ORDER BY ${definition.order} LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize]);
    return { rows, total: totals[0]?.total ?? 0, columns: rows[0] ? Object.keys(rows[0]) : columnAliases(definition.select) };
  }

  private statusColumn(type: ReportType) {
    const columns: Partial<Record<ReportType,string>> = { infractions: "i.status", cash: "cs.status", reconciliation: "rb.status", aging: "po.status", "adjustments-exemptions": "ia.status", appeals: "a.status", solvencies: "s.status" };
    return columns[type] ?? "'UNSUPPORTED'";
  }

  private searchColumn(type: ReportType) {
    const columns: Record<ReportType,string> = { infractions: "i.ticket_number", collection: "po.order_number", cash: "cd.name", "payments-reversals": "CAST(p.id AS CHAR)", reconciliation: "rb.public_reference", aging: "po.order_number", "adjustments-exemptions": "i.ticket_number", appeals: "a.appeal_number", solvencies: "s.solvency_number", "agent-activity": "i.agent_name_snapshot", audit: "al.action" };
    return columns[type];
  }
}

function columnAliases(select: string): string[] {
  return select.split(",").map((part) => part.trim().split(/\s+/).at(-1) ?? part.trim());
}

export function csvCell(value: unknown): string {
  const normalized = value instanceof Date ? value.toISOString() : value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : typeof value === "string" ? value : typeof value === "number" || typeof value === "bigint" || typeof value === "boolean" ? `${value}` : "";
  return `"${normalized.replaceAll('"','""')}"`;
}
