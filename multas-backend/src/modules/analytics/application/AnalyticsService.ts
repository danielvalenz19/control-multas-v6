import type { RowDataPacket } from "mysql2/promise";
import type { MySqlDatabase } from "../../../shared/infrastructure/mysql/MySqlConnection.js";
import type { AnalyticsFilter } from "./AnalyticsFilters.js";
import { dependencyClause } from "./AnalyticsFilters.js";

type Row = RowDataPacket & Record<string, string | number | Date | null>;

export class AnalyticsService {
  public constructor(private readonly database: MySqlDatabase) {}

  public async dashboard(filter: AnalyticsFilter) {
    const [departments, infractions, adjustments, payments, reversals, orders, cash, appeals, solvencies, byType, byAgent, byLocation, collectionDaily, collectionMonthly, byMethod, aging, appealTrend, issuedVsPaid] = await Promise.all([
      this.database.query<Row[]>("SELECT id,code,name FROM departments WHERE is_active=1 ORDER BY name"),
      this.grouped(`SELECT i.status label,COUNT(*) count,COALESCE(SUM(i.total_amount),0) amount FROM infractions i JOIN users u ON u.id=i.created_by_user_id WHERE i.occurred_at>=? AND i.occurred_at<?`, "u", filter, " GROUP BY i.status ORDER BY i.status"),
      this.grouped(`SELECT ia.adjustment_type label,ia.direction,COUNT(*) count,COALESCE(SUM(ia.amount),0) amount FROM infraction_adjustments ia JOIN users u ON u.id=ia.requested_by_user_id WHERE ia.requested_at>=? AND ia.requested_at<? AND ia.status='APPROVED'`, "u", filter, " GROUP BY ia.adjustment_type,ia.direction ORDER BY ia.adjustment_type"),
      this.grouped(`SELECT 'COLLECTED' label,COUNT(*) count,COALESCE(SUM(p.amount),0) amount FROM payments p JOIN users u ON u.id=p.created_by_user_id WHERE p.confirmed_at>=? AND p.confirmed_at<? AND p.status='CONFIRMED' AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.payment_id=p.id)`, "u", filter),
      this.grouped(`SELECT 'REVERSALS' label,COUNT(*) count,COALESCE(SUM(pr.amount),0) amount FROM payment_reversals pr JOIN users u ON u.id=pr.reversed_by_user_id WHERE pr.reversed_at>=? AND pr.reversed_at<?`, "u", filter),
      this.grouped(`SELECT po.status label,COUNT(*) count,COALESCE(SUM(po.pending_balance_snapshot),0) amount FROM payment_orders po JOIN infractions i ON i.id=po.infraction_id JOIN users u ON u.id=i.created_by_user_id WHERE po.issued_at>=? AND po.issued_at<?`, "u", filter, " GROUP BY po.status ORDER BY po.status"),
      this.grouped(`SELECT cs.status label,COUNT(*) count,COALESCE(SUM(cs.difference_amount),0) amount FROM cash_sessions cs JOIN users u ON u.id=cs.cashier_user_id WHERE cs.opened_at>=? AND cs.opened_at<?`, "u", filter, " GROUP BY cs.status ORDER BY cs.status"),
      this.grouped(`SELECT a.status label,COUNT(*) count FROM appeals a JOIN users u ON u.id=a.created_by_user_id WHERE a.filed_at>=? AND a.filed_at<?`, "u", filter, " GROUP BY a.status ORDER BY a.status"),
      this.grouped(`SELECT s.status label,COUNT(*) count FROM solvencies s JOIN users u ON u.id=s.issued_by_user_id WHERE s.issued_at>=? AND s.issued_at<?`, "u", filter, " GROUP BY s.status ORDER BY s.status"),
      this.grouped(`SELECT ii.type_name_snapshot label,COUNT(DISTINCT i.id) count,COALESCE(SUM(ii.amount_snapshot),0) amount FROM infractions i JOIN users u ON u.id=i.created_by_user_id JOIN infraction_items ii ON ii.infraction_id=i.id WHERE i.occurred_at>=? AND i.occurred_at<?`, "u", filter, " GROUP BY ii.type_name_snapshot ORDER BY count DESC LIMIT 10"),
      this.grouped(`SELECT i.agent_name_snapshot label,COUNT(*) count,COALESCE(SUM(i.total_amount),0) amount FROM infractions i JOIN users u ON u.id=i.created_by_user_id WHERE i.occurred_at>=? AND i.occurred_at<?`, "u", filter, " GROUP BY i.agent_name_snapshot ORDER BY count DESC LIMIT 10"),
      this.grouped(`SELECT COALESCE(il.place_name,il.address,i.location_snapshot,'Sin ubicación') label,COUNT(*) count FROM infractions i JOIN users u ON u.id=i.created_by_user_id LEFT JOIN infraction_locations il ON il.infraction_id=i.id WHERE i.occurred_at>=? AND i.occurred_at<?`, "u", filter, " GROUP BY label ORDER BY count DESC LIMIT 10"),
      this.collectionByPeriod(filter, "%Y-%m-%d"),
      this.collectionByPeriod(filter, "%Y-%m"),
      this.grouped(`SELECT pm.name label,COUNT(*) count,COALESCE(SUM(p.amount),0) amount FROM payments p JOIN users u ON u.id=p.created_by_user_id JOIN payment_methods pm ON pm.id=p.payment_method_id WHERE p.confirmed_at>=? AND p.confirmed_at<? AND p.status='CONFIRMED' AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.payment_id=p.id)`, "u", filter, " GROUP BY pm.id,pm.name ORDER BY amount DESC"),
      this.grouped(`SELECT CASE WHEN DATEDIFF(UTC_DATE(),po.issued_at)<=30 THEN '0-30' WHEN DATEDIFF(UTC_DATE(),po.issued_at)<=60 THEN '31-60' WHEN DATEDIFF(UTC_DATE(),po.issued_at)<=90 THEN '61-90' ELSE '90+' END label,COUNT(*) count,COALESCE(SUM(po.pending_balance_snapshot),0) amount FROM payment_orders po JOIN infractions i ON i.id=po.infraction_id JOIN users u ON u.id=i.created_by_user_id WHERE po.issued_at>=? AND po.issued_at<? AND po.pending_balance_snapshot>0 AND po.status IN ('ISSUED','PARTIALLY_PAID','EXPIRED')`, "u", filter, " GROUP BY label ORDER BY MIN(DATEDIFF(UTC_DATE(),po.issued_at))"),
      this.grouped(`SELECT DATE_FORMAT(a.filed_at,'%Y-%m-%d') label,COUNT(*) count,SUM(a.status LIKE 'RESUELTA_%') resolved FROM appeals a JOIN users u ON u.id=a.created_by_user_id WHERE a.filed_at>=? AND a.filed_at<?`, "u", filter, " GROUP BY label ORDER BY label"),
      this.issuedVsPaid(filter),
    ]);
    return { filter: { from: filter.from, to: filter.to, departmentId: filter.departmentId ?? null }, departments, kpis: { infractions, adjustments, payments: payments[0] ?? empty("COLLECTED"), reversals: reversals[0] ?? empty("REVERSALS"), orders, cash, appeals, solvencies }, charts: { byType, byAgent, byLocation, collectionDaily, collectionMonthly, byMethod, aging, appealTrend, issuedVsPaid } };
  }

  private async grouped(prefix: string, userAlias: string, filter: AnalyticsFilter, suffix = "") {
    const values: unknown[] = [filter.start, filter.endExclusive];
    const sql = `${prefix}${dependencyClause(userAlias, filter, values)}${suffix}`;
    return this.database.query<Row[]>(sql, values);
  }

  private collectionByPeriod(filter: AnalyticsFilter, format: string) {
    return this.grouped(`SELECT DATE_FORMAT(p.confirmed_at,'${format}') label,COUNT(*) count,COALESCE(SUM(p.amount),0) amount FROM payments p JOIN users u ON u.id=p.created_by_user_id WHERE p.confirmed_at>=? AND p.confirmed_at<? AND p.status='CONFIRMED' AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.payment_id=p.id)`, "u", filter, " GROUP BY label ORDER BY label");
  }

  private issuedVsPaid(filter: AnalyticsFilter) {
    const values: unknown[] = [filter.start, filter.endExclusive, filter.departmentId ?? null, filter.departmentId ?? null, filter.start, filter.endExclusive, filter.departmentId ?? null, filter.departmentId ?? null];
    return this.database.query<Row[]>(`SELECT day label,SUM(issued) issued,SUM(paid) paid FROM (
      SELECT DATE_FORMAT(i.occurred_at,'%Y-%m-%d') day,COUNT(*) issued,0 paid FROM infractions i JOIN users u ON u.id=i.created_by_user_id WHERE i.occurred_at>=? AND i.occurred_at<? AND (? IS NULL OR u.department_id=?) GROUP BY day
      UNION ALL
      SELECT DATE_FORMAT(p.confirmed_at,'%Y-%m-%d') day,0 issued,COUNT(*) paid FROM payments p JOIN users u ON u.id=p.created_by_user_id WHERE p.confirmed_at>=? AND p.confirmed_at<? AND p.status='CONFIRMED' AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.payment_id=p.id) AND (? IS NULL OR u.department_id=?) GROUP BY day
    ) x GROUP BY day ORDER BY day`, values);
  }
}

function empty(label: string) { return { label, count: 0, amount: "0.00" }; }
